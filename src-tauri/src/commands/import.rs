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

    let mut result_rows = Vec::new();
    let mut valid_count = 0;
    let mut duplicate_count = 0;
    let mut error_count = 0;

    for row in rows_iter {
        let has_any_value = row
            .iter()
            .any(|cell| !cell.to_string().trim().is_empty());
        if !has_any_value {
            continue;
        }

        let mut import_row = ImportRow {
            id: String::new(),
            full_name: cell_to_db_string(row.first()),
            last_name: String::new(),
            first_name: String::new(),
            middle_initial: String::new(),
            date: cell_to_date_string(row.get(1)),
            r#case: cell_to_db_string(row.get(2)),
            sanction: cell_to_db_string(row.get(3)),
            progress: cell_to_db_string(row.get(4)),
            level: cell_to_db_string(row.get(5)),
            section: cell_to_db_string(row.get(6)),
            adviser: cell_to_db_string(row.get(7)),
            date_filed: String::new(),
            description: String::new(),
            proofs: String::from("[]"),
            title: String::new(),
            students: String::new(),
            is_duplicate: false,
            existing_case: None,
            has_errors: false,
            errors: Vec::new(),
            school_year: None,
        };

        // Students JSON is dynamically constructed during `import_row.validate()`

        import_row.validate(&connection);

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
                        group_id: None,
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

    Ok(ParseFileResult {
        rows: result_rows,
        valid_count,
        duplicate_count,
        error_count,
    })
}

#[tauri::command]
pub fn batch_import_cases(app: tauri::AppHandle, state: State<'_, DbState>, mut rows: Vec<ImportRow>) -> Result<BatchImportResult, String> {
    let mut connection = state.connection.lock().map_err(db_error)?;
    
    // Create backup before import if not in debug mode
    #[cfg(not(debug_assertions))]
    {
        use tauri::Manager;
        if let (Ok(db_path), Ok(app_data_dir)) = (crate::db::get_db_path(&app), app.path().app_data_dir()) {
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
            date_filed: row.date_filed.clone(),
            r#case: row.r#case.clone(),
            description: row.description.clone(),
            sanction: row.sanction.clone(),
            progress: row.progress.clone(),
            proofs: row.proofs.clone(),
            title: row.title.clone(),
            reporting_student: None, // Import rows do not specify reporting student explicitly yet
            group_id: None,
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

