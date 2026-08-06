use rusqlite::{params, Row, OptionalExtension};
use crate::models::{CasePayload, CaseRecord};

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

    pub fn find_by_id(connection: &rusqlite::Connection, id: i64) -> Result<Option<CaseRecord>, String> {
        connection.query_row(
            "SELECT * FROM cases WHERE id = ?1 LIMIT 1",
            params![id],
            Self::map_case
        ).optional().map_err(|e| e.to_string())
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
        connection.query_row(
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
            params![first_name, last_name, middle_initial, level, section, date, adviser, case_type, sanction, progress],
            Self::map_case
        ).optional().map_err(|e| e.to_string())
    }


    pub fn insert(
        connection: &rusqlite::Connection,
        payload: &CasePayload,
    ) -> Result<i64, String> {
        let primary_student = payload
            .students
            .first()
            .ok_or_else(|| "At least one student is required".to_string())?;

        let initial_history = format!(
            "[{{\"timestamp\":\"{}T00:00:00.000Z\",\"action\":\"Case created\"}}]",
            payload.date_filed
        );

        let students_json = serde_json::to_string(&payload.students)
            .map_err(|e| format!("Failed to serialize students: {}", e))?;

        connection
            .execute(
                r#"
INSERT INTO cases (
  students, date, date_filed, "case", description, sanction, progress, proofs, title, reporting_student, group_id, first_name, last_name, middle_initial, level, section, adviser, update_history, school_year
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, COALESCE((SELECT value FROM app_config WHERE key = 'current_school_year'), ''))
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
                    initial_history
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
        let primary_student = payload
            .students
            .first()
            .ok_or_else(|| "At least one student is required".to_string())?;

        let students_json = serde_json::to_string(&payload.students)
            .map_err(|e| format!("Failed to serialize students: {}", e))?;

        let timestamp = chrono::Utc::now().to_rfc3339();

        let rows_updated = connection
            .execute(
                r#"
UPDATE cases SET
  students = ?1, date = ?2, date_filed = ?3, "case" = ?4, description = ?5,
  sanction = ?6, progress = ?7, proofs = ?8, title = ?9,
  reporting_student = COALESCE(?10, reporting_student), group_id = ?11,
  first_name = ?12, last_name = ?13, middle_initial = ?14, level = ?15, section = ?16, adviser = ?17,
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
                    id
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
        let mut stmt = connection
            .prepare("SELECT DISTINCT strftime('%Y-%m', date) FROM cases WHERE school_year = ?1 ORDER BY date ASC")
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let rows = stmt
            .query_map(params![school_year], |row| row.get::<_, String>(0))
            .map_err(|e| format!("Query execution failed: {}", e))?;

        let mut months = Vec::new();
        for row in rows {
            if let Ok(month) = row {
                if !month.is_empty() && month != "null" {
                    months.push(month);
                }
            }
        }

        Ok(months)
    }
}
