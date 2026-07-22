pub mod backup;
pub mod schema;
pub mod repository;

use rusqlite::Connection;
use std::{
    error::Error,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

const DB_FILE_NAME: &str = "guidance.db";
#[cfg(not(debug_assertions))]
const DEFAULT_PRODUCTION_DB_KEY: &str = "LagunaCollegeGuidanceOfficeDefaultKey2026";

pub type DbResult<T> = Result<T, Box<dyn Error>>;

pub struct DbState {
    pub connection: Mutex<Connection>,
}

impl DbState {
    pub fn new(connection: Connection) -> Self {
        Self {
            connection: Mutex::new(connection),
        }
    }
}

pub fn get_db_path(_app: &tauri::AppHandle) -> DbResult<PathBuf> {
    #[cfg(debug_assertions)]
    {
        let db_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("db");
        fs::create_dir_all(&db_dir)?;

        Ok(db_dir.join(DB_FILE_NAME))
    }

    #[cfg(not(debug_assertions))]
    {
        use tauri::Manager;

        let db_dir = _app.path().app_data_dir()?;
        fs::create_dir_all(&db_dir)?;

        Ok(db_dir.join(DB_FILE_NAME))
    }
}

pub fn open_db(path: &Path) -> DbResult<Connection> {
    let connection = Connection::open(path)?;
    apply_production_key(&connection)?;

    Ok(connection)
}

#[cfg(debug_assertions)]
fn apply_production_key(_connection: &Connection) -> DbResult<()> {
    Ok(())
}

#[cfg(not(debug_assertions))]
fn apply_production_key(connection: &Connection) -> DbResult<()> {
    let key = match std::env::var("GUIDANCE_DB_KEY") {
        Ok(key) => key,
        Err(_) => {
            eprintln!(
                "WARNING: GUIDANCE_DB_KEY is not set; using the institutional default database key."
            );
            DEFAULT_PRODUCTION_DB_KEY.to_string()
        }
    };

    let escaped_key = key.replace('\'', "''");
    connection.execute_batch(&format!("PRAGMA key = '{}';", escaped_key))?;

    Ok(())
}
