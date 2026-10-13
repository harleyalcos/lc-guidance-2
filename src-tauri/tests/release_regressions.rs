//! Release regressions reproduced during the guidance office readiness audit.
//! All databases and spreadsheets are synthetic; no live data or email is used.
#[cfg(test)]
mod tests {
    use lc_guidance_lib::{
        commands,
        db::{repository::CaseRepository, schema::initialize_schema, DbState},
        models::{CasePayload, ImportRow},
    };
    use tauri::Manager;

    fn fresh_app() -> tauri::App<tauri::test::MockRuntime> {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        initialize_schema(&conn).unwrap();
        tauri::test::mock_builder()
            .manage(DbState::new(conn))
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap()
    }

    fn app() -> tauri::App<tauri::test::MockRuntime> {
        let app = fresh_app();
        commands::complete_setup(
            app.state(),
            "123456".into(),
            "".into(),
            "".into(),
            "".into(),
        )
        .unwrap();
        assert!(commands::verify_pin(app.state(), "123456".into()).unwrap());
        app
    }

    fn payload(date: &str) -> CasePayload {
        serde_json::from_value(serde_json::json!({
            "students": [{"firstName":"Ana","lastName":"Santos","middleInitial":"","level":"Grade 7","section":"A","adviser":"Teacher","role":"Respondent","sanction":"Warning"}],
            "date":date,"dateFiled":"2026-10-13T09:15:00.000Z","case":"Bullying","description":"Synthetic audit record","sanction":"Warning","progress":"Pending","proofs":"[]","title":""
        })).unwrap()
    }

    fn row() -> ImportRow {
        serde_json::from_value(serde_json::json!({"id":"","full_name":"Santos, Ana","first_name":"","last_name":"","middle_initial":"","level":"7","section":"a","date":"03/10/2025","date_filed":"","adviser":"Teacher","case":"Bullying","description":"","sanction":"Warning","progress":"Pending","proofs":"[]","students":"[]","title":"","is_duplicate":false,"existing_case":null,"has_errors":false,"errors":[],"group_id":null})).unwrap()
    }

    #[test]
    fn academic_filter_excludes_previous_school_year() {
        let app = app();
        let state = app.state::<DbState>();
        let conn = state.connection.lock().unwrap();
        CaseRepository::insert(&conn, &payload("2025-03-10")).unwrap();
        assert!(
            CaseRepository::get_cases(&conn, Some("2025-2026".into()), None)
                .unwrap()
                .is_empty(),
            "A March 2025 case from AY 2024-2025 must not appear in AY 2025-2026"
        );
    }

    #[test]
    fn new_case_datetime_derives_january_academic_year() {
        assert_eq!(
            CaseRepository::derive_school_year("2025-03-10T08:30", "2025-03-10T00:30:00Z"),
            "2024-2025"
        );
    }

    #[test]
    fn editing_date_updates_school_year() {
        let app = app();
        let state = app.state::<DbState>();
        let conn = state.connection.lock().unwrap();
        let id = CaseRepository::insert(&conn, &payload("2024-08-15")).unwrap();
        CaseRepository::update(&conn, id, &payload("2026-08-15"), None).unwrap();
        assert_eq!(
            CaseRepository::find_by_id(&conn, id)
                .unwrap()
                .unwrap()
                .school_year,
            "2026-2027"
        );
    }

    #[test]
    fn creation_history_has_valid_timestamp() {
        let app = app();
        let state = app.state::<DbState>();
        let conn = state.connection.lock().unwrap();
        let id = CaseRepository::insert(&conn, &payload("2026-10-13T17:15")).unwrap();
        let c = CaseRepository::find_by_id(&conn, id).unwrap().unwrap();
        let h: serde_json::Value = serde_json::from_str(&c.update_history).unwrap();
        let timestamp = h[0]["timestamp"].as_str().unwrap();
        assert!(
            chrono::DateTime::parse_from_rfc3339(timestamp).is_ok(),
            "Invalid creation timestamp: {timestamp}"
        );
    }

