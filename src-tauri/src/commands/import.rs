use calamine::{open_workbook_auto, Reader, DataType};

use serde::{Deserialize, Serialize};
use tauri::State;
use rust_xlsxwriter::{Workbook, Format};

use crate::db::DbState;
use crate::models::{CaseRecord, ImportRow, CasePayload};
use super::db_error;

const DB_IMPORT_HEADERS: [&str; 8] = [
    "Full Name",
    "Date",
    "Case",
    "Sanction",
    "Progress",
    "Grade",
    "Section",
    "Adviser",
];


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseFileResult {
    pub rows: Vec<ImportRow>,
    pub valid_count: usize,
    pub duplicate_count: usize,
    pub error_count: usize,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchImportResult {
    pub success: bool,
    pub inserted_count: usize,
    pub failed_count: usize,
    pub errors: Vec<String>,
}

fn cell_to_db_string(cell: Option<&calamine::Data>) -> String {
    cell.map(|cell| cell.to_string().trim().to_string()).unwrap_or_default()
}

fn cell_to_date_string(cell: Option<&calamine::Data>) -> String {
    match cell {
        Some(cell) => {
            if let Some(dt) = cell.as_date() {
                dt.format("%m/%d/%Y").to_string()
            } else {
                cell.to_string().trim().to_string()
            }
        }
        None => String::new(),
    }
}


#[tauri::command]
pub fn parse_import_file(state: State<'_, DbState>, file_path: String) -> Result<ParseFileResult, String> {
    let connection = state.connection.lock().map_err(db_error)?;

    let mut workbook = open_workbook_auto(&file_path)
        .map_err(|e| format!("Invalid or corrupted file. Please ensure it is a valid Excel spreadsheet (.xlsx). Details: {}", e))?;
    
    let sheet_name = workbook.sheet_names().first().ok_or("The uploaded file does not contain any sheets.")?.to_string();
    let range = workbook.worksheet_range(&sheet_name)
        .map_err(|e| format!("Could not read data from the sheet. Details: {:?}", e))?;

    let total_rows = range.get_size().0;
    if total_rows > 5001 {
        return Err(format!("File is too large ({} rows). The maximum allowed limit is 5,000 rows. Please split your file.", total_rows - 1));
    }

    let mut rows_iter = range.rows();
    let header_row = match rows_iter.next() {
        Some(row) => row,
        None => return Ok(ParseFileResult { rows: vec![], valid_count: 0, duplicate_count: 0, error_count: 0 }),
    };

    let actual_headers: Vec<String> = header_row
        .iter()
        .map(|cell| cell.to_string().trim().to_string())
        .collect();

    // Collect specific header mismatches
    let mut header_errors = Vec::new();
    for (i, expected) in DB_IMPORT_HEADERS.iter().enumerate() {
        if let Some(actual) = actual_headers.get(i) {
            if actual != expected {
                header_errors.push(format!("Column {} should be '{}' but got '{}'", i + 1, expected, actual));
            }
        } else {
            header_errors.push(format!("Missing expected column '{}' at position {}", expected, i + 1));
        }
    }
    
    if actual_headers.len() > DB_IMPORT_HEADERS.len() {
        header_errors.push(format!("Found {} extra columns at the end of the file", actual_headers.len() - DB_IMPORT_HEADERS.len()));
    }

    if !header_errors.is_empty() {
        return Err(format!("Invalid import format.\n\n{}", header_errors.join("\n")));
    }

    #[derive(Debug, Clone)]
    struct RawRowData {
        full_name: String,
        date: String,
        case_type: String,
        sanction: String,
        progress: String,
        level: String,
        section: String,
        adviser: String,
    }

    let mut raw_records = Vec::new();
    for row in rows_iter {
        let has_any_value = row
            .iter()
            .any(|cell| !cell.to_string().trim().is_empty());
        if !has_any_value {
            continue;
        }

        let full_name_raw = cell_to_db_string(row.first());
        let date_raw = cell_to_date_string(row.get(1));
        let case_type_raw = cell_to_db_string(row.get(2));
        let sanction_raw = cell_to_db_string(row.get(3));
        let progress_raw = cell_to_db_string(row.get(4));
        let level_raw = cell_to_db_string(row.get(5));
        let section_raw = cell_to_db_string(row.get(6));
        let adviser_raw = cell_to_db_string(row.get(7));

        // If Full Name contains multiple lines (e.g. Name 1\nName 2\nName 3 in a single or merged cell)
        let name_lines: Vec<&str> = full_name_raw
            .split('\n')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();

        if name_lines.len() > 1 {
            let sanction_lines: Vec<&str> = sanction_raw.split('\n').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
            let level_lines: Vec<&str> = level_raw.split('\n').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
            let section_lines: Vec<&str> = section_raw.split('\n').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
            let adviser_lines: Vec<&str> = adviser_raw.split('\n').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();

            for (i, name) in name_lines.into_iter().enumerate() {
                let sanction = sanction_lines.get(i).copied().unwrap_or(if sanction_lines.len() == 1 { sanction_lines[0] } else { &sanction_raw });
                let level = level_lines.get(i).copied().unwrap_or(if level_lines.len() == 1 { level_lines[0] } else { &level_raw });
                let section = section_lines.get(i).copied().unwrap_or(if section_lines.len() == 1 { section_lines[0] } else { &section_raw });
                let adviser = adviser_lines.get(i).copied().unwrap_or(if adviser_lines.len() == 1 { adviser_lines[0] } else { &adviser_raw });

                raw_records.push(RawRowData {
                    full_name: name.to_string(),
                    date: date_raw.clone(),
                    case_type: case_type_raw.clone(),
                    sanction: sanction.to_string(),
                    progress: progress_raw.clone(),
                    level: level.to_string(),
                    section: section.to_string(),
                    adviser: adviser.to_string(),
                });
            }
        } else {
            raw_records.push(RawRowData {
                full_name: full_name_raw,
                date: date_raw,
                case_type: case_type_raw,
                sanction: sanction_raw,
                progress: progress_raw,
                level: level_raw,
                section: section_raw,
                adviser: adviser_raw,
            });
        }
    }

    // Partition raw records into incident groups (conjoined or contiguous matching Date & Case)
    let mut groups: Vec<Vec<RawRowData>> = Vec::new();
    let mut current_group: Vec<RawRowData> = Vec::new();

    for row in raw_records {
        if current_group.is_empty() {
            current_group.push(row);
            continue;
        }

        let group_dates: Vec<&str> = current_group
            .iter()
            .map(|r| r.date.trim())
            .filter(|d| !d.is_empty())
            .collect();
        let group_cases: Vec<&str> = current_group
            .iter()
            .map(|r| r.case_type.trim())
            .filter(|c| !c.is_empty())
            .collect();

        let cur_date = row.date.trim();
        let cur_case = row.case_type.trim();

        let is_conjoined_date = cur_date.is_empty() && !group_dates.is_empty();
        let is_conjoined_case = cur_case.is_empty() && !group_cases.is_empty();

        let is_same_date = !cur_date.is_empty() && group_dates.iter().all(|d| d.eq_ignore_ascii_case(cur_date));
        let is_same_case = !cur_case.is_empty() && group_cases.iter().all(|c| c.eq_ignore_ascii_case(cur_case));

        // Group rows together if they are conjoined (blank cell from vertical merge) or share identical incident Date & Case
        let belongs_to_group = (is_conjoined_date || is_same_date || group_dates.is_empty())
            && (is_conjoined_case || is_same_case || group_cases.is_empty());

        if belongs_to_group {
            current_group.push(row);
        } else {
            groups.push(current_group);
            current_group = vec![row];
        }
    }

    if !current_group.is_empty() {
        groups.push(current_group);
    }

    let mut result_rows = Vec::new();
    let mut valid_count = 0;
    let mut duplicate_count = 0;
    let mut error_count = 0;

    for group in groups {
        let is_multi_student_group = group.len() > 1;
        let group_id = if is_multi_student_group {
            Some(uuid::Uuid::new_v4().to_string())
        } else {
            None
        };

        // Collect distinct non-empty dates and case types in this group
        let mut distinct_dates: Vec<String> = Vec::new();
        for r in &group {
            let d = r.date.trim();
            if !d.is_empty() && !distinct_dates.iter().any(|x| x.eq_ignore_ascii_case(d)) {
                distinct_dates.push(d.to_string());
            }
        }

        let mut distinct_cases: Vec<String> = Vec::new();
        for r in &group {
            let c = r.case_type.trim();
            if !c.is_empty() && !distinct_cases.iter().any(|x| x.eq_ignore_ascii_case(c)) {
                distinct_cases.push(c.to_string());
            }
        }

        let has_date_conflict = distinct_dates.len() > 1;
        let has_case_conflict = distinct_cases.len() > 1;

        let resolved_date = distinct_dates.first().cloned().unwrap_or_default();
        let resolved_case = distinct_cases.first().cloned().unwrap_or_default();

        let resolved_progress = group
            .iter()
            .map(|r| r.progress.trim())
            .find(|p| !p.is_empty())
            .unwrap_or("Pending")
            .to_string();

        let resolved_adviser = {
            let mut distinct: Vec<String> = Vec::new();
            for r in &group {
                let a = r.adviser.trim();
                if !a.is_empty() && !distinct.iter().any(|x| x.eq_ignore_ascii_case(a)) {
                    distinct.push(a.to_string());
                }
            }
            if distinct.len() == 1 {
                distinct.remove(0)
            } else {
                String::new()
            }
        };

        let resolved_level = {
            let mut distinct: Vec<String> = Vec::new();
            for r in &group {
                let l = r.level.trim();
                if !l.is_empty() && !distinct.iter().any(|x| x.eq_ignore_ascii_case(l)) {
                    distinct.push(l.to_string());
                }
            }
            if distinct.len() == 1 {
                distinct.remove(0)
            } else {
                String::new()
            }
        };

        let resolved_section = {
            let mut distinct: Vec<String> = Vec::new();
            for r in &group {
                let s = r.section.trim();
                if !s.is_empty() && !distinct.iter().any(|x| x.eq_ignore_ascii_case(s)) {
                    distinct.push(s.to_string());
                }
            }
            if distinct.len() == 1 {
                distinct.remove(0)
            } else {
                String::new()
            }
        };

        let resolved_sanction = {
            let mut distinct: Vec<String> = Vec::new();
            for r in &group {
                let s = r.sanction.trim();
                if !s.is_empty() && !distinct.iter().any(|x| x.eq_ignore_ascii_case(s)) {
                    distinct.push(s.to_string());
                }
            }
            if distinct.len() == 1 {
                distinct.remove(0)
            } else {
                String::new()
            }
        };

        let group_title = if is_multi_student_group && !resolved_case.is_empty() {
            format!("Group Incident - {}", resolved_case)
        } else {
            String::new()
        };

        for row in group {
            let date = if !row.date.trim().is_empty() {
                row.date
            } else {
                resolved_date.clone()
            };

            let r#case = if !row.case_type.trim().is_empty() {
                row.case_type
            } else {
                resolved_case.clone()
            };

            let progress = if !row.progress.trim().is_empty() {
                row.progress
            } else {
                resolved_progress.clone()
            };

            let adviser = if !row.adviser.trim().is_empty() {
                row.adviser
            } else {
                resolved_adviser.clone()
            };

            let level = if !row.level.trim().is_empty() {
                row.level
            } else {
                resolved_level.clone()
            };

            let section = if !row.section.trim().is_empty() {
                row.section
            } else {
                resolved_section.clone()
            };

            let sanction = if !row.sanction.trim().is_empty() {
                row.sanction
            } else {
                resolved_sanction.clone()
            };

            let mut import_row = ImportRow {
                id: String::new(),
                full_name: row.full_name,
                last_name: String::new(),
                first_name: String::new(),
                middle_initial: String::new(),
                date,
                r#case,
                sanction,
                progress,
                level,
                section,
                adviser,
                date_filed: String::new(),
                description: String::new(),
                proofs: String::from("[]"),
                title: group_title.clone(),
                students: String::new(),
                is_duplicate: false,
                existing_case: None,
                has_errors: false,
                errors: Vec::new(),
                group_id: group_id.clone(),
                school_year: None,
            };

            import_row.validate(&connection);

            if has_date_conflict {
                import_row.has_errors = true;
                import_row.errors.push("Inconsistent date within conjoined/grouped case".to_string());
            }

            if has_case_conflict {
                import_row.has_errors = true;
                import_row.errors.push("Inconsistent case type within conjoined/grouped case".to_string());
            }

            if !import_row.is_duplicate && !import_row.has_errors {
                let found_prev = result_rows.iter().find(|prev: &&ImportRow| {
                    prev.first_name.trim().to_lowercase() == import_row.first_name.trim().to_lowercase()
                        && prev.last_name.trim().to_lowercase() == import_row.last_name.trim().to_lowercase()
                        && prev.middle_initial.trim().to_lowercase() == import_row.middle_initial.trim().to_lowercase()
                        && prev.level.trim().to_lowercase() == import_row.level.trim().to_lowercase()
                        && prev.section.trim().to_lowercase() == import_row.section.trim().to_lowercase()
                        && prev.date.trim().to_lowercase() == import_row.date.trim().to_lowercase()
                        && prev.adviser.trim().to_lowercase() == import_row.adviser.trim().to_lowercase()
                        && prev.case.trim().to_lowercase() == import_row.case.trim().to_lowercase()
                        && prev.sanction.trim().to_lowercase() == import_row.sanction.trim().to_lowercase()
                        && prev.progress.trim().to_lowercase() == import_row.progress.trim().to_lowercase()
                });

                if let Some(prev) = found_prev {
                    import_row.is_duplicate = true;
                    import_row.existing_case = Some(CaseRecord {
                        id: 0,
                        first_name: prev.first_name.clone(),
                        last_name: prev.last_name.clone(),
                        middle_initial: prev.middle_initial.clone(),
                        level: prev.level.clone(),
                        section: prev.section.clone(),
                        date: prev.date.clone(),
                        date_filed: prev.date_filed.clone(),
                        adviser: prev.adviser.clone(),
                        case: prev.case.clone(),
                        description: prev.description.clone(),
                        sanction: prev.sanction.clone(),
                        progress: prev.progress.clone(),
                        proofs: prev.proofs.clone(),
                        students: prev.students.clone(),
                        title: prev.title.clone(),
                        reporting_student: String::new(),
                        group_id: prev.group_id.clone(),
                        update_history: String::from("[]"),
                        school_year: prev.school_year.clone().unwrap_or_default(),
                    });
                }
            }

            if import_row.has_errors {
                error_count += 1;
            } else if import_row.is_duplicate {
                duplicate_count += 1;
            } else {
                valid_count += 1;
            }

            result_rows.push(import_row);
        }
    }

    Ok(ParseFileResult {
        rows: result_rows,
        valid_count,
        duplicate_count,
        error_count,
    })
}

