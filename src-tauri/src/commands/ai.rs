use rusqlite::params;
use serde_json::{json, Value};
use tauri::State;

use crate::db::DbState;

fn db_error(error: impl std::fmt::Display) -> String {
    error.to_string()
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
