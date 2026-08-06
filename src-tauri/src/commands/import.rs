use calamine::{open_workbook_auto, Reader, DataType};

use serde::{Deserialize, Serialize};
use tauri::State;
use rust_xlsxwriter::{Workbook, Format};

use crate::db::DbState;
use crate::models::{CaseRecord, ImportRow, CasePayload};
use super::db_error;

const DB_IMPORT_HEADERS: [&str; 10] = [
    "Last Name",
    "First Name",
    "Middle Initial",
    "Date of Incident (mm/dd/yyyy)",
    "Case Type",
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
                dt.format("%m/%d/%y").to_string()
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

    let mut workbook = open_workbook_auto(&file_path).map_err(|e| format!("Failed to open workbook: {}", e))?;
    
    let sheet_name = workbook.sheet_names().first().ok_or("No sheets found in workbook")?.to_string();
    let range = workbook.worksheet_range(&sheet_name).map_err(|e| format!("Error reading sheet: {:?}", e))?;

    let mut rows_iter = range.rows();
    let header_row = rows_iter.next().ok_or("File is empty or missing headers")?;

    let actual_headers: Vec<String> = header_row
        .iter()
        .map(|cell| cell.to_string().trim().to_string())
        .collect();
    let expected_headers = DB_IMPORT_HEADERS.join(", ");

    if actual_headers.len() != DB_IMPORT_HEADERS.len()
        || actual_headers.iter().zip(DB_IMPORT_HEADERS.iter()).any(|(actual, expected)| actual != expected)
    {
        return Err(format!(
            "Invalid import format. Expected exact database export headers in this order: {expected_headers}"
        ));
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
            last_name: cell_to_db_string(row.first()),
            first_name: cell_to_db_string(row.get(1)),
            middle_initial: cell_to_db_string(row.get(2)),
            date: cell_to_date_string(row.get(3)),
            r#case: cell_to_db_string(row.get(4)),
            sanction: cell_to_db_string(row.get(5)),
            progress: cell_to_db_string(row.get(6)),
            level: cell_to_db_string(row.get(7)),
            section: cell_to_db_string(row.get(8)),
            adviser: cell_to_db_string(row.get(9)),
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
pub fn batch_import_cases(state: State<'_, DbState>, mut rows: Vec<ImportRow>) -> Result<BatchImportResult, String> {
    let mut connection = state.connection.lock().map_err(db_error)?;
    
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

    let column_widths = [18.0, 18.0, 18.0, 26.0, 16.0, 28.0, 16.0, 16.0, 16.0, 22.0];

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

