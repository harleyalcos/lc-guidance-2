use chrono::{Duration, Utc};
use rusqlite::{params, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use tauri::State;

pub mod import;
pub use import::*;

pub mod ai;
pub use ai::*;

use crate::db::DbState;

use crate::models::CaseRecord;
use crate::db::repository::CaseRepository;

// primary_student logic moved to repository

pub fn map_case(row: &Row<'_>) -> rusqlite::Result<CaseRecord> {
    CaseRepository::map_case(row)
}

fn db_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn get_config(connection: &rusqlite::Connection, key: &str) -> Result<Option<String>, String> {
    connection
        .query_row("SELECT value FROM app_config WHERE key = ?1", params![key], |row| row.get(0))
        .optional()
        .map_err(db_error)
}

fn require_config(connection: &rusqlite::Connection, key: &str) -> Result<String, String> {
    get_config(connection, key)?.ok_or_else(|| format!("Missing app setting: {key}"))
}

fn set_config(connection: &rusqlite::Connection, key: &str, value: &str) -> Result<(), String> {
    connection
        .execute(
            r#"
INSERT INTO app_config (key, value)
VALUES (?1, ?2)
ON CONFLICT(key) DO UPDATE SET value = excluded.value
"#,
            params![key, value],
        )
        .map_err(db_error)?;

    Ok(())
}

#[tauri::command]
pub fn check_setup_complete(state: State<'_, DbState>) -> Result<bool, String> {
    let connection = state.connection.lock().map_err(db_error)?;
    Ok(get_config(&connection, "is_setup_complete")?.as_deref() == Some("true"))
}

#[tauri::command]
pub fn complete_setup(
    state: State<'_, DbState>,
    pin: String,
    smtp_email: String,
    smtp_password: String,
    recovery_email: String,
) -> Result<(), String> {
    crate::auth::validate_pin(&pin)?;
    if smtp_email.trim().is_empty() || smtp_password.trim().is_empty() || recovery_email.trim().is_empty() {
        return Err("Email setup fields cannot be empty".to_string());
    }

    let pin_hash = crate::auth::hash_secret(&pin)?;
    let connection = state.connection.lock().map_err(db_error)?;
    set_config(&connection, "app_pin_hash", &pin_hash)?;
    set_config(&connection, "smtp_email", smtp_email.trim())?;
    set_config(&connection, "smtp_password", &smtp_password.replace(' ', ""))?;
    set_config(&connection, "recovery_email", recovery_email.trim())?;
    set_config(&connection, "is_setup_complete", "true")?;

    Ok(())
}

#[tauri::command]
pub fn test_smtp(smtp_email: String, smtp_password: String) -> Result<(), String> {
    if smtp_email.trim().is_empty() || smtp_password.trim().is_empty() {
        return Err("Gmail address and App Password are required".to_string());
    }

    crate::email::send_test_email(smtp_email.trim(), &smtp_password.replace(' ', ""))
}

#[tauri::command]
pub fn verify_pin(state: State<'_, DbState>, pin: String) -> Result<bool, String> {
    let connection = state.connection.lock().map_err(db_error)?;
    let hash = require_config(&connection, "app_pin_hash")?;
    crate::auth::verify_secret(&pin, &hash)
}

fn request_otp_for_purpose(
    connection: &rusqlite::Connection,
    purpose: &str,
) -> Result<(), String> {
    let now = Utc::now();
    let newest_expiry: Option<String> = connection
        .query_row(
            "SELECT expires_at FROM otp_tokens WHERE used = 0 AND purpose = ?1 ORDER BY id DESC LIMIT 1",
            params![purpose],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?;

    if let Some(expires_at) = newest_expiry {
        if let Ok(expiry) = chrono::DateTime::parse_from_rfc3339(&expires_at) {
            if expiry.with_timezone(&Utc) > now + Duration::minutes(9) {
                return Err("Please wait before requesting another code".to_string());
            }
        }
    }

    let code = crate::auth::generate_otp();
    let code_hash = crate::auth::hash_secret(&code)?;
    let expires_at = (now + Duration::minutes(10)).to_rfc3339();
    let smtp_email = require_config(connection, "smtp_email")?;
    let smtp_password = require_config(connection, "smtp_password")?;
    let recovery_email = require_config(connection, "recovery_email")?;

    connection
        .execute("DELETE FROM otp_tokens WHERE purpose = ?1", params![purpose])
        .map_err(db_error)?;
    connection
        .execute(
            "INSERT INTO otp_tokens (code_hash, expires_at, used, purpose) VALUES (?1, ?2, 0, ?3)",
            params![code_hash, expires_at, purpose],
        )
        .map_err(db_error)?;

    crate::email::send_otp_email(
        &smtp_email,
        &smtp_password,
        &recovery_email,
        &code,
        purpose,
    )
}

fn verify_otp_for_purpose(
    connection: &rusqlite::Connection,
    code: &str,
    purpose: &str,
) -> Result<bool, String> {
    let token: Option<(i64, String, String)> = connection
        .query_row(
            "SELECT id, code_hash, expires_at FROM otp_tokens WHERE used = 0 AND purpose = ?1 ORDER BY id DESC LIMIT 1",
            params![purpose],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(db_error)?;

    let Some((id, code_hash, expires_at)) = token else {
        return Err("No active verification code found".to_string());
    };

    let expiry = chrono::DateTime::parse_from_rfc3339(&expires_at)
        .map_err(|_| "Verification code is invalid".to_string())?
        .with_timezone(&Utc);
    if expiry < Utc::now() {
        return Err("Verification code has expired".to_string());
    }

    if crate::auth::verify_secret(code, &code_hash)? {
        connection
            .execute("UPDATE otp_tokens SET used = 1 WHERE id = ?1", params![id])
            .map_err(db_error)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub fn request_otp(state: State<'_, DbState>) -> Result<(), String> {
    let connection = state.connection.lock().map_err(db_error)?;
    request_otp_for_purpose(&connection, "pin_reset")
}

#[tauri::command]
pub fn verify_otp(state: State<'_, DbState>, code: String) -> Result<bool, String> {
    let connection = state.connection.lock().map_err(db_error)?;
    verify_otp_for_purpose(&connection, &code, "pin_reset")
}

#[tauri::command]
pub fn request_recovery_email_otp(state: State<'_, DbState>) -> Result<(), String> {
    let connection = state.connection.lock().map_err(db_error)?;
    request_otp_for_purpose(&connection, "recovery_email_access")
}

#[tauri::command]
pub fn verify_recovery_email_otp(
    state: State<'_, DbState>,
    code: String,
) -> Result<bool, String> {
    let connection = state.connection.lock().map_err(db_error)?;
    verify_otp_for_purpose(&connection, &code, "recovery_email_access")
}

#[tauri::command]
pub fn request_pin_change_otp(state: State<'_, DbState>) -> Result<(), String> {
    let connection = state.connection.lock().map_err(db_error)?;
    request_otp_for_purpose(&connection, "pin_change_access")
}

#[tauri::command]
pub fn verify_pin_change_otp(
    state: State<'_, DbState>,
    code: String,
) -> Result<bool, String> {
    let connection = state.connection.lock().map_err(db_error)?;
    verify_otp_for_purpose(&connection, &code, "pin_change_access")
}

#[tauri::command]
pub fn reset_pin(state: State<'_, DbState>, new_pin: String) -> Result<(), String> {
    crate::auth::validate_pin(&new_pin)?;
    let connection = state.connection.lock().map_err(db_error)?;
    let verified_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM otp_tokens WHERE used = 1 AND purpose = 'pin_reset'",
            [],
            |row| row.get(0),
        )
        .map_err(db_error)?;

    if verified_count == 0 {
        return Err("OTP not verified".to_string());
    }

    let pin_hash = crate::auth::hash_secret(&new_pin)?;
    set_config(&connection, "app_pin_hash", &pin_hash)?;
    connection
        .execute("DELETE FROM otp_tokens WHERE purpose = 'pin_reset'", [])
        .map_err(db_error)?;
    Ok(())
}

#[tauri::command]
pub fn change_pin(
    state: State<'_, DbState>,
    current_pin: String,
    new_pin: String,
) -> Result<(), String> {
    crate::auth::validate_pin(&new_pin)?;
    let connection = state.connection.lock().map_err(db_error)?;
    let current_hash = require_config(&connection, "app_pin_hash")?;
    if !crate::auth::verify_secret(&current_pin, &current_hash)? {
        return Err("Current PIN is incorrect".to_string());
    }

    let next_hash = crate::auth::hash_secret(&new_pin)?;
    set_config(&connection, "app_pin_hash", &next_hash)
}

#[tauri::command]
pub fn update_smtp_config(
    state: State<'_, DbState>,
    smtp_email: String,
    smtp_password: String,
    recovery_email: String,
) -> Result<(), String> {
    if smtp_email.trim().is_empty() || smtp_password.trim().is_empty() || recovery_email.trim().is_empty() {
        return Err("Email setup fields cannot be empty".to_string());
    }

    let connection = state.connection.lock().map_err(db_error)?;
    set_config(&connection, "smtp_email", smtp_email.trim())?;
    set_config(&connection, "smtp_password", &smtp_password.replace(' ', ""))?;
    set_config(&connection, "recovery_email", recovery_email.trim())
}

#[tauri::command]
pub fn get_recovery_email(state: State<'_, DbState>) -> Result<String, String> {
    let connection = state.connection.lock().map_err(db_error)?;
    get_config(&connection, "recovery_email").map(|value| value.unwrap_or_default())
}

#[tauri::command]
pub fn update_recovery_email(
    state: State<'_, DbState>,
    recovery_email: String,
) -> Result<(), String> {
    if recovery_email.trim().is_empty() {
        return Err("Recovery email cannot be empty".to_string());
    }

    let connection = state.connection.lock().map_err(db_error)?;
    set_config(&connection, "recovery_email", recovery_email.trim())
}

#[tauri::command]
pub fn get_cases(state: State<'_, DbState>, school_year: Option<String>) -> Result<Vec<CaseRecord>, String> {
    let connection = state.connection.lock().map_err(db_error)?;
    
    let mut query = r#"
SELECT id, first_name, last_name, middle_initial, level, section, date, date_filed, adviser, "case", description, sanction, progress, proofs, students, title, reporting_student, group_id, update_history, school_year
FROM cases
"#.to_string();

    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    
    if let Some(ref year) = school_year {
        if !year.is_empty() && year != "all" {
            query.push_str(" WHERE (strftime('%Y', date) = ?1 OR school_year = ?1) ");
            params_vec.push(Box::new(year.clone()));
        }
    }
    
    query.push_str(" ORDER BY id DESC");

    let mut statement = connection.prepare(&query).map_err(db_error)?;

    let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    
    let cases = statement
        .query_map(rusqlite::params_from_iter(param_refs), map_case)
        .map_err(db_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_error)?;

    Ok(cases)
}

#[tauri::command]
pub fn get_current_school_year(_state: State<'_, DbState>) -> Result<Option<String>, String> {
    Ok(Some(chrono::Utc::now().format("%Y").to_string()))
}

#[tauri::command]
pub fn set_current_school_year(state: State<'_, DbState>, start_year: String) -> Result<String, String> {
    let connection = state.connection.lock().map_err(db_error)?;
    set_config(&connection, "current_school_year", &start_year)?;
    Ok(start_year)
}

#[tauri::command]
pub fn get_all_school_years(state: State<'_, DbState>) -> Result<Vec<String>, String> {
    let connection = state.connection.lock().map_err(db_error)?;
    
    let mut statement = connection
        .prepare("SELECT DISTINCT strftime('%Y', date) as yr FROM cases WHERE date IS NOT NULL AND date != '' UNION SELECT DISTINCT school_year as yr FROM cases WHERE school_year != '' ORDER BY yr DESC")
        .map_err(db_error)?;
        
    let mut years: Vec<String> = statement
        .query_map([], |row| row.get(0))
        .map_err(db_error)?
        .filter_map(|r| r.ok())
        .filter(|y: &String| !y.is_empty() && y != "null")
        .collect();
        
    let current_calendar_year = chrono::Utc::now().format("%Y").to_string();
    if !years.contains(&current_calendar_year) {
        years.insert(0, current_calendar_year);
    }
    
    years.sort_by(|a, b| b.cmp(a));
    years.dedup();
    
    Ok(years)
}

use crate::models::CasePayload;


#[tauri::command]
pub fn add_case(
    state: State<'_, DbState>,
    payload: CasePayload,
) -> Result<i64, String> {
    let connection = state.connection.lock().map_err(db_error)?;
    CaseRepository::insert(&connection, &payload)
}

#[tauri::command]
pub fn update_case(
    state: State<'_, DbState>,
    id: i64,
    payload: CasePayload,
    update_log: Option<String>,
) -> Result<(), String> {
    let connection = state.connection.lock().map_err(db_error)?;
    CaseRepository::update(&connection, id, &payload, update_log)
}

#[tauri::command]
pub fn delete_case(state: State<'_, DbState>, id: i64) -> Result<(), String> {
    let connection = state.connection.lock().map_err(db_error)?;
    let rows_deleted = connection
        .execute("DELETE FROM cases WHERE id = ?1", params![id])
        .map_err(db_error)?;

    if rows_deleted == 0 {
        return Err(format!("Case with id {id} was not found"));
    }

    Ok(())
}

#[tauri::command]
pub fn get_case(state: State<'_, DbState>, id: i64) -> Result<CaseRecord, String> {
    let connection = state.connection.lock().map_err(db_error)?;
    let case = connection
        .query_row(
            r#"
SELECT id, first_name, last_name, middle_initial, level, section, date, date_filed, adviser, "case", description, sanction, progress, proofs, students, title, reporting_student, group_id, update_history, school_year
FROM cases
WHERE id = ?1
"#,
            params![id],
            map_case,
        )
        .optional()
        .map_err(db_error)?;

    case.ok_or_else(|| format!("Case with id {id} was not found"))
}

#[tauri::command]
pub fn copy_generated_proof(src_path: String, dest_filename: String) -> Result<String, String> {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let dest_path = std::path::Path::new(manifest_dir)
        .parent()
        .unwrap()
        .join("src")
        .join("assets")
        .join(&dest_filename);

    if let Some(parent) = dest_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    std::fs::copy(&src_path, &dest_path)
        .map_err(|e| format!("Failed to copy file from {} to {:?}: {}", src_path, dest_path, e))?;

    Ok(format!("Successfully copied to {:?}", dest_path))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupRecord {
    pub date_time: String,
    pub backup_type: String,
    pub file_size: String,
    pub filename: String,
}

#[tauri::command]
pub fn get_backups(app: tauri::AppHandle) -> Result<Vec<BackupRecord>, String> {
    use tauri::Manager;
    use std::fs;

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let backup_dir = app_data_dir.join("backups");

    let mut backups = Vec::new();
    if let Ok(entries) = fs::read_dir(backup_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(filename) = path.file_name().and_then(|f| f.to_str()) {
                    if filename.starts_with("backup_") {
                        let backup_type = if filename.starts_with("backup_manual_") {
                            "Manual".to_string()
                        } else {
                            "Automatic".to_string()
                        };

                        let time_part = filename.split('_').skip(2).collect::<Vec<_>>().join("_");
                        let date_time = if time_part.len() >= 19 {
                            let mut dt = String::new();
                            if let Some((date_str, time_str)) = time_part.split_once('_') {
                                dt = format!("{} {}", date_str, time_str.replace('-', ":"));
                                dt.truncate(16);
                            }
                            if dt.is_empty() { time_part.clone() } else { dt }
                        } else {
                            time_part
                        };

                        let mut size = 0;
                        if let Ok(db_meta) = fs::metadata(path.join("snapshot.db")) {
                            size += db_meta.len();
                        }
                        if let Ok(csv_meta) = fs::metadata(path.join("snapshot.csv")) {
                            size += csv_meta.len();
                        }

                        let file_size = if size >= 1_073_741_824 {
                            format!("{:.1} GB", size as f64 / 1_073_741_824.0)
                        } else if size >= 1_048_576 {
                            format!("{:.1} MB", size as f64 / 1_048_576.0)
                        } else {
                            format!("{:.1} KB", size as f64 / 1024.0)
                        };

                        backups.push(BackupRecord {
                            date_time,
                            backup_type,
                            file_size,
                            filename: filename.to_string(),
                        });
                    }
                }
            }
        }
    }

    backups.sort_by(|a, b| b.filename.cmp(&a.filename));
    Ok(backups)
}

#[tauri::command]
pub fn create_backup(
    app: tauri::AppHandle,
    state: State<'_, DbState>,
    is_manual: Option<bool>,
) -> Result<(), String> {
    use tauri::Manager;
    use std::fs;

    let db_path = crate::db::get_db_path(&app).map_err(|e| e.to_string())?;
    if !db_path.exists() {
        return Err("Database file does not exist".to_string());
    }

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let backup_dir = app_data_dir.join("backups");
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    let now = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
    let is_manual = is_manual.unwrap_or(true);
    let prefix = if is_manual { "backup_manual" } else { "backup_auto" };
    let folder_name = format!("{}_{}", prefix, now);
    let current_backup_dir = backup_dir.join(&folder_name);
    fs::create_dir_all(&current_backup_dir).map_err(|e| e.to_string())?;

    fs::copy(&db_path, current_backup_dir.join("snapshot.db")).map_err(|e| e.to_string())?;

    let connection = state.connection.lock().map_err(db_error)?;
    crate::db::backup::export_csv(&connection, &current_backup_dir.join("snapshot.csv"))?;

    Ok(())
}

#[tauri::command]
pub fn restore_backup(
    app: tauri::AppHandle,
    state: State<'_, DbState>,
    filename: String,
) -> Result<(), String> {
    use tauri::Manager;
    use std::fs;

    let db_path = crate::db::get_db_path(&app).map_err(|e| e.to_string())?;
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let backup_dir = app_data_dir.join("backups");
    let backup_file = backup_dir.join(&filename).join("snapshot.db");

    if !backup_file.exists() {
        return Err(format!("Backup file snapshot.db does not exist in folder {}", filename));
    }

    let mut connection_guard = state.connection.lock().map_err(|_| "Failed to lock database state")?;
    
    // Temporarily replace with in-memory connection to drop file handles
    let temp_conn = rusqlite::Connection::open_in_memory().map_err(|e| e.to_string())?;
    *connection_guard = temp_conn;

    // Perform copy
    fs::copy(&backup_file, &db_path).map_err(|e| e.to_string())?;

    // Reopen original connection
    let new_conn = crate::db::open_db(&db_path).map_err(|e| e.to_string())?;
    *connection_guard = new_conn;

    Ok(())
}

#[tauri::command]
pub fn delete_backup(
    app: tauri::AppHandle,
    filename: String,
) -> Result<(), String> {
    use tauri::Manager;
    use std::fs;

    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return Err("Invalid backup filename".to_string());
    }

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let backup_dir = app_data_dir.join("backups").join(&filename);

    if !backup_dir.exists() {
        return Err(format!("Backup folder {} does not exist", filename));
    }

    fs::remove_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn save_file(
    app: tauri::AppHandle,
    base64_data: String,
    filename: String,
) -> Result<String, String> {
    use tauri::Manager;
    use std::fs;
    use base64::{Engine as _, engine::general_purpose};
    use tauri_plugin_opener::OpenerExt;

    let download_dir = app.path().download_dir().map_err(|e| e.to_string())?;
    let file_path = download_dir.join(&filename);

    let bytes = general_purpose::STANDARD.decode(base64_data).map_err(|e| e.to_string())?;
    fs::write(&file_path, bytes).map_err(|e| e.to_string())?;

    let path_str = file_path.to_string_lossy().to_string();
    let _ = app.opener().open_path(&path_str, None::<&str>);

    Ok(path_str)
}

#[tauri::command]
pub fn save_pdf(
    app: tauri::AppHandle,
    base64_data: String,
    filename: String,
) -> Result<String, String> {
    save_file(app, base64_data, filename)
}

#[tauri::command]
pub fn export_db_file(
    app: tauri::AppHandle,
    state: State<'_, DbState>,
    dest_path: String,
) -> Result<(), String> {
    use std::fs;
    let _conn = state.connection.lock().map_err(|_| "Failed to lock database state")?;
    let db_path = crate::db::get_db_path(&app).map_err(|e| e.to_string())?;
    fs::copy(&db_path, &dest_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn import_db_file(
    app: tauri::AppHandle,
    state: State<'_, DbState>,
    src_path: String,
) -> Result<(), String> {
    use std::fs;
    let db_path = crate::db::get_db_path(&app).map_err(|e| e.to_string())?;
    let mut connection_guard = state.connection.lock().map_err(|_| "Failed to lock database state")?;
    
    let temp_conn = rusqlite::Connection::open_in_memory().map_err(|e| e.to_string())?;
    *connection_guard = temp_conn;

    fs::copy(&src_path, &db_path).map_err(|e| e.to_string())?;

    let new_conn = crate::db::open_db(&db_path).map_err(|e| e.to_string())?;
    *connection_guard = new_conn;

    Ok(())
}

#[tauri::command]
pub fn get_active_months(state: State<'_, DbState>, school_year: String) -> Result<Vec<String>, String> {
    let connection = state.connection.lock().map_err(db_error)?;
    CaseRepository::get_active_months(&connection, &school_year)
}

#[tauri::command]
pub fn reset_application_data(state: State<'_, DbState>, pin: String) -> Result<(), String> {
    crate::auth::validate_pin(&pin)?;
    let connection = state.connection.lock().map_err(db_error)?;
    let hash = require_config(&connection, "app_pin_hash")?;
    if !crate::auth::verify_secret(&pin, &hash)? {
        return Err("Incorrect PIN. Cannot reset application data.".to_string());
    }

    connection.execute("DELETE FROM cases;", []).map_err(db_error)?;
    connection.execute("DELETE FROM otp_tokens;", []).map_err(db_error)?;
    let _ = connection.execute("DELETE FROM sqlite_sequence WHERE name = 'cases';", []);

    Ok(())
}

