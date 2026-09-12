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

export const isReprimandCase = (caseRecord: CaseRecord): boolean => {
  if ((caseRecord.sanction || "").toLowerCase().includes("reprimand")) {
    return true;
  }
  if ((caseRecord.progress || "").toLowerCase().includes("reprimand")) {
    return true;
  }
  const students = parseStudentsList(caseRecord.students);
  return students.some((s) => (s.sanction || "").toLowerCase().includes("reprimand"));
};

export const isResolvedCase = (caseRecord: CaseRecord): boolean => {
  return (caseRecord.progress || "").toLowerCase() === "resolved";
};

export const isClosedCase = (caseRecord: CaseRecord): boolean => {
  return (caseRecord.progress || "").toLowerCase() === "closed";
};

export const isPendingCase = (caseRecord: CaseRecord): boolean => {
  const progress = (caseRecord.progress || "").toLowerCase();
  if (progress === "resolved" || progress === "closed") return false;
  if (isReprimandCase(caseRecord)) return false;
  return progress === "pending" || progress === "";
};
