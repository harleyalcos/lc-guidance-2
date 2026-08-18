import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createMockExcel() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Cases');

  worksheet.columns = [
    { header: 'Full Name', key: 'fullName', width: 25 },
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Case', key: 'case', width: 28 },
    { header: 'Sanction', key: 'sanction', width: 20 },
    { header: 'Progress', key: 'progress', width: 15 },
    { header: 'Grade', key: 'grade', width: 15 },
    { header: 'Section', key: 'section', width: 12 },
    { header: 'Adviser', key: 'adviser', width: 25 },
  ];

  const rows = [
    {
      fullName: 'Dela Cruz, Juan M.',
      date: '2026-08-10',
      case: 'Absenteeism / tardiness',
      sanction: 'Verbal Warning',
      progress: 'Pending',
      grade: 'Grade 10',
      section: '',
      adviser: 'Mr. Santos',
    },
    {
      fullName: 'Santos, Maria Clara',
      date: '2026-08-12',
      case: 'Bullying',
      sanction: 'Parent Conference & Suspension',
      progress: 'Resolved',
      grade: 'Grade 11',
      section: '',
      adviser: 'Mrs. Reyes',
    },
    {
      fullName: 'Rizal, Jose P.',
      date: '2026-08-14',
      case: 'Theft & dishonesty',
      sanction: '',
      progress: 'Pending',
      grade: '',
      section: '',
      adviser: '',
    },
    {
      fullName: 'Bonifacio, Andres L.',
      date: '2026-08-15',
      case: 'Classroom disruption',
      sanction: 'Reprimand',
      progress: 'Reprimand',
      grade: 'Grade 9',
      section: '',
      adviser: '',
    },
    {
      fullName: 'Luna, Antonio K.',
      date: '2026-08-16',
      case: 'Vandalism / property damage',
      sanction: 'Community Service',
      progress: 'Closed',
      grade: 'Grade 12',
      section: '',
      adviser: 'Ms. Garcia',
    },
    {
      fullName: 'Mabini, Apolinario G.',
      date: '2026-08-16',
      case: 'Peer relationship issues',
      sanction: '',
      progress: 'Pending',
      grade: 'Grade 8',
      section: '',
      adviser: 'Mr. Torres',
    },
  ];

  rows.forEach((r) => worksheet.addRow(r));

  // Style header
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };

  const outputPath = path.join(__dirname, '..', 'mock_cases_import.xlsx');
  await workbook.xlsx.writeFile(outputPath);
  console.log(`Successfully created mock Excel file at: ${outputPath}`);
}

createMockExcel().catch(console.error);
