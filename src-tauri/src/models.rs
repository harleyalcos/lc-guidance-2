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
    pub school_year: Option<String>,
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
    pub school_year: String,
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
    pub school_year: Option<String>,
}

impl ImportRow {
    pub fn sync_students(&mut self) {
        let fnames: Vec<&str> = self.first_name.split('\n').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
        let lnames: Vec<&str> = self.last_name.split('\n').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
        let mnames: Vec<&str> = self.middle_initial.split('\n').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();

        let mut student_list = Vec::new();
        let max_len = fnames.len().max(lnames.len()).max(mnames.len());
        
        if max_len == 0 {
            student_list.push(serde_json::json!({
                "firstName": "",
                "lastName": "",
                "middleInitial": "",
                "level": self.level,
                "section": self.section,
                "adviser": self.adviser,
                "role": "Respondent"
            }));
        } else {
            for index in 0..max_len {
                let fn_val = fnames.get(index).copied().unwrap_or("").to_string();
                let ln_val = lnames.get(index).copied().unwrap_or("").to_string();
                let mn_val = mnames.get(index).copied().unwrap_or("").to_string();
                
                student_list.push(serde_json::json!({
                    "firstName": fn_val,
                    "lastName": ln_val,
                    "middleInitial": mn_val,
                    "level": self.level,
                    "section": self.section,
                    "adviser": self.adviser,
                    "role": "Respondent"
                }));
            }
        }
        self.students = serde_json::to_string(&student_list).unwrap_or_else(|_| "[]".to_string());
    }

    pub fn validate(&mut self, connection: &rusqlite::Connection) {
        use crate::db::repository::CaseRepository;

        self.sync_students();
        self.errors.clear();
        self.has_errors = false;
        self.is_duplicate = false;
        self.existing_case = None;

        let normalize_id = |s: &str| -> Option<String> {
            let s = s.trim();
            if s.is_empty() { return None; }
            if let Some(stripped) = s.strip_prefix('#') {
                Some(stripped.trim().to_string())
            } else {
                Some(s.to_string())
            }
        };

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
        
        let valid_progress = ["pending", "reprimand", "resolved", "closed"];
        if self.progress.trim().is_empty() {
            self.errors.push("Progress is required".to_string());
        } else if !valid_progress.contains(&self.progress.trim().to_lowercase().as_str()) {
            self.errors.push("Progress must be Pending, Reprimand, Resolved, or Closed".to_string());
        }
        if self.date.trim().is_empty() {
            self.errors.push("Incident Date is required".to_string());
        } else {
            let trimmed_date = self.date.trim();
            let parts: Vec<&str> = trimmed_date.split('/').collect();
            if parts.len() == 3 && (parts[0].len() == 1 || parts[0].len() == 2) && (parts[1].len() == 1 || parts[1].len() == 2) && (parts[2].len() == 4 || parts[2].len() == 2) {
                let month = format!("{:02}", parts[0].parse::<u32>().unwrap_or(0));
                let day = format!("{:02}", parts[1].parse::<u32>().unwrap_or(0));
                let year = if parts[2].len() == 2 {
                    let y = parts[2].parse::<i32>().unwrap_or(0);
                    if y < 50 { format!("20{:02}", y) } else { format!("19{:02}", y) }
                } else {
                    parts[2].to_string()
                };
                self.date = format!("{}-{}-{}", year, month, day);
            } else if trimmed_date.len() == 10
                && trimmed_date.chars().nth(4) == Some('-')
                && trimmed_date.chars().nth(7) == Some('-') {
                // already in yyyy-mm-dd
            } else {
                self.errors.push("Incident Date must be in mm/dd/yy or mm/dd/yyyy format".to_string());
            }
        }

        if let Some(id_str) = normalize_id(&self.id) {
            match id_str.parse::<i64>() {
                Ok(id) => {
                    if let Ok(Some(existing)) = CaseRepository::find_by_id(connection, id) {
                        self.is_duplicate = true;
                        self.existing_case = Some(existing);
                    }
                }
                Err(_) => self.errors.push("id must be a whole number".to_string()),
            }
        } else if !self.first_name.trim().is_empty()
            && !self.last_name.trim().is_empty()
            && !self.date.trim().is_empty()
            && !self.r#case.trim().is_empty()
        {
            if let Ok(Some(existing)) = CaseRepository::find_exact_duplicate(
                connection,
                &self.first_name,
                &self.last_name,
                &self.middle_initial,
                &self.level,
                &self.section,
                &self.date,
                &self.adviser,
                &self.r#case,
                &self.sanction,
                &self.progress,
            ) {
                self.is_duplicate = true;
                self.existing_case = Some(existing);
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
        } else {
            self.date_filed = self.date.clone();
        }

        if self.adviser.trim().is_empty() {
            self.errors.push("Adviser is required".to_string());
        }
        if self.r#case.trim().is_empty() {
            self.errors.push("Case Type is required".to_string());
        }

        if self.sanction.chars().count() > 250 {
            self.errors.push("Sanction cannot exceed 250 characters".to_string());
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
