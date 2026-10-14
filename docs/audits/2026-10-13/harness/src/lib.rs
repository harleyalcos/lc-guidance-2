//! Isolated rollout checks. Failed tests express expected safe behavior.
//! All databases and spreadsheets are synthetic; no live data or email is used.
#[cfg(test)]
mod tests {
    use lc_guidance_lib::{commands, db::{DbState, schema::initialize_schema, repository::CaseRepository}, models::{CasePayload, ImportRow}};
    use tauri::Manager;

    fn app() -> tauri::App<tauri::test::MockRuntime> {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        initialize_schema(&conn).unwrap();
        tauri::test::mock_builder().manage(DbState::new(conn))
            .build(tauri::test::mock_context(tauri::test::noop_assets())).unwrap()
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
        let app = app(); let state = app.state::<DbState>(); let conn = state.connection.lock().unwrap();
        CaseRepository::insert(&conn, &payload("2025-03-10")).unwrap();
        assert!(CaseRepository::get_cases(&conn,Some("2025-2026".into()),None).unwrap().is_empty(), "A March 2025 case from AY 2024-2025 must not appear in AY 2025-2026");
    }

    #[test]
    fn new_case_datetime_derives_january_academic_year() {
        assert_eq!(CaseRepository::derive_school_year("2025-03-10T08:30", "2025-03-10T00:30:00Z"), "2024-2025");
    }

    #[test]
    fn editing_date_updates_school_year() {
        let app = app(); let state = app.state::<DbState>(); let conn = state.connection.lock().unwrap();
        let id = CaseRepository::insert(&conn, &payload("2024-08-15")).unwrap();
        CaseRepository::update(&conn,id,&payload("2026-08-15"),None).unwrap();
        assert_eq!(CaseRepository::find_by_id(&conn,id).unwrap().unwrap().school_year,"2026-2027");
    }

    #[test]
    fn creation_history_has_valid_timestamp() {
        let app = app(); let state = app.state::<DbState>(); let conn = state.connection.lock().unwrap();
        let id = CaseRepository::insert(&conn,&payload("2026-10-13T17:15")).unwrap();
        let c = CaseRepository::find_by_id(&conn,id).unwrap().unwrap();
        let h: serde_json::Value = serde_json::from_str(&c.update_history).unwrap();
        let timestamp = h[0]["timestamp"].as_str().unwrap();
        assert!(chrono::DateTime::parse_from_rfc3339(timestamp).is_ok(),"Invalid creation timestamp: {timestamp}");
    }

    #[test]
    fn import_validation_returns_matching_students_and_primary_name() {
        let app = app(); let state = app.state::<DbState>(); let conn = state.connection.lock().unwrap();
        let mut r = row(); r.validate(&conn); assert!(!r.has_errors);
        let students: serde_json::Value = serde_json::from_str(&r.students).unwrap();
        assert_eq!(students[0]["firstName"].as_str(),Some(r.first_name.as_str()));
    }

    #[test]
    fn numeric_import_grade_is_canonical_for_grade_filters() {
        let app = app(); let state = app.state::<DbState>(); let conn = state.connection.lock().unwrap();
        let mut r = row(); r.validate(&conn);
        assert_eq!(r.level,"Grade 7");
    }

    #[test]
    fn complete_setup_cannot_overwrite_initialized_account() {
        let app = app();
        commands::complete_setup(app.state(),"123456".into(),"sender@example.test".into(),"fake-app-password".into(),"owner@example.test".into()).unwrap();
        let result = commands::complete_setup(app.state(),"654321".into(),"attacker@example.test".into(),"fake-password".into(),"attacker@example.test".into());
        assert!(result.is_err(),"Initialized account was overwritten without PIN or OTP");
    }

    #[test]
    fn expired_verified_otp_cannot_change_recovery_email() {
        let app = app();
        { let state = app.state::<DbState>(); let conn = state.connection.lock().unwrap();
          conn.execute("INSERT INTO otp_tokens(code_hash,expires_at,used,purpose) VALUES('synthetic','2000-01-01T00:00:00Z',1,'recovery_email_access')",[]).unwrap(); }
        assert!(commands::update_recovery_email(app.state(),"attacker@example.test".into(),None).is_err());
    }

    #[test]
    fn reset_removes_confidential_ai_history() {
        let app = app();
        commands::complete_setup(app.state(),"123456".into(),"sender@example.test".into(),"fake-password".into(),"owner@example.test".into()).unwrap();
        {let state = app.state::<DbState>(); let conn = state.connection.lock().unwrap();
         conn.execute("INSERT INTO ai_sessions VALUES('audit','Private student report','Reports','2026-10-13','2026-10-13')",[]).unwrap();
         conn.execute("INSERT INTO ai_messages VALUES('msg','audit','model','Synthetic confidential case details',NULL,'2026-10-13')",[]).unwrap();}
        commands::reset_application_data(app.state(),"123456".into()).unwrap();
        assert!(commands::get_ai_sessions(app.state()).unwrap().is_empty(),"AI case history survives application reset");
    }

