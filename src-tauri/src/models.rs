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
    pub full_name: String,
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

        let title_case = |s: &str| -> String {
            s.split_whitespace()
                .map(|word| {
                    let mut c = word.chars();
                    match c.next() {
                        None => String::new(),
                        Some(f) => f.to_uppercase().collect::<String>() + c.as_str().to_lowercase().as_str(),
                    }
                })
                .collect::<Vec<String>>()
                .join(" ")
        };

        // 1. Full Name parsing (Format: Lastname, Firstname I.)
        let trimmed_full = self.full_name.trim();
        if !trimmed_full.is_empty() {
            if !trimmed_full.contains(',') {
                self.errors.push("Full Name must match 'Lastname, Firstname I.' format (comma required)".to_string());
            } else {
                let parts: Vec<&str> = trimmed_full.splitn(2, ',').collect();
                let last = parts.get(0).copied().unwrap_or("").trim();
                let rest = parts.get(1).copied().unwrap_or("").trim();
                
                let rest_tokens: Vec<&str> = rest.split_whitespace().collect();
                if rest_tokens.is_empty() {
                    self.errors.push("First Name is required after comma in Full Name".to_string());
                } else if rest_tokens.len() == 1 {
                    self.first_name = title_case(rest_tokens[0]);
                    self.middle_initial = String::new();
                } else {
                    let last_token = rest_tokens.last().copied().unwrap_or("");
                    let fn_tokens = &rest_tokens[..rest_tokens.len() - 1];
                    self.first_name = title_case(&fn_tokens.join(" "));
                    self.middle_initial = title_case(last_token);
                }
                self.last_name = title_case(last);
            }
        }

        if self.first_name.trim().is_empty() {
            self.errors.push("First Name is required".to_string());
        } else if self.first_name.trim().chars().all(|c| c.is_numeric() || c.is_whitespace() || c == '.' || c == ',') {
            self.errors.push("First Name cannot be purely numeric or punctuation".to_string());
        } else {
            self.first_name = title_case(&self.first_name);
        }

        if self.last_name.trim().is_empty() {
            self.errors.push("Last Name is required".to_string());
        } else if self.last_name.trim().chars().all(|c| c.is_numeric() || c.is_whitespace() || c == '.' || c == ',') {
            self.errors.push("Last Name cannot be purely numeric or punctuation".to_string());
        } else {
            self.last_name = title_case(&self.last_name);
        }

        if !self.middle_initial.trim().is_empty() {
            self.middle_initial = title_case(&self.middle_initial);
        }

        // Reconstruct canonical full_name
        if !self.last_name.is_empty() && !self.first_name.is_empty() {
            if !self.middle_initial.is_empty() {
                self.full_name = format!("{}, {} {}", self.last_name, self.first_name, self.middle_initial);
            } else {
                self.full_name = format!("{}, {}", self.last_name, self.first_name);
            }
        }

        if !self.level.trim().is_empty() {
            self.level = title_case(&self.level);
        }
        
        if self.section.trim().is_empty() {
            self.errors.push("Section is required".to_string());
        } else if self.section.chars().count() > 250 {
            self.errors.push("Section cannot exceed 250 characters".to_string());
        } else {
            self.section = self.section.trim().to_uppercase();
        }
        
        let valid_progress = ["pending", "reprimand", "resolved", "closed"];
        if self.progress.trim().is_empty() {
            self.errors.push("Progress is required".to_string());
        } else {
            let p_lower = self.progress.trim().to_lowercase();
            if !valid_progress.contains(&p_lower.as_str()) {
                self.errors.push("Progress must be Pending, Reprimand, Resolved, or Closed".to_string());
            } else {
                self.progress = title_case(&p_lower);
            }
        }

        if self.date.trim().is_empty() {
            self.errors.push("Incident Date is required".to_string());
        } else {
            let trimmed = self.date.trim();
            let mut parsed_date = None;

            if let Ok(naive) = chrono::NaiveDate::parse_from_str(trimmed, "%m/%d/%y") {
                parsed_date = Some(naive);
            } else if let Ok(naive) = chrono::NaiveDate::parse_from_str(trimmed, "%m/%d/%Y") {
                parsed_date = Some(naive);
            } else if let Ok(naive) = chrono::NaiveDate::parse_from_str(trimmed, "%Y-%m-%d") {
                parsed_date = Some(naive);
            } else if let Ok(naive) = chrono::NaiveDate::parse_from_str(trimmed, "%b %d, %Y") {
                parsed_date = Some(naive);
            } else if let Ok(naive) = chrono::NaiveDate::parse_from_str(trimmed, "%B %d, %Y") {
                parsed_date = Some(naive);
            } else if let Ok(naive) = chrono::NaiveDate::parse_from_str(trimmed, "%m-%d-%y") {
                parsed_date = Some(naive);
            } else if let Ok(naive) = chrono::NaiveDate::parse_from_str(trimmed, "%m-%d-%Y") {
                parsed_date = Some(naive);
            }
            
            if let Some(naive) = parsed_date {
                self.date = naive.format("%b %d, %Y").to_string();
            } else {
                self.errors.push("Incident Date must be a valid date (e.g. Jun 21, 2026 or 06/21/2026)".to_string());
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
            let trimmed = self.date_filed.trim();
            let mut parsed_date = None;

            if let Ok(naive) = chrono::NaiveDate::parse_from_str(trimmed, "%m/%d/%y") {
                parsed_date = Some(naive);
            } else if let Ok(naive) = chrono::NaiveDate::parse_from_str(trimmed, "%m/%d/%Y") {
                parsed_date = Some(naive);
            } else if let Ok(naive) = chrono::NaiveDate::parse_from_str(trimmed, "%Y-%m-%d") {
                parsed_date = Some(naive);
            } else if let Ok(naive) = chrono::NaiveDate::parse_from_str(trimmed, "%m-%d-%y") {
                parsed_date = Some(naive);
            } else if let Ok(naive) = chrono::NaiveDate::parse_from_str(trimmed, "%m-%d-%Y") {
                parsed_date = Some(naive);
            }
            
            if let Some(naive) = parsed_date {
                self.date_filed = naive.format("%Y-%m-%d").to_string();
            } else {
                self.errors.push("Date Filed must be a valid date in MM/DD/YYYY or YYYY-MM-DD format".to_string());
            }
        } else {
            self.date_filed = self.date.clone();
        }

        if self.adviser.trim().is_empty() {
            self.errors.push("Adviser is required".to_string());
        } else if self.adviser.chars().count() > 250 {
            self.errors.push("Adviser cannot exceed 250 characters".to_string());
        } else {
            self.adviser = title_case(&self.adviser);
        }

        if self.r#case.trim().is_empty() {
            self.errors.push("Case Type is required".to_string());
        } else if self.r#case.chars().count() > 250 {
            self.errors.push("Case Type cannot exceed 250 characters".to_string());
        } else {
            self.r#case = title_case(&self.r#case);
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
        
        // Re-sync students since we title-cased the names
        self.sync_students();
        validate_json(&self.students, "students", &mut self.errors);

        self.has_errors = !self.errors.is_empty();
    }
}