#[tauri::command]
pub fn batch_import_cases(_app: tauri::AppHandle, state: State<'_, DbState>, mut rows: Vec<ImportRow>) -> Result<BatchImportResult, String> {
    let mut connection = state.connection.lock().map_err(db_error)?;
    
    // Create backup before import if not in debug mode
    #[cfg(not(debug_assertions))]
    {
        use tauri::Manager;
        if let (Ok(db_path), Ok(app_data_dir)) = (crate::db::get_db_path(&_app), _app.path().app_data_dir()) {
            let backup_dir = app_data_dir.join("backups");
            let _ = std::fs::create_dir_all(&backup_dir);
            let _ = crate::db::backup::run_backup(&db_path, &backup_dir, &connection);
        }
    }

    let tx = connection.transaction().map_err(db_error)?;

    let mut inserted_count = 0;
    let mut failed_count = 0;
    let mut errors = Vec::new();

    for (i, row) in rows.iter_mut().enumerate() {
        row.validate(&tx);
        
        if row.has_errors {
            failed_count += 1;
            errors.push(format!("Row {}: Validation failed", i + 1));
            continue;
        }

        let payload = CasePayload {
            students: serde_json::from_str(&row.students).unwrap_or_default(),
            date: row.date.clone(),
            date_filed: if row.date_filed.is_empty() { row.date.clone() } else { row.date_filed.clone() },
            r#case: row.r#case.clone(),
            description: row.description.clone(),
            sanction: row.sanction.clone(),
            progress: row.progress.clone(),
            proofs: row.proofs.clone(),
            title: row.title.clone(),
            reporting_student: None,
            group_id: row.group_id.clone(),
            school_year: None,
        };

        match crate::db::repository::CaseRepository::insert(&tx, &payload) {
            Ok(_) => inserted_count += 1,
            Err(e) => {
                failed_count += 1;
                errors.push(format!("Row {}: DB Error - {}", i + 1, e));
            }
        }
    }

    if failed_count > 0 {
        tx.rollback().map_err(db_error)?;
        return Ok(BatchImportResult {
            success: false,
            inserted_count: 0,
            failed_count,
            errors,
        });
    }

    tx.commit().map_err(db_error)?;

    Ok(BatchImportResult {
        success: true,
        inserted_count,
        failed_count: 0,
        errors: Vec::new(),
    })
}

