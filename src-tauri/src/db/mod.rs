pub mod backup;
pub mod recovery;
pub mod repository;
pub mod schema;

use rusqlite::Connection;
use std::{
    error::Error,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

const DB_FILE_NAME: &str = "guidance.db";

pub type DbResult<T> = Result<T, Box<dyn Error>>;

pub struct DbState {
    pub connection: Mutex<Connection>,
    pub security: Mutex<crate::auth::SecurityState>,
    pub backup_dir: Option<PathBuf>,
}

impl DbState {
    pub fn require_session(&self) -> Result<(), String> {
        if self
            .security
            .lock()
            .map_err(|_| "Security state unavailable")?
            .authenticated
        {
            Ok(())
        } else {
            Err("Please sign in to continue.".into())
        }
    }

    pub fn new(connection: Connection) -> Self {
        Self {
            connection: Mutex::new(connection),
            security: Mutex::new(crate::auth::SecurityState::default()),
            backup_dir: None,
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
    connection.execute_batch("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")?;

    Ok(connection)
}
