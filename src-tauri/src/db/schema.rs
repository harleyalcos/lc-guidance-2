use rusqlite::Connection;

use super::DbResult;

pub fn initialize_schema(connection: &Connection) -> DbResult<()> {
    connection.execute_batch(
        r#"
CREATE TABLE IF NOT EXISTS cases (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  middle_initial TEXT NOT NULL DEFAULT '',
  level      TEXT NOT NULL,
  section    TEXT NOT NULL,
  date       TEXT NOT NULL,
  date_filed TEXT NOT NULL DEFAULT '',
  adviser    TEXT NOT NULL,
  "case"     TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sanction   TEXT NOT NULL,
  progress   TEXT NOT NULL DEFAULT 'Pending',
  proofs     TEXT NOT NULL DEFAULT '[]',
  students   TEXT NOT NULL DEFAULT '[]',
  student_roles TEXT NOT NULL DEFAULT '[]',
  title      TEXT NOT NULL DEFAULT '',
  reporting_student TEXT NOT NULL DEFAULT '',
  group_id   TEXT,
  update_history TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS otp_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  purpose    TEXT NOT NULL DEFAULT 'pin_reset'
);
"#,
    )?;

    let mut stmt = connection.prepare("PRAGMA table_info(cases)")?;
    let mut rows = stmt.query([])?;
    let mut has_date_filed = false;
    let mut has_middle_initial = false;
    let mut has_description = false;
    let mut has_proofs = false;
    let mut has_students = false;
    let mut has_student_roles = false;
    let mut has_title = false;
    let mut has_reporting_student = false;
    let mut has_group_id = false;
    let mut has_update_history = false;
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name == "date_filed" {
            has_date_filed = true;
        }
        if name == "middle_initial" {
            has_middle_initial = true;
        }
        if name == "description" {
            has_description = true;
        }
        if name == "proofs" {
            has_proofs = true;
        }
        if name == "students" {
            has_students = true;
        }
        if name == "student_roles" {
            has_student_roles = true;
        }
        if name == "title" {
            has_title = true;
        }
        if name == "reporting_student" {
            has_reporting_student = true;
        }
        if name == "group_id" {
            has_group_id = true;
        }
        if name == "update_history" {
            has_update_history = true;
        }
    }

    if !has_date_filed {
        connection.execute_batch(
            r#"
ALTER TABLE cases ADD COLUMN date_filed TEXT NOT NULL DEFAULT '';
UPDATE cases SET date_filed = date WHERE date_filed = '';
"#,
        )?;
    }

    if !has_students {
        connection.execute_batch(
            r#"
ALTER TABLE cases ADD COLUMN students TEXT NOT NULL DEFAULT '[]';
UPDATE cases SET students = json_array(json_object(
  'firstName', first_name,
  'lastName', last_name,
  'middleInitial', middle_initial,
  'level', level,
  'section', section,
  'adviser', adviser,
  'role', 'Respondent'
)) WHERE students = '[]';
"#,
        )?;
    }

    connection.execute_batch(
        r#"
UPDATE cases
SET students = COALESCE((
  SELECT json_group_array(
    CASE
      WHEN LOWER(COALESCE(json_extract(value, '$.role'), '')) IN ('reporter', 'accused', 'respondent')
        OR COALESCE(json_extract(value, '$.role'), '') = ''
      THEN json_set(value, '$.role', 'Respondent')
      WHEN LOWER(COALESCE(json_extract(value, '$.role'), '')) IN ('complainant', 'complainant / subject')
      THEN json_set(value, '$.role', 'Complainant / Subject')
      ELSE value
    END
  )
  FROM json_each(cases.students)
), students)
WHERE json_valid(students)
  AND json_array_length(students) > 0;
"#,
    )?;

    if !has_student_roles {
        connection.execute_batch(
            r#"
ALTER TABLE cases ADD COLUMN student_roles TEXT NOT NULL DEFAULT '[]';
UPDATE cases
SET student_roles = COALESCE((
  SELECT json_group_array(
    CASE
      WHEN LOWER(COALESCE(json_extract(value, '$.role'), '')) IN ('reporter', 'accused', 'respondent')
        OR COALESCE(json_extract(value, '$.role'), '') = ''
      THEN 'Respondent'
      WHEN LOWER(COALESCE(json_extract(value, '$.role'), '')) IN ('complainant', 'complainant / subject')
      THEN 'Complainant / Subject'
      ELSE json_extract(value, '$.role')
    END
  )
  FROM json_each(cases.students)
), '[]')
WHERE json_valid(students)
  AND json_array_length(students) > 0
  AND student_roles = '[]';
"#,
        )?;
    }

    connection.execute_batch(
        r#"
DROP TRIGGER IF EXISTS sync_case_student_roles_after_insert;
DROP TRIGGER IF EXISTS sync_case_student_roles_after_student_update;

CREATE TRIGGER IF NOT EXISTS sync_case_student_roles_after_insert
AFTER INSERT ON cases
WHEN json_valid(NEW.students) AND json_array_length(NEW.students) > 0
BEGIN
  UPDATE cases
  SET students = COALESCE((
      SELECT json_group_array(
        CASE
          WHEN LOWER(COALESCE(json_extract(value, '$.role'), '')) IN ('reporter', 'accused', 'respondent')
            OR COALESCE(json_extract(value, '$.role'), '') = ''
          THEN json_set(value, '$.role', 'Respondent')
          WHEN LOWER(COALESCE(json_extract(value, '$.role'), '')) IN ('complainant', 'complainant / subject')
          THEN json_set(value, '$.role', 'Complainant / Subject')
          ELSE value
        END
      )
      FROM json_each(NEW.students)
    ), NEW.students),
    student_roles = COALESCE((
      SELECT json_group_array(
        CASE
          WHEN LOWER(COALESCE(json_extract(value, '$.role'), '')) IN ('reporter', 'accused', 'respondent')
            OR COALESCE(json_extract(value, '$.role'), '') = ''
          THEN 'Respondent'
          WHEN LOWER(COALESCE(json_extract(value, '$.role'), '')) IN ('complainant', 'complainant / subject')
          THEN 'Complainant / Subject'
          ELSE json_extract(value, '$.role')
        END
      )
      FROM json_each(NEW.students)
    ), '[]')
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS sync_case_student_roles_after_student_update
AFTER UPDATE OF students ON cases
WHEN json_valid(NEW.students) AND json_array_length(NEW.students) > 0
BEGIN
  UPDATE cases
  SET students = COALESCE((
      SELECT json_group_array(
        CASE
          WHEN LOWER(COALESCE(json_extract(value, '$.role'), '')) IN ('reporter', 'accused', 'respondent')
            OR COALESCE(json_extract(value, '$.role'), '') = ''
          THEN json_set(value, '$.role', 'Respondent')
          WHEN LOWER(COALESCE(json_extract(value, '$.role'), '')) IN ('complainant', 'complainant / subject')
          THEN json_set(value, '$.role', 'Complainant / Subject')
          ELSE value
        END
      )
      FROM json_each(NEW.students)
    ), NEW.students),
    student_roles = COALESCE((
      SELECT json_group_array(
        CASE
          WHEN LOWER(COALESCE(json_extract(value, '$.role'), '')) IN ('reporter', 'accused', 'respondent')
            OR COALESCE(json_extract(value, '$.role'), '') = ''
          THEN 'Respondent'
          WHEN LOWER(COALESCE(json_extract(value, '$.role'), '')) IN ('complainant', 'complainant / subject')
          THEN 'Complainant / Subject'
          ELSE json_extract(value, '$.role')
        END
      )
      FROM json_each(NEW.students)
    ), '[]')
  WHERE id = NEW.id;
END;
"#,
    )?;

    if !has_middle_initial {
        connection.execute_batch(
            r#"
ALTER TABLE cases ADD COLUMN middle_initial TEXT NOT NULL DEFAULT '';
"#,
        )?;
    }

    if !has_description {
        connection.execute_batch(
            r#"
ALTER TABLE cases ADD COLUMN description TEXT NOT NULL DEFAULT '';
"#,
        )?;
    }

    if !has_proofs {
        connection.execute_batch(
            r#"
ALTER TABLE cases ADD COLUMN proofs TEXT NOT NULL DEFAULT '[]';
"#,
        )?;
    }

    if !has_title {
        connection.execute_batch(
            r#"
ALTER TABLE cases ADD COLUMN title TEXT NOT NULL DEFAULT '';
"#,
        )?;
    }

    if !has_reporting_student {
        connection.execute_batch(
            r#"
ALTER TABLE cases ADD COLUMN reporting_student TEXT NOT NULL DEFAULT '';
"#,
        )?;
    }

    if !has_group_id {
        connection.execute_batch(
            r#"
ALTER TABLE cases ADD COLUMN group_id TEXT;
"#,
        )?;
    }

    if !has_update_history {
        connection.execute_batch(
            r#"
ALTER TABLE cases ADD COLUMN update_history TEXT NOT NULL DEFAULT '[]';
UPDATE cases SET update_history = json_insert('[]', '$[0]', json_object('timestamp', date_filed || 'T00:00:00.000Z', 'action', 'Case created')) WHERE date_filed != '';
"#,
        )?;
    }

    let has_otp_purpose: bool = connection.query_row(
        "SELECT COUNT(*) > 0 FROM pragma_table_info('otp_tokens') WHERE name = 'purpose'",
        [],
        |row| row.get(0),
    )?;
    if !has_otp_purpose {
        connection.execute_batch(
            "ALTER TABLE otp_tokens ADD COLUMN purpose TEXT NOT NULL DEFAULT 'pin_reset';",
        )?;
    }

    connection.execute_batch(
        r#"
UPDATE cases
SET first_name = COALESCE(NULLIF(json_extract(students, '$[0].firstName'), ''), first_name),
    last_name = COALESCE(NULLIF(json_extract(students, '$[0].lastName'), ''), last_name),
    middle_initial = COALESCE(NULLIF(json_extract(students, '$[0].middleInitial'), ''), middle_initial),
    level = COALESCE(NULLIF(json_extract(students, '$[0].level'), ''), level),
    section = COALESCE(NULLIF(json_extract(students, '$[0].section'), ''), section),
    adviser = COALESCE(NULLIF(json_extract(students, '$[0].adviser'), ''), adviser)
WHERE json_valid(students)
  AND json_array_length(students) > 0
  AND (
    first_name = '' OR last_name = '' OR middle_initial = ''
    OR level = '' OR section = '' OR adviser = ''
  );
"#,
    )?;

    let legacy_proof_table_count: i64 = connection.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'case_proofs'",
        [],
        |row| row.get(0),
    )?;

    if legacy_proof_table_count > 0 {
        connection.execute_batch(
            r#"
UPDATE cases
SET proofs = COALESCE((
  SELECT json_group_array(json_object(
    'name', name,
    'data', data,
    'created_at', created_at
  ))
  FROM case_proofs
  WHERE case_proofs.case_id = cases.id
), '[]')
WHERE EXISTS (
  SELECT 1 FROM case_proofs WHERE case_proofs.case_id = cases.id
);

DROP TABLE case_proofs;
"#,
        )?;
    }

    Ok(())
}