    #[test]
    fn import_validation_returns_matching_students_and_primary_name() {
        let app = app();
        let state = app.state::<DbState>();
        let conn = state.connection.lock().unwrap();
        let mut r = row();
        r.validate(&conn);
        assert!(!r.has_errors);
        let students: serde_json::Value = serde_json::from_str(&r.students).unwrap();
        assert_eq!(
            students[0]["firstName"].as_str(),
            Some(r.first_name.as_str())
        );
    }

    #[test]
    fn numeric_import_grade_is_canonical_for_grade_filters() {
        let app = app();
        let state = app.state::<DbState>();
        let conn = state.connection.lock().unwrap();
        let mut r = row();
        r.validate(&conn);
        assert_eq!(r.level, "Grade 7");
    }

    #[test]
    fn complete_setup_cannot_overwrite_initialized_account() {
        let app = fresh_app();
        commands::complete_setup(
            app.state(),
            "123456".into(),
            "sender@example.test".into(),
            "abcdefghijklmnop".into(),
            "owner@example.test".into(),
        )
        .unwrap();
        let result = commands::complete_setup(
            app.state(),
            "654321".into(),
            "attacker@example.test".into(),
            "abcdefghijklmnop".into(),
            "attacker@example.test".into(),
        );
        assert!(
            result.is_err(),
            "Initialized account was overwritten without PIN or OTP"
        );
    }

    #[test]
    fn expired_verified_otp_cannot_change_recovery_email() {
        let app = app();
        {
            let state = app.state::<DbState>();
            let conn = state.connection.lock().unwrap();
            conn.execute("INSERT INTO otp_tokens(code_hash,expires_at,used,purpose) VALUES('synthetic','2000-01-01T00:00:00Z',1,'recovery_email_access')",[]).unwrap();
        }
        assert!(
            commands::update_recovery_email(app.state(), "attacker@example.test".into(), None)
                .is_err()
        );
    }

    #[test]
    fn reset_removes_confidential_ai_history() {
        let app = app();
        {
            let state = app.state::<DbState>();
            let conn = state.connection.lock().unwrap();
            conn.execute("INSERT INTO ai_sessions VALUES('audit','Private student report','Reports','2026-10-13','2026-10-13')",[]).unwrap();
            conn.execute("INSERT INTO ai_messages VALUES('msg','audit','model','Synthetic confidential case details',NULL,'2026-10-13')",[]).unwrap();
        }
        commands::reset_application_data(app.state(), "123456".into()).unwrap();
        assert!(
            commands::get_ai_sessions(app.state()).unwrap().is_empty(),
            "AI case history survives application reset"
        );
    }

    #[test]
    fn excel_same_date_and_type_do_not_imply_same_incident() {
        let app = app();
        let path =
            std::env::temp_dir().join(format!("guidance-audit-{}.xlsx", uuid::Uuid::new_v4()));
        let mut book = rust_xlsxwriter::Workbook::new();
        let sheet = book.add_worksheet();
        for (i, h) in [
            "Full Name",
            "Date",
            "Case",
            "Sanction",
            "Progress",
            "Grade",
            "Section",
            "Adviser",
        ]
        .iter()
        .enumerate()
        {
            sheet.write_string(0, i as u16, *h).unwrap();
        }
        for (ri, name) in ["Santos, Ana", "Reyes, Ben"].iter().enumerate() {
            for (i, v) in [
                *name,
                "08/15/2024",
                "Tardiness",
                "Warning",
                "Pending",
                "Grade 7",
                "A",
                "Teacher",
            ]
            .iter()
            .enumerate()
            {
                sheet.write_string((ri + 1) as u32, i as u16, *v).unwrap();
            }
        }
        book.save(&path).unwrap();
        let result = tauri::async_runtime::block_on(commands::parse_import_file(
            app.state(),
            path.to_string_lossy().into(),
        ))
        .unwrap();
        std::fs::remove_file(path).unwrap();
        assert_eq!(result.valid_count, 2);
        assert!(
            result.rows.iter().all(|r| r.group_id.is_none()),
            "Independent rows silently linked to a group: {:?}",
            result.rows.iter().map(|r| &r.group_id).collect::<Vec<_>>()
        );
    }

