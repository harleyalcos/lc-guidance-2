import ExcelJS from "exceljs";
import path from "path";
import os from "os";

async function createMultilineMockExcel() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Cases");

  // Headers
  const headers = ["Full Name", "Date", "Case", "Sanction", "Progress", "Grade", "Section", "Adviser"];
  const headerRow = worksheet.addRow(headers);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF002F87" }
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };

  worksheet.columns = [
    { width: 30 }, // Full Name
    { width: 16 }, // Date
    { width: 22 }, // Case
    { width: 26 }, // Sanction
    { width: 16 }, // Progress
    { width: 14 }, // Grade
    { width: 18 }, // Section
    { width: 26 }, // Adviser
  ];

  // 1 row containing 3 students separated by line breaks (Alt+Enter in Excel)
  const multilineNames = "Santos, Juan A.\nReyes, Miguel B.\nDela Cruz, Mark C.";
  const multilineSanctions = "3-Day Suspension\n3-Day Suspension\n2-Day Suspension";

  const row = worksheet.addRow([
    multilineNames,
    "08/15/2026",
    "Bullying",
    multilineSanctions,
    "Pending",
    "Grade 9",
    "St. Jude",
    "Mrs. Patricia Santos",
  ]);

  // Enable text wrapping so the multi-line text displays nicely in Excel
  row.eachCell((cell) => {
    cell.alignment = { wrapText: true, vertical: "top" };
  });

  const localPath = path.join(process.cwd(), "mock_multiline_3_students.xlsx");
  await workbook.xlsx.writeFile(localPath);
  console.log("Local mock file written:", localPath);

  try {
    const downloadPath = path.join(os.homedir(), "Downloads", "mock_multiline_3_students.xlsx");
    await workbook.xlsx.writeFile(downloadPath);
    console.log("Downloads mock file written:", downloadPath);
  } catch (err) {
    const downloadPathV2 = path.join(os.homedir(), "Downloads", "mock_multiline_3_students_new.xlsx");
    await workbook.xlsx.writeFile(downloadPathV2);
    console.log("Downloads fallback written:", downloadPathV2);
  }
}

createMultilineMockExcel().catch(console.error);
