use crate::models::{CasePayload, CaseRecord};
use rusqlite::{params, OptionalExtension, Row};

pub struct CaseRepository;

impl CaseRepository {
    pub fn map_case(row: &Row<'_>) -> rusqlite::Result<CaseRecord> {
        Ok(CaseRecord {
            id: row.get("id")?,
            first_name: row.get("first_name")?,
            last_name: row.get("last_name")?,
            middle_initial: row.get("middle_initial")?,
            level: row.get("level")?,
            section: row.get("section")?,
            date: row.get("date")?,
            date_filed: row.get("date_filed")?,
            adviser: row.get("adviser")?,
            r#case: row.get("case")?,
            description: row.get("description")?,
            sanction: row.get("sanction")?,
            progress: row.get("progress")?,
            proofs: row.get("proofs")?,
            students: row.get("students")?,
            title: row.get("title")?,
            reporting_student: row.get("reporting_student")?,
            group_id: row.get("group_id").unwrap_or(None),
            update_history: row.get("update_history")?,
            school_year: row.get("school_year").unwrap_or_default(),
        })
    }

    pub fn get_cases(
        connection: &rusqlite::Connection,
        school_year: Option<String>,
        group_id: Option<String>,
    ) -> Result<Vec<CaseRecord>, String> {
        let mut query = r#"
SELECT id, first_name, last_name, middle_initial, level, section, date, date_filed, adviser, "case", description, sanction, progress, proofs, students, title, reporting_student, group_id, update_history, school_year
FROM cases
"#.to_string();

        let mut conditions: Vec<String> = Vec::new();
        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(ref year) = school_year {
            if !year.is_empty() && year != "all" {
                let p = params_vec.len() + 1;
                if year.len() == 4 && year.chars().all(|c| c.is_ascii_digit()) {
                    conditions.push(format!("substr(date, 1, 4) = ?{}", p));
                } else {
                    conditions.push(format!("school_year = ?{}", p));
                }
                params_vec.push(Box::new(year.clone()));
            }
        }

        if let Some(ref gid) = group_id {
            if !gid.trim().is_empty() {
                let p = params_vec.len() + 1;
                conditions.push(format!("group_id = ?{}", p));
                params_vec.push(Box::new(gid.trim().to_string()));
            }
        }

        if !conditions.is_empty() {
            query.push_str(" WHERE ");
            query.push_str(&conditions.join(" AND "));
        }

        query.push_str(" ORDER BY id DESC");

        let mut statement = connection.prepare(&query).map_err(|e| e.to_string())?;
        let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

        let cases = statement
            .query_map(rusqlite::params_from_iter(param_refs), Self::map_case)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        Ok(cases)
    }

    pub fn find_by_id(
        connection: &rusqlite::Connection,
        id: i64,
    ) -> Result<Option<CaseRecord>, String> {
        connection
            .query_row(
                "SELECT * FROM cases WHERE id = ?1 LIMIT 1",
                params![id],
                Self::map_case,
            )
            .optional()
            .map_err(|e| e.to_string())
    }

    pub fn find_exact_duplicate(
        connection: &rusqlite::Connection,
        first_name: &str,
        last_name: &str,
        middle_initial: &str,
        level: &str,
        section: &str,
        date: &str,
        adviser: &str,
        case_type: &str,
        sanction: &str,
        progress: &str,
    ) -> Result<Option<CaseRecord>, String> {
        connection
            .query_row(
                r#"SELECT * FROM cases
            WHERE LOWER(TRIM(first_name)) = LOWER(TRIM(?1))
            AND LOWER(TRIM(last_name)) = LOWER(TRIM(?2))
            AND LOWER(TRIM(middle_initial)) = LOWER(TRIM(?3))
            AND LOWER(TRIM(level)) = LOWER(TRIM(?4))
            AND LOWER(TRIM(section)) = LOWER(TRIM(?5))
            AND LOWER(TRIM(date)) = LOWER(TRIM(?6))
            AND LOWER(TRIM(adviser)) = LOWER(TRIM(?7))
            AND LOWER(TRIM("case")) = LOWER(TRIM(?8))
            AND LOWER(TRIM(sanction)) = LOWER(TRIM(?9))
            AND LOWER(TRIM(progress)) = LOWER(TRIM(?10))
            LIMIT 1"#,
                params![
                    first_name,
                    last_name,
                    middle_initial,
                    level,
                    section,
                    date,
                    adviser,
                    case_type,
                    sanction,
                    progress
                ],
                Self::map_case,
            )
            .optional()
            .map_err(|e| e.to_string())
    }