    #[test]
    fn ordinary_case_crud_and_group_filter_work() {
        let app = app();
        let state = app.state::<DbState>();
        let conn = state.connection.lock().unwrap();
        let mut p = payload("2026-10-13");
        p.group_id = Some("audit-group".into());
        let id = CaseRepository::insert(&conn, &p).unwrap();
        p.progress = "Resolved".into();
        CaseRepository::update(&conn, id, &p, Some("Resolved by counselor".into())).unwrap();
        let cases = CaseRepository::get_cases(&conn, None, Some("audit-group".into())).unwrap();
        assert_eq!(cases.len(), 1);
        assert_eq!(cases[0].progress, "Resolved");
        CaseRepository::delete_case(&conn, id).unwrap();
        assert!(CaseRepository::find_by_id(&conn, id).unwrap().is_none());
    }

    #[test]
    fn imported_dates_and_invalid_dates_are_checked() {
        let app = app();
        let state = app.state::<DbState>();
        let conn = state.connection.lock().unwrap();
        let mut r = row();
        r.validate(&conn);
        assert_eq!(r.date, "2025-03-10");
        assert!(!r.has_errors);
        r.date = "02/30/2025".into();
        r.validate(&conn);
        assert!(r.has_errors);
    }

    #[test]
    fn branded_excel_export_can_be_imported_with_reordered_headers() {
        let path =
            std::env::temp_dir().join(format!("guidance-roundtrip-{}.xlsx", uuid::Uuid::new_v4()));
        let mut book = rust_xlsxwriter::Workbook::new();
        let sheet = book.add_worksheet();
        sheet.write_string(0, 0, "GUIDANCE OFFICE").unwrap();
        let headers = [
            "Date",
            "Full Name",
            "Grade",
            "Progress",
            "Sanction",
            "Case",
            "Adviser",
            "Section",
        ];
        let row = [
            "2025-03-10T08:30",
            "Santos, Ana",
            "7",
            "Pending",
            "Warning",
            "Bullying",
            "Teacher",
            "A",
        ];
        for (i, h) in headers.iter().enumerate() {
            sheet.write_string(7, i as u16, *h).unwrap();
            sheet.write_string(8, i as u16, row[i]).unwrap();
        }
        book.save(&path).unwrap();
        let app = app();
        let parsed = tauri::async_runtime::block_on(commands::parse_import_file(
            app.state(),
            path.to_string_lossy().into(),
        ))
        .unwrap();
        std::fs::remove_file(path).unwrap();
        assert_eq!(parsed.valid_count, 1);
        assert_eq!(parsed.rows[0].level, "Grade 7");
        assert_eq!(parsed.rows[0].date, "2025-03-10T08:30");
        assert_eq!(parsed.rows[0].source_row, Some(9));
    }

    #[test]
    fn confidential_database_reads_require_login() {
        let app = fresh_app();
        {
            let state = app.state::<DbState>();
            let conn = state.connection.lock().unwrap();
            CaseRepository::insert(&conn, &payload("2026-10-13")).unwrap();
        }
        assert!(commands::add_case(app.state(), payload("2026-10-13")).is_err());
        assert!(
            commands::get_cases(app.state(), None, None).is_err(),
            "Case records can be read before verifying any PIN"
        );
    }

    struct Temporary(std::path::PathBuf);
    impl Temporary {
        fn new() -> Self {
            Self(std::env::temp_dir().join(format!("guidance-test-{}", uuid::Uuid::new_v4())))
        }
    }
    impl Drop for Temporary {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn offline_setup_login_signout_and_pin_lockout() {
        let app = fresh_app();
        commands::complete_setup(
            app.state(),
            "123456".into(),
            "".into(),
            "".into(),
            "".into(),
        )
        .unwrap();
        assert!(commands::get_cases(app.state(), None, None).is_err());
        assert!(commands::verify_pin(app.state(), "123456".into()).unwrap());
        commands::get_cases(app.state(), None, None).unwrap();
        commands::sign_out(app.state()).unwrap();
        assert!(commands::get_cases(app.state(), None, None).is_err());
        assert!(commands::get_ai_sessions(app.state()).is_err());
        for _ in 0..5 {
            assert!(!commands::verify_pin(app.state(), "654321".into()).unwrap());
        }
        assert!(commands::verify_pin(app.state(), "123456".into()).is_err());
        app.state::<DbState>().security.lock().unwrap().locked_until =
            Some(chrono::Utc::now() - chrono::Duration::seconds(1));
        assert!(commands::verify_pin(app.state(), "123456".into()).unwrap());
    }

