import ExcelJS from "exceljs";
import path from "path";
import os from "os";

async function createTenIndividualMockExcel() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Cases");

  // Define headers matching system requirements
  const headers = [
    "Full Name",
    "Date",
    "Case",
    "Sanction",
    "Progress",
    "Grade",
    "Section",
    "Adviser",
  ];

  const headerRow = worksheet.addRow(headers);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF002F87" }, // Laguna College Brand Blue
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 28;

  worksheet.columns = [
    { width: 30 }, // Full Name
    { width: 16 }, // Date
    { width: 36 }, // Case
    { width: 42 }, // Sanction
    { width: 16 }, // Progress
    { width: 16 }, // Grade
    { width: 20 }, // Section
    { width: 28 }, // Adviser
  ];

  const casesData = [
    [
      "Dela Cruz, Juan M.",
      "08/10/2026",
      "Tardiness & Habitual Absenteeism",
      "Verbal Warning & Counseling",
      "Pending",
      "Grade 10",
      "St. Augustine",
      "Mrs. Patricia Santos",
    ],
    [
      "Santos, Maria Clara A.",
      "08/12/2026",
      "Bullying & Verbal Harassment",
      "Parent Conference & 2-Day Suspension",
      "Resolved",
      "Grade 11",
      "St. Therese",
      "Mr. Roberto Gomez",
    ],
    [
      "Rizal, Jose P.",
      "08/14/2026",
      "Academic Dishonesty",
      "Written Reprimand & Retest",
      "Reprimand",
      "Grade 12",
      "St. Thomas",
      "Ms. Elena Cruz",
    ],
    [
      "Bonifacio, Andres L.",
      "08/17/2026",
      "Classroom Disruption",
      "1-Day In-School Suspension",
      "Pending",
      "Grade 9",
      "St. Jude",
      "Mr. Daniel Reyes",
    ],
    [
      "Luna, Antonio K.",
      "08/19/2026",
      "Vandalism / School Property Damage",
      "Community Service (8 Hours)",
      "Closed",
      "Grade 10",
      "St. Paul",
      "Mrs. Carmela Diaz",
    ],
    [
      "Mabini, Apolinario G.",
      "08/22/2026",
      "Unauthorized Gadget Use",
      "Device Confiscation & Warning",
      "Resolved",
      "Grade 8",
      "St. Peter",
      "Mr. Victor Ramos",
    ],
    [
      "Aquino, Corazon C.",
      "08/25/2026",
      "Uniform & Dress Code Violation",
      "Counseling Session",
      "Pending",
      "Grade 7",
      "St. Anne",
      "Ms. Janice Flores",
    ],
    [
      "Silang, Gabriela M.",
      "08/28/2026",
      "Cutting Classes",
      "Parent Notification & Behavioral Contract",
      "Reprimand",
      "Grade 11",
      "St. Francis",
      "Mrs. Angela Mendoza",
    ],
    [
      "Del Pilar, Marcelo H.",
      "09/02/2026",
      "Gambling on Campus Premises",
      "3-Day Suspension",
      "Pending",
      "Grade 12",
      "St. Joseph",
      "Mr. Lawrence Tan",
    ],
    [
      "Jacinto, Emilio D.",
      "09/05/2026",
      "Disrespect towards Faculty",
      "Written Apology & Counseling",
      "Resolved",
      "Grade 9",
      "St. Anthony",
      "Ms. Maria Garcia",
    ],
  ];

  casesData.forEach((record, index) => {
    const row = worksheet.addRow(record);
    row.height = 22;
    row.alignment = { vertical: "middle" };

    // Center alignment for Date, Progress, Grade, Section
    row.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(5).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(6).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(7).alignment = { vertical: "middle", horizontal: "center" };

    // Subtle alternating row striping
    if (index % 2 === 1) {
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF8FAFC" },
      };
    }
  });

  // Add thin grid border to all populated cells
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  });

  const filename = "mock_10_individual_cases.xlsx";
  const projectPath = path.join(process.cwd(), filename);
  await workbook.xlsx.writeFile(projectPath);
  console.log("Project file generated at:", projectPath);

  try {
    const downloadPath = path.join(os.homedir(), "Downloads", filename);
    await workbook.xlsx.writeFile(downloadPath);
    console.log("Downloads file generated at:", downloadPath);
  } catch (err) {
    console.warn("Could not write to Downloads directory:", err.message);
  }
}

createTenIndividualMockExcel().catch(console.error);
