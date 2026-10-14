use std::path::Path;

pub fn export_csv(connection: &rusqlite::Connection, csv_path: &Path) -> Result<(), String> {
    let mut wtr = csv::Writer::from_path(csv_path).map_err(|e| e.to_string())?;
    wtr.write_record([
        "id",
        "students",
        "date",
        "date_filed",
        "case",
        "description",
        "sanction",
        "progress",
        "proofs",
        "first_name",
        "last_name",
        "middle_initial",
        "level",
        "section",
        "adviser",
        "title",
        "reporting_student",
        "group_id",
        "student_roles",
        "update_history",
        "school_year",
    ])
    .map_err(|e| e.to_string())?;

    let mut stmt = connection.prepare(
        r#"SELECT id, students, date, date_filed, "case", description, sanction, progress, proofs, first_name, last_name, middle_initial, level, section, adviser, title, reporting_student, group_id, student_roles, update_history, school_year FROM cases"#
    ).map_err(|e| e.to_string())?;

    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        wtr.write_record(&[
            row.get::<_, i64>("id").unwrap_or(0).to_string(),
            row.get::<_, String>("students").unwrap_or_default(),
            row.get::<_, String>("date").unwrap_or_default(),
            row.get::<_, String>("date_filed").unwrap_or_default(),
            row.get::<_, String>("case").unwrap_or_default(),
            row.get::<_, String>("description").unwrap_or_default(),
            row.get::<_, String>("sanction").unwrap_or_default(),
            row.get::<_, String>("progress").unwrap_or_default(),
            row.get::<_, String>("proofs").unwrap_or_default(),
            row.get::<_, String>("first_name").unwrap_or_default(),
            row.get::<_, String>("last_name").unwrap_or_default(),
            row.get::<_, String>("middle_initial").unwrap_or_default(),
            row.get::<_, String>("level").unwrap_or_default(),
            row.get::<_, String>("section").unwrap_or_default(),
            row.get::<_, String>("adviser").unwrap_or_default(),
            row.get::<_, String>("title").unwrap_or_default(),
            row.get::<_, String>("reporting_student")
                .unwrap_or_default(),
            row.get::<_, Option<String>>("group_id")
                .unwrap_or_default()
                .unwrap_or_default(),
            row.get::<_, String>("student_roles").unwrap_or_default(),
            row.get::<_, String>("update_history").unwrap_or_default(),
            row.get::<_, String>("school_year").unwrap_or_default(),
        ])
        .map_err(|e| e.to_string())?;
    }

    wtr.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPolicy {
    pub enabled: bool,
    pub frequency: String,
    pub retention: usize,
    #[serde(default)]
    pub last_error: Option<String>,
}
impl Default for BackupPolicy {
    fn default() -> Self {
        Self {
            enabled: true,
            frequency: "Daily".into(),
            retention: 7,
            last_error: None,
        }
    }
}
impl BackupPolicy {
    pub fn validate(&self) -> Result<(), String> {
        if !["Daily", "Weekly", "Monthly", "On New Record"].contains(&self.frequency.as_str())
            || !(1..=50).contains(&self.retention)
        {
            return Err(
                "Choose a valid backup frequency and retain 1 to 50 automatic backups.".into(),
            );
        }
        Ok(())
    }
}
pub fn policy(connection: &rusqlite::Connection) -> Result<BackupPolicy, String> {
    let mut policy: BackupPolicy = match crate::commands::get_config(connection, "backup_policy")? {
        Some(value) => serde_json::from_str(&value)
            .map_err(|_| "Backup settings are invalid. Save them again.")?,
        None => BackupPolicy::default(),
    };
    policy.last_error =
        crate::commands::get_config(connection, "backup_last_error")?.filter(|s| !s.is_empty());
    policy.validate()?;
    Ok(policy)
}