    #[test]
    fn verified_grants_are_expiring_single_use_and_revoked_on_signout() {
        let app = app();
        let state = app.state::<DbState>();
        let hash = lc_guidance_lib::auth::hash_secret("111111").unwrap();
        let install = || {
            let conn = state.connection.lock().unwrap();
            conn.execute("INSERT INTO otp_tokens(code_hash,expires_at,used,purpose) VALUES(?1,?2,0,'recovery_email_access')",rusqlite::params![hash,(chrono::Utc::now()+chrono::Duration::minutes(10)).to_rfc3339()]).unwrap();
        };
        install();
        assert!(commands::verify_recovery_email_otp(app.state(), "111111".into()).unwrap());
        commands::update_recovery_email(app.state(), "new@example.test".into(), None).unwrap();
        assert!(
            commands::update_recovery_email(app.state(), "again@example.test".into(), None)
                .is_err()
        );
        install();
        assert!(commands::verify_recovery_email_otp(app.state(), "111111".into()).unwrap());
        state.security.lock().unwrap().grants.insert(
            "recovery_email_access".into(),
            chrono::Utc::now() - chrono::Duration::seconds(1),
        );
        assert!(
            commands::update_recovery_email(app.state(), "expired@example.test".into(), None)
                .is_err()
        );
        state.security.lock().unwrap().grants.insert(
            "recovery_email_access".into(),
            chrono::Utc::now() + chrono::Duration::minutes(5),
        );
        commands::sign_out(app.state()).unwrap();
        commands::verify_pin(app.state(), "123456".into()).unwrap();
        assert!(
            commands::update_recovery_email(app.state(), "stale@example.test".into(), None)
                .is_err()
        );
        assert!(state.security.lock().unwrap().grants.is_empty());
    }

    #[test]
    fn otp_for_another_purpose_cannot_change_delivery_settings() {
        let app = app();
        app.state::<DbState>()
            .security
            .lock()
            .unwrap()
            .grants
            .insert(
                "pin_change_access".into(),
                chrono::Utc::now() + chrono::Duration::minutes(5),
            );
        assert!(commands::update_smtp_config(
            app.state(),
            "sender@example.test".into(),
            "abcdefghijklmnop".into(),
            "recipient@example.test".into(),
            None
        )
        .is_err());
    }

    #[test]
    fn cross_file_duplicates_are_reviewed_and_rejected_at_commit() {
        let app = app();
        let rows = tauri::async_runtime::block_on(commands::validate_import_rows(
            app.state(),
            vec![row(), row()],
        ))
        .unwrap();
        assert!(!rows[0].is_duplicate);
        assert!(rows[1].is_duplicate);
        let result = tauri::async_runtime::block_on(commands::batch_import_cases(
            app.state(),
            vec![row(), row()],
        ))
        .unwrap();
        assert!(!result.success);
        assert_eq!(result.inserted_count, 0);
        assert!(commands::get_cases(app.state(), None, None)
            .unwrap()
            .is_empty());
        assert!(
            tauri::async_runtime::block_on(commands::batch_import_cases(app.state(), vec![row()]))
                .unwrap()
                .success
        );
        assert!(
            !tauri::async_runtime::block_on(commands::batch_import_cases(app.state(), vec![row()]))
                .unwrap()
                .success
        );
        assert_eq!(
            commands::get_cases(app.state(), None, None).unwrap().len(),
            1
        );
    }

