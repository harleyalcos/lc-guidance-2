//! Usability/error-handling audit regressions (November 2026).
//! All data is synthetic; no network, email or live database is touched.
#[cfg(test)]
mod tests {
    use lc_guidance_lib::{
        commands,
        db::{recovery, repository::CaseRepository, schema::initialize_schema, DbState},
        models::CasePayload,
    };
    use std::path::{Path, PathBuf};
    use tauri::Manager;

    struct TempDir(PathBuf);
    impl TempDir {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("guidance-audit-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }
        fn file(&self, name: &str, contents: &[u8]) -> PathBuf {
            let path = self.0.join(name);
            std::fs::write(&path, contents).unwrap();
            path
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn memory_db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        initialize_schema(&conn).unwrap();
        conn
    }

    fn signed_in_app() -> tauri::App<tauri::test::MockRuntime> {
        let app = tauri::test::mock_builder()
            .manage(DbState::new(memory_db()))
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        commands::complete_setup(app.state(), "123456".into(), "".into(), "".into(), "".into())
            .unwrap();
        assert!(commands::verify_pin(app.state(), "123456".into()).unwrap());
        app
    }

    fn repo_file(name: &str) -> String {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join(name)
            .to_string_lossy()
            .into_owned()
    }

    fn parse(conn: &rusqlite::Connection, path: &str) -> Result<commands::ParseFileResult, String> {
        let (rows, start) = commands::load_import_sheet(path)?;
        commands::parse_import_rows(conn, rows, start)
    }

    fn payload() -> CasePayload {
        serde_json::from_value(serde_json::json!({
            "students": [{"firstName":"Ana","lastName":"Santos","middleInitial":"","level":"Grade 7","section":"A","adviser":"Teacher","role":"Respondent","sanction":"Warning"}],
            "date":"2026-10-13","dateFiled":"2026-10-13T09:15:00.000Z","case":"Bullying","description":"Synthetic","sanction":"Warning","progress":"Pending","proofs":"[]","title":""
        }))
        .unwrap()
    }

    // ── Import parsing ────────────────────────────────────────────────────

    #[test]
    fn every_bundled_mock_spreadsheet_parses_into_reviewable_rows() {
        let conn = memory_db();
        for name in [
            "mock_10_individual_cases.xlsx",
            "mock_cases_20.xlsx",
            "mock_grouped_5_students.xlsx",
            "mock_multiline_3_students.xlsx",
            "mock_cases_import.csv",
        ] {
            let result = parse(&conn, &repo_file(name)).unwrap_or_else(|e| panic!("{name}: {e}"));
            assert!(!result.rows.is_empty(), "{name} produced no rows");
            assert_eq!(
                result.valid_count + result.duplicate_count + result.error_count,
                result.rows.len(),
                "{name}: every row must be counted exactly once"
            );
            assert!(
                result.rows.iter().all(|r| r.source_row.is_some()),
                "{name}: rows must keep their spreadsheet row for error messages"
            );
        }
    }

    #[test]
    fn csv_import_keeps_quoted_commas_and_utf8_bom() {
        let dir = TempDir::new();
        let path = dir.file(
            "bom.csv",
            "\u{feff}Full Name,Date,Case,Sanction,Progress,Grade,Section,Adviser\n\"Dela Cruz, Juan M.\",2026-08-10,Bullying,\"Warning, verbal\",Pending,Grade 10,A,Mr. Santos\n".as_bytes(),
        );
        let result = parse(&memory_db(), path.to_str().unwrap()).unwrap();
        assert_eq!(result.rows.len(), 1);
        let row = &result.rows[0];
        assert_eq!(row.last_name, "Dela Cruz");
        assert_eq!(row.sanction, "Warning, verbal");
        assert!(!row.has_errors, "{:?}", row.errors);
    }

    #[test]
    fn csv_with_unsupported_headers_explains_required_columns() {
        let err = parse(&memory_db(), &repo_file("test_import.csv")).unwrap_err();
        assert!(err.contains("No supported header row"), "{err}");
        assert!(err.contains("Full Name"), "{err}");
    }

    #[test]
    fn empty_header_only_wrong_type_corrupt_and_missing_files_are_rejected_clearly() {
        let dir = TempDir::new();
        let conn = memory_db();

        let empty = dir.file("empty.csv", b"");
        assert!(parse(&conn, empty.to_str().unwrap()).unwrap_err().contains("empty"));

        let header_only = dir.file(
            "header.csv",
            b"Full Name,Date,Case,Sanction,Progress,Grade,Section,Adviser\n,,,,,,,\n",
        );
        assert!(parse(&conn, header_only.to_str().unwrap())
            .unwrap_err()
            .contains("No case rows"));

        let text = dir.file("notes.txt", b"hello");
        assert!(parse(&conn, text.to_str().unwrap())
            .unwrap_err()
            .contains("Unsupported file type"));

        let corrupt = dir.file("broken.xlsx", b"this is not a zip archive");
        assert!(parse(&conn, corrupt.to_str().unwrap())
            .unwrap_err()
            .contains("Invalid or corrupted"));

        let missing = dir.0.join("missing.xlsx");
        assert!(parse(&conn, missing.to_str().unwrap())
            .unwrap_err()
            .contains("could not be found"));
    }

    #[test]
    fn oversized_import_is_rejected_before_validation() {
        let dir = TempDir::new();
        let mut csv = String::from("Full Name,Date,Case,Sanction,Progress,Grade,Section,Adviser\n");
        for i in 0..5001 {
            csv.push_str(&format!("Student{i} Test,2026-08-10,Bullying,Warning,Pending,Grade 7,A,T\n"));
        }
        let path = dir.file("big.csv", csv.as_bytes());
        assert!(parse(&memory_db(), path.to_str().unwrap())
            .unwrap_err()
            .contains("too large"));
    }

    // ── Payload / repository robustness ──────────────────────────────────

    #[test]
    fn payload_missing_optional_student_fields_still_saves() {
        let payload: CasePayload = serde_json::from_value(serde_json::json!({
            "students": [{"firstName":"Ana","lastName":"Santos","role":"Respondent"}],
            "date":"2026-10-13","dateFiled":"2026-10-13","case":"Bullying","progress":"Pending"
        }))
        .unwrap();
        let conn = memory_db();
        let id = CaseRepository::insert(&conn, &payload).unwrap();
        let saved = CaseRepository::find_by_id(&conn, id).unwrap().unwrap();
        assert_eq!(saved.proofs, "[]");
        assert_eq!(saved.first_name, "Ana");
    }

    #[test]
    fn school_year_derivation_never_panics_on_multibyte_dates() {
        for value in ["é2026", "日本語の日付", "２０２６-01-01", "ñ", ""] {
            let _ = CaseRepository::derive_school_year(value, "");
        }
        assert_eq!(CaseRepository::derive_school_year("2026-ñ", ""), "2026-2027");
    }

    #[test]
    fn active_months_are_sorted_and_unique() {
        let conn = memory_db();
        for date in ["2026-11-02", "2026-08-15", "2026-11-20", "2026-09-01"] {
            let mut p = payload();
            p.date = date.into();
            CaseRepository::insert(&conn, &p).unwrap();
        }
        assert_eq!(
            CaseRepository::get_active_months(&conn, "all").unwrap(),
            vec!["2026-08", "2026-09", "2026-11"]
        );
    }

    // ── Database import / export safety ──────────────────────────────────

    #[test]
    fn importing_non_sqlite_or_foreign_database_never_touches_live_data() {
        let dir = TempDir::new();
        let mut live = memory_db();
        CaseRepository::insert(&live, &payload()).unwrap();

        let junk = dir.file("junk.db", b"definitely not sqlite");
        assert!(recovery::replace_database(&mut live, &junk, &dir.0.join("safety")).is_err());

        let foreign = dir.0.join("foreign.db");
        rusqlite::Connection::open(&foreign)
            .unwrap()
            .execute_batch("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT);")
            .unwrap();
        let err = recovery::replace_database(&mut live, &foreign, &dir.0.join("safety")).unwrap_err();
        assert!(err.contains("not a Guidance Office database"), "{err}");

        assert_eq!(CaseRepository::get_cases(&live, None, None).unwrap().len(), 1);
    }

    #[test]
    fn export_replaces_a_chosen_file_atomically_and_refuses_the_live_database() {
        let dir = TempDir::new();
        let live_path = dir.0.join("live.db");
        let live = rusqlite::Connection::open(&live_path).unwrap();
        initialize_schema(&live).unwrap();
        CaseRepository::insert(&live, &payload()).unwrap();

        let destination = dir.file("existing.db", b"old contents");
        commands::export_database_to(&live, &destination).unwrap();
        let exported = rusqlite::Connection::open(&destination).unwrap();
        let count: i64 = exported
            .query_row("SELECT COUNT(*) FROM cases", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);

        let err = commands::export_database_to(&live, &live_path).unwrap_err();
        assert!(err.contains("live database"), "{err}");
        let leftovers: Vec<_> = std::fs::read_dir(&dir.0)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().starts_with(".lc-export-"))
            .collect();
        assert!(leftovers.is_empty(), "temporary export files must be cleaned up");
    }

