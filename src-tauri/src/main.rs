// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use lc_guidance_lib::{commands, db};
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let db_path = db::get_db_path(app.handle())?;
            let connection = db::open_db(&db_path)?;
            db::schema::initialize_schema(&connection)?;

            #[cfg(not(debug_assertions))]
            {
                let app_data_dir = app.path().app_data_dir()?;
                let backup_dir = app_data_dir.join("backups");
                std::fs::create_dir_all(&backup_dir)?;
                db::backup::run_backup(&db_path, &backup_dir, &connection)?;
            }

            app.manage(db::DbState::new(connection));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_cases,
            commands::add_case,
            commands::update_case,
            commands::delete_case,
            commands::get_case,
            commands::copy_generated_proof,
            commands::check_setup_complete,
            commands::complete_setup,
            commands::test_smtp,
            commands::verify_pin,
            commands::request_otp,
            commands::verify_otp,
            commands::request_recovery_email_otp,
            commands::verify_recovery_email_otp,
            commands::request_pin_change_otp,
            commands::verify_pin_change_otp,
            commands::reset_pin,
            commands::change_pin,
            commands::update_smtp_config,
            commands::get_recovery_email,
            commands::update_recovery_email,
            commands::get_backups,
            commands::create_backup,
            commands::restore_backup,
            commands::delete_backup,
            commands::save_pdf,
            commands::save_file,
            commands::parse_import_file,
            commands::batch_import_cases,
            commands::generate_import_template,
            commands::validate_import_row,
            commands::export_db_file,
            commands::import_db_file,
            commands::get_gemini_api_key,
            commands::set_gemini_api_key,
            commands::query_database_for_ai
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
