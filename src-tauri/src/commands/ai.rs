use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;

use crate::db::DbState;

fn db_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiSession {
    pub id: String,
    pub title: String,
    pub tag: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiSavedMessage {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub metadata: Option<String>,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiGeneratedDocument {
    pub message_id: String,
    pub session_id: String,
    pub session_title: String,
    pub title: String,
    pub reporting_period: String,
    pub scope: String,
    pub status_filter: String,
    pub content: String,
    pub timestamp: String,
}

#[tauri::command]
pub fn get_gemini_api_key(state: State<'_, DbState>) -> Result<String, String> {
    let connection = state.connection.lock().map_err(db_error)?;
    
    let key: Option<String> = connection
        .query_row(
            "SELECT value FROM app_config WHERE key = 'gemini_api_key'",
            [],
            |row| row.get(0),
        )
        .ok();
        
    Ok(key.unwrap_or_default())
}

#[tauri::command]
pub fn set_gemini_api_key(state: State<'_, DbState>, api_key: String) -> Result<(), String> {
    let connection = state.connection.lock().map_err(db_error)?;
    
    connection
        .execute(
            "INSERT INTO app_config (key, value) VALUES ('gemini_api_key', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![api_key],
        )
        .map_err(db_error)?;
        
    Ok(())
}

#[tauri::command]
pub fn query_database_for_ai(state: State<'_, DbState>, sql: String) -> Result<Vec<Value>, String> {
    let sql_trimmed = sql.trim();
    if !sql_trimmed.to_uppercase().starts_with("SELECT") {
        return Err("Only SELECT queries are allowed for AI context.".to_string());
    }
    
    // As an additional safety check, prohibit any other operations via string search
    let upper_sql = sql_trimmed.to_uppercase();
    if upper_sql.contains("INSERT") || upper_sql.contains("UPDATE") || upper_sql.contains("DELETE") || upper_sql.contains("DROP") || upper_sql.contains("ALTER") {
        return Err("Query contains forbidden operations.".to_string());
    }

    let connection = state.connection.lock().map_err(db_error)?;
    let mut stmt = connection.prepare(sql_trimmed).map_err(db_error)?;
    
    let column_names: Vec<String> = stmt.column_names().iter().map(|&s| s.to_string()).collect();
    let column_count = column_names.len();
    
    let mut rows = stmt.query([]).map_err(db_error)?;
    let mut results = Vec::new();
    
    while let Some(row) = rows.next().map_err(db_error)? {
        let mut row_obj = serde_json::Map::new();
        
        for (i, col_name) in column_names.iter().enumerate().take(column_count) {
            let value = match row.get_ref(i).map_err(db_error)? {
                rusqlite::types::ValueRef::Null => Value::Null,
                rusqlite::types::ValueRef::Integer(i) => json!(i),
                rusqlite::types::ValueRef::Real(f) => json!(f),
                rusqlite::types::ValueRef::Text(t) => {
                    let text = std::str::from_utf8(t).unwrap_or("");
                    json!(text)
                },
                rusqlite::types::ValueRef::Blob(b) => {
                    json!(format!("<blob {} bytes>", b.len()))
                }
            };
            row_obj.insert(col_name.clone(), value);
        }
        
        results.push(Value::Object(row_obj));
        
        // Safety limit to avoid exhausting tokens / memory
        if results.len() >= 500 {
            break;
        }
    }
    
    Ok(results)
}

#[tauri::command]
pub fn get_ai_sessions(state: State<'_, DbState>) -> Result<Vec<AiSession>, String> {
    let connection = state.connection.lock().map_err(db_error)?;
    let mut stmt = connection
        .prepare("SELECT id, title, tag, created_at, updated_at FROM ai_sessions ORDER BY updated_at DESC")
        .map_err(db_error)?;
    
    let rows = stmt
        .query_map([], |row| {
            Ok(AiSession {
                id: row.get(0)?,
                title: row.get(1)?,
                tag: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(db_error)?;

    let mut sessions = Vec::new();
    for row in rows {
        sessions.push(row.map_err(db_error)?);
    }
    Ok(sessions)
}

#[tauri::command]
pub fn get_ai_session_messages(state: State<'_, DbState>, session_id: String) -> Result<Vec<AiSavedMessage>, String> {
    let connection = state.connection.lock().map_err(db_error)?;
    let mut stmt = connection
        .prepare("SELECT id, session_id, role, content, metadata, timestamp FROM ai_messages WHERE session_id = ?1 ORDER BY timestamp ASC")
        .map_err(db_error)?;

    let rows = stmt
        .query_map(params![session_id], |row| {
            Ok(AiSavedMessage {
                id: row.get(0)?,
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                metadata: row.get(4)?,
                timestamp: row.get(5)?,
            })
        })
        .map_err(db_error)?;

    let mut messages = Vec::new();
    for row in rows {
        messages.push(row.map_err(db_error)?);
    }
    Ok(messages)
}

#[tauri::command]
pub fn get_ai_generated_documents(state: State<'_, DbState>) -> Result<Vec<AiGeneratedDocument>, String> {
    let connection = state.connection.lock().map_err(db_error)?;
    let mut stmt = connection
        .prepare(
            "SELECT m.id, m.session_id, s.title, m.metadata, m.content, m.timestamp
             FROM ai_messages m
             JOIN ai_sessions s ON m.session_id = s.id
             WHERE m.metadata IS NOT NULL AND m.metadata != '' AND m.metadata != 'null'
             ORDER BY m.timestamp DESC",
        )
        .map_err(db_error)?;

    let rows = stmt
        .query_map([], |row| {
            let message_id: String = row.get(0)?;
            let session_id: String = row.get(1)?;
            let session_title: String = row.get(2)?;
            let metadata_raw: Option<String> = row.get(3)?;
            let content: String = row.get(4)?;
            let timestamp: String = row.get(5)?;

            let mut title = session_title.clone();
            let mut reporting_period = "—".to_string();
            let mut scope = "All Year Levels".to_string();
            let mut status_filter = "All Statuses".to_string();

            if let Some(ref meta_str) = metadata_raw {
                if let Ok(meta_json) = serde_json::from_str::<serde_json::Value>(meta_str) {
                    if let Some(t) = meta_json.get("title").and_then(|v| v.as_str()) {
                        if !t.trim().is_empty() {
                            title = t.to_string();
                        }
                    }
                    if let Some(p) = meta_json.get("reporting_period").and_then(|v| v.as_str()) {
                        if !p.trim().is_empty() {
                            reporting_period = p.to_string();
                        }
                    }
                    if let Some(s) = meta_json.get("scope").and_then(|v| v.as_str()) {
                        if !s.trim().is_empty() {
                            scope = s.to_string();
                        }
                    }
                    if let Some(st) = meta_json.get("status_filter").and_then(|v| v.as_str()) {
                        if !st.trim().is_empty() {
                            status_filter = st.to_string();
                        }
                    }
                }
            }

            Ok(AiGeneratedDocument {
                message_id,
                session_id,
                session_title,
                title,
                reporting_period,
                scope,
                status_filter,
                content,
                timestamp,
            })
        })
        .map_err(db_error)?;

    let mut docs = Vec::new();
    for row in rows {
        docs.push(row.map_err(db_error)?);
    }
    Ok(docs)
}

#[tauri::command]
pub fn save_ai_message(
    state: State<'_, DbState>,
    session_id: String,
    session_title: Option<String>,
    tag: Option<String>,
    message: AiSavedMessage,
) -> Result<(), String> {
    let connection = state.connection.lock().map_err(db_error)?;
    let now = chrono::Utc::now().to_rfc3339();

    // Check if session exists
    let exists: bool = connection
        .query_row(
            "SELECT COUNT(*) > 0 FROM ai_sessions WHERE id = ?1",
            params![session_id],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if !exists {
        let title = session_title.unwrap_or_else(|| "New Conversation".to_string());
        let session_tag = tag.unwrap_or_else(|| "Queries".to_string());
        connection
            .execute(
                "INSERT INTO ai_sessions (id, title, tag, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![session_id, title, session_tag, now, now],
            )
            .map_err(db_error)?;
    } else {
        // Update session's updated_at and optionally tag
        if let Some(t) = tag {
            connection
                .execute(
                    "UPDATE ai_sessions SET updated_at = ?1, tag = ?2 WHERE id = ?3",
                    params![now, t, session_id],
                )
                .map_err(db_error)?;
        } else {
            connection
                .execute(
                    "UPDATE ai_sessions SET updated_at = ?1 WHERE id = ?2",
                    params![now, session_id],
                )
                .map_err(db_error)?;
        }
    }

    // Insert message (replace if already exists with same id)
    connection
        .execute(
            "INSERT OR REPLACE INTO ai_messages (id, session_id, role, content, metadata, timestamp) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                message.id,
                session_id,
                message.role,
                message.content,
                message.metadata,
                message.timestamp
            ],
        )
        .map_err(db_error)?;

    Ok(())
}

#[tauri::command]
pub fn delete_ai_session(state: State<'_, DbState>, session_id: String) -> Result<(), String> {
    let connection = state.connection.lock().map_err(db_error)?;
    connection
        .execute("DELETE FROM ai_messages WHERE session_id = ?1", params![session_id])
        .map_err(db_error)?;
    connection
        .execute("DELETE FROM ai_sessions WHERE id = ?1", params![session_id])
        .map_err(db_error)?;
    Ok(())
}

#[tauri::command]
pub fn rename_ai_session(state: State<'_, DbState>, session_id: String, new_title: String) -> Result<(), String> {
    let connection = state.connection.lock().map_err(db_error)?;
    connection
        .execute(
            "UPDATE ai_sessions SET title = ?1 WHERE id = ?2",
            params![new_title.trim(), session_id],
        )
        .map_err(db_error)?;
    Ok(())
}

#[tauri::command]
pub fn clear_all_ai_sessions(state: State<'_, DbState>) -> Result<(), String> {
    let connection = state.connection.lock().map_err(db_error)?;
    connection
        .execute("DELETE FROM ai_messages", [])
        .map_err(db_error)?;
    connection
        .execute("DELETE FROM ai_sessions", [])
        .map_err(db_error)?;
    Ok(())
}
