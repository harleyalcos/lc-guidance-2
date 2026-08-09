import ExcelJS from 'exceljs';
import path from 'path';
import os from 'os';
import fs from 'fs';

async function createExcelFile() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Mock Cases');

  // Define headers exactly as required by import format
  worksheet.columns = [
    { header: 'Full Name', key: 'fullName', width: 28 },
    { header: 'Date', key: 'date', width: 16 },
    { header: 'Case', key: 'case', width: 24 },
    { header: 'Sanction', key: 'sanction', width: 35 },
    { header: 'Progress', key: 'progress', width: 16 },
    { header: 'Section', key: 'section', width: 18 },
    { header: 'Adviser', key: 'adviser', width: 22 },
  ];

  // Professional header styling
  const headerRow = worksheet.getRow(1);
  headerRow.height = 24;
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11, name: 'Segoe UI' };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '002F87' }
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' };

  // 10 Realistic Mock Cases
  const mockCases = [
    { fullName: 'Santos, Juan Carlos A.', date: '08/01/2026', case: 'Tardiness', sanction: '1st Written Warning', progress: 'Pending', section: '10-RUBY', adviser: 'Maria Santos' },
    { fullName: 'Dela Cruz, Maria Clara B.', date: '08/02/2026', case: 'Bullying', sanction: 'Parent-Teacher Conference', progress: 'Reprimand', section: '11-STEM-A', adviser: 'Juan Dela Cruz' },
    { fullName: 'Reyes, Mark Anthony C.', date: '08/03/2026', case: 'Cheating', sanction: 'Invalidated Test & 1-Day Suspension', progress: 'Resolved', section: '9-SILVER', adviser: 'Ana Reyes' },
    { fullName: 'Garcia, Sofia Isabelle D.', date: '08/04/2026', case: 'Disruptive Behavior', sanction: 'Counseling Session', progress: 'Closed', section: '8-GOLD', adviser: 'Robert Garcia' },
    { fullName: 'Mendoza, Gabriel E.', date: '08/05/2026', case: 'Vandalism', sanction: 'Campus Clean-up Duty & Restitution', progress: 'Pending', section: '12-HUMSS-B', adviser: 'Grace Tan' },
    { fullName: 'Bautista, Chloe Grace F.', date: '08/05/2026', case: 'Cutting Classes', sanction: 'Behavioral Contract Signed', progress: 'Reprimand', section: '7-ALEXANDRITE', adviser: 'Pedro Penduko' },
    { fullName: 'Torres, Ethan James G.', date: '08/06/2026', case: 'Cell Phone Violation', sanction: 'Device Confiscated (3 Days)', progress: 'Resolved', section: '10-EMERALD', adviser: 'Elena Gomez' },
    { fullName: 'Aquino, Samantha Mae H.', date: '08/06/2026', case: 'Dress Code Violation', sanction: 'Verbal Reprimand', progress: 'Closed', section: '11-ABM-A', adviser: 'Michael Tan' },
    { fullName: 'Ramos, Alexander Ian I.', date: '08/07/2026', case: 'Verbal Assault', sanction: 'Parent Conference & 3-Day Suspension', progress: 'Pending', section: '12-TVL-ICT', adviser: 'Sofia Ramirez' },
    { fullName: 'Castillo, Bea Patricia J.', date: '08/08/2026', case: 'Unexcused Absence', sanction: 'Written Apology & Guidance Consultation', progress: 'Resolved', section: '9-ILANG-ILANG', adviser: 'David Reyes' },
  ];

  mockCases.forEach((caseData) => {
    const row = worksheet.addRow(caseData);
    row.font = { name: 'Segoe UI', size: 10 };
    row.alignment = { vertical: 'middle' };
  });

  // Save to workspace root and Downloads folder
  const downloadsDir = path.join(os.homedir(), 'Downloads');
  const downloadsPath = path.join(downloadsDir, 'mock_cases.xlsx');
  const projectPath = path.resolve(process.cwd(), 'mock_cases.xlsx');

  await workbook.xlsx.writeFile(downloadsPath);
  await workbook.xlsx.writeFile(projectPath);

  console.log(`Successfully generated Excel file in Downloads: ${downloadsPath}`);
  console.log(`Successfully generated Excel file in Workspace: ${projectPath}`);
}

createExcelFile().catch(console.error);