/// Online SQLite copies are transactional; incomplete copies roll back on drop.
/// See https://www.sqlite.org/c3ref/backup_finish.html.
pub fn copy_database(
    from: &rusqlite::Connection,
    to: &mut rusqlite::Connection,
) -> Result<(), String> {
    let backup = rusqlite::backup::Backup::new(from, to).map_err(|e| e.to_string())?;
    for _ in 0..10 {
        match backup.step(-1).map_err(|e| e.to_string())? {
            rusqlite::backup::StepResult::Done => return Ok(()),
            rusqlite::backup::StepResult::Busy | rusqlite::backup::StepResult::Locked => {
                std::thread::sleep(std::time::Duration::from_millis(50))
            }
            _ => {}
        }
    }
    Err("The database is busy. Please close other operations and retry.".into())
}

pub fn snapshot(
    connection: &rusqlite::Connection,
    backup_dir: &Path,
    kind: &str,
) -> Result<String, String> {
    use std::fs;
    fs::create_dir_all(backup_dir).map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4();
    let name = format!(
        "backup_{}_{}_{}",
        kind,
        chrono::Local::now().format("%Y-%m-%d_%H-%M-%S%.6f"),
        id
    );
    let staging = backup_dir.join(format!(".partial-{id}"));
    fs::create_dir(&staging).map_err(|e| e.to_string())?;
    let result = (|| {
        let mut target =
            rusqlite::Connection::open(staging.join("snapshot.db")).map_err(|e| e.to_string())?;
        copy_database(connection, &mut target)?;
        let integrity: String = target
            .query_row("PRAGMA integrity_check", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if integrity != "ok" {
            return Err("The backup integrity check failed.".into());
        }
        export_csv(&target, &staging.join("snapshot.csv"))?;
        target.close().map_err(|(_, e)| e.to_string())?;
        fs::rename(&staging, backup_dir.join(&name)).map_err(|e| e.to_string())?;
        Ok(name)
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(staging);
    }
    result
}

pub fn prune_automatic(backup_dir: &Path, retention: usize) -> Result<(), String> {
    let mut entries = std::fs::read_dir(backup_dir)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    entries.retain(|e| {
        e.path().is_dir()
            && e.file_name().to_string_lossy().starts_with("backup_auto_")
            && e.path().join("snapshot.db").exists()
    });
    entries.sort_by_key(|e| std::cmp::Reverse(e.file_name()));
    for old in entries.into_iter().skip(retention) {
        std::fs::remove_dir_all(old.path()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn scheduled(
    connection: &rusqlite::Connection,
    backup_dir: &Path,
    new_record: bool,
) -> Result<(), String> {
    use chrono::Datelike;
    let config = policy(connection)?;
    if !config.enabled {
        return Ok(());
    }
    let now = chrono::Local::now();
    let last = crate::commands::get_config(connection, "backup_last_run")?
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok())
        .map(|d| d.with_timezone(&chrono::Local));
    let due = if config.frequency == "On New Record" {
        new_record
    } else if let Some(last) = last {
        match config.frequency.as_str() {
            "Daily" => now.date_naive() != last.date_naive(),
            "Weekly" => now.signed_duration_since(last) >= chrono::Duration::days(7),
            "Monthly" => (now.year(), now.month()) != (last.year(), last.month()),
            _ => false,
        }
    } else {
        true
    };
    if due {
        snapshot(connection, backup_dir, "auto")?;
        crate::commands::set_config(connection, "backup_last_run", &now.to_rfc3339())?;
        prune_automatic(backup_dir, config.retention)?;
        crate::commands::set_config(connection, "backup_last_error", "")?;
    }
    Ok(())
}

pub fn run_scheduled(state: &super::DbState, connection: &rusqlite::Connection, new_record: bool) {
    if let Some(dir) = &state.backup_dir {
        if let Err(error) = scheduled(connection, dir, new_record) {
            let _ = crate::commands::set_config(connection, "backup_last_error", &error);
        }
    }
}