    // ── Command guards ───────────────────────────────────────────────────

    #[test]
    fn school_year_setting_rejects_malformed_values() {
        let app = signed_in_app();
        for bad in ["", "abcd", "2026-2030", "20262027"] {
            assert!(
                commands::set_current_school_year(app.state(), bad.into()).is_err(),
                "{bad:?} should be rejected"
            );
        }
        assert_eq!(
            commands::set_current_school_year(app.state(), " 2026-2027 ".into()).unwrap(),
            "2026-2027"
        );
        assert_eq!(
            commands::get_current_school_year(app.state()).unwrap().as_deref(),
            Some("2026-2027")
        );
    }

    #[test]
    fn ai_session_rename_requires_a_title_and_an_existing_session() {
        let app = signed_in_app();
        assert!(commands::rename_ai_session(app.state(), "missing".into(), "   ".into())
            .unwrap_err()
            .contains("Enter a name"));
        assert!(commands::rename_ai_session(app.state(), "missing".into(), "Title".into())
            .unwrap_err()
            .contains("no longer exists"));
    }

    #[test]
    fn ai_sql_tool_rejects_writes_and_secret_tables() {
        let app = signed_in_app();
        for sql in [
            "DELETE FROM cases",
            "SELECT * FROM app_config",
            "SELECT 1; DROP TABLE cases",
            "SELECT value FROM otp_tokens",
        ] {
            assert!(
                commands::query_database_for_ai(app.state(), sql.into()).is_err(),
                "{sql} must be rejected"
            );
        }
        assert!(commands::query_database_for_ai(app.state(), "SELECT COUNT(*) AS n FROM cases".into()).is_ok());
    }

    #[test]
    fn signed_out_users_cannot_run_data_commands() {
        let app = signed_in_app();
        commands::sign_out(app.state()).unwrap();
        let err = commands::get_cases(app.state(), None, None).unwrap_err();
        assert!(err.contains("sign in"), "{err}");
        assert!(commands::get_gemini_api_key(app.state()).is_err());
        assert!(commands::set_current_school_year(app.state(), "2026-2027".into()).is_err());
    }

    #[test]
    fn wrong_pin_lockout_and_validation() {
        let app = signed_in_app();
        commands::sign_out(app.state()).unwrap();
        assert!(lc_guidance_lib::auth::validate_pin("12345").is_err());
        assert!(lc_guidance_lib::auth::validate_pin("12a456").is_err());
        for _ in 0..5 {
            assert!(!commands::verify_pin(app.state(), "000000".into()).unwrap());
        }
        let err = commands::verify_pin(app.state(), "123456".into()).unwrap_err();
        assert!(err.contains("wait"), "{err}");
    }
}