#[tauri::command]
pub fn generate_import_template(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    use tauri_plugin_opener::OpenerExt;

    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    worksheet.set_name("Template").map_err(|e| e.to_string())?;

    let header_format = Format::new()
        .set_bold()
        .set_font_color("#FFFFFF")
        .set_background_color("#002F87");

    let column_widths = [26.0, 18.0, 22.0, 24.0, 16.0, 16.0, 16.0, 22.0];

    for (col, header) in DB_IMPORT_HEADERS.iter().enumerate() {
        worksheet.write_string_with_format(0, col as u16, *header, &header_format).map_err(|e| e.to_string())?;
        worksheet.set_column_width(col as u16, column_widths[col]).map_err(|e| e.to_string())?;
    }

    let download_dir = app.path().download_dir().map_err(|e| e.to_string())?;
    let file_path = download_dir.join("guidance_import_template.xlsx");
    
    workbook.save(&file_path).map_err(|e| e.to_string())?;

    let path_str = file_path.to_string_lossy().to_string();
    let _ = app.opener().open_path(&path_str, None::<&str>);

    Ok(path_str)
}

#[tauri::command]
pub fn validate_import_row(state: State<'_, DbState>, mut row: ImportRow) -> Result<ImportRow, String> {
    let connection = state.connection.lock().map_err(db_error)?;
    row.validate(&connection);
    Ok(row)
}

