import { CaseRecord, StudentInfo } from "../types";

export const parseStudentsList = (studentsStr?: string): StudentInfo[] => {
  if (!studentsStr) return [];
  try {
    const parsed = JSON.parse(studentsStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// Status metrics are exclusive. A reprimand sanction does not override progress.
export const isReprimandCase = (caseRecord: CaseRecord): boolean =>
  (caseRecord.progress || "").trim().toLowerCase() === "reprimand";

export const isResolvedCase = (caseRecord: CaseRecord): boolean => {
  return (caseRecord.progress || "").toLowerCase() === "resolved";
};

export const isClosedCase = (caseRecord: CaseRecord): boolean => {
  return (caseRecord.progress || "").toLowerCase() === "closed";
};

export const isPendingCase = (caseRecord: CaseRecord): boolean => {
  const progress = (caseRecord.progress || "").toLowerCase();
  if (progress === "resolved" || progress === "closed") return false;
  return progress === "pending" || progress === "";
};
