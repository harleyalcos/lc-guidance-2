// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use lc_guidance_lib::{commands, db};
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let db_path = db::get_db_path(app.handle())?;
            let connection = db::open_db(&db_path)?;
            db::schema::initialize_schema(&connection)?;

            let mut state = db::DbState::new(connection);
            state.backup_dir = Some(app.path().app_data_dir()?.join("backups"));
            {
                let connection = state
                    .connection
                    .lock()
                    .map_err(|_| "Database unavailable")?;
                db::backup::run_scheduled(&state, &connection, false);
            }
            app.manage(state);
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(60));
                let state = handle.state::<db::DbState>();
                if let Ok(connection) = state.connection.lock() {
                    db::backup::run_scheduled(&state, &connection, false);
                };
            });

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
            commands::get_session,
            commands::sign_out,
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
            commands::get_backup_policy,
            commands::set_backup_policy,
            commands::create_backup,
            commands::restore_backup,
            commands::delete_backup,
            commands::save_pdf,
            commands::save_file,
            commands::parse_import_file,
            commands::batch_import_cases,
            commands::generate_import_template,
            commands::validate_import_row,
            commands::validate_import_rows,
            commands::apply_case_changes,
            commands::export_db_file,
            commands::import_db_file,
            commands::get_gemini_api_key,
            commands::set_gemini_api_key,
            commands::query_database_for_ai,
            commands::get_ai_sessions,
            commands::get_ai_session_messages,
            commands::save_ai_message,
            commands::delete_ai_session,
            commands::rename_ai_session,
            commands::clear_all_ai_sessions,
            commands::get_ai_generated_documents,
            commands::get_current_school_year,
            commands::set_current_school_year,
            commands::get_all_school_years,
            commands::get_active_months,
            commands::reset_application_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
