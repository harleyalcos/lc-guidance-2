import { invoke } from "@tauri-apps/api/core";
import { StudentInfo } from "../types";

export interface CaseChange {
  kind: "add" | "update";
  id?: number;
  payload: {
    students: StudentInfo[]; date: string; dateFiled: string; case: string;
    description: string; sanction: string; progress: string; proofs: string;
    title: string; reportingStudent?: string; groupId?: string | null;
  };
  updateLog?: string;
}

// Retain the same receipt for an exact retry after a lost IPC response.
const receipts = new Map<string, string>();
export async function applyCaseChanges(changes: CaseChange[], requestId?: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(changes)));
  const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,"0")).join("");
  const id = requestId ?? receipts.get(key) ?? crypto.randomUUID();
  receipts.set(key, id);
  if (receipts.size > 100) receipts.delete(receipts.keys().next().value!);
  return invoke<number[]>("apply_case_changes", { requestId: id, changes });
}

export function uniqueStudents<T extends StudentInfo>(students: T[]): T[] {
  const seen = new Set<string>();
  return students.filter((s) => {
    const key = studentIdentity(s);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export function studentIdentity(s: StudentInfo): string {
  return s.participantId || [s.firstName,s.lastName,s.middleInitial,s.level,s.section,s.role].map(v => (v || "").trim().toLowerCase()).join("|");
}
