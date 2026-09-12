import { CaseRecord, StudentInfo } from "../../types";
import { ReportConfig, ReportSummaryData } from "../types/reportTypes";
import {
  isClosedCase,
  isPendingCase,
  isReprimandCase,
  isResolvedCase,
} from "../../utils/caseStatus";

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
  if (!dateString) return "";
  const trimmed = dateString.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    return `${mm.padStart(2, "0")}/${dd.padStart(2, "0")}/${yyyy}`;
  }
  const mdyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdyMatch) {
    const [, mm, dd, yyyy] = mdyMatch;
    return `${mm.padStart(2, "0")}/${dd.padStart(2, "0")}/${yyyy}`;
  }
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
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
      const d = getCaseDate(c);
      if (d && !isNaN(d.getTime())) {
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

  const parseLocalDate = (s: string) => {
    const parts = s.split("-").map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    return new Date(s);
  };

  const startDateObj = parseLocalDate(start);
  const endDateObj = parseLocalDate(end);

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
      const mm = String(startDateObj.getMonth() + 1).padStart(2, "0");
      return `${mm}/${startDateObj.getFullYear()}`;
    }
  }

  return `${formatDate(start)} – ${formatDate(end)}`;
};

export const getCaseDate = (caseRecord: CaseRecord): Date | null => {
  const dateStr = caseRecord.date || caseRecord.date_filed;
  if (!dateStr) return null;
  const parts = dateStr.split("-").map(Number);
  if (parts.length === 3 && !parts.some(isNaN)) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  const parsed = new Date(dateStr);
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
    return "#15803d"; // Greenish
  }
  if (normalizedProgress.includes("reprimand")) {
    return "#b91c1c"; // Reddish
  }
  return "#b45309"; // Amber/Pending
};

export const filterReportCases = (casesList: CaseRecord[], config: ReportConfig): CaseRecord[] => {
  return casesList.filter((c) => {
    // 1. Filter by grade scope
    if (config.scope === "specific" && config.selectedGrade) {
      const grade = getCaseGradeLevel(c);
      if (grade !== config.selectedGrade) return false;
    }

    // 2. Filter by status using unified rules
    if (config.status !== "all") {
      const statusLower = config.status.toLowerCase();
      if (statusLower === "resolved") {
        if (!isResolvedCase(c)) return false;
      } else if (statusLower === "closed") {
        if (!isClosedCase(c)) return false;
      } else if (statusLower === "reprimand") {
        if (!isReprimandCase(c)) return false;
      } else if (statusLower === "pending") {
        if (!isPendingCase(c)) return false;
      }
    }

    // 3. Filter by date
    const d = getCaseDate(c);
    if (!d) return false;

    if (config.startDate) {
      const startParts = config.startDate.split("-").map(Number);
      const start = startParts.length === 3 ? new Date(startParts[0], startParts[1] - 1, startParts[2], 0, 0, 0, 0) : new Date(config.startDate);
      if (d < start) return false;
    }
    if (config.endDate) {
      const endParts = config.endDate.split("-").map(Number);
      const end = endParts.length === 3 ? new Date(endParts[0], endParts[1] - 1, endParts[2], 23, 59, 59, 999) : new Date(config.endDate);
      if (d > end) return false;
    }

    return true;
  });
};

export const calculateReportSummary = (activeCases: CaseRecord[]): ReportSummaryData => {
  const total = activeCases.length;
  const resolved = activeCases.filter(isResolvedCase).length;
  const closed = activeCases.filter(isClosedCase).length;
  const reprimand = activeCases.filter(isReprimandCase).length;
  const pending = activeCases.filter(isPendingCase).length;

  return { total, pending, resolved, reprimand, closed };
};
