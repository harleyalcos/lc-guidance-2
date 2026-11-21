//! End-to-end counselor workflow through the real Tauri command functions and a real
//! SQLite database: setup → sign in → file/edit cases → import → backup/restore →
//! database export/import → Guidance AI history → PIN change → reset → sign out.
//! Network-only features (SMTP, Gemini HTTP) and OS dialogs are excluded.
#[cfg(test)]
mod tests {
    use lc_guidance_lib::{
        commands::{self, AiSavedMessage, CaseChange},
        db::{schema::initialize_schema, DbState},
    };
    use std::path::PathBuf;
    use tauri::Manager;

    struct TempDir(PathBuf);
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn change(kind: &str, id: Option<i64>, students: serde_json::Value, extra: serde_json::Value) -> CaseChange {
        let mut payload = serde_json::json!({
            "students": students, "date": "2026-11-10", "dateFiled": "2026-11-10T09:00:00.000Z",
            "case": "Bullying", "description": "Synthetic \"quoted\", comma\nnew line — ñ 名前",
            "sanction": "Warning", "progress": "Pending", "proofs": "[]", "title": "", "groupId": null
        });
        if let (Some(base), Some(over)) = (payload.as_object_mut(), extra.as_object()) {
            for (k, v) in over {
                base.insert(k.clone(), v.clone());
            }
        }
        serde_json::from_value(serde_json::json!({ "kind": kind, "id": id, "payload": payload, "updateLog": null }))
            .unwrap()
    }

    fn student(first: &str, role: &str) -> serde_json::Value {
        serde_json::json!({"firstName": first, "lastName": "Santos", "middleInitial": "", "level": "Grade 7",
            "section": "A", "adviser": "Teacher", "role": role, "sanction": "Warning"})
    }

    fn uuid() -> String {
        uuid::Uuid::new_v4().to_string()
    }

