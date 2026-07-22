use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudentInfo {
    pub first_name: String,
    pub last_name: String,
    pub middle_initial: String,
    pub level: String,
    pub section: String,
    pub adviser: String,
    pub role: Option<String>,
    pub sanction: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CasePayload {
    pub students: Vec<StudentInfo>,
    pub date: String,
    pub date_filed: String,
    pub r#case: String,
    pub description: String,
    pub sanction: String,
    pub progress: String,
    pub proofs: String,
    pub title: String,
    pub reporting_student: Option<String>,
    pub group_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaseRecord {
    pub id: i64,
    pub first_name: String,
    pub last_name: String,
    pub middle_initial: String,
    pub level: String,
    pub section: String,
    pub date: String,
    pub date_filed: String,
    pub adviser: String,
    #[serde(rename = "case")]
    pub r#case: String,
    pub description: String,
    pub sanction: String,
    pub progress: String,
    pub proofs: String,
    pub students: String,
    pub title: String,
    pub reporting_student: String,
    pub group_id: Option<String>,
    pub update_history: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportRow {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    pub middle_initial: String,
    pub level: String,
    pub section: String,
    pub date: String,
    pub date_filed: String,
    pub adviser: String,
    pub r#case: String,
    pub description: String,
    pub sanction: String,
    pub progress: String,
    pub proofs: String,
    pub students: String,
    pub title: String,
    pub is_duplicate: bool,
    pub existing_case: Option<CaseRecord>,
    pub has_errors: bool,
    pub errors: Vec<String>,
}

impl ImportRow {
    pub fn validate(&mut self, connection: &rusqlite::Connection) {
        use crate::db::repository::CaseRepository;

        let normalize_id = |s: &str| -> Option<String> {
            let s = s.trim();
            if s.is_empty() { return None; }
            if let Some(stripped) = s.strip_prefix('#') {
                Some(stripped.trim().to_string())
            } else {
                Some(s.to_string())
            }
        };

        if !self.id.trim().is_empty() {
            match normalize_id(&self.id) {
                Some(id) => {
                    self.id = id;
                    if let Ok(id_val) = self.id.parse::<i64>() {
                        if let Ok(Some(existing)) = CaseRepository::find_by_id(connection, id_val) {
                            self.is_duplicate = true;
                            self.existing_case = Some(existing);
                        }
                    }
                }
                None => self.errors.push("id must be a whole number".to_string()),
            }
        } else if !self.first_name.trim().is_empty()
            && !self.last_name.trim().is_empty()
            && !self.date.trim().is_empty()
            && !self.r#case.trim().is_empty()
        {
            if let Ok(Some(existing)) = CaseRepository::find_duplicate_by_fields(
                connection,
                &self.first_name,
                &self.last_name,
                &self.date,
                &self.r#case,
            ) {
                self.is_duplicate = true;
                self.existing_case = Some(existing);
            }
        }

        if self.first_name.trim().is_empty() {
            self.errors.push("First Name is required".to_string());
        }
        if self.last_name.trim().is_empty() {
            self.errors.push("Last Name is required".to_string());
        }
        if self.level.trim().is_empty() {
            self.errors.push("Grade Level is required".to_string());
        }
        if self.section.trim().is_empty() {
            self.errors.push("Section is required".to_string());
        }
        
        if self.date.trim().is_empty() {
            self.errors.push("Incident Date is required".to_string());
        } else {
            let trimmed_date = self.date.trim();
            let valid_format = trimmed_date.len() == 10
                && trimmed_date.chars().nth(4) == Some('-')
                && trimmed_date.chars().nth(7) == Some('-');
            if !valid_format {
                self.errors.push("Incident Date must be in YYYY-MM-DD format".to_string());
            }
        }

        if !self.date_filed.trim().is_empty() {
            let trimmed_date = self.date_filed.trim();
            let valid_format = trimmed_date.len() == 10
                && trimmed_date.chars().nth(4) == Some('-')
                && trimmed_date.chars().nth(7) == Some('-');
            if !valid_format {
                self.errors.push("Date Filed must be in YYYY-MM-DD format".to_string());
            }
        }

        if self.adviser.trim().is_empty() {
            self.errors.push("Adviser is required".to_string());
        }
        if self.r#case.trim().is_empty() {
            self.errors.push("Case Type is required".to_string());
        }

        let validate_json = |val: &str, field: &str, errors: &mut Vec<String>| {
            if !val.trim().is_empty() {
                if serde_json::from_str::<serde_json::Value>(val).is_err() {
                    errors.push(format!("{} must be valid JSON", field));
                }
            }
        };

        validate_json(&self.proofs, "proofs", &mut self.errors);
        validate_json(&self.students, "students", &mut self.errors);

        self.has_errors = !self.errors.is_empty();
    }
}
