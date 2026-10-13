import { describe, expect, it, vi } from "vitest";
import { calculateReportSummary, filterReportCases, formatReportDateRange } from "../src/reports/utils/reportCalculations";
import { buildReportData } from "../src/reports/utils/buildReportData";
import { caseDay, localDay, normalizeGrade } from "../src/utils/caseValues";
import { isPendingCase, isReprimandCase } from "../src/utils/caseStatus";
import { uniqueStudents, applyCaseChanges } from "../src/utils/caseChanges";
import { invoke } from "@tauri-apps/api/core";
import type { CaseRecord, StudentInfo } from "../src/types";
import type { ReportConfig } from "../src/reports/types/reportTypes";
process.env.TZ = "Asia/Manila";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([1, 2]) }));
const config: ReportConfig = {
  scope: "all", selectedGrade: "Grade 7", status: "all", startDate: "", endDate: "", paperSize: "A4",
  includes: { summary: true, signature: false },
  columns: { date: true, student: true, class: true, adviser: true, type: true, description: true, sanction: true, status: true },
  signatureConfig: { sig1: { show: false, label: "", title: "" }, sig2: { show: false, label: "", title: "" } },
};
const student: StudentInfo = { firstName: "Ana", lastName: "Santos", middleInitial: "", role: "Respondent", level: "Grade 7", section: "A", adviser: "Teacher", sanction: "Warning" };
function record(overrides: Partial<CaseRecord> = {}): CaseRecord {
  return { id: 1, first_name: "Ana", last_name: "Santos", middle_initial: "", level: "Grade 7", section: "A", date: "2026-10-13", date_filed: "2026-10-13T09:15:00Z", adviser: "Teacher", case: "Bullying", description: "Synthetic case", sanction: "Warning", progress: "Pending", proofs: "[]", students: JSON.stringify([student]), title: "", update_history: "[]", ...overrides };
}
describe("guidance office report regressions", () => {
  it("keeps status totals exclusive even with reprimand sanctions", () => {
    const cases = [record({progress:"Pending", sanction:"Written Reprimand"}),record({progress:"Resolved",sanction:"Written Reprimand"}),record({progress:"Reprimand"}),record({progress:"Closed"})];
    expect(calculateReportSummary(cases)).toEqual({total:4,pending:1,resolved:1,reprimand:1,closed:1});
    expect(isPendingCase(cases[0])).toBe(true); expect(isReprimandCase(cases[1])).toBe(false);
  });
  it("preserves the school's calendar day when formatting automatic report periods", () => {
    expect(new Date(2026,9,13).getTimezoneOffset()).toBe(-480);
    expect(localDay(new Date(2026,9,13))).toBe("2026-10-13");
    expect(formatReportDateRange("","",[record()])).toBe("10/13/2026");
    expect(formatReportDateRange("","",[record({date:"2024-08-15"}),record({date:"2026-10-13T23:59"})])).toBe("08/15/2024 – 10/13/2026");
  });
  it("includes legacy numeric grades in a named-grade scope", () => {
    const cases=[record(),record({id:2,level:"7",students:JSON.stringify([{...student,level:"7"}])}),record({id:3,level:"Grade 8",students:JSON.stringify([{...student,level:"Grade 8"}])})];
    expect(filterReportCases(cases,{...config,scope:"specific"})).toHaveLength(2);
    expect(buildReportData({...config,scope:"specific"},cases).rows.map(r=>r.grade)).toEqual(["Grade 7","Grade 7"]);
  });
  it("includes timed manual incidents throughout the selected final day", () => {
    const cases=[record({date:"2026-10-13T00:01"}),record({id:2,date:"2026-10-13T23:59"}),record({id:3,date:"2026-10-14T00:00"})];
    expect(filterReportCases(cases,{...config,startDate:"2026-10-13",endDate:"2026-10-13"}).map(c=>c.id)).toEqual([1,2]);
    expect(caseDay(cases[1].date)).toBe("2026-10-13");
  });
  it("derives report period from the filtered scope", () => {
    const cases=[record(),record({id:2,date:"2024-08-15",level:"Grade 8",students:JSON.stringify([{...student,level:"Grade 8"}])})];
    expect(buildReportData({...config,scope:"specific"},cases).metadata.reportingPeriod).toBe("10/13/2026");
  });
  it("normalizes supported grade and date formats without time conversion", () => {
    expect(normalizeGrade(" 7 ")).toBe("Grade 7"); expect(normalizeGrade("grade 12")).toBe("Grade 12");
    expect(caseDay("10/13/2026")).toBe("2026-10-13"); expect(caseDay("2026-10-13T11:00:00Z")).toBe("2026-10-13");
  });
});
describe("linked case save regressions", () => {
  it("keeps a shared complainant once while retaining distinct students", () => {
    const subject={...student,firstName:"Jamie",role:"Complainant / Subject"};
    expect(uniqueStudents([student,subject,{...subject},{...subject,section:"B"}])).toHaveLength(3);
  });
  it("preserves two students with the same name when their participant IDs differ", () => {
    const subject={...student,role:"Complainant / Subject"};
    expect(uniqueStudents([{...subject,participantId:"one"},{...subject,participantId:"two"},{...subject,participantId:"one"}])).toHaveLength(2);
  });
  it("submits one atomic batch and reuses its receipt on an exact retry", async () => {
    const payload={students:[student],date:"2026-10-13",dateFiled:"2026-10-13T09:15:00Z",case:"Bullying",description:"Synthetic",sanction:"Warning",progress:"Pending",proofs:"[]",title:"Group"};
    const changes=[{kind:"add" as const,payload},{kind:"add" as const,payload:{...payload,students:[{...student,firstName:"Ben"}]}}];
    vi.mocked(invoke).mockClear(); await applyCaseChanges(changes); await applyCaseChanges(changes);
    const calls=vi.mocked(invoke).mock.calls; expect(calls).toHaveLength(2); expect(calls[0][0]).toBe("apply_case_changes");
    expect(calls[0][1]).toEqual(calls[1][1]); expect(calls[0][1]).toMatchObject({changes});
  });
});