    #[test]
    fn group_save_rolls_back_then_retries_idempotently() {
        let app = app();
        let state = app.state::<DbState>();
        let mut conn = state.connection.lock().unwrap();
        let request = uuid::Uuid::new_v4().to_string();
        let make = |bad: bool| {
            let first = payload("2026-10-13");
            let mut second = first.clone();
            second.students[0].first_name = "Ben".into();
            if bad {
                second.students.clear();
            }
            vec![
                commands::CaseChange {
                    kind: "add".into(),
                    id: None,
                    payload: first,
                    update_log: None,
                },
                commands::CaseChange {
                    kind: "add".into(),
                    id: None,
                    payload: second,
                    update_log: None,
                },
            ]
        };
        assert!(commands::apply_changes(&mut conn, &request, make(true)).is_err());
        assert!(CaseRepository::get_cases(&conn, None, None)
            .unwrap()
            .is_empty());
        let ids = commands::apply_changes(&mut conn, &request, make(false)).unwrap();
        assert_eq!(
            commands::apply_changes(&mut conn, &request, make(false)).unwrap(),
            ids
        );
        assert_eq!(
            CaseRepository::get_cases(&conn, None, None).unwrap().len(),
            2
        );
        let fail = commands::CaseChange {
            kind: "update".into(),
            id: Some(9999),
            payload: payload("2026-10-13"),
            update_log: None,
        };
        let mut changed = payload("2026-10-13");
        changed.progress = "Resolved".into();
        assert!(commands::apply_changes(
            &mut conn,
            &uuid::Uuid::new_v4().to_string(),
            vec![
                commands::CaseChange {
                    kind: "update".into(),
                    id: Some(ids[0]),
                    payload: changed,
                    update_log: None
                },
                fail
            ]
        )
        .is_err());
        assert_eq!(
            CaseRepository::find_by_id(&conn, ids[0])
                .unwrap()
                .unwrap()
                .progress,
            "Pending"
        );
    }

    #[test]
    fn status_transition_is_logged_without_frontend_log() {
        let app = app();
        let id = commands::add_case(app.state(), payload("2026-10-13")).unwrap();
        let mut changed = payload("2026-10-13");
        changed.progress = "Resolved".into();
        commands::update_case(app.state(), id, changed, None).unwrap();
        let stored = commands::get_case(app.state(), id).unwrap();
        let history: serde_json::Value = serde_json::from_str(&stored.update_history).unwrap();
        assert_eq!(history.as_array().unwrap().len(), 2);
        assert!(history[1]["action"]
            .as_str()
            .unwrap()
            .contains("Pending to Resolved"));
    }

    #[test]
    fn shared_participant_is_unique_at_storage_boundary_and_import_keeps_sanction() {
        let app = app();
        let mut p = payload("2026-10-13");
        let mut subject = p.students[0].clone();
        subject.first_name = "Jamie".into();
        subject.role = Some("Complainant / Subject".into());
        p.students.extend([subject.clone(), subject]);
        let id = commands::add_case(app.state(), p).unwrap();
        let stored = commands::get_case(app.state(), id).unwrap();
        let students: serde_json::Value = serde_json::from_str(&stored.students).unwrap();
        assert_eq!(students.as_array().unwrap().len(), 2);
        let r = commands::validate_import_row(app.state(), row()).unwrap();
        let imported: serde_json::Value = serde_json::from_str(&r.students).unwrap();
        assert_eq!(imported[0]["sanction"], "Warning");
    }

