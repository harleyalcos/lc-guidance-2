import { CaseRecord, StudentInfo } from "../../types";
import { ReportConfig, ReportSummaryData } from "../types/reportTypes";

export const normalizeRole = (value?: string): string => {
  const normalized = value?.trim() ?? "";
  const lower = normalized.toLowerCase();
  if (!normalized || lower === "reporter") return "Respondent";
  if (lower === "accused" || lower === "respondent") return "Respondent";
  if (lower === "complainant" || lower === "complainant / subject") return "Complainant / Subject";
  return normalized;
};

export const parseStudents = (studentsStr: string): StudentInfo[] => {
  try {
    const parsed = JSON.parse(studentsStr) || [];
    return Array.isArray(parsed)
      ? parsed.map((student) => ({ ...student, role: normalizeRole(student.role) }))
      : [];
  } catch {
    return [];
  }
};

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export const formatReportDateRange = (
  startStr: string,
  endStr: string,
  casesList: CaseRecord[]
): string => {
  let oldestStr = "";
  let latestStr = "";

  if (casesList && casesList.length > 0) {
    let oldest: Date | null = null;
    let latest: Date | null = null;
    for (const c of casesList) {
      const d = new Date(c.date_filed || c.date);
      if (!isNaN(d.getTime())) {
        if (!oldest || d.getTime() < oldest.getTime()) oldest = d;
        if (!latest || d.getTime() > latest.getTime()) latest = d;
      }
    }
    if (oldest) oldestStr = oldest.toISOString().split("T")[0];
    if (latest) latestStr = latest.toISOString().split("T")[0];
  }

  const start = startStr || oldestStr;
  const end = endStr || latestStr;

  if (!start && !end) return "No Cases";
  if (start && !end) return `From ${formatDate(start)}`;
  if (!start && end) return `Until ${formatDate(end)}`;

  const startDateObj = new Date(start);
  const endDateObj = new Date(end);

  if (startDateObj.getTime() === endDateObj.getTime()) {
    return formatDate(start);
  }

  // Check if it's a full calendar year
  if (
    startDateObj.getMonth() === 0 &&
    startDateObj.getDate() === 1 &&
    endDateObj.getMonth() === 11 &&
    endDateObj.getDate() === 31 &&
    startDateObj.getFullYear() === endDateObj.getFullYear()
  ) {
    return `${startDateObj.getFullYear()}`;
  }

  // Check if it's a full calendar month
  if (
    startDateObj.getDate() === 1 &&
    startDateObj.getFullYear() === endDateObj.getFullYear() &&
    startDateObj.getMonth() === endDateObj.getMonth()
  ) {
    const lastDay = new Date(endDateObj.getFullYear(), endDateObj.getMonth() + 1, 0).getDate();
    if (endDateObj.getDate() === lastDay) {
      return startDateObj.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
  }

  return `${formatDate(start)} – ${formatDate(end)}`;
};

export const getCaseDate = (caseRecord: CaseRecord): Date | null => {
  const parsed = new Date(caseRecord.date_filed || caseRecord.date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getCaseGradeLevel = (caseRecord: CaseRecord): string => {
  const students = parseStudents(caseRecord.students);
  return students[0]?.level || caseRecord.level || "Unspecified";
};

export const getStatusColor = (progress: string): string => {
  const normalizedProgress = progress.toLowerCase();
  if (normalizedProgress === "closed") {
    return "#4b5563"; // Grayish
  }
  if (normalizedProgress === "resolved") {
    return "#15803d"; // Green
  }
  if (normalizedProgress === "pending") {
    return "#a16207"; // Yellow/Gold
  }
  return "#b45309"; // Amber/Orange
};

export const filterReportCases = (cases: CaseRecord[], config: ReportConfig): CaseRecord[] => {
  return cases.filter((c) => {
    // 1. Filter by scope
    if (config.scope === "specific") {
      const grade = getCaseGradeLevel(c);
      if (grade !== config.selectedGrade) return false;
    }

    // 2. Filter by status
    if (config.status !== "all") {
      const p = (c.progress || "").toLowerCase();
      const statusLower = config.status.toLowerCase();

      if (statusLower === "resolved") {
        if (p !== "resolved") return false;
      } else if (statusLower === "closed") {
        if (p !== "closed") return false;
      } else if (statusLower === "reprimand") {
        if (!p.includes("reprimand")) return false;
      } else if (statusLower === "pending") {
        const isPending = p !== "resolved" && p !== "closed" && !p.includes("reprimand");
        if (!isPending) return false;
      }
    }

    // 3. Filter by date
    const d = getCaseDate(c);
    if (!d) return false;

    if (config.startDate) {
      const start = new Date(config.startDate);
      start.setHours(0, 0, 0, 0);
      if (d < start) return false;
    }
    if (config.endDate) {
      const end = new Date(config.endDate);
      end.setHours(23, 59, 59, 999);
      if (d > end) return false;
    }

    return true;
  });
};

export const calculateReportSummary = (activeCases: CaseRecord[]): ReportSummaryData => {
  const total = activeCases.length;
  const resolved = activeCases.filter((c) => (c.progress || "").toLowerCase() === "resolved").length;
  const closed = activeCases.filter((c) => (c.progress || "").toLowerCase() === "closed").length;
  const reprimand = activeCases.filter((c) =>
    (c.progress || "").toLowerCase().includes("reprimand")
  ).length;
  const pending = total - resolved - closed - reprimand;

  return { total, pending, resolved, reprimand, closed };
};
