use std::path::Path;

use super::DbResult;

pub fn export_csv(connection: &rusqlite::Connection, csv_path: &Path) -> Result<(), String> {
    let mut wtr = csv::Writer::from_path(csv_path).map_err(|e| e.to_string())?;
    wtr.write_record([
        "id", "students", "date", "date_filed", "case", "description", 
        "sanction", "progress", "proofs", "first_name", "last_name", 
        "middle_initial", "level", "section", "adviser", "title", "reporting_student"
    ]).map_err(|e| e.to_string())?;

    let mut stmt = connection.prepare(
        r#"SELECT id, students, date, date_filed, "case", description, sanction, progress, proofs, first_name, last_name, middle_initial, level, section, adviser, title, reporting_student FROM cases"#
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
            row.get::<_, String>("reporting_student").unwrap_or_default(),
        ]).map_err(|e| e.to_string())?;
    }
    
    wtr.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(debug_assertions))]
pub fn run_backup(db_path: &Path, backup_dir: &Path, connection: &rusqlite::Connection) -> DbResult<()> {
    use chrono::Local;
    use std::{fs, io};

    if !db_path.exists() {
        return Ok(());
    }

    let today = Local::now().format("%Y-%m-%d");
    
    let mut already_backed_up = false;
    if let Ok(entries) = fs::read_dir(backup_dir) {
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                if name.starts_with(&format!("backup_auto_{}", today)) {
                    already_backed_up = true;
                    break;
                }
            }
        }
    }

    if already_backed_up {
        return Ok(());
    }

    let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S");
    let folder_name = format!("backup_auto_{}", timestamp);
    let current_backup_dir = backup_dir.join(folder_name);
    fs::create_dir_all(&current_backup_dir)?;

    fs::copy(db_path, current_backup_dir.join("snapshot.db"))?;
    
    export_csv(connection, &current_backup_dir.join("snapshot.csv")).map_err(|e| {
        io::Error::new(io::ErrorKind::Other, e)
    })?;

    Ok(())
}

#[cfg(debug_assertions)]
pub fn run_backup(_db_path: &Path, _backup_dir: &Path, _connection: &rusqlite::Connection) -> DbResult<()> {
    Ok(())
}
