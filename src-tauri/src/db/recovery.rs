use super::{backup, schema};
use rusqlite::{Connection, OpenFlags};
use std::path::Path;

pub fn replace_database(
    active: &mut Connection,
    source: &Path,
    safety_dir: &Path,
) -> Result<(), String> {
    let incoming = Connection::open_with_flags(source, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("Could not read the selected database: {e}"))?;
    let integrity: String = incoming
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(|_| "This is not a readable SQLite backup.")?;
    if integrity != "ok" {
        return Err("The selected database is corrupt. Your current data has not changed.".into());
    }
    let mut columns = incoming
        .prepare("SELECT name FROM pragma_table_info('cases')")
        .map_err(|e| e.to_string())?;
    let names = columns
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for required in [
        "id",
        "first_name",
        "last_name",
        "level",
        "section",
        "date",
        "adviser",
        "case",
        "sanction",
        "progress",
    ] {
        if !names.iter().any(|n| n == required) {
            return Err(
                "This file is not a Guidance Office database. Your current data has not changed."
                    .into(),
            );
        }
    }
    let version: i64 = incoming
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if version > 1 {
        return Err(
            "This backup requires a newer app version. Update the app before restoring it.".into(),
        );
    }
    let mut triggers = incoming
        .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'")
        .map_err(|e| e.to_string())?;
    let names = triggers
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    if names.iter().any(|name| {
        ![
            "sync_case_student_roles_after_insert",
            "sync_case_student_roles_after_student_update",
        ]
        .contains(&name.as_str())
    }) {
        return Err(
            "This database contains unsupported triggers. Your current data has not changed."
                .into(),
        );
    }
    drop(triggers);
    drop(columns);
    let mut staging = Connection::open_in_memory().map_err(|e| e.to_string())?;
    backup::copy_database(&incoming, &mut staging)?;
    schema::initialize_schema(&staging)
        .map_err(|e| format!("This backup could not be upgraded: {e}"))?;
    staging
        .execute("DELETE FROM otp_tokens", [])
        .map_err(|e| e.to_string())?;
    // Fully materialize records/config before the live copy; bad schemas fail here.
    super::repository::CaseRepository::get_cases(&staging, None, None)?;
    if crate::commands::get_config(&staging, "is_setup_complete")?.as_deref() == Some("true") {
        let hash = crate::commands::require_config(&staging, "app_pin_hash")?;
        crate::auth::verify_secret("", &hash)?;
    }
    backup::snapshot(active, safety_dir, "safety")?;
    backup::copy_database(&staging, active)?;
    active.flush_prepared_statement_cache();
    Ok(())
}
