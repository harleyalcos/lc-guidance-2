import { CaseRecord } from "../../types";
import { ReportConfig, ReportData, ReportRow } from "../types/reportTypes";
import {
  calculateReportSummary,
  filterReportCases,
  formatDate,
  formatReportDateRange,
  getStatusColor,
  parseStudents,
} from "./reportCalculations";

export const buildReportData = (config: ReportConfig, rawCases: CaseRecord[]): ReportData => {
  const filteredCases = filterReportCases(rawCases, config);
  const summary = calculateReportSummary(filteredCases);

  const reportingPeriod = formatReportDateRange(config.startDate, config.endDate, rawCases);
  const scopeLabel = config.scope === "all" ? "All year levels" : config.selectedGrade;
  const statusLabel = config.status === "all" ? "All statuses" : config.status;
  const dateGenerated = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const rows: ReportRow[] = filteredCases.map((c, index) => {
    const students = parseStudents(c.students);
    let studentName = "";
    let studentGrade = "";
    let studentAdviser = c.adviser || "—";

    if (students.length > 0) {
      const s = students[0];
      studentName = `${s.lastName}, ${s.firstName}${s.middleInitial ? ` ${s.middleInitial}.` : ""}`;
      studentGrade = s.level
        ? s.level.startsWith("Grade")
          ? s.level
          : `Grade ${s.level}`
        : "—";
      studentAdviser = s.adviser || c.adviser || "—";
    } else {
      studentName = `${c.last_name}, ${c.first_name}${c.middle_initial ? ` ${c.middle_initial}.` : ""}`;
      studentGrade = c.level
        ? c.level.startsWith("Grade")
          ? c.level
          : `Grade ${c.level}`
        : "—";
      studentAdviser = c.adviser || "—";
    }

    return {
      index: index + 1,
      date: formatDate(c.date_filed || c.date),
      studentName,
      grade: studentGrade,
      adviser: studentAdviser,
      type: c.case || "—",
      description: c.description || "—",
      sanction: c.sanction || "—",
      status: c.progress || "—",
      statusColor: getStatusColor(c.progress || ""),
    };
  });

  return {
    metadata: {
      reportingPeriod,
      scopeLabel,
      statusLabel,
      dateGenerated,
    },
    summary,
    rows,
    columns: config.columns,
    includes: config.includes,
    signatureConfig: config.signatureConfig,
    statusFilter: config.status,
    paperSize: config.paperSize || "A4",
  };
};