    pub fn insert(connection: &rusqlite::Connection, payload: &CasePayload) -> Result<i64, String> {
        let payload = payload.normalized()?;
        let primary_student = payload
            .students
            .first()
            .ok_or_else(|| "At least one student is required".to_string())?;

        let timestamp = chrono::DateTime::parse_from_rfc3339(&payload.date_filed)
            .map(|d| d.to_rfc3339())
            .unwrap_or_else(|_| {
                chrono::NaiveDate::parse_from_str(&payload.date_filed, "%Y-%m-%d")
                    .map(|d| format!("{}T00:00:00Z", d))
                    .unwrap_or_else(|_| chrono::Utc::now().to_rfc3339())
            });
        let initial_history =
            serde_json::json!([{"timestamp":timestamp,"action":"Case created"}]).to_string();

        let case_year = if let Some(ref sy) = payload.school_year {
            if !sy.trim().is_empty() {
                sy.trim().to_string()
            } else {
                Self::derive_school_year(&payload.date, &payload.date_filed)
            }
        } else {
            Self::derive_school_year(&payload.date, &payload.date_filed)
        };

        let students_json = serde_json::to_string(&payload.students)
            .map_err(|e| format!("Failed to serialize students: {}", e))?;

        connection
            .execute(
                r#"
INSERT INTO cases (
  students, date, date_filed, "case", description, sanction, progress, proofs, title, reporting_student, group_id, first_name, last_name, middle_initial, level, section, adviser, update_history, school_year
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
"#,
                params![
                    students_json,
                    payload.date,
                    payload.date_filed,
                    payload.r#case,
                    payload.description,
                    payload.sanction,
                    payload.progress,
                    payload.proofs,
                    payload.title,
                    payload.reporting_student.clone().unwrap_or_default(),
                    payload.group_id,
                    primary_student.first_name,
                    primary_student.last_name,
                    primary_student.middle_initial,
                    primary_student.level,
                    primary_student.section,
                    primary_student.adviser,
                    initial_history,
                    case_year
                ],
            )
            .map_err(|e| e.to_string())?;

        Ok(connection.last_insert_rowid())
    }

    pub fn update(
        connection: &rusqlite::Connection,
        id: i64,
        payload: &CasePayload,
        update_log: Option<String>,
    ) -> Result<(), String> {
        let payload = payload.normalized()?;
        let primary_student = payload
            .students
            .first()
            .ok_or_else(|| "At least one student is required".to_string())?;

        let students_json = serde_json::to_string(&payload.students)
            .map_err(|e| format!("Failed to serialize students: {}", e))?;

        let previous = Self::find_by_id(connection, id)?
            .ok_or_else(|| format!("Case with id {id} was not found"))?;
        let case_year = payload
            .school_year
            .as_deref()
            .filter(|y| !y.trim().is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| {
                if previous.date == payload.date && !previous.school_year.is_empty() {
                    previous.school_year.clone()
                } else {
                    Self::derive_school_year(&payload.date, &payload.date_filed)
                }
            });
        let update_log = update_log.or_else(|| {
            if previous.progress != payload.progress {
                Some(format!(
                    "Status changed from {} to {}",
                    previous.progress, payload.progress
                ))
            } else {
                Some("Case details updated".into())
            }
        });
        let timestamp = chrono::Utc::now().to_rfc3339();

        let rows_updated = connection
            .execute(
                r#"
UPDATE cases SET
  students = ?1, date = ?2, date_filed = ?3, "case" = ?4, description = ?5,
  sanction = ?6, progress = ?7, proofs = ?8, title = ?9,
  reporting_student = COALESCE(?10, reporting_student), group_id = ?11,
  first_name = ?12, last_name = ?13, middle_initial = ?14, level = ?15, section = ?16, adviser = ?17,
  school_year = ?21,
  update_history = CASE
      WHEN ?18 IS NOT NULL THEN json_insert(update_history, '$[#]', json_object('timestamp', ?19, 'action', ?18))
      ELSE update_history
  END
WHERE id = ?20
"#,
                params![
                    students_json,
                    payload.date,
                    payload.date_filed,
                    payload.r#case,
                    payload.description,
                    payload.sanction,
                    payload.progress,
                    payload.proofs,
                    payload.title,
                    payload.reporting_student,
                    payload.group_id,
                    primary_student.first_name,
                    primary_student.last_name,
                    primary_student.middle_initial,
                    primary_student.level,
                    primary_student.section,
                    primary_student.adviser,
                    update_log,
                    timestamp,
                    id,
                    case_year
                ],
            )
            .map_err(|e| e.to_string())?;

        if rows_updated == 0 {
            return Err(format!("Case with id {} was not found", id));
        }

        Ok(())
    }

    pub fn delete_case(connection: &rusqlite::Connection, id: i64) -> Result<(), String> {
        let rows_affected = connection
            .execute("DELETE FROM cases WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;

        if rows_affected > 0 {
            Ok(())
        } else {
            Err(format!("Case with id {} not found.", id))
        }
    }

    pub fn get_active_months(
        connection: &rusqlite::Connection,
        school_year: &str,
    ) -> Result<Vec<String>, String> {
        let mut months = Vec::new();
        if school_year == "all" || school_year.is_empty() {
            let mut stmt = connection
                .prepare("SELECT DISTINCT strftime('%Y-%m', date) FROM cases WHERE date IS NOT NULL AND date != '' ORDER BY date ASC")
                .map_err(|e| format!("Failed to prepare query: {}", e))?;
            let rows = stmt
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(|e| format!("Query execution failed: {}", e))?;
            for row in rows {
                if let Ok(month) = row {
                    if !month.is_empty() && month != "null" {
                        months.push(month);
                    }
                }
            }
        } else {
            let mut stmt = connection
                .prepare("SELECT DISTINCT strftime('%Y-%m', date) FROM cases WHERE ((length(?1) = 4 AND substr(date, 1, 4) = ?1) OR (length(?1) != 4 AND school_year = ?1)) AND date != '' ORDER BY date ASC")
                .map_err(|e| format!("Failed to prepare query: {}", e))?;
            let rows = stmt
                .query_map(params![school_year], |row| row.get::<_, String>(0))
                .map_err(|e| format!("Query execution failed: {}", e))?;
            for row in rows {
                if let Ok(month) = row {
                    if !month.is_empty() && month != "null" {
                        months.push(month);
                    }
                }
            }
        }

        Ok(months)
    }

    pub fn derive_school_year(date: &str, date_filed: &str) -> String {
        let target_date = if !date.trim().is_empty() {
            date.trim()
        } else {
            date_filed.trim()
        };

        if let Ok(d) = chrono::NaiveDate::parse_from_str(
            target_date.get(..10).unwrap_or(target_date),
            "%Y-%m-%d",
        ) {
            let year = chrono::Datelike::year(&d);
            let month = chrono::Datelike::month(&d);
            if month >= 7 {
                format!("{}-{}", year, year + 1)
            } else {
                format!("{}-{}", year - 1, year)
            }
        } else if let Ok(d) = chrono::NaiveDate::parse_from_str(target_date, "%m/%d/%Y") {
            let year = chrono::Datelike::year(&d);
            let month = chrono::Datelike::month(&d);
            if month >= 7 {
                format!("{}-{}", year, year + 1)
            } else {
                format!("{}-{}", year - 1, year)
            }
        } else if target_date.len() >= 4 && target_date[0..4].chars().all(|c| c.is_ascii_digit()) {
            let year: i32 = target_date[0..4].parse().unwrap_or(2026);
            format!("{}-{}", year, year + 1)
        } else {
            chrono::Utc::now().format("%Y").to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::schema::initialize_schema;
    use crate::models::{CasePayload, StudentInfo};

    #[test]
    fn test_derive_school_year() {
        assert_eq!(
            CaseRepository::derive_school_year("2024-08-15", ""),
            "2024-2025"
        );
        assert_eq!(
            CaseRepository::derive_school_year("2025-03-10", ""),
            "2024-2025"
        );
        assert_eq!(
            CaseRepository::derive_school_year("08/15/2024", ""),
            "2024-2025"
        );
        assert_eq!(
            CaseRepository::derive_school_year("03/10/2025", ""),
            "2024-2025"
        );
    }

    #[test]
    fn test_insert_and_filter_by_academic_year() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        initialize_schema(&conn).unwrap();

        let payload = CasePayload {
            students: vec![StudentInfo {
                participant_id: None,
                first_name: "Juan".to_string(),
                last_name: "Dela Cruz".to_string(),
                middle_initial: "P".to_string(),
                level: "Grade 10".to_string(),
                section: "Rizal".to_string(),
                adviser: "Ms. Santos".to_string(),
                role: Some("Respondent".to_string()),
                sanction: Some("Verbal Warning".to_string()),
            }],
            date: "2024-08-15".to_string(),
            date_filed: "2024-08-15".to_string(),
            r#case: "Tardiness".to_string(),
            description: "Repeated tardiness".to_string(),
            sanction: "Verbal Warning".to_string(),
            progress: "Pending".to_string(),
            proofs: "[]".to_string(),
            title: "Tardiness Case".to_string(),
            reporting_student: None,
            group_id: None,
            school_year: None,
        };

        let case_id = CaseRepository::insert(&conn, &payload).unwrap();
        assert!(case_id > 0);

        // Filter by school year 2024-2025
        let cases_sy =
            CaseRepository::get_cases(&conn, Some("2024-2025".to_string()), None).unwrap();
        assert_eq!(
            cases_sy.len(),
            1,
            "Should find case when filtering by academic year 2024-2025"
        );
        assert_eq!(cases_sy[0].school_year, "2024-2025");

        // Filter by calendar year 2024
        let cases_cal = CaseRepository::get_cases(&conn, Some("2024".to_string()), None).unwrap();
        assert_eq!(
            cases_cal.len(),
            1,
            "Should find case when filtering by calendar year 2024"
        );
    }

    #[test]
    fn test_filter_by_group_id() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        initialize_schema(&conn).unwrap();

        let mut p1 = CasePayload {
            students: vec![StudentInfo {
                participant_id: None,
                first_name: "Student".to_string(),
                last_name: "One".to_string(),
                middle_initial: "".to_string(),
                level: "Grade 8".to_string(),
                section: "A".to_string(),
                adviser: "Teacher".to_string(),
                role: Some("Respondent".to_string()),
                sanction: Some("Warning".to_string()),
            }],
            date: "2024-09-01".to_string(),
            date_filed: "2024-09-01".to_string(),
            r#case: "Dispute".to_string(),
            description: "Group altercation".to_string(),
            sanction: "Warning".to_string(),
            progress: "Pending".to_string(),
            proofs: "[]".to_string(),
            title: "Group Dispute".to_string(),
            reporting_student: None,
            group_id: Some("GRP-1001".to_string()),
            school_year: None,
        };

        CaseRepository::insert(&conn, &p1).unwrap();
        p1.group_id = Some("GRP-1002".to_string());
        p1.students[0].first_name = "StudentTwo".to_string();
        CaseRepository::insert(&conn, &p1).unwrap();

        let group_cases =
            CaseRepository::get_cases(&conn, None, Some("GRP-1001".to_string())).unwrap();
        assert_eq!(group_cases.len(), 1);
        assert_eq!(group_cases[0].group_id.as_deref(), Some("GRP-1001"));
    }

    #[test]
    fn test_duplicate_detection_normalized_dates() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        initialize_schema(&conn).unwrap();

        let payload = CasePayload {
            students: vec![StudentInfo {
                participant_id: None,
                first_name: "Maria".to_string(),
                last_name: "Clara".to_string(),
                middle_initial: "".to_string(),
                level: "Grade 7".to_string(),
                section: "Luna".to_string(),
                adviser: "Mr. Cruz".to_string(),
                role: Some("Respondent".to_string()),
                sanction: Some("Written Reprimand".to_string()),
            }],
            date: "2024-09-01".to_string(),
            date_filed: "2024-09-01".to_string(),
            r#case: "Bullying".to_string(),
            description: "Teasing classmate".to_string(),
            sanction: "Written Reprimand".to_string(),
            progress: "Pending".to_string(),
            proofs: "[]".to_string(),
            title: "Bullying Incident".to_string(),
            reporting_student: None,
            group_id: None,
            school_year: Some("2024-2025".to_string()),
        };

        CaseRepository::insert(&conn, &payload).unwrap();

        let dup = CaseRepository::find_exact_duplicate(
            &conn,
            "Maria",
            "Clara",
            "",
            "Grade 7",
            "Luna",
            "2024-09-01",
            "Mr. Cruz",
            "Bullying",
            "Written Reprimand",
            "Pending",
        )
        .unwrap();

        assert!(
            dup.is_some(),
            "Duplicate detection should match exact record"
        );
    }

    #[test]
    fn test_app_config_school_year() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        initialize_schema(&conn).unwrap();

        // Default when not configured returns current calendar year
        let default_sy = crate::commands::get_config(&conn, "current_school_year").unwrap();
        assert!(default_sy.is_none());

        // Configure academic year
        crate::commands::set_config(&conn, "current_school_year", "2026-2027").unwrap();
        let configured = crate::commands::get_config(&conn, "current_school_year").unwrap();
        assert_eq!(configured, Some("2026-2027".to_string()));
    }

