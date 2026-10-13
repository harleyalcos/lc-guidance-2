use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudentInfo {
    #[serde(default)]
    pub participant_id: Option<String>,
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
    pub group_id: Option<String>,
    pub school_year: Option<String>,
}

impl ImportRow {
    pub fn sync_students(&mut self) {
        let fnames: Vec<&str> = self
            .first_name
            .split('\n')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();
        let lnames: Vec<&str> = self
            .last_name
            .split('\n')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();
        let mnames: Vec<&str> = self
            .middle_initial
            .split('\n')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();

        let existing: Vec<serde_json::Value> =
            serde_json::from_str(&self.students).unwrap_or_default();
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
                "role": "Respondent",
                "sanction": self.sanction
            }));
        } else {
            for index in 0..max_len {
                let fn_val = fnames.get(index).copied().unwrap_or("").to_string();
                let ln_val = lnames.get(index).copied().unwrap_or("").to_string();
                let mn_val = mnames.get(index).copied().unwrap_or("").to_string();

                student_list.push(serde_json::json!({
                    "participantId": existing.get(index).and_then(|s| s.get("participantId")).and_then(|v| v.as_str()).map(str::to_string).unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
                    "firstName": fn_val,
                    "lastName": ln_val,
                    "middleInitial": mn_val,
                    "level": self.level,
                    "section": self.section,
                    "adviser": self.adviser,
                    "role": "Respondent",
                "sanction": self.sanction
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
            if s.is_empty() {
                return None;
            }
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
                        Some(f) => {
                            f.to_uppercase().collect::<String>()
                                + c.as_str().to_lowercase().as_str()
                        }
                    }
                })
                .collect::<Vec<String>>()
                .join(" ")
        };

        // 1. Full Name parsing (Accepts any non-empty name string without strict format errors)
        let trimmed_full = self.full_name.trim();
        if trimmed_full.is_empty() {
            self.first_name = String::new();
            self.last_name = String::new();
            self.middle_initial = String::new();
        } else if trimmed_full.contains(',') {
            let parts: Vec<&str> = trimmed_full.splitn(2, ',').collect();
            let last = parts.get(0).copied().unwrap_or("").trim();
            let rest = parts.get(1).copied().unwrap_or("").trim();

            let rest_tokens: Vec<&str> = rest.split_whitespace().collect();
            if rest_tokens.is_empty() {
                let formatted_last = title_case(last);
                self.last_name = formatted_last.clone();
                self.first_name = formatted_last;
                self.middle_initial = String::new();
            } else if rest_tokens.len() == 1 {
                self.first_name = title_case(rest_tokens[0]);
                self.middle_initial = String::new();
                self.last_name = title_case(last);
            } else {
                let last_token = rest_tokens.last().copied().unwrap_or("");
                if last_token.len() <= 2 || last_token.ends_with('.') {
                    let fn_tokens = &rest_tokens[..rest_tokens.len() - 1];
                    self.first_name = title_case(&fn_tokens.join(" "));
                    self.middle_initial = title_case(last_token.trim_end_matches('.'));
                } else {
                    self.first_name = title_case(&rest_tokens.join(" "));
                    self.middle_initial = String::new();
                }
                self.last_name = title_case(last);
            }
        } else {
            let tokens: Vec<&str> = trimmed_full.split_whitespace().collect();
            if tokens.len() <= 1 {
                let single_name = title_case(trimmed_full);
                self.first_name = single_name.clone();
                self.last_name = single_name;
                self.middle_initial = String::new();
            } else if tokens.len() == 2 {
                self.first_name = title_case(tokens[0]);
                self.last_name = title_case(tokens[1]);
                self.middle_initial = String::new();
            } else {
                let second_to_last = tokens[tokens.len() - 2];
                if second_to_last.len() <= 2 || second_to_last.ends_with('.') {
                    self.first_name = title_case(&tokens[..tokens.len() - 2].join(" "));
                    self.middle_initial = title_case(second_to_last.trim_end_matches('.'));
                    self.last_name = title_case(tokens[tokens.len() - 1]);
                } else {
                    self.first_name = title_case(&tokens[..tokens.len() - 1].join(" "));
                    self.middle_initial = String::new();
                    self.last_name = title_case(tokens[tokens.len() - 1]);
                }
            }
        }

        let mut missing_fields = Vec::new();

        if trimmed_full.is_empty()
            || self.first_name.trim().is_empty()
            || self.last_name.trim().is_empty()
        {
            missing_fields.push("Full Name");
        }
        if self.date.trim().is_empty() {
            missing_fields.push("Date");
        }
        if self.r#case.trim().is_empty() {
            missing_fields.push("Case Type");
        }

        if self.progress.trim().is_empty() {
            self.progress = "Pending".to_string();
        }

        if !missing_fields.is_empty() {
            self.errors.push(format!(
                "These fields are required : {}",
                missing_fields.join(", ")
            ));
        }

        if !self.first_name.trim().is_empty() {
            if self
                .first_name
                .trim()
                .chars()
                .all(|c| c.is_numeric() || c.is_whitespace() || c == '.' || c == ',')
            {
                self.errors
                    .push("First Name cannot be purely numeric or punctuation".to_string());
            } else {
                self.first_name = title_case(&self.first_name);
            }
        }

        if !self.last_name.trim().is_empty() {
            if self
                .last_name
                .trim()
                .chars()
                .all(|c| c.is_numeric() || c.is_whitespace() || c == '.' || c == ',')
            {
                self.errors
                    .push("Last Name cannot be purely numeric or punctuation".to_string());
            } else {
                self.last_name = title_case(&self.last_name);
            }
        }

        if !self.middle_initial.trim().is_empty() {
            self.middle_initial = title_case(&self.middle_initial);
        }

        // Reconstruct canonical full_name
        if !self.last_name.is_empty() && !self.first_name.is_empty() {
            if self.last_name == self.first_name {
                self.full_name = self.first_name.clone();
            } else if !self.middle_initial.is_empty() {
                self.full_name = format!(
                    "{}, {} {}",
                    self.last_name, self.first_name, self.middle_initial
                );
            } else {
                self.full_name = format!("{}, {}", self.last_name, self.first_name);
            }
        } else if !trimmed_full.is_empty() {
            self.full_name = title_case(trimmed_full);
        } else {
            self.full_name = String::new();
        }

        if !self.level.trim().is_empty() {
            self.level = normalize_grade(&self.level);
        }

        if !self.section.trim().is_empty() {
            if self.section.chars().count() > 250 {
                self.errors
                    .push("Section cannot exceed 250 characters".to_string());
            } else {
                self.section = self.section.trim().to_uppercase();
            }
        }

        let valid_progress = ["pending", "reprimand", "resolved", "closed"];
        if !self.progress.trim().is_empty() {
            let p_lower = self.progress.trim().to_lowercase();
            if !valid_progress.contains(&p_lower.as_str()) {
                self.errors
                    .push("Progress must be Pending, Reprimand, Resolved, or Closed".to_string());
            } else {
                self.progress = title_case(&p_lower);
            }
        }

        if !self.date.trim().is_empty() {
            let s = self.date.trim().to_lowercase();
            let months = [
                (vec!["january", "jan.", "jan"], "1"),
                (vec!["february", "feb.", "feb"], "2"),
                (vec!["march", "mar.", "mar"], "3"),
                (vec!["april", "apr.", "apr"], "4"),
                (vec!["may.", "may"], "5"),
                (vec!["june", "jun.", "jun"], "6"),
                (vec!["july", "jul.", "jul"], "7"),
                (vec!["august", "aug.", "aug"], "8"),
                (
                    vec!["septemer", "september", "sept.", "sept", "sep.", "sep"],
                    "9",
                ),
                (vec!["october", "oct.", "oct"], "10"),
                (vec!["november", "nov.", "nov"], "11"),
                (vec!["december", "dec.", "dec"], "12"),
            ];

            let mut month_num = "";
            let mut found_variant = "";

            for (variants, num) in months.iter() {
                for variant in variants {
                    // check if the string contains the variant
                    if s.contains(variant) {
                        month_num = num;
                        found_variant = variant;
                        break;
                    }
                }
                if !month_num.is_empty() {
                    break;
                }
            }

            if !month_num.is_empty() {
                let rest = s.replace(found_variant, "");
                let parts: Vec<&str> = rest
                    .split(|c: char| c == ',' || c == ' ' || c == '/')
                    .filter(|p| !p.is_empty())
                    .collect();
                if parts.len() == 2 {
                    self.date = format!("{}/{}/{}", month_num, parts[0], parts[1]);
                }
            }

            let date_text = self.date.trim().to_string();
            let trimmed = date_text.as_str();
            let mut parsed_date = None;

            if let Ok(naive) = chrono::NaiveDate::parse_from_str(trimmed, "%m/%d/%Y") {
                parsed_date = Some(naive);
            } else if let Ok(naive) = chrono::NaiveDate::parse_from_str(trimmed, "%-m/%-d/%Y") {
                parsed_date = Some(naive);
            } else if let Some(date) = normalize_incident_date(trimmed) {
                self.date = date.clone();
                parsed_date = None;
            } else if let Ok(naive) = chrono::NaiveDate::parse_from_str(trimmed, "%m-%d-%Y") {
                parsed_date = Some(naive);
            } else if let Ok(naive) = chrono::NaiveDate::parse_from_str(trimmed, "%m-%d-%y") {
                parsed_date = Some(naive);
            } else if let Ok(naive) = chrono::NaiveDate::parse_from_str(trimmed, "%m/%d/%y") {
                parsed_date = Some(naive);
            }

            if let Some(naive) = parsed_date {
                self.date = naive.format("%Y-%m-%d").to_string();
            } else if normalize_incident_date(&self.date).is_none() {
                self.errors
                    .push("Invalid date format. Must be YYYY-MM-DD or MM/DD/YYYY, with a valid optional time".to_string());
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
            } else if let Some(date) = normalize_incident_date(trimmed) {
                self.date = date.clone();
                parsed_date = None;
            } else if let Ok(naive) = chrono::NaiveDate::parse_from_str(trimmed, "%m-%d-%y") {
                parsed_date = Some(naive);
            } else if let Ok(naive) = chrono::NaiveDate::parse_from_str(trimmed, "%m-%d-%Y") {
                parsed_date = Some(naive);
            }

            if let Some(naive) = parsed_date {
                self.date_filed = naive.format("%Y-%m-%d").to_string();
            } else {
                self.date_filed = self.date.clone();
            }
        } else {
            self.date_filed = self.date.clone();
        }

        if !self.adviser.trim().is_empty() {
            if self.adviser.chars().count() > 50 {
                self.errors
                    .push("Adviser cannot exceed 50 characters".to_string());
            } else {
                self.adviser = title_case(&self.adviser);
            }
        }

        if !self.r#case.trim().is_empty() {
            if self.r#case.chars().count() > 250 {
                self.errors
                    .push("Case Type cannot exceed 250 characters".to_string());
            } else {
                self.r#case = title_case(&self.r#case);
            }
        }

        if self.sanction.chars().count() > 250 {
            self.errors
                .push("Sanction cannot exceed 250 characters".to_string());
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

pub fn normalize_grade(value: &str) -> String {
    let trimmed = value.trim();
    let lower = trimmed.to_lowercase();
    let number = lower.strip_prefix("grade").unwrap_or(&lower).trim();
    match number.parse::<u8>() {
        Ok(n) if (7..=12).contains(&n) => format!("Grade {n}"),
        _ => trimmed.to_string(),
    }
}

impl CasePayload {
    pub fn normalized(&self) -> Result<Self, String> {
        let mut payload = self.clone();
        if payload.students.is_empty() {
            return Err("At least one student is required".into());
        }
        payload.date = normalize_incident_date(&payload.date)
            .ok_or("Select a valid incident date and time.")?;
        if payload.r#case.trim().is_empty() {
            return Err("Case type is required".into());
        }
        if !["Pending", "Resolved", "Closed", "Reprimand"].contains(&payload.progress.as_str()) {
            return Err("Select a valid case status.".into());
        }
        serde_json::from_str::<Vec<serde_json::Value>>(&payload.proofs)
            .map_err(|_| "Attachments must be a valid list.")?;
        for student in &mut payload.students {
            if student.first_name.trim().is_empty() || student.last_name.trim().is_empty() {
                return Err("Each student needs a first and last name.".into());
            }
            student.first_name = student.first_name.trim().to_string();
            student.last_name = student.last_name.trim().to_string();
            student.level = normalize_grade(&student.level);
            let role = student
                .role
                .as_deref()
                .unwrap_or("Respondent")
                .to_lowercase();
            student.role = Some(
                match role.as_str() {
                    "respondent" | "accused" | "reporter" | "" => "Respondent",
                    "complainant" | "complainant / subject" => "Complainant / Subject",
                    _ => return Err("Invalid student role.".into()),
                }
                .into(),
            );
        }
        let mut seen = std::collections::HashSet::new();
        payload.students.retain(|student| {
            let key = student
                .participant_id
                .clone()
                .filter(|id| !id.is_empty())
                .unwrap_or_else(|| {
                    if student.role.as_deref() == Some("Respondent") {
                        uuid::Uuid::new_v4().to_string()
                    } else {
                        legacy_student_key(student)
                    }
                });
            seen.insert(key)
        });
        for student in &mut payload.students {
            if student.participant_id.as_deref().unwrap_or("").is_empty() {
                student.participant_id = Some(uuid::Uuid::new_v4().to_string());
            }
        }
        if !payload
            .students
            .iter()
            .any(|s| s.role.as_deref() == Some("Respondent"))
        {
            return Err("At least one respondent is required.".into());
        }
        if payload.students[0].role.as_deref() != Some("Respondent") {
            let index = payload
                .students
                .iter()
                .position(|s| s.role.as_deref() == Some("Respondent"))
                .unwrap();
            payload.students.swap(0, index);
        }
        if payload.students[0]
            .sanction
            .as_deref()
            .unwrap_or("")
            .is_empty()
        {
            payload.students[0].sanction = Some(payload.sanction.clone());
        }
        Ok(payload)
    }
}

pub fn legacy_student_key(student: &StudentInfo) -> String {
    format!(
        "{}|{}|{}|{}|{}|{}",
        student.first_name.trim(),
        student.last_name.trim(),
        student.middle_initial.trim(),
        normalize_grade(&student.level),
        student.section.trim(),
        student.role.as_deref().unwrap_or_default()
    )
    .to_lowercase()
}

pub fn normalize_incident_date(value: &str) -> Option<String> {
    let value = value.trim();
    if let Ok(day) = chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d") {
        return Some(day.format("%Y-%m-%d").to_string());
    }
    if let Ok(date) = chrono::DateTime::parse_from_rfc3339(value) {
        return Some(date.to_rfc3339_opts(chrono::SecondsFormat::AutoSi, true));
    }
    for format in [
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%d %H:%M:%S%.f",
    ] {
        if let Ok(date) = chrono::NaiveDateTime::parse_from_str(value, format) {
            use chrono::Timelike;
            return Some(if date.second() == 0 && date.nanosecond() == 0 {
                date.format("%Y-%m-%dT%H:%M").to_string()
            } else {
                date.format("%Y-%m-%dT%H:%M:%S%.f").to_string()
            });
        }
    }
    None
}