    #[test]
    fn replacement_rejects_corrupt_unrelated_and_failed_safety_snapshot_without_data_loss() {
        let temp = Temporary::new();
        std::fs::create_dir_all(&temp.0).unwrap();
        let mut active = rusqlite::Connection::open(temp.0.join("active.db")).unwrap();
        initialize_schema(&active).unwrap();
        CaseRepository::insert(&active, &payload("2026-10-13")).unwrap();
        let corrupt = temp.0.join("corrupt.db");
        std::fs::write(&corrupt, b"not a database").unwrap();
        assert!(lc_guidance_lib::db::recovery::replace_database(
            &mut active,
            &corrupt,
            &temp.0.join("backups")
        )
        .is_err());
        let unrelated = temp.0.join("unrelated.db");
        rusqlite::Connection::open(&unrelated)
            .unwrap()
            .execute("CREATE TABLE unrelated(value TEXT)", [])
            .unwrap();
        assert!(lc_guidance_lib::db::recovery::replace_database(
            &mut active,
            &unrelated,
            &temp.0.join("backups")
        )
        .is_err());
        let valid = temp.0.join("valid.db");
        let source = rusqlite::Connection::open(&valid).unwrap();
        initialize_schema(&source).unwrap();
        drop(source);
        let blocked = temp.0.join("blocked");
        std::fs::write(&blocked, b"not a directory").unwrap();
        assert!(
            lc_guidance_lib::db::recovery::replace_database(&mut active, &valid, &blocked).is_err()
        );
        assert_eq!(
            CaseRepository::get_cases(&active, None, None)
                .unwrap()
                .len(),
            1
        );
        lc_guidance_lib::db::recovery::replace_database(
            &mut active,
            &valid,
            &temp.0.join("backups"),
        )
        .unwrap();
        assert!(CaseRepository::get_cases(&active, None, None)
            .unwrap()
            .is_empty());
        let backup = std::fs::read_dir(temp.0.join("backups"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        let prior = rusqlite::Connection::open(backup.join("snapshot.db")).unwrap();
        assert_eq!(
            CaseRepository::get_cases(&prior, None, None).unwrap().len(),
            1
        );
    }

    #[test]
    fn replacement_copy_failure_preserves_live_connection() {
        let temp = Temporary::new();
        std::fs::create_dir_all(&temp.0).unwrap();
        let active_path = temp.0.join("active.db");
        let conn = rusqlite::Connection::open(&active_path).unwrap();
        initialize_schema(&conn).unwrap();
        CaseRepository::insert(&conn, &payload("2026-10-13")).unwrap();
        drop(conn);
        let valid = temp.0.join("valid.db");
        let source = rusqlite::Connection::open(&valid).unwrap();
        initialize_schema(&source).unwrap();
        drop(source);
        let mut active = rusqlite::Connection::open_with_flags(
            active_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .unwrap();
        assert!(lc_guidance_lib::db::recovery::replace_database(
            &mut active,
            &valid,
            &temp.0.join("backups")
        )
        .is_err());
        assert_eq!(
            CaseRepository::get_cases(&active, None, None)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn backend_backup_policy_disabled_schedule_retention_and_distinct_safety_snapshots() {
        let temp = Temporary::new();
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        initialize_schema(&conn).unwrap();
        let save_policy = |enabled: bool, frequency: &str, retention: usize| {
            conn.execute("INSERT INTO app_config(key,value) VALUES('backup_policy',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[serde_json::json!({"enabled":enabled,"frequency":frequency,"retention":retention}).to_string()]).unwrap();
        };
        save_policy(false, "Daily", 2);
        lc_guidance_lib::db::backup::scheduled(&conn, &temp.0, false).unwrap();
        assert!(!temp.0.exists());
        save_policy(true, "Daily", 2);
        lc_guidance_lib::db::backup::scheduled(&conn, &temp.0, false).unwrap();
        lc_guidance_lib::db::backup::scheduled(&conn, &temp.0, false).unwrap();
        assert_eq!(std::fs::read_dir(&temp.0).unwrap().count(), 1);
        save_policy(true, "On New Record", 2);
        lc_guidance_lib::db::backup::scheduled(&conn, &temp.0, false).unwrap();
        assert_eq!(std::fs::read_dir(&temp.0).unwrap().count(), 1);
        for _ in 0..4 {
            lc_guidance_lib::db::backup::scheduled(&conn, &temp.0, true).unwrap();
        }
        assert_eq!(std::fs::read_dir(&temp.0).unwrap().count(), 2);
        let first = lc_guidance_lib::db::backup::snapshot(&conn, &temp.0, "safety").unwrap();
        let second = lc_guidance_lib::db::backup::snapshot(&conn, &temp.0, "safety").unwrap();
        assert_ne!(first, second);
        lc_guidance_lib::db::backup::prune_automatic(&temp.0, 1).unwrap();
        assert_eq!(std::fs::read_dir(&temp.0).unwrap().count(), 3);
        for frequency in ["Weekly", "Monthly"] {
            save_policy(true, frequency, 2);
            conn.execute(
                "UPDATE app_config SET value='2000-01-01T00:00:00Z' WHERE key='backup_last_run'",
                [],
            )
            .unwrap();
            lc_guidance_lib::db::backup::scheduled(&conn, &temp.0, false).unwrap();
        }
    }
    #[test]
    fn incident_times_survive_import_and_invalid_suffixes_fail() {
        let app = app();
        let state = app.state::<DbState>();
        let conn = state.connection.lock().unwrap();
        let mut original = payload("2026-10-13T23:59");
        original.students[0].level = "Grade 7".into();
        CaseRepository::insert(&conn, &original).unwrap();
        let mut imported = row();
        imported.date = "2026-10-13T23:59".into();
        imported.validate(&conn);
        assert_eq!(imported.date, "2026-10-13T23:59");
        assert!(imported.is_duplicate);
        assert!(payload("2026-10-13Tgarbage").normalized().is_err());
        imported.date = "2026-10-13Tgarbage".into();
        imported.validate(&conn);
        assert!(imported.has_errors);
    }

    #[test]
    fn distinct_participant_ids_preserve_same_named_students() {
        let mut case = payload("2026-10-13");
        let mut first = case.students[0].clone();
        first.role = Some("Complainant / Subject".into());
        first.participant_id = Some(uuid::Uuid::new_v4().to_string());
        let mut second = first.clone();
        second.participant_id = Some(uuid::Uuid::new_v4().to_string());
        case.students.extend([first.clone(), second, first]);
        assert_eq!(case.normalized().unwrap().students.len(), 3);
    }
    #[test]
    fn backup_order_uses_time_instead_of_backup_type() {
        assert!(
            commands::backup_timestamp("backup_manual_2026-10-14_01-43-00_abc")
                > commands::backup_timestamp("backup_safety_2026-10-14_01-36-00_xyz")
        );
    }
    #[test]
    fn full_size_workbook_imports_all_rows_without_false_groups() {
        let path =
            std::env::temp_dir().join(format!("guidance-load-{}.xlsx", uuid::Uuid::new_v4()));
        let mut book = rust_xlsxwriter::Workbook::new();
        let sheet = book.add_worksheet();
        let headers = [
            "Full Name",
            "Date",
            "Case",
            "Sanction",
            "Progress",
            "Grade",
            "Section",
            "Adviser",
        ];
        for (index, header) in headers.iter().enumerate() {
            sheet.write_string(0, index as u16, *header).unwrap();
        }
        for index in 1..=5000 {
            let name = format!("Student{index}, Test");
            let fields = [
                name.as_str(),
                "2026-10-13",
                "Bullying",
                "Warning",
                "Pending",
                "7",
                "A",
                "Teacher",
            ];
            for (column, value) in fields.iter().enumerate() {
                sheet.write_string(index, column as u16, *value).unwrap();
            }
        }
        book.save(&path).unwrap();
        let app = app();
        let start = std::time::Instant::now();
        let parsed = tauri::async_runtime::block_on(commands::parse_import_file(
            app.state(),
            path.to_string_lossy().into(),
        ))
        .unwrap();
        assert_eq!(parsed.valid_count, 5000);
        assert!(parsed.rows.iter().all(|row| row.group_id.is_none()));
        let result =
            tauri::async_runtime::block_on(commands::batch_import_cases(app.state(), parsed.rows))
                .unwrap();
        assert!(result.success);
        assert_eq!(result.inserted_count, 5000);
        eprintln!(
            "5,000-row parse and transactional commit: {:?}",
            start.elapsed()
        );
        assert_eq!(
            commands::get_cases(app.state(), None, None).unwrap().len(),
            5000
        );
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn import_filing_timestamp_does_not_replace_incident_date() {
        let app = app();
        let state = app.state::<DbState>();
        let conn = state.connection.lock().unwrap();
        let mut imported = row();
        imported.date = "2025-03-10T08:30".into();
        imported.date_filed = "2026-10-14T09:00:00Z".into();
        imported.validate(&conn);
        assert!(!imported.has_errors);
        assert_eq!(imported.date, "2025-03-10T08:30");
        assert_eq!(imported.date_filed, "2026-10-14T09:00:00Z");
    }
}
