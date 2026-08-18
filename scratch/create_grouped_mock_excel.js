import ExcelJS from "exceljs";
import path from "path";
import os from "os";

async function createGroupedMockExcel() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Cases");

  // Headers matching DB_IMPORT_HEADERS exactly
  const headers = ["Full Name", "Date", "Case", "Sanction", "Progress", "Grade", "Section", "Adviser"];
  const headerRow = worksheet.addRow(headers);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF002F87" }
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };

  // Set standard column widths
  worksheet.columns = [
    { width: 28 }, // Full Name
    { width: 16 }, // Date
    { width: 22 }, // Case
    { width: 24 }, // Sanction
    { width: 16 }, // Progress
    { width: 14 }, // Grade
    { width: 16 }, // Section
    { width: 26 }, // Adviser
  ];

  // 5 students belonging to the same grouped case incident
  const students = [
    { name: "Santos, Juan A.", sanction: "3-Day Suspension", grade: "Grade 9", section: "St. Jude", adviser: "Mrs. Patricia Santos" },
    { name: "Reyes, Miguel B.", sanction: "3-Day Suspension", grade: "Grade 9", section: "St. Jude", adviser: "Mrs. Patricia Santos" },
    { name: "Dela Cruz, Mark C.", sanction: "2-Day Suspension", grade: "Grade 9", section: "St. Thomas", adviser: "Mr. Roberto Gomez" },
    { name: "Navarro, Carlos D.", sanction: "Verbal Warning", grade: "Grade 9", section: "St. Jude", adviser: "Mrs. Patricia Santos" },
    { name: "Aquino, Joshua E.", sanction: "Written Reprimand", grade: "Grade 9", section: "St. Peter", adviser: "Ms. Elena Cruz" },
  ];

  // Add the 5 rows
  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    worksheet.addRow([
      s.name,
      i === 0 ? "08/15/2026" : "", // Date on first row, conjoined/merged vertically
      i === 0 ? "Bullying" : "",   // Case on first row, conjoined/merged vertically
      s.sanction,
      "Pending",
      s.grade,
      s.section,
      i === 0 ? "Mrs. Patricia Santos" : "", // Adviser on first row, conjoined/merged vertically
    ]);
  }

  // Merge Date (B2:B6), Case (C2:C6), and Adviser (H2:H6) cells vertically
  worksheet.mergeCells("B2:B6");
  worksheet.mergeCells("C2:C6");
  worksheet.mergeCells("H2:H6");

  // Center the merged cells vertically
  worksheet.getCell("B2").alignment = { vertical: "middle", horizontal: "center" };
  worksheet.getCell("C2").alignment = { vertical: "middle", horizontal: "center" };
  worksheet.getCell("H2").alignment = { vertical: "middle", horizontal: "center" };

  const localPath = path.join(process.cwd(), "mock_grouped_5_students.xlsx");
  await workbook.xlsx.writeFile(localPath);
  console.log("Local mock file written:", localPath);

  try {
    const downloadPath = path.join(os.homedir(), "Downloads", "mock_grouped_5_students.xlsx");
    await workbook.xlsx.writeFile(downloadPath);
    console.log("Downloads mock file written:", downloadPath);
  } catch (err) {
    const downloadPathV2 = path.join(os.homedir(), "Downloads", "mock_grouped_5_students_merged.xlsx");
    await workbook.xlsx.writeFile(downloadPathV2);
    console.log("Downloads mock file (v2) written because original was open in Excel:", downloadPathV2);
  }
}

createGroupedMockExcel().catch(console.error);