    #[test]
    fn full_counselor_workflow() {
        let dir = TempDir(std::env::temp_dir().join(format!("guidance-e2e-{}", uuid())));
        std::fs::create_dir_all(&dir.0).unwrap();
        let db_path = dir.0.join("guidance.db");
        let connection = rusqlite::Connection::open(&db_path).unwrap();
        initialize_schema(&connection).unwrap();
        let mut state = DbState::new(connection);
        state.backup_dir = Some(dir.0.join("backups"));
        let app = tauri::test::mock_builder()
            .manage(state)
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let handle = app.handle().clone();
        let s = || app.state::<DbState>();
        let count = || commands::get_cases(app.state(), None, None).unwrap().len();

        // 1. First-time setup and sign-in.
        assert!(!commands::check_setup_complete(s()).unwrap());
        commands::complete_setup(s(), "123456".into(), "".into(), "".into(), "".into()).unwrap();
        assert!(commands::check_setup_complete(s()).unwrap());
        assert!(commands::get_cases(s(), None, None).is_err(), "data must be locked before sign-in");
        assert!(!commands::verify_pin(s(), "654321".into()).unwrap());
        assert!(commands::verify_pin(s(), "123456".into()).unwrap());
        assert!(commands::get_session(s()).unwrap());
        assert_eq!(count(), 0);

        // 2. File an individual case and a two-respondent group case with a shared complainant.
        let ids = commands::apply_case_changes(s(), uuid(), vec![change("add", None, serde_json::json!([student("Ana", "Respondent")]), serde_json::json!({}))]).unwrap();
        let individual = ids[0];
        let group = "grp-e2e";
        let complainant = student("Cara", "Complainant / Subject");
        let group_ids = commands::apply_case_changes(s(), uuid(), vec![
            change("add", None, serde_json::json!([student("Ben", "Respondent"), complainant.clone()]), serde_json::json!({"groupId": group, "title": "Group Incident"})),
            change("add", None, serde_json::json!([student("Dan", "Respondent"), complainant.clone()]), serde_json::json!({"groupId": group, "title": "Group Incident"})),
        ]).unwrap();
        assert_eq!(count(), 3);
        let members = commands::get_cases(s(), None, Some(group.into())).unwrap();
        assert_eq!(members.len(), 2);
        let participant_ids: Vec<String> = members.iter().map(|c| {
            let students: serde_json::Value = serde_json::from_str(&c.students).unwrap();
            students[1]["participantId"].as_str().unwrap().to_string()
        }).collect();
        assert_eq!(participant_ids[0], participant_ids[1], "shared complainant keeps one Participant ID");

        // 3. Retrying the exact same save (lost IPC reply) must not duplicate records.
        let request = uuid();
        let edit = vec![change("update", Some(individual), serde_json::json!([student("Ana", "Respondent")]), serde_json::json!({"progress": "Resolved"}))];
        let first = commands::apply_case_changes(s(), request.clone(), edit).unwrap();
        let again = commands::apply_case_changes(s(), request, vec![change("update", Some(individual), serde_json::json!([student("Ana", "Respondent")]), serde_json::json!({"progress": "Resolved"}))]).unwrap();
        assert_eq!(first, again);
        let saved = commands::get_case(s(), individual).unwrap();
        assert_eq!(saved.progress, "Resolved");
        assert!(saved.description.contains("名前") && saved.description.contains('\n'));
        let history: serde_json::Value = serde_json::from_str(&saved.update_history).unwrap();
        assert!(history.as_array().unwrap().len() >= 2, "status change must be logged");

        // 4. Filters used by Dashboard / Catalog / Reports.
        assert!(commands::get_all_school_years(s()).unwrap().contains(&"2026-2027".to_string()));
        assert_eq!(commands::get_cases(s(), Some("2026-2027".into()), None).unwrap().len(), 3);
        assert_eq!(commands::get_active_months(s(), "2026-2027".into()).unwrap(), vec!["2026-11"]);

        // 5. Excel import: parse a bundled mock workbook, validate, commit, then re-import → duplicates.
        let workbook = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../mock_10_individual_cases.xlsx");
        let parsed = tauri::async_runtime::block_on(commands::parse_import_file(s(), workbook.to_string_lossy().into())).unwrap();
        let checked = tauri::async_runtime::block_on(commands::validate_import_rows(s(), parsed.rows)).unwrap();
        let ready: Vec<_> = checked.into_iter().filter(|r| !r.has_errors && !r.is_duplicate).collect();
        assert!(!ready.is_empty());
        let ready_count = ready.len();
        let result = tauri::async_runtime::block_on(commands::batch_import_cases(s(), ready.clone())).unwrap();
        assert!(result.success, "{:?}", result.errors);
        assert_eq!(result.inserted_count, ready_count);
        assert_eq!(count(), 3 + ready_count);
        let rechecked = tauri::async_runtime::block_on(commands::validate_import_rows(s(), ready)).unwrap();
        assert!(rechecked.iter().all(|r| r.is_duplicate), "re-importing the same rows must be flagged");
        let rejected = tauri::async_runtime::block_on(commands::batch_import_cases(s(), rechecked)).unwrap();
        assert!(!rejected.success && rejected.inserted_count == 0);
        assert!(rejected.errors[0].contains("already saved"), "{:?}", rejected.errors);
        assert_eq!(count(), 3 + ready_count, "failed import must save nothing");

        // 6. Backup policy, manual backup, delete a case, restore the backup.
        let mut policy = commands::get_backup_policy(s()).unwrap();
        policy.frequency = "Weekly".into();
        policy.retention = 3;
        commands::set_backup_policy(s(), policy).unwrap();
        assert_eq!(commands::get_backup_policy(s()).unwrap().frequency, "Weekly");
        commands::create_backup(handle.clone(), s(), Some(true)).unwrap();
        let backups = commands::get_backups(s(), handle.clone()).unwrap();
        let manual = backups.iter().find(|b| b.backup_type == "Manual").expect("manual backup listed").filename.clone();
        let before_delete = count();
        commands::delete_case(s(), group_ids[1]).unwrap();
        assert_eq!(count(), before_delete - 1);
        assert!(commands::delete_case(s(), group_ids[1]).is_err(), "deleting twice reports not found");
        commands::restore_backup(handle.clone(), s(), manual).unwrap();
        assert!(commands::get_cases(s(), None, None).is_err(), "restore signs the user out");
        assert!(commands::verify_pin(s(), "123456".into()).unwrap());
        assert_eq!(count(), before_delete, "restore brings the deleted case back");
        assert!(commands::get_backups(s(), handle.clone()).unwrap().iter().any(|b| b.backup_type == "Safety"));

        // 7. Database export, then import of the exported file.
        let export = dir.0.join("migration.db");
        commands::export_db_file(handle.clone(), s(), export.to_string_lossy().into()).unwrap();
        commands::delete_case(s(), individual).unwrap();
        commands::import_db_file(handle.clone(), s(), export.to_string_lossy().into()).unwrap();
        assert!(commands::verify_pin(s(), "123456".into()).unwrap());
        assert_eq!(count(), before_delete);
        let junk = dir.0.join("junk.db");
        std::fs::write(&junk, b"not a database").unwrap();
        assert!(commands::import_db_file(handle.clone(), s(), junk.to_string_lossy().into()).is_err());
        assert_eq!(count(), before_delete, "rejected import leaves data untouched");

        // 8. Guidance AI history and key storage.
        commands::set_gemini_api_key(s(), "  test-key  ".into()).unwrap();
        assert_eq!(commands::get_gemini_api_key(s()).unwrap(), "test-key");
        let message = |id: &str, role: &str, metadata: Option<&str>| AiSavedMessage {
            id: id.into(), session_id: "s1".into(), role: role.into(), content: "Report body".into(),
            metadata: metadata.map(str::to_string), timestamp: "2026-11-21T01:00:00Z".into(),
        };
        commands::save_ai_message(s(), "s1".into(), Some("Pending cases".into()), Some("Queries".into()), message("m1", "user", None)).unwrap();
        commands::save_ai_message(s(), "s1".into(), None, Some("Reports".into()), message("m2", "model", Some(r#"{"title":"Monthly Report"}"#))).unwrap();
        assert_eq!(commands::get_ai_sessions(s()).unwrap()[0].tag, "Reports");
        assert_eq!(commands::get_ai_session_messages(s(), "s1".into()).unwrap().len(), 2);
        assert_eq!(commands::get_ai_generated_documents(s()).unwrap()[0].title, "Monthly Report");
        commands::rename_ai_session(s(), "s1".into(), "Renamed".into()).unwrap();
        assert_eq!(commands::get_ai_sessions(s()).unwrap()[0].title, "Renamed");
        commands::delete_ai_session(s(), "s1".into()).unwrap();
        assert!(commands::get_ai_sessions(s()).unwrap().is_empty());
        assert!(commands::get_ai_session_messages(s(), "s1".into()).unwrap().is_empty());

        // 9. PIN change.
        assert!(commands::change_pin(s(), "000000".into(), "222222".into()).is_err());
        assert!(commands::change_pin(s(), "123456".into(), "12".into()).is_err());
        commands::change_pin(s(), "123456".into(), "222222".into()).unwrap();
        commands::sign_out(s()).unwrap();
        assert!(!commands::verify_pin(s(), "123456".into()).unwrap());
        assert!(commands::verify_pin(s(), "222222".into()).unwrap());

        // 10. Reset application data keeps the PIN, clears records and AI, keeps a safety backup.
        commands::save_ai_message(s(), "s2".into(), None, None, AiSavedMessage { session_id: "s2".into(), ..message("m3", "user", None) }).unwrap();
        let backups_before = commands::get_backups(s(), handle.clone()).unwrap().len();
        assert!(commands::reset_application_data(s(), "999999".into()).is_err());
        assert!(count() > 0, "wrong PIN must not delete anything");
        commands::reset_application_data(s(), "222222".into()).unwrap();
        assert_eq!(count(), 0);
        assert!(commands::get_ai_sessions(s()).unwrap().is_empty());
        assert_eq!(commands::get_backups(s(), handle.clone()).unwrap().len(), backups_before + 1);

        // 11. Sign out locks everything again.
        commands::sign_out(s()).unwrap();
        assert!(commands::get_cases(s(), None, None).is_err());
        assert!(commands::get_backups(s(), handle).is_err());
    }
}