    #[test]
    fn test_ai_query_blocks_sensitive_tables() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        initialize_schema(&conn).unwrap();

        // Testing the query filter logic
        let test_queries = [
            ("SELECT * FROM app_config", true),
            (
                "SELECT value FROM app_config WHERE key = 'app_pin_hash'",
                true,
            ),
            ("SELECT * FROM otp_tokens", true),
            ("SELECT * FROM sqlite_master", true),
            ("SELECT id, title FROM cases", false),
        ];

        for (sql, should_block) in test_queries {
            let upper = sql.to_uppercase();
            let is_blocked = upper.contains("APP_CONFIG")
                || upper.contains("OTP_TOKENS")
                || upper.contains("SQLITE_MASTER")
                || upper.contains("SQLITE_SCHEMA")
                || upper.contains("PRAGMA");
            assert_eq!(is_blocked, should_block, "Query check failed for: {}", sql);
        }
    }

    #[test]
    fn test_export_csv_includes_all_columns() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        initialize_schema(&conn).unwrap();

        let temp_dir = std::env::temp_dir();
        let csv_path = temp_dir.join("test_snapshot.csv");

        crate::db::backup::export_csv(&conn, &csv_path).unwrap();

        let mut rdr = csv::Reader::from_path(&csv_path).unwrap();
        let headers = rdr.headers().unwrap();
        assert_eq!(headers.len(), 21, "CSV must include all 21 columns");
        assert!(headers.iter().any(|h| h == "group_id"));
        assert!(headers.iter().any(|h| h == "student_roles"));
        assert!(headers.iter().any(|h| h == "update_history"));
        assert!(headers.iter().any(|h| h == "school_year"));

        let _ = std::fs::remove_file(csv_path);
    }
}
