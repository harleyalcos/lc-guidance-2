use calamine::{open_workbook_auto, DataType, Reader};

use rust_xlsxwriter::{Format, Workbook};
use serde::{Deserialize, Serialize};
use tauri::State;

use super::db_error;
use crate::db::DbState;
use crate::models::{CasePayload, CaseRecord, ImportRow};

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
    cell.map(|cell| cell.to_string().trim().to_string())
        .unwrap_or_default()
}

fn cell_to_date_string(cell: Option<&calamine::Data>) -> String {
    match cell {
        Some(cell) => {
            if let Some(dt) = cell.as_datetime() {
                use chrono::Timelike;
                if dt.time() == chrono::NaiveTime::MIN {
                    dt.format("%Y-%m-%d").to_string()
                } else if dt.second() == 0 && dt.nanosecond() == 0 {
                    dt.format("%Y-%m-%dT%H:%M").to_string()
                } else {
                    dt.format("%Y-%m-%dT%H:%M:%S%.f").to_string()
                }
            } else {
                cell.to_string().trim().to_string()
            }
        }
        None => String::new(),
    }
}

#[tauri::command]
pub async fn parse_import_file(
    state: State<'_, DbState>,
    file_path: String,
) -> Result<ParseFileResult, String> {
    state.require_session()?;
    let connection = state.connection.lock().map_err(db_error)?;

    let mut workbook = open_workbook_auto(&file_path)
        .map_err(|e| format!("Invalid or corrupted file. Please ensure it is a valid Excel spreadsheet (.xlsx). Details: {}", e))?;

    let sheet_name = workbook
        .sheet_names()
        .first()
        .ok_or("The uploaded file does not contain any sheets.")?
        .to_string();
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|e| format!("Could not read data from the sheet. Details: {:?}", e))?;

    let total_rows = range.get_size().0;
    if total_rows > 5001 {
        return Err(format!("File is too large ({} rows). The maximum allowed limit is 5,000 rows. Please split your file.", total_rows - 1));
    }

    // Locate and map named headers, including the branded row-8 app export.
    let all_rows: Vec<_> = range.rows().collect();
    let canonical = |value: &str| -> String {
        match value.trim().to_lowercase().as_str() {
            "grade level" | "year level" => "grade".into(),
            "case category" | "case type" => "case".into(),
            "status" | "progress status" => "progress".into(),
            "student name" | "name" => "full name".into(),
            "advisor" | "class adviser" => "adviser".into(),
            other => other.to_string(),
        }
    };
    let found = all_rows
        .iter()
        .take(25)
        .enumerate()
        .find_map(|(index, row)| {
            let headers: Vec<String> = row
                .iter()
                .map(|cell| canonical(&cell.to_string()))
                .collect();
            let positions: Option<Vec<usize>> = DB_IMPORT_HEADERS
                .iter()
                .map(|h| headers.iter().position(|s| *s == h.to_lowercase()))
                .collect();
            positions.map(|positions| (index, positions))
        });
    let Some((header_index, positions)) = found else {
        return Err(format!("No supported header row found in the first 25 rows. Required columns: {}. Download the import template and copy your records into it.", DB_IMPORT_HEADERS.join(", ")));
    };
    let start_row = range
        .start()
        .map(|position| position.0 as usize)
        .unwrap_or(0);
    let rows_iter = all_rows.into_iter().enumerate().skip(header_index + 1);

    #[derive(Debug, Clone)]
    struct RawRowData {
        source_row: usize,
        full_name: String,
        date: String,
        case_type: String,
        sanction: String,
        progress: String,
        level: String,
        section: String,
        adviser: String,
        explicit_group: Option<String>,
    }

    let mut raw_records = Vec::new();
    for (row_index, row) in rows_iter {
        let has_any_value = row.iter().any(|cell| !cell.to_string().trim().is_empty());
        if !has_any_value {
            continue;
        }

        let full_name_raw = cell_to_db_string(row.get(positions[0]));
        let date_raw = cell_to_date_string(row.get(positions[1]));
        let case_type_raw = cell_to_db_string(row.get(positions[2]));
        let sanction_raw = cell_to_db_string(row.get(positions[3]));
        let progress_raw = cell_to_db_string(row.get(positions[4]));
        let level_raw = cell_to_db_string(row.get(positions[5]));
        let section_raw = cell_to_db_string(row.get(positions[6]));
        let adviser_raw = cell_to_db_string(row.get(positions[7]));

        // If Full Name contains multiple lines (e.g. Name 1\nName 2\nName 3 in a single or merged cell)
        let name_lines: Vec<&str> = full_name_raw
            .split('\n')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();

        if name_lines.len() > 1 {
            let sanction_lines: Vec<&str> = sanction_raw
                .split('\n')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();
            let level_lines: Vec<&str> = level_raw
                .split('\n')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();
            let section_lines: Vec<&str> = section_raw
                .split('\n')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();
            let adviser_lines: Vec<&str> = adviser_raw
                .split('\n')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();

            let explicit_group = Some(uuid::Uuid::new_v4().to_string());
            for (i, name) in name_lines.into_iter().enumerate() {
                let sanction =
                    sanction_lines
                        .get(i)
                        .copied()
                        .unwrap_or(if sanction_lines.len() == 1 {
                            sanction_lines[0]
                        } else {
                            &sanction_raw
                        });
                let level = level_lines
                    .get(i)
                    .copied()
                    .unwrap_or(if level_lines.len() == 1 {
                        level_lines[0]
                    } else {
                        &level_raw
                    });
                let section =
                    section_lines
                        .get(i)
                        .copied()
                        .unwrap_or(if section_lines.len() == 1 {
                            section_lines[0]
                        } else {
                            &section_raw
                        });
                let adviser =
                    adviser_lines
                        .get(i)
                        .copied()
                        .unwrap_or(if adviser_lines.len() == 1 {
                            adviser_lines[0]
                        } else {
                            &adviser_raw
                        });

                raw_records.push(RawRowData {
                    source_row: start_row + row_index + 1,
                    full_name: name.to_string(),
                    date: date_raw.clone(),
                    case_type: case_type_raw.clone(),
                    sanction: sanction.to_string(),
                    progress: progress_raw.clone(),
                    level: level.to_string(),
                    section: section.to_string(),
                    adviser: adviser.to_string(),
                    explicit_group: explicit_group.clone(),
                });
            }
        } else {
            raw_records.push(RawRowData {
                source_row: start_row + row_index + 1,
                full_name: full_name_raw,
                date: date_raw,
                case_type: case_type_raw,
                sanction: sanction_raw,
                progress: progress_raw,
                level: level_raw,
                section: section_raw,
                adviser: adviser_raw,
                explicit_group: None,
            });
        }
    }

    // Only multiple names explicitly supplied in one cell establish a group.
    // Adjacent matching dates/types and blank cells alone cannot identify an incident.
    let mut groups: Vec<Vec<RawRowData>> = Vec::new();
    for row in raw_records {
        if row.explicit_group.is_some()
            && groups
                .last()
                .is_some_and(|g| g[0].explicit_group == row.explicit_group)
        {
            groups.last_mut().unwrap().push(row);
        } else {
            groups.push(vec![row]);
        }
    }

    let mut result_rows: Vec<ImportRow> = Vec::new();
    let mut reviewed = std::collections::HashMap::<String, usize>::new();
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
                source_row: Some(row.source_row),
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
                import_row
                    .errors
                    .push("Inconsistent date within conjoined/grouped case".to_string());
            }

            if has_case_conflict {
                import_row.has_errors = true;
                import_row
                    .errors
                    .push("Inconsistent case type within conjoined/grouped case".to_string());
            }

            if !import_row.is_duplicate && !import_row.has_errors {
                let found_prev = reviewed
                    .get(&import_row_key(&import_row))
                    .and_then(|index| result_rows.get(*index));

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

            if !import_row.has_errors {
                reviewed
                    .entry(import_row_key(&import_row))
                    .or_insert(result_rows.len());
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
pub async fn batch_import_cases(
    state: State<'_, DbState>,
    mut rows: Vec<ImportRow>,
) -> Result<BatchImportResult, String> {
    state.require_session()?;
    let mut connection = state.connection.lock().map_err(db_error)?;

    // A mandatory, distinct snapshot is never skipped by the schedule/disabled switch.
    if let Some(directory) = &state.backup_dir {
        crate::db::backup::snapshot(&connection, directory, "safety")
            .map_err(|e| format!("Import stopped because the safety backup failed: {e}"))?;
    }

    let tx = connection.transaction().map_err(db_error)?;

    let mut inserted_count = 0;
    let mut failed_count = 0;
    let mut errors = Vec::new();

    for (i, row) in rows.iter_mut().enumerate() {
        row.validate(&tx);

        if row.has_errors || row.is_duplicate {
            failed_count += 1;
            errors.push(format!(
                "Row {}: {}",
                i + 1,
                if row.is_duplicate {
                    "Duplicate detected. Review the import again; no records were saved."
                } else {
                    "Validation failed"
                }
            ));
            continue;
        }

        let payload = CasePayload {
            students: serde_json::from_str(&row.students).unwrap_or_default(),
            date: row.date.clone(),
            date_filed: if row.date_filed.is_empty() {
                row.date.clone()
            } else {
                row.date_filed.clone()
            },
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
    crate::db::backup::run_scheduled(&state, &connection, true);

    Ok(BatchImportResult {
        success: true,
        inserted_count,
        failed_count: 0,
        errors: Vec::new(),
    })
}

#[tauri::command]
pub fn generate_import_template(
    state: State<'_, DbState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    state.require_session()?;
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
        worksheet
            .write_string_with_format(0, col as u16, *header, &header_format)
            .map_err(|e| e.to_string())?;
        worksheet
            .set_column_width(col as u16, column_widths[col])
            .map_err(|e| e.to_string())?;
    }

    let download_dir = app.path().download_dir().map_err(|e| e.to_string())?;
    let file_path = download_dir.join("guidance_import_template.xlsx");

    workbook.save(&file_path).map_err(|e| e.to_string())?;

    let path_str = file_path.to_string_lossy().to_string();
    let _ = app.opener().open_path(&path_str, None::<&str>);

    Ok(path_str)
}

#[tauri::command]
pub fn validate_import_row(
    state: State<'_, DbState>,
    mut row: ImportRow,
) -> Result<ImportRow, String> {
    state.require_session()?;
    let connection = state.connection.lock().map_err(db_error)?;
    row.validate(&connection);
    Ok(row)
}

#[tauri::command]
pub async fn validate_import_rows(
    state: State<'_, DbState>,
    mut rows: Vec<ImportRow>,
) -> Result<Vec<ImportRow>, String> {
    state.require_session()?;
    let connection = state.connection.lock().map_err(db_error)?;
    let mut seen = std::collections::HashSet::new();
    for row in &mut rows {
        row.validate(&connection);
        if !row.has_errors {
            let key = import_row_key(row);
            if !seen.insert(key) {
                row.is_duplicate = true;
            }
        }
    }
    Ok(rows)
}

fn import_row_key(row: &ImportRow) -> String {
    serde_json::to_string(
        &[
            &row.first_name,
            &row.last_name,
            &row.middle_initial,
            &row.level,
            &row.section,
            &row.date,
            &row.adviser,
            &row.r#case,
            &row.sanction,
            &row.progress,
        ]
        .map(|value| value.trim().to_lowercase()),
    )
    .unwrap()
}