    #[test]
    fn excel_same_date_and_type_do_not_imply_same_incident() {
        let app = app(); let path = std::env::temp_dir().join(format!("guidance-audit-{}.xlsx",std::process::id()));
        let mut book = rust_xlsxwriter::Workbook::new(); let sheet = book.add_worksheet();
        for (i,h) in ["Full Name","Date","Case","Sanction","Progress","Grade","Section","Adviser"].iter().enumerate() {sheet.write_string(0,i as u16,*h).unwrap();}
        for (ri,name) in ["Santos, Ana","Reyes, Ben"].iter().enumerate() {
            for (i,v) in [*name,"08/15/2024","Tardiness","Warning","Pending","Grade 7","A","Teacher"].iter().enumerate() {sheet.write_string((ri+1) as u32,i as u16,*v).unwrap();}
        }
        book.save(&path).unwrap();
        let result = commands::parse_import_file(app.state(),path.to_string_lossy().into()).unwrap();
        std::fs::remove_file(path).unwrap();
        assert_eq!(result.valid_count,2);
        assert!(result.rows.iter().all(|r| r.group_id.is_none()),"Independent rows silently linked to a group: {:?}",result.rows.iter().map(|r|&r.group_id).collect::<Vec<_>>());
    }

    #[test]
    fn ordinary_case_crud_and_group_filter_work() {
        let app = app(); let state=app.state::<DbState>(); let conn=state.connection.lock().unwrap();
        let mut p=payload("2026-10-13"); p.group_id=Some("audit-group".into());
        let id=CaseRepository::insert(&conn,&p).unwrap(); p.progress="Resolved".into();
        CaseRepository::update(&conn,id,&p,Some("Resolved by counselor".into())).unwrap();
        let cases=CaseRepository::get_cases(&conn,None,Some("audit-group".into())).unwrap();
        assert_eq!(cases.len(),1); assert_eq!(cases[0].progress,"Resolved");
        CaseRepository::delete_case(&conn,id).unwrap(); assert!(CaseRepository::find_by_id(&conn,id).unwrap().is_none());
    }

    #[test]
    fn imported_dates_and_invalid_dates_are_checked() {
        let app=app(); let state=app.state::<DbState>(); let conn=state.connection.lock().unwrap();
        let mut r=row(); r.validate(&conn); assert_eq!(r.date,"2025-03-10"); assert!(!r.has_errors);
        r.date="02/30/2025".into(); r.validate(&conn); assert!(r.has_errors);
    }

    #[test]
    fn app_default_excel_export_can_be_imported() {
        let path=std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../cases_export_2026-10-13.xlsx");
        assert!(path.exists(),"Run ui-checks.mjs first to produce the actual app export");
        let app=app();let result=commands::parse_import_file(app.state(),path.to_string_lossy().into());
        assert!(result.is_ok(),"The app rejects its own default export: {:?}",result.err());
    }

    #[test]
    fn confidential_database_reads_require_login() {
        let app=app(); commands::add_case(app.state(),payload("2026-10-13")).unwrap();
        assert!(commands::get_cases(app.state(),None,None).is_err(),"Case records can be read before verifying any PIN");
    }

    #[test]
    fn write_synthetic_browser_fixtures() {
        let app=app();
        commands::complete_setup(app.state(),"123456".into(),"sender@example.test".into(),"fake-password".into(),"owner@example.test".into()).unwrap();
        for (index,(status,sanction)) in [("Pending","Warning"),("Reprimand","Written Reprimand"),("Resolved","Written Reprimand"),("Closed","Warning")].iter().enumerate() {
            let mut p=payload("2026-10-13"); p.progress=(*status).into(); p.sanction=(*sanction).into();
            p.students[0].first_name=format!("Audit{}",index); p.students[0].sanction=Some((*sanction).into());
            commands::add_case(app.state(),p).unwrap();
        }
        for i in 0..2 {
            let mut p=payload("2026-10-13");p.group_id=Some("audit-group".into());p.title="Synthetic Group".into();
            p.students[0].first_name=format!("Group{}",i);
            let mut subject=p.students[0].clone();subject.first_name="Shared Complainant".into();subject.role=Some("Complainant / Subject".into());
            p.students.push(subject);commands::add_case(app.state(),p).unwrap();
        }
        let cases=commands::get_cases(app.state(),None,None).unwrap();
        let import=commands::parse_import_file(app.state(),std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../../mock_cases_20.xlsx").to_string_lossy().into()).unwrap();
        let data=serde_json::json!({"cases":cases,"import":import});
        std::fs::write(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../synthetic-fixtures.json"),serde_json::to_string_pretty(&data).unwrap()).unwrap();
    }
}
