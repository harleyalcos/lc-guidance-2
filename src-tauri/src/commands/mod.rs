use chrono::{Duration, Utc};
use rusqlite::{params, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use tauri::State;

pub mod import;
pub use import::*;

pub mod ai;
pub use ai::*;

use crate::db::DbState;

use crate::db::repository::CaseRepository;
use crate::models::CaseRecord;

// primary_student logic moved to repository

pub fn map_case(row: &Row<'_>) -> rusqlite::Result<CaseRecord> {
    CaseRepository::map_case(row)
}

fn db_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

pub(crate) fn get_config(
    connection: &rusqlite::Connection,
    key: &str,
) -> Result<Option<String>, String> {
    connection
        .query_row(
            "SELECT value FROM app_config WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)
}

pub(crate) fn require_config(
    connection: &rusqlite::Connection,
    key: &str,
) -> Result<String, String> {
    get_config(connection, key)?.ok_or_else(|| format!("Missing app setting: {key}"))
}

pub(crate) fn set_config(
    connection: &rusqlite::Connection,
    key: &str,
    value: &str,
) -> Result<(), String> {
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
    let mut connection = state.connection.lock().map_err(db_error)?;
    if get_config(&connection, "is_setup_complete")?.as_deref() == Some("true") {
        return Err(
            "Setup has already been completed. Use Account Settings to change credentials.".into(),
        );
    }
    let configure_email = !smtp_email.trim().is_empty()
        || !smtp_password.trim().is_empty()
        || !recovery_email.trim().is_empty();
    if configure_email {
        validate_email_settings(&smtp_email, &smtp_password, &recovery_email)?;
    }
    let hash = crate::auth::hash_secret(&pin)?;
    let tx = connection.transaction().map_err(db_error)?;
    set_config(&tx, "app_pin_hash", &hash)?;
    if configure_email {
        set_config(&tx, "smtp_email", smtp_email.trim())?;
        set_config(&tx, "smtp_password", &smtp_password.replace(' ', ""))?;
        set_config(&tx, "recovery_email", recovery_email.trim())?;
    }
    set_config(&tx, "is_setup_complete", "true")?;
    tx.commit().map_err(db_error)
}

#[tauri::command]
pub async fn test_smtp(
    state: State<'_, DbState>,
    smtp_email: String,
    smtp_password: String,
    recovery_email: String,
) -> Result<(), String> {
    {
        let connection = state.connection.lock().map_err(db_error)?;
        if get_config(&connection, "is_setup_complete")?.as_deref() == Some("true") {
            state.require_session()?;
        }
    }
    validate_email_settings(&smtp_email, &smtp_password, &recovery_email)?;
    tauri::async_runtime::spawn_blocking(move || {
        crate::email::send_test_email(
            smtp_email.trim(),
            &smtp_password.replace(' ', ""),
            recovery_email.trim(),
        )
    })
    .await
    .map_err(db_error)?
}

#[tauri::command]
pub fn verify_pin(state: State<'_, DbState>, pin: String) -> Result<bool, String> {
    let connection = state.connection.lock().map_err(db_error)?;
    verify_current_pin(&state, &connection, &pin, true)
}

fn request_otp_for_purpose(
    connection: &rusqlite::Connection,
    purpose: &str,
) -> Result<(String, String, String, String), String> {
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
    let smtp_email = get_config(connection, "smtp_email")?.filter(|s| !s.is_empty()).ok_or("Email recovery is not configured. Sign in with your PIN and configure Recovery email delivery in Settings. If the PIN is lost, contact the school IT administrator.")?;
    let smtp_password = require_config(connection, "smtp_password")?;
    let recovery_email = require_config(connection, "recovery_email")?;

    connection
        .execute(
            "DELETE FROM otp_tokens WHERE purpose = ?1",
            params![purpose],
        )
        .map_err(db_error)?;
    connection
        .execute(
            "INSERT INTO otp_tokens (code_hash, expires_at, used, purpose) VALUES (?1, ?2, 0, ?3)",
            params![code_hash, expires_at, purpose],
        )
        .map_err(db_error)?;

    Ok((smtp_email, smtp_password, recovery_email, code))
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
        let attempt_key = format!("otp_attempts_{}", id);
        let _ = connection.execute(
            "DELETE FROM app_config WHERE key = ?1",
            params![&attempt_key],
        );
        Ok(true)
    } else {
        let attempt_key = format!("otp_attempts_{}", id);
        let current_attempts: i64 = connection
            .query_row(
                "SELECT value FROM app_config WHERE key = ?1",
                params![&attempt_key],
                |r| r.get::<_, String>(0),
            )
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(0)
            + 1;

        if current_attempts >= 5 {
            let _ = connection.execute("DELETE FROM otp_tokens WHERE id = ?1", params![id]);
            let _ = connection.execute(
                "DELETE FROM app_config WHERE key = ?1",
                params![&attempt_key],
            );
            return Err(
                "Too many failed attempts. This verification code has been invalidated."
                    .to_string(),
            );
        } else {
            let _ = set_config(connection, &attempt_key, &current_attempts.to_string());
        }
        Ok(false)
    }
}

#[tauri::command]
pub async fn request_otp(state: State<'_, DbState>) -> Result<(), String> {
    send_requested_code(state, "pin_reset").await
}

#[tauri::command]
pub fn verify_otp(state: State<'_, DbState>, code: String) -> Result<bool, String> {
    let connection = state.connection.lock().map_err(db_error)?;
    let verified = verify_otp_for_purpose(&connection, &code, "pin_reset")?;
    if verified {
        let expires: String = connection.query_row("SELECT expires_at FROM otp_tokens WHERE purpose = ?1 AND used = 1 ORDER BY id DESC LIMIT 1", ["pin_reset"], |r| r.get(0)).map_err(db_error)?;
        let expiry = chrono::DateTime::parse_from_rfc3339(&expires)
            .map_err(db_error)?
            .with_timezone(&Utc);
        state
            .security
            .lock()
            .map_err(db_error)?
            .grants
            .insert("pin_reset".into(), expiry);
    }
    Ok(verified)
}

#[tauri::command]
pub async fn request_recovery_email_otp(state: State<'_, DbState>) -> Result<(), String> {
    state.require_session()?;
    send_requested_code(state, "recovery_email_access").await
}

#[tauri::command]
pub fn verify_recovery_email_otp(state: State<'_, DbState>, code: String) -> Result<bool, String> {
    state.require_session()?;
    let connection = state.connection.lock().map_err(db_error)?;
    let verified = verify_otp_for_purpose(&connection, &code, "recovery_email_access")?;
    if verified {
        let expires: String = connection.query_row("SELECT expires_at FROM otp_tokens WHERE purpose = ?1 AND used = 1 ORDER BY id DESC LIMIT 1", ["recovery_email_access"], |r| r.get(0)).map_err(db_error)?;
        let expiry = chrono::DateTime::parse_from_rfc3339(&expires)
            .map_err(db_error)?
            .with_timezone(&Utc);
        state
            .security
            .lock()
            .map_err(db_error)?
            .grants
            .insert("recovery_email_access".into(), expiry);
    }
    Ok(verified)
}

#[tauri::command]
pub async fn request_pin_change_otp(state: State<'_, DbState>) -> Result<(), String> {
    state.require_session()?;
    send_requested_code(state, "pin_change_access").await
}

#[tauri::command]
pub fn verify_pin_change_otp(state: State<'_, DbState>, code: String) -> Result<bool, String> {
    state.require_session()?;
    let connection = state.connection.lock().map_err(db_error)?;
    let verified = verify_otp_for_purpose(&connection, &code, "pin_change_access")?;
    if verified {
        let expires: String = connection.query_row("SELECT expires_at FROM otp_tokens WHERE purpose = ?1 AND used = 1 ORDER BY id DESC LIMIT 1", ["pin_change_access"], |r| r.get(0)).map_err(db_error)?;
        let expiry = chrono::DateTime::parse_from_rfc3339(&expires)
            .map_err(db_error)?
            .with_timezone(&Utc);
        state
            .security
            .lock()
            .map_err(db_error)?
            .grants
            .insert("pin_change_access".into(), expiry);
    }
    Ok(verified)
}

#[tauri::command]
pub fn reset_pin(state: State<'_, DbState>, new_pin: String) -> Result<(), String> {
    crate::auth::validate_pin(&new_pin)?;
    let mut connection = state.connection.lock().map_err(db_error)?;
    let mut security = state.security.lock().map_err(db_error)?;
    if !security.has_grant("pin_reset") {
        return Err("Verification expired. Request a new reset code.".into());
    }
    let hash = crate::auth::hash_secret(&new_pin)?;
    let tx = connection.transaction().map_err(db_error)?;
    set_config(&tx, "app_pin_hash", &hash)?;
    tx.execute("DELETE FROM otp_tokens", []).map_err(db_error)?;
    tx.commit().map_err(db_error)?;
    security.revoke();
    security.failures = 0;
    security.locked_until = None;
    Ok(())
}

#[tauri::command]
pub fn change_pin(
    state: State<'_, DbState>,
    current_pin: String,
    new_pin: String,
) -> Result<(), String> {
    state.require_session()?;
    crate::auth::validate_pin(&new_pin)?;
    let connection = state.connection.lock().map_err(db_error)?;
    if !verify_current_pin(&state, &connection, &current_pin, false)? {
        return Err("Current PIN is incorrect".into());
    }
    set_config(
        &connection,
        "app_pin_hash",
        &crate::auth::hash_secret(&new_pin)?,
    )?;
    state.security.lock().map_err(db_error)?.grants.clear();
    connection
        .execute("DELETE FROM otp_tokens", [])
        .map_err(db_error)?;
    Ok(())
}

#[tauri::command]
pub fn update_smtp_config(
    state: State<'_, DbState>,
    smtp_email: String,
    smtp_password: String,
    recovery_email: String,
    pin: Option<String>,
) -> Result<(), String> {
    state.require_session()?;
    validate_email_settings(&smtp_email, &smtp_password, &recovery_email)?;
    let mut connection = state.connection.lock().map_err(db_error)?;
    let authorized = if let Some(pin) = pin {
        verify_current_pin(&state, &connection, &pin, false)?
    } else {
        state
            .security
            .lock()
            .map_err(db_error)?
            .has_grant("recovery_email_access")
    };
    if !authorized {
        return Err("Enter your current PIN or verify a new recovery-email code.".into());
    }
    let tx = connection.transaction().map_err(db_error)?;
    set_config(&tx, "smtp_email", smtp_email.trim())?;
    set_config(&tx, "smtp_password", &smtp_password.replace(' ', ""))?;
    set_config(&tx, "recovery_email", recovery_email.trim())?;
    tx.execute("DELETE FROM otp_tokens", []).map_err(db_error)?;
    tx.commit().map_err(db_error)?;
    state.security.lock().map_err(db_error)?.grants.clear();
    Ok(())
}

#[tauri::command]
pub fn get_recovery_email(state: State<'_, DbState>) -> Result<String, String> {
    state.require_session()?;
    let connection = state.connection.lock().map_err(db_error)?;
    get_config(&connection, "recovery_email").map(|value| value.unwrap_or_default())
}

#[tauri::command]
pub fn update_recovery_email(
    state: State<'_, DbState>,
    recovery_email: String,
    pin: Option<String>,
) -> Result<(), String> {
    state.require_session()?;
    crate::email::validate_address(recovery_email.trim())?;
    let mut connection = state.connection.lock().map_err(db_error)?;
    let authorized = if let Some(pin) = pin {
        verify_current_pin(&state, &connection, &pin, false)?
    } else {
        state
            .security
            .lock()
            .map_err(db_error)?
            .has_grant("recovery_email_access")
    };
    if !authorized {
        return Err("Enter your current PIN or verify a new recovery-email code.".into());
    }
    let tx = connection.transaction().map_err(db_error)?;
    set_config(&tx, "recovery_email", recovery_email.trim())?;
    tx.execute(
        "DELETE FROM otp_tokens WHERE purpose = 'recovery_email_access'",
        [],
    )
    .map_err(db_error)?;
    tx.commit().map_err(db_error)?;
    state
        .security
        .lock()
        .map_err(db_error)?
        .grants
        .remove("recovery_email_access");
    Ok(())
}

#[tauri::command]
pub fn get_cases(
    state: State<'_, DbState>,
    school_year: Option<String>,
    group_id: Option<String>,
) -> Result<Vec<CaseRecord>, String> {
    state.require_session()?;
    let connection = state.connection.lock().map_err(db_error)?;
    CaseRepository::get_cases(&connection, school_year, group_id).map_err(db_error)
}

#[tauri::command]
pub fn get_current_school_year(state: State<'_, DbState>) -> Result<Option<String>, String> {
    state.require_session()?;
    let connection = state.connection.lock().map_err(db_error)?;
    let saved = get_config(&connection, "current_school_year")?;
    if let Some(sy) = saved {
        if !sy.trim().is_empty() {
            return Ok(Some(sy));
        }
    }
    Ok(Some(chrono::Utc::now().format("%Y").to_string()))
}

#[tauri::command]
pub fn set_current_school_year(
    state: State<'_, DbState>,
    start_year: String,
) -> Result<String, String> {
    state.require_session()?;
    let connection = state.connection.lock().map_err(db_error)?;
    set_config(&connection, "current_school_year", &start_year)?;
    Ok(start_year)
}

#[tauri::command]
pub fn get_all_school_years(state: State<'_, DbState>) -> Result<Vec<String>, String> {
    state.require_session()?;
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
pub fn add_case(state: State<'_, DbState>, payload: CasePayload) -> Result<i64, String> {
    state.require_session()?;
    let connection = state.connection.lock().map_err(db_error)?;
    let id = CaseRepository::insert(&connection, &payload)?;
    crate::db::backup::run_scheduled(&state, &connection, true);
    Ok(id)
}

#[tauri::command]
pub fn update_case(
    state: State<'_, DbState>,
    id: i64,
    payload: CasePayload,
    update_log: Option<String>,
) -> Result<(), String> {
    state.require_session()?;
    let connection = state.connection.lock().map_err(db_error)?;
    CaseRepository::update(&connection, id, &payload, update_log)
}

#[tauri::command]
pub fn delete_case(state: State<'_, DbState>, id: i64) -> Result<(), String> {
    state.require_session()?;
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
    state.require_session()?;
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
pub fn copy_generated_proof(
    state: State<'_, DbState>,
    src_path: String,
    dest_filename: String,
) -> Result<String, String> {
    state.require_session()?;
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

    std::fs::copy(&src_path, &dest_path).map_err(|e| {
        format!(
            "Failed to copy file from {} to {:?}: {}",
            src_path, dest_path, e
        )
    })?;

    Ok(format!("Successfully copied to {:?}", dest_path))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupRecord {
    pub date_time: String,
    pub backup_type: String,
    pub file_size: String,
    pub filename: String,
}

pub fn backup_timestamp(filename: &str) -> String {
    filename.split('_').skip(2).collect::<Vec<_>>().join("_")
}

#[tauri::command]
pub fn get_backups(
    state: State<'_, DbState>,
    app: tauri::AppHandle,
) -> Result<Vec<BackupRecord>, String> {
    state.require_session()?;
    use std::fs;
    use tauri::Manager;

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let backup_dir = app_data_dir.join("backups");

    let mut backups = Vec::new();
    if backup_dir.exists() {
        let entries = fs::read_dir(&backup_dir).map_err(db_error)?;
        for entry in entries {
            let entry = entry.map_err(db_error)?;
            let path = entry.path();
            if path.is_dir() {
                if let Some(filename) = path.file_name().and_then(|f| f.to_str()) {
                    if filename.starts_with("backup_") && path.join("snapshot.db").is_file() {
                        let backup_type = if filename.starts_with("backup_manual_") {
                            "Manual".to_string()
                        } else if filename.starts_with("backup_safety_") {
                            "Safety".to_string()
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
                            if dt.is_empty() {
                                time_part.clone()
                            } else {
                                dt
                            }
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

    backups.sort_by(|a, b| backup_timestamp(&b.filename).cmp(&backup_timestamp(&a.filename)));
    Ok(backups)
}

#[tauri::command]
pub fn create_backup(
    app: tauri::AppHandle,
    state: State<'_, DbState>,
    is_manual: Option<bool>,
) -> Result<(), String> {
    state.require_session()?;
    use tauri::Manager;
    let directory = app.path().app_data_dir().map_err(db_error)?.join("backups");
    let connection = state.connection.lock().map_err(db_error)?;
    let manual = is_manual.unwrap_or(true);
    crate::db::backup::snapshot(
        &connection,
        &directory,
        if manual { "manual" } else { "auto" },
    )?;
    crate::db::backup::prune_automatic(
        &directory,
        crate::db::backup::policy(&connection)?.retention,
    )
}

#[tauri::command]
pub fn restore_backup(
    app: tauri::AppHandle,
    state: State<'_, DbState>,
    filename: String,
) -> Result<(), String> {
    state.require_session()?;
    use tauri::Manager;
    if filename.contains("..")
        || filename.contains('/')
        || filename.contains(char::from(92))
        || !filename.starts_with("backup_")
    {
        return Err("Invalid backup filename".into());
    }
    let directory = app.path().app_data_dir().map_err(db_error)?.join("backups");
    let mut connection = state.connection.lock().map_err(db_error)?;
    crate::db::recovery::replace_database(
        &mut connection,
        &directory.join(filename).join("snapshot.db"),
        &directory,
    )?;
    state.security.lock().map_err(db_error)?.revoke();
    Ok(())
}

#[tauri::command]
pub fn delete_backup(
    state: State<'_, DbState>,
    app: tauri::AppHandle,
    filename: String,
) -> Result<(), String> {
    state.require_session()?;
    use std::fs;
    use tauri::Manager;

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
    state: State<'_, DbState>,
    app: tauri::AppHandle,
    base64_data: String,
    filename: String,
) -> Result<String, String> {
    state.require_session()?;
    use base64::{engine::general_purpose, Engine as _};
    use std::fs;
    use tauri::Manager;
    use tauri_plugin_opener::OpenerExt;

    let download_dir = app.path().download_dir().map_err(|e| e.to_string())?;

    let sanitized_filename = filename.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
    let safe_name = std::path::Path::new(&sanitized_filename)
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("document.pdf");

    let bytes = general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| e.to_string())?;
    let original = download_dir.join(safe_name);
    let mut file_path = original.clone();
    let mut number = 0;
    loop {
        use std::io::Write;
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&file_path)
        {
            Ok(mut file) => {
                if let Err(error) = file.write_all(&bytes).and_then(|_| file.sync_all()) {
                    drop(file);
                    let _ = fs::remove_file(&file_path);
                    return Err(error.to_string());
                }
                break;
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                number += 1;
                let stem = original
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("document");
                let extension = original
                    .extension()
                    .and_then(|s| s.to_str())
                    .map(|s| format!(".{s}"))
                    .unwrap_or_default();
                file_path = download_dir.join(format!("{stem} ({number}){extension}"));
            }
            Err(error) => return Err(error.to_string()),
        }
    }

    let path_str = file_path.to_string_lossy().to_string();
    let _ = app.opener().open_path(&path_str, None::<&str>);

    Ok(path_str)
}

#[tauri::command]
pub fn save_pdf(
    state: State<'_, DbState>,
    app: tauri::AppHandle,
    base64_data: String,
    filename: String,
) -> Result<String, String> {
    state.require_session()?;
    save_file(state, app, base64_data, filename)
}

#[tauri::command]
pub fn export_db_file(
    _app: tauri::AppHandle,
    state: State<'_, DbState>,
    dest_path: String,
) -> Result<(), String> {
    state.require_session()?;
    let connection = state.connection.lock().map_err(db_error)?;
    let destination = std::path::Path::new(&dest_path);
    if destination.exists() {
        return Err("Choose a new filename so an existing database is not overwritten.".into());
    }
    let mut target = rusqlite::Connection::open(destination).map_err(db_error)?;
    crate::db::backup::copy_database(&connection, &mut target)
}

#[tauri::command]
pub fn import_db_file(
    app: tauri::AppHandle,
    state: State<'_, DbState>,
    src_path: String,
) -> Result<(), String> {
    state.require_session()?;
    use tauri::Manager;
    let directory = app.path().app_data_dir().map_err(db_error)?.join("backups");
    let mut connection = state.connection.lock().map_err(db_error)?;
    crate::db::recovery::replace_database(
        &mut connection,
        std::path::Path::new(&src_path),
        &directory,
    )?;
    state.security.lock().map_err(db_error)?.revoke();
    Ok(())
}

#[tauri::command]
pub fn get_active_months(
    state: State<'_, DbState>,
    school_year: String,
) -> Result<Vec<String>, String> {
    state.require_session()?;
    let connection = state.connection.lock().map_err(db_error)?;
    CaseRepository::get_active_months(&connection, &school_year)
}

#[tauri::command]
pub fn reset_application_data(state: State<'_, DbState>, pin: String) -> Result<(), String> {
    state.require_session()?;
    let mut connection = state.connection.lock().map_err(db_error)?;
    if !verify_current_pin(&state, &connection, &pin, false)? {
        return Err("Incorrect PIN. Cannot reset application data.".into());
    }
    if let Some(dir) = &state.backup_dir {
        crate::db::backup::snapshot(&connection, dir, "safety")?;
    }
    let tx = connection.transaction().map_err(db_error)?;
    tx.execute_batch("DELETE FROM case_save_requests; DELETE FROM ai_messages; DELETE FROM ai_sessions; DELETE FROM cases; DELETE FROM otp_tokens; DELETE FROM app_config WHERE key LIKE 'otp_attempts_%'; DELETE FROM sqlite_sequence WHERE name = 'cases';").map_err(db_error)?;
    tx.commit().map_err(db_error)?;
    state.security.lock().map_err(db_error)?.grants.clear();
    Ok(())
}

fn verify_current_pin(
    state: &DbState,
    connection: &rusqlite::Connection,
    pin: &str,
    login: bool,
) -> Result<bool, String> {
    let mut security = state.security.lock().map_err(db_error)?;
    security.check_attempt()?;
    let valid = crate::auth::verify_secret(pin, &require_config(connection, "app_pin_hash")?)?;
    security.record_attempt(valid);
    if login && valid {
        security.authenticated = true;
    }
    Ok(valid)
}

fn validate_email_settings(sender: &str, password: &str, recipient: &str) -> Result<(), String> {
    crate::email::validate_address(sender.trim())?;
    crate::email::validate_address(recipient.trim())?;
    if password.replace(' ', "").len() != 16 {
        return Err(
            "Enter the 16-character Gmail App Password (not your Gmail account password).".into(),
        );
    }
    Ok(())
}

#[tauri::command]
pub fn get_session(state: State<'_, DbState>) -> Result<bool, String> {
    Ok(state.security.lock().map_err(db_error)?.authenticated)
}

#[tauri::command]
pub fn sign_out(state: State<'_, DbState>) -> Result<(), String> {
    let connection = state.connection.lock().map_err(db_error)?;
    state.security.lock().map_err(db_error)?.revoke();
    connection
        .execute("DELETE FROM otp_tokens", [])
        .map_err(db_error)?;
    Ok(())
}

#[tauri::command]
pub fn get_backup_policy(
    state: State<'_, DbState>,
) -> Result<crate::db::backup::BackupPolicy, String> {
    state.require_session()?;
    let connection = state.connection.lock().map_err(db_error)?;
    crate::db::backup::policy(&connection)
}
#[tauri::command]
pub fn set_backup_policy(
    state: State<'_, DbState>,
    mut policy: crate::db::backup::BackupPolicy,
) -> Result<(), String> {
    state.require_session()?;
    policy.validate()?;
    policy.last_error = None;
    let connection = state.connection.lock().map_err(db_error)?;
    set_config(
        &connection,
        "backup_policy",
        &serde_json::to_string(&policy).map_err(db_error)?,
    )?;
    if let Some(dir) = &state.backup_dir {
        crate::db::backup::prune_automatic(dir, policy.retention)?;
    }
    crate::db::backup::run_scheduled(&state, &connection, false);
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseChange {
    pub kind: String,
    pub id: Option<i64>,
    pub payload: CasePayload,
    pub update_log: Option<String>,
}

/// One receipt and all respondent/sibling writes commit together.
pub fn apply_changes(
    connection: &mut rusqlite::Connection,
    request_id: &str,
    changes: Vec<CaseChange>,
) -> Result<Vec<i64>, String> {
    use sha2::{Digest, Sha256};
    uuid::Uuid::parse_str(request_id).map_err(|_| "Invalid save request.")?;
    if changes.is_empty() || changes.len() > 5000 {
        return Err("A save must contain 1 to 5,000 changes.".into());
    }
    let digest = format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&changes).map_err(db_error)?)
    );
    let previous: Option<(String, String)> = connection
        .query_row(
            "SELECT fingerprint, result FROM case_save_requests WHERE id = ?1",
            [request_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(db_error)?;
    if let Some((fingerprint, result)) = previous {
        if fingerprint != digest {
            return Err("This save already completed with different details. Reload the saved record before editing.".into());
        }
        return serde_json::from_str(&result).map_err(db_error);
    }
    let tx = connection.transaction().map_err(db_error)?;
    let mut ids = Vec::new();
    let mut shared_participants = std::collections::HashMap::<String, String>::new();
    for mut change in changes {
        if let Some(group) = &change.payload.group_id {
            for student in &mut change.payload.students {
                let role = student.role.as_deref().unwrap_or_default().to_lowercase();
                if role.starts_with("complainant")
                    && student.participant_id.as_deref().unwrap_or("").is_empty()
                {
                    let key = format!("{}|{}", group, crate::models::legacy_student_key(student));
                    student.participant_id = Some(
                        shared_participants
                            .entry(key)
                            .or_insert_with(|| uuid::Uuid::new_v4().to_string())
                            .clone(),
                    );
                }
            }
        }
        match change.kind.as_str() {
            "add" => ids.push(CaseRepository::insert(&tx, &change.payload)?),
            "update" => {
                let id = change.id.ok_or("An update requires a case ID.")?;
                CaseRepository::update(&tx, id, &change.payload, change.update_log)?;
                ids.push(id);
            }
            _ => return Err("Invalid case change.".into()),
        }
    }
    tx.execute(
        "INSERT INTO case_save_requests(id,fingerprint,result) VALUES (?1,?2,?3)",
        params![
            request_id,
            digest,
            serde_json::to_string(&ids).map_err(db_error)?
        ],
    )
    .map_err(db_error)?;
    tx.commit().map_err(db_error)?;
    Ok(ids)
}

#[tauri::command]
pub fn apply_case_changes(
    state: State<'_, DbState>,
    request_id: String,
    changes: Vec<CaseChange>,
) -> Result<Vec<i64>, String> {
    state.require_session()?;
    let mut connection = state.connection.lock().map_err(db_error)?;
    let creates_record = changes.iter().any(|c| c.kind == "add");
    let ids = apply_changes(&mut connection, &request_id, changes)?;
    crate::db::backup::run_scheduled(&state, &connection, creates_record);
    Ok(ids)
}

async fn send_requested_code(
    state: State<'_, DbState>,
    purpose: &'static str,
) -> Result<(), String> {
    let (sender, password, recipient, code) = {
        let connection = state.connection.lock().map_err(db_error)?;
        state
            .security
            .lock()
            .map_err(db_error)?
            .grants
            .remove(purpose);
        request_otp_for_purpose(&connection, purpose)?
    };
    let result = tauri::async_runtime::spawn_blocking(move || {
        crate::email::send_otp_email(&sender, &password, &recipient, &code, purpose)
    })
    .await
    .map_err(db_error)?;
    if result.is_err() {
        state
            .connection
            .lock()
            .map_err(db_error)?
            .execute("DELETE FROM otp_tokens WHERE purpose = ?1", [purpose])
            .map_err(db_error)?;
    }
    result
}
