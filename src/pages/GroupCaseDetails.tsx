import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import html2pdf from "html2pdf.js";
import lcOfficialLogo from "../assets/lc-official-logo.jpg";
import guidanceLogo from "../assets/guidance-logo.png";
import { CaseRecord, StudentInfo } from "../types";
import { RoleDropdown } from "../components/RoleDropdown";
import { ProgressDropdown } from "../components/ProgressDropdown";

const GRADE_LEVEL_OPTIONS = ["Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];

const CASE_TYPE_OPTIONS = [
  "Bullying / Harassment",
  "Fighting / Physical Altercation",
  "Cheating / Academic Dishonesty",
  "Vandalism / Property Damage",
  "Cutting Classes / Truancy",
  "Defiance / Disrespect",
  "Theft",
  "Substance Use / Possession",
  "Dress Code Violation",
  "Inappropriate Behavior",
  "Other",
];

const TEXT_FIELD_LIMIT = 250;
const ADVISER_LIMIT = 40;
const GRADE_LEVEL_LIMIT = 40;
const CASE_TYPE_LIMIT = 50;
const CASE_TITLE_LIMIT = 50;

interface ProofItem {
  name: string;
  data: string;
  created_at: string;
}

const parseStudents = (studentsStr: string): StudentInfo[] => {
  try {
    const parsed = JSON.parse(studentsStr) || [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

const parseProofs = (value: string): ProofItem[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as ProofItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const capitalizeWords = (str: string) => {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const autoCapitalize = (str: string) => {
  if (!str) return str;
  return str.replace(/(?:^|\s)\S/g, (char) => char.toUpperCase());
};

const normalizeRole = (value: string | undefined) => {
  const normalized = capitalizeWords(value ?? "");
  const lower = normalized.toLowerCase();
  if (!normalized || lower === "reporter") return "Respondent";
  if (lower === "accused" || lower === "respondent") return "Respondent";
  if (lower === "complainant" || lower === "complainant / subject") return "Complainant / Subject";
  return normalized;
};

const isComplainantSubject = (student: StudentInfo) => normalizeRole(student.role) === "Complainant / Subject";
const isRespondent = (student: StudentInfo) => normalizeRole(student.role) === "Respondent";

const normalizeGradeLevel = (value: string | undefined) => (value ? capitalizeWords(value).slice(0, GRADE_LEVEL_LIMIT) : "");
const normalizeMiddleInitial = (value: string | undefined) => (value ? value.replace(/\s+/g, "").toUpperCase().slice(0, 3) : "");
const normalizeCaseType = (value: string | undefined) => (value ? capitalizeWords(value).slice(0, CASE_TYPE_LIMIT) : "");

const formatDateTime = (dateStr: string) => {
  if (!dateStr) return "—";
  const parsed = new Date(dateStr);

  if (Number.isNaN(parsed.getTime())) {
    return dateStr;
  }

  const hasTime = dateStr.includes("T") || dateStr.includes(":") || dateStr.includes(" ");

  if (!hasTime) {
    const formatted = parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return formatted.replace(/^[a-zA-Z]+/, (m) => m.toUpperCase());
  }

  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };

  let formatted = parsed.toLocaleString("en-US", options);
  formatted = formatted.replace(" at ", ", ");
  return formatted.replace(/^[a-zA-Z]+/, (m) => m.toUpperCase());
};

const getStatusTextColor = (progress: string) => {
  const p = progress.toLowerCase();
  if (p === "resolved") return "text-[#15803d] dark:text-[#34A06A]";
  if (p === "closed") return "text-[#4b5563] dark:text-[#9ca3af]";
  if (p === "reprimand") return "text-[#dc2626] dark:text-[#ef4444]";
  return "text-[#d97706] dark:text-[#D9A23B]";
};

const getEarliestDateString = (cases: CaseRecord[]): string => {
  const validDates = cases
    .map((c) => c.date_filed || c.date)
    .filter(Boolean)
    .map((d) => ({ raw: d, time: new Date(d).getTime() }))
    .filter((d) => !isNaN(d.time))
    .sort((a, b) => a.time - b.time);

  return validDates.length > 0 ? validDates[0].raw : (cases[0]?.date_filed || cases[0]?.date || "");
};

interface EditStudentRow {
  caseId: number;
  studentIndex: number;
  student: StudentInfo;
  progress: string;
}

export default function GroupCaseDetails() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();

  const [groupCases, setGroupCases] = useState<CaseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showComplainant, setShowComplainant] = useState(false);
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);
  const [isProofLightboxClosing, setIsProofLightboxClosing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  // Edit Mode State
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editGroupForm, setEditGroupForm] = useState({
    title: "",
    caseType: "",
    description: "",
    date: "",
  });
  const [editStudentRows, setEditStudentRows] = useState<EditStudentRow[]>([]);

  // Add Student Modal State
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isAddStudentClosing, setIsAddStudentClosing] = useState(false);
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [addStudentError, setAddStudentError] = useState("");
  const [newStudentForm, setNewStudentForm] = useState({
    firstName: "",
    lastName: "",
    middleInitial: "",
    role: "Respondent",
    level: "",
    adviser: "",
    sanction: "",
    caseTitle: "",
  });

  const loadGroupCases = useCallback(async () => {
    if (!groupId) return;
    try {
      setIsLoading(true);
      const allCases = await invoke<CaseRecord[]>("get_cases", {});
      const matched = allCases.filter((c) => c.group_id === groupId);

      if (matched.length === 0) {
        setError("No records found for this group ID.");
      } else {
        setGroupCases(matched);
        setError(null);

        // Initialize Edit Form
        const rep = matched[0];
        setEditGroupForm({
          title: rep.title || "",
          caseType: rep.case || "",
          description: rep.description || "",
          date: rep.date || "",
        });

        const rows: EditStudentRow[] = [];
        matched.forEach((c) => {
          const students = parseStudents(c.students);
          if (students.length > 0) {
            students.forEach((s, sIdx) => {
              rows.push({
                caseId: c.id,
                studentIndex: sIdx,
                student: { ...s },
                progress: c.progress,
              });
            });
          } else {
            rows.push({
              caseId: c.id,
              studentIndex: 0,
              student: {
                firstName: c.first_name,
                lastName: c.last_name,
                middleInitial: "",
                level: c.level,
                section: c.section,
                adviser: c.adviser,
                sanction: c.sanction,
                role: "Respondent",
              },
              progress: c.progress,
            });
          }
        });
        setEditStudentRows(rows);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadGroupCases();
  }, [loadGroupCases]);

  const repCase = groupCases[0];
  const earliestDate = getEarliestDateString(groupCases);
  const groupTitle = repCase?.title || "—";
  const caseType = repCase?.case || "—";
  const description = repCase?.description || "No description provided.";

  // Aggregate all respondents and complainants across group cases
  const allRespondents: { student: StudentInfo; caseRecord: CaseRecord }[] = useMemo(() => {
    const list: { student: StudentInfo; caseRecord: CaseRecord }[] = [];
    groupCases.forEach((c) => {
      const students = parseStudents(c.students);
      const respondents = students.filter(isRespondent);
      if (respondents.length > 0) {
        respondents.forEach((s) => list.push({ student: s, caseRecord: c }));
      } else if (c.last_name || c.first_name) {
        list.push({
          student: {
            firstName: c.first_name,
            lastName: c.last_name,
            middleInitial: "",
            level: c.level,
            section: c.section,
            adviser: c.adviser,
            sanction: c.sanction,
            role: "Respondent",
          },
          caseRecord: c,
        });
      }
    });
    return list;
  }, [groupCases]);

  const allComplainants: { student: StudentInfo; caseRecord: CaseRecord }[] = useMemo(() => {
    const list: { student: StudentInfo; caseRecord: CaseRecord }[] = [];
    const seenNames = new Set<string>();
    groupCases.forEach((c) => {
      const students = parseStudents(c.students);
      const complainants = students.filter(isComplainantSubject);
      complainants.forEach((s) => {
        const key = `${s.lastName}-${s.firstName}-${s.level}`;
        if (!seenNames.has(key)) {
          seenNames.add(key);
          list.push({ student: s, caseRecord: c });
        }
      });
    });
    return list;
  }, [groupCases]);

  // Aggregate update history across all cases in this group
  const updateHistory = useMemo(() => {
    const allHistory: any[] = [];
    groupCases.forEach((c) => {
      if (!c.update_history) return;
      try {
        const history = JSON.parse(c.update_history);
        if (Array.isArray(history)) {
          history.forEach((h) => allHistory.push(h));
        }
      } catch (e) {
        // ignore
      }
    });

    allHistory.sort((a, b) => {
      const timeA = new Date(a.timestamp || 0).getTime();
      const timeB = new Date(b.timestamp || 0).getTime();
      return timeB - timeA;
    });

    return allHistory;
  }, [groupCases]);

  // Aggregate all proofs across the cases in the group
  const allProofs: ProofItem[] = useMemo(() => {
    const proofsList: ProofItem[] = [];
    const proofUrls = new Set<string>();
    groupCases.forEach((c) => {
      const proofs = parseProofs(c.proofs);
      proofs.forEach((p) => {
        if (!proofUrls.has(p.data)) {
          proofUrls.add(p.data);
          proofsList.push(p);
        }
      });
    });
    return proofsList;
  }, [groupCases]);

  const handleEditStudentChange = (rowIdx: number, field: keyof StudentInfo, value: string) => {
    setEditStudentRows((prev) => {
      const next = [...prev];
      next[rowIdx] = {
        ...next[rowIdx],
        student: {
          ...next[rowIdx].student,
          [field]: value,
        },
      };
      return next;
    });
  };

  const handleEditStudentStatusChange = (rowIdx: number, status: string) => {
    setEditStudentRows((prev) => {
      const next = [...prev];
      next[rowIdx] = {
        ...next[rowIdx],
        progress: status,
      };
      return next;
    });
  };

  // Save edits across all cases in the group
  const handleSaveEdits = async () => {
    if (groupCases.length === 0 || isSaving) return;
    setIsSaving(true);
    try {
      const normalizedTitle = capitalizeWords(editGroupForm.title).slice(0, CASE_TITLE_LIMIT);
      const normalizedCaseType = normalizeCaseType(editGroupForm.caseType);
      const normalizedDescription = editGroupForm.description.trim().slice(0, TEXT_FIELD_LIMIT);

      // Extract all updated complainants across the group
      const updatedComplainants: StudentInfo[] = editStudentRows
        .filter((r) => isComplainantSubject(r.student))
        .map((r) => ({
          firstName: capitalizeWords(r.student.firstName),
          lastName: capitalizeWords(r.student.lastName),
          middleInitial: normalizeMiddleInitial(r.student.middleInitial),
          level: normalizeGradeLevel(r.student.level),
          section: r.student.section || "",
          adviser: capitalizeWords(r.student.adviser || "").slice(0, ADVISER_LIMIT),
          sanction: (r.student.sanction || "").trim().slice(0, TEXT_FIELD_LIMIT),
          role: "Complainant / Subject",
        }));

      for (const c of groupCases) {
        const respondentRows = editStudentRows.filter(
          (r) => r.caseId === c.id && isRespondent(r.student)
        );
        const updatedRespondents: StudentInfo[] = respondentRows.map((r) => ({
          firstName: capitalizeWords(r.student.firstName),
          lastName: capitalizeWords(r.student.lastName),
          middleInitial: normalizeMiddleInitial(r.student.middleInitial),
          level: normalizeGradeLevel(r.student.level),
          section: r.student.section || c.section || "",
          adviser: capitalizeWords(r.student.adviser || "").slice(0, ADVISER_LIMIT),
          sanction: (r.student.sanction || "").trim().slice(0, TEXT_FIELD_LIMIT),
          role: "Respondent",
        }));

        const finalRespondents =
          updatedRespondents.length > 0
            ? updatedRespondents
            : [
                {
                  firstName: capitalizeWords(c.first_name),
                  lastName: capitalizeWords(c.last_name),
                  middleInitial: "",
                  level: normalizeGradeLevel(c.level),
                  section: c.section || "",
                  adviser: capitalizeWords(c.adviser || "").slice(0, ADVISER_LIMIT),
                  sanction: (c.sanction || "").trim().slice(0, TEXT_FIELD_LIMIT),
                  role: "Respondent",
                },
              ];

        const updatedStudents = [...finalRespondents, ...updatedComplainants];
        const primaryRow = respondentRows[0];
        const updatedProgress = primaryRow ? primaryRow.progress : c.progress;
        const primarySanction = primaryRow?.student.sanction || c.sanction;

        await invoke("update_case", {
          id: c.id,
          payload: {
            students: updatedStudents,
            date: editGroupForm.date || c.date,
            dateFiled: c.date_filed,
            case: normalizedCaseType,
            description: normalizedDescription,
            sanction: (primarySanction || "").trim().slice(0, TEXT_FIELD_LIMIT),
            progress: updatedProgress,
            proofs: c.proofs,
            title: normalizedTitle,
            reportingStudent: c.reporting_student || "",
            groupId: c.group_id,
          },
          updateLog: JSON.stringify({
            text: "Group case details were updated.",
            diffs: [{ label: "Group Edit", oldVal: c.title || "", newVal: normalizedTitle }],
          }),
        });
      }

      setIsEditing(false);
      window.dispatchEvent(new Event("cases:changed"));
      loadGroupCases();
    } catch (err) {
      alert("Failed to save group case details: " + err);
    } finally {
      setIsSaving(false);
    }
  };

  // Add Student to Group
  const handleOpenAddStudent = () => {
    setIsAddStudentClosing(false);
    setAddStudentError("");
    setNewStudentForm({
      firstName: "",
      lastName: "",
      middleInitial: "",
      role: "Respondent",
      level: "",
      adviser: "",
      sanction: "",
      caseTitle: groupTitle || "",
    });
    setIsAddStudentOpen(true);
  };

  const closeAddStudentModal = () => {
    setIsAddStudentClosing(true);
    window.setTimeout(() => {
      setIsAddStudentOpen(false);
      setIsAddStudentClosing(false);
    }, 200);
  };

  const handleAddStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentForm.lastName.trim() || !newStudentForm.firstName.trim()) {
      setAddStudentError("Please fill out all required fields (First name and Last name).");
      return;
    }

    if (!groupId || !repCase) return;

    setIsAddingStudent(true);
    try {
      const newStudent: StudentInfo = {
        firstName: capitalizeWords(newStudentForm.firstName),
        lastName: capitalizeWords(newStudentForm.lastName),
        middleInitial: normalizeMiddleInitial(newStudentForm.middleInitial),
        level: normalizeGradeLevel(newStudentForm.level),
        section: repCase.section || "",
        adviser: capitalizeWords(newStudentForm.adviser).slice(0, ADVISER_LIMIT),
        sanction: newStudentForm.sanction.trim().slice(0, TEXT_FIELD_LIMIT),
        role: normalizeRole(newStudentForm.role),
      };

      const resolvedTitle = (newStudentForm.caseTitle.trim() || repCase.title || "").slice(0, CASE_TITLE_LIMIT);
      const isRespondentStudent = normalizeRole(newStudentForm.role) === "Respondent";

      if (isRespondentStudent) {
        // Add a new case record tied to this groupId
        await invoke<number>("add_case", {
          payload: {
            students: [newStudent],
            date: repCase.date,
            dateFiled: new Date().toISOString(),
            case: repCase.case.trim(),
            description: (repCase.description || "").trim().slice(0, TEXT_FIELD_LIMIT),
            sanction: newStudent.sanction ? newStudent.sanction.trim().slice(0, TEXT_FIELD_LIMIT) : "",
            progress: "Pending",
            proofs: repCase.proofs,
            title: resolvedTitle || repCase.title,
            reportingStudent: "",
            groupId: groupId,
          },
        });
      } else {
        // Role is Complainant - attach to all sibling cases in the group
        for (const sibling of groupCases) {
          const sibStudents = parseStudents(sibling.students);
          const alreadyExists = sibStudents.some(
            (s) => s.firstName.toLowerCase() === newStudent.firstName.toLowerCase() &&
                   s.lastName.toLowerCase() === newStudent.lastName.toLowerCase()
          );
          if (!alreadyExists) {
            await invoke("update_case", {
              id: sibling.id,
              payload: {
                students: [...sibStudents, newStudent],
                date: sibling.date,
                dateFiled: sibling.date_filed,
                case: normalizeCaseType(sibling.case),
                description: (sibling.description || "").slice(0, TEXT_FIELD_LIMIT),
                sanction: (sibling.sanction || "").slice(0, TEXT_FIELD_LIMIT),
                progress: sibling.progress,
                proofs: sibling.proofs,
                title: resolvedTitle || sibling.title,
                reportingStudent: sibling.reporting_student || "",
                groupId: sibling.group_id,
              },
              updateLog: `Added complainant ${newStudent.firstName} ${newStudent.lastName}`,
            });
          }
        }
      }

      closeAddStudentModal();
      window.dispatchEvent(new Event("cases:changed"));
      loadGroupCases();
    } catch (err) {
      setAddStudentError("Failed to add student: " + err);
    } finally {
      setIsAddingStudent(false);
    }
  };

  const getBadgeInlineStyle = (progress: string): React.CSSProperties => {
    const p = progress.toLowerCase();
    if (p === "closed") return { color: "#4b5563" };
    if (p === "resolved") return { color: "#15803d" };
    if (p === "pending") return { color: "#a16207" };
    return { color: "#b45309" };
  };

  const pdfFirstHeader = (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "84px 1fr 84px", alignItems: "center", gap: "16px", marginBottom: "16px", fontFamily: "sans-serif" }}>
        <img src={lcOfficialLogo} alt="Laguna College Logo" style={{ width: 72, height: 72, objectFit: "contain" }} />
        <div style={{ textAlign: "center", color: "#000", fontFamily: "Georgia, 'Times New Roman', serif" }}>
          <div style={{ margin: 0, fontSize: 15, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.02em", lineHeight: "18px" }}>LAGUNA COLLEGE</div>
          <div style={{ margin: 0, marginTop: 2, fontSize: 11, fontWeight: 700, lineHeight: "13px" }}>San Pablo City</div>
          <div style={{ margin: 0, marginTop: 2, fontSize: 18, fontWeight: 900, lineHeight: "21px" }}>Guidance Office</div>
        </div>
        <img src={guidanceLogo} alt="Guidance Office Logo" style={{ width: 72, height: 72, objectFit: "contain", justifySelf: "end" }} />
      </div>
      <div style={{ height: 2, width: "100%", background: "#002F87", marginBottom: 20 }} />
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "sans-serif", color: "#000" }}>Group Case Record</div>
        <div style={{ fontSize: 10, color: "#6b7280", fontFamily: "sans-serif", marginTop: 2 }}>Official Guidance Office Record</div>
      </div>
    </>
  );

  const pdfFooter = (page: number, total: number) => (
    <div style={{ position: "absolute", bottom: 32, left: 48, right: 48, display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 9, color: "#9ca3af", fontFamily: "sans-serif", borderTop: "1px solid #e5e7eb", paddingTop: 12, background: "#fff" }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontWeight: 700, color: "#000" }}>Generated by LCGO Information System</span>
        <span>Confidential Student Record</span>
      </div>
      <div style={{ fontWeight: 700, color: "#000" }}>Page {page} of {total}</div>
    </div>
  );

  const handleExportPDF = () => {
    if (groupCases.length === 0 || isExporting) return;
    setIsExporting(true);
  };

  useEffect(() => {
    if (!isExporting) return;

    let isMounted = true;
    const runExport = async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 200));

      const element = pdfRef.current;
      if (!element) {
        if (isMounted) setIsExporting(false);
        return;
      }

      element.style.position = "relative";
      element.style.left = "0";
      element.style.top = "0";
      element.style.opacity = "1";
      element.style.visibility = "visible";
      element.style.overflow = "visible";
      element.getBoundingClientRect();

      const opt = {
        margin: 0,
        filename: `Group_Case_${(groupTitle || "Record").replace(/\s+/g, "_")}.pdf`,
        image: { type: "jpeg" as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm" as const, format: "a4" as const, orientation: "portrait" as const },
      };

      try {
        await html2pdf().set(opt).from(element).save();
      } catch (e) {
        console.error("PDF generation failed:", e);
      } finally {
        element.style.position = "absolute";
        element.style.left = "-9999px";
        element.style.top = "-9999px";
        element.style.opacity = "0";
        element.style.visibility = "hidden";
        element.style.overflow = "hidden";
        if (isMounted) setIsExporting(false);
      }
    };

    runExport();
    return () => {
      isMounted = false;
    };
  }, [isExporting, groupTitle]);

  const closeProofLightbox = () => {
    setIsProofLightboxClosing(true);
    window.setTimeout(() => {
      setSelectedProofUrl(null);
      setIsProofLightboxClosing(false);
    }, 200);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 mt-6 animate-pulse">
        <div className="h-10 bg-surface-container rounded-lg w-1/3" />
        <div className="h-[400px] bg-surface-container rounded-xl w-full" />
      </div>
    );
  }

  if (error || groupCases.length === 0) {
    return (
      <div className="text-center mt-12 bg-surface border border-outline-variant p-8 rounded-xl max-w-md mx-auto shadow-sm">
        <span className="material-symbols-outlined text-error text-5xl mb-3">error</span>
        <h3 className="text-lg font-bold text-on-surface mb-2">Group Case Not Found</h3>
        <p className="text-sm text-secondary mb-6">{error || "The requested group case could not be retrieved."}</p>
        <button
          onClick={() => navigate("/catalog")}
          className="btn-primary"
        >
          Return to Catalog
        </button>
      </div>
    );
  }

  return (
    <>
      <datalist id="group-case-grade-level-options">
        {GRADE_LEVEL_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <datalist id="group-case-case-type-options">
        {CASE_TYPE_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>

      {/* Sub-header / Actions matching the design layout */}
      <div className="flex justify-between items-center mb-4 mt-2 print:hidden">
        <span className="font-data-mono text-xs font-semibold bg-surface border border-outline-variant px-3 py-1.5 rounded-lg text-secondary">
          ID: GC-2026-{repCase.id.toString().padStart(4, "0")}
        </span>
        <div className="flex gap-3">
          {isEditing ? (
            <>
              <button
                onClick={handleSaveEdits}
                disabled={isSaving}
                className="btn-primary bg-[#15803d] hover:bg-green-700 text-white font-bold"
              >
                {isSaving ? (
                  <>
                    <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">save</span>
                    <span>Save</span>
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  loadGroupCases();
                }}
                className="btn-secondary"
              >
                <span className="material-symbols-outlined text-sm">close</span>
                <span>Cancel</span>
              </button>
            </>
          ) : (
            <>
              {allComplainants.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowComplainant((prev) => !prev)}
                  className={`btn-secondary transition-all duration-300 active:scale-95 group ${
                    !showComplainant ? "bg-primary/10 border-primary/40 text-primary dark:bg-primary/20 dark:border-primary/50" : ""
                  }`}
                  title={showComplainant ? "Hide complainant details from view" : "Show complainant details"}
                >
                  <span
                    className="material-symbols-outlined text-sm transition-transform duration-300 group-hover:scale-110"
                    style={{
                      transform: showComplainant ? "rotate(0deg)" : "rotate(180deg)",
                    }}
                  >
                    {showComplainant ? "visibility_off" : "visibility"}
                  </span>
                  <span className="transition-all duration-300">
                    {showComplainant ? "Hide Complainant" : "Show Complainant"}
                  </span>
                </button>
              )}
              <button
                onClick={handleExportPDF}
                disabled={isExporting}
                className="btn-secondary"
              >
                {isExporting ? (
                  <>
                    <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
                    <span>Export PDF</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleOpenAddStudent}
                className="btn-secondary"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                <span>Add a Student</span>
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="btn-secondary"
              >
                <span className="material-symbols-outlined text-sm">edit</span>
                <span>Edit</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Guidance Card Document */}
      <div className="case-details-document bg-[#FAF9F5] dark:bg-surface-container-low relative overflow-hidden flex flex-col mb-8 print:mb-0 print:border-0 print:shadow-none print:rounded-none border border-outline-variant rounded shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
        {/* Official document header */}
        <div className="px-8 py-5 border-b border-outline-variant bg-white dark:bg-surface-container-low shrink-0">
          <div className="grid grid-cols-[92px_1fr_92px] items-center gap-6">
            <img src={lcOfficialLogo} alt="Laguna College Logo" className="w-[78px] h-[78px] object-contain justify-self-start rounded-full" />
            <div className="text-center text-black dark:text-on-surface" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
              <h2 className="m-0 text-[18px] leading-[20px] font-black uppercase tracking-[0.02em] text-black dark:text-on-surface">LAGUNA COLLEGE</h2>
              <p className="m-0 mt-1 text-[13px] leading-[15px] font-bold text-black dark:text-on-surface">San Pablo City</p>
              <p className="m-0 mt-1 text-[23px] leading-[25px] font-black text-black dark:text-on-surface">Guidance Office</p>
            </div>
            <img src={guidanceLogo} alt="Guidance Office Logo" className="w-[78px] h-[78px] object-contain justify-self-end rounded-full" />
          </div>
        </div>

        {/* Content Body Grid */}
        <div className="p-8 space-y-8">
          {/* Student Information Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-4 mb-4">
              <span className="text-base font-medium text-on-surface uppercase tracking-widest whitespace-nowrap">
                Student Information
              </span>
            </div>

            {isEditing ? (
              editStudentRows
                .map((row, idx) => ({ row, idx }))
                .filter(({ row }) => isRespondent(row.student))
                .map(({ row, idx }) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1.2fr_1.8fr_1fr] gap-x-6 gap-y-5 border-b border-outline-variant pb-4 mb-4 last:border-0 last:pb-0 last:mb-0">
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Full Name</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={row.student.lastName}
                        placeholder="Last Name"
                        onChange={(e) => handleEditStudentChange(idx, "lastName", autoCapitalize(e.target.value))}
                        className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary min-w-0 flex-1"
                      />
                      <input
                        type="text"
                        value={row.student.firstName}
                        placeholder="First Name"
                        onChange={(e) => handleEditStudentChange(idx, "firstName", autoCapitalize(e.target.value))}
                        className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary min-w-0 flex-1"
                      />
                      <input
                        type="text"
                        value={row.student.middleInitial}
                        placeholder="M.I."
                        maxLength={3}
                        onChange={(e) => handleEditStudentChange(idx, "middleInitial", e.target.value.replace(/\s+/g, "").toUpperCase())}
                        className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-14"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Grade</label>
                    <input
                      type="text"
                      value={row.student.level}
                      list="group-case-grade-level-options"
                      placeholder="e.g. Grade 10"
                      maxLength={GRADE_LEVEL_LIMIT}
                      onChange={(e) => handleEditStudentChange(idx, "level", e.target.value)}
                      className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Adviser</label>
                    <input
                      type="text"
                      value={row.student.adviser}
                      placeholder="e.g. Mr. Santos"
                      maxLength={ADVISER_LIMIT}
                      onChange={(e) => handleEditStudentChange(idx, "adviser", autoCapitalize(e.target.value))}
                      className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Sanction Taken</label>
                    <input
                      type="text"
                      value={row.student.sanction || ""}
                      maxLength={TEXT_FIELD_LIMIT}
                      placeholder="Sanction / Action Taken"
                      onChange={(e) => handleEditStudentChange(idx, "sanction", e.target.value.slice(0, TEXT_FIELD_LIMIT))}
                      className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Case Status</label>
                    <ProgressDropdown
                      value={row.progress}
                      onChange={(val) => handleEditStudentStatusChange(idx, val)}
                    />
                  </div>
                </div>
              ))
            ) : (
              allRespondents.map(({ student, caseRecord: c }, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1.5fr_2fr_1.2fr] gap-x-8 gap-y-5 border-b border-outline-variant pb-4 mb-4 last:border-0 last:pb-0 last:mb-0 cursor-pointer group"
                  onClick={() => navigate(`/case/${c.id}`)}
                  title="Click to view individual case details"
                >
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">
                      Full Name
                    </label>
                    <p className="text-sm font-medium text-on-surface group-hover:text-primary transition-colors">
                      {student.lastName}, {student.firstName}{student.middleInitial ? ` ${student.middleInitial}.` : ""}
                    </p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">
                      Grade
                    </label>
                    <p className="text-sm font-medium text-on-surface">{student.level || "—"}</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">
                      Adviser
                    </label>
                    <p className="text-sm font-medium text-on-surface">{student.adviser || "—"}</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">
                      Sanction Taken
                    </label>
                    <p className="text-sm font-medium text-on-surface leading-relaxed" title={student.sanction || undefined}>
                      {student.sanction ? (
                        student.sanction.length > 70
                          ? `${student.sanction.slice(0, 70)}...`
                          : student.sanction
                      ) : "—"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">
                      Case Status
                    </label>
                    <p className={`text-sm font-bold uppercase tracking-wider ${getStatusTextColor(c.progress)}`}>
                      {c.progress}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Complainant Section */}
          {allComplainants.length > 0 && (
            <div
              className={`grid transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                showComplainant
                  ? "grid-rows-[1fr] opacity-100 border-t border-outline-variant pt-8 mt-4"
                  : "grid-rows-[0fr] opacity-0 border-t-0 pt-0 mt-0 pointer-events-none"
              }`}
            >
              <div className="overflow-hidden space-y-4">
                {isEditing ? (
                  editStudentRows
                    .map((row, idx) => ({ row, idx }))
                    .filter(({ row }) => isComplainantSubject(row.student))
                    .map(({ row, idx }) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1.5fr_2fr_1.2fr] gap-x-8 gap-y-5 border-b border-outline-variant pb-4 mb-4 last:border-0 last:pb-0 last:mb-0"
                      >
                        <div>
                          <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">
                            Full Name
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={row.student.lastName}
                              placeholder="Last Name"
                              onChange={(e) => handleEditStudentChange(idx, "lastName", autoCapitalize(e.target.value))}
                              className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary min-w-0 flex-1"
                            />
                            <input
                              type="text"
                              value={row.student.firstName}
                              placeholder="First Name"
                              onChange={(e) => handleEditStudentChange(idx, "firstName", autoCapitalize(e.target.value))}
                              className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary min-w-0 flex-1"
                            />
                            <input
                              type="text"
                              value={row.student.middleInitial}
                              placeholder="M.I."
                              maxLength={3}
                              onChange={(e) => handleEditStudentChange(idx, "middleInitial", e.target.value.replace(/\s+/g, "").toUpperCase())}
                              className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-14"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">
                            Grade
                          </label>
                          <input
                            type="text"
                            value={row.student.level}
                            list="group-case-grade-level-options"
                            placeholder="e.g. Grade 10"
                            maxLength={GRADE_LEVEL_LIMIT}
                            onChange={(e) => handleEditStudentChange(idx, "level", e.target.value)}
                            className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">
                            Adviser
                          </label>
                          <input
                            type="text"
                            value={row.student.adviser}
                            placeholder="e.g. Mr. Santos"
                            maxLength={ADVISER_LIMIT}
                            onChange={(e) => handleEditStudentChange(idx, "adviser", autoCapitalize(e.target.value))}
                            className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">
                            Role
                          </label>
                          <p className="text-sm font-medium text-on-surface py-1.5">{row.student.role || "Complainant / Subject"}</p>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">
                            Status
                          </label>
                          <p className="text-sm font-medium text-secondary py-1.5">—</p>
                        </div>
                      </div>
                    ))
                ) : (
                  allComplainants.map(({ student }, idx) => (
                    <div
                      key={idx}
                      className={`grid grid-cols-1 md:grid-cols-[2fr_1fr_1.5fr_2fr_1.2fr] gap-x-8 gap-y-5 border-b border-outline-variant pb-4 mb-4 last:border-0 last:pb-0 last:mb-0 transition-all duration-500 ${
                        showComplainant ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
                      }`}
                    >
                      <div>
                        <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">
                          Full Name
                        </label>
                        <p className="text-sm font-medium text-on-surface">
                          {student.lastName}, {student.firstName}{student.middleInitial ? ` ${student.middleInitial}.` : ""}
                        </p>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">
                          Grade
                        </label>
                        <p className="text-sm font-medium text-on-surface">{student.level || "—"}</p>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">
                          Adviser
                        </label>
                        <p className="text-sm font-medium text-on-surface">{student.adviser || "—"}</p>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">
                          Role
                        </label>
                        <p className="text-sm font-medium text-on-surface">{student.role || "Complainant / Subject"}</p>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">
                          Status
                        </label>
                        <p className="text-sm font-medium text-secondary">—</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Case Information Section */}
          <div className="space-y-6 border-t border-outline-variant pt-8">
            <div className="flex items-center gap-4 mb-4">
              <span className="text-base font-medium text-on-surface uppercase tracking-widest whitespace-nowrap">
                Case Information
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
              <div>
                <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">
                  Case Title
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editGroupForm.title}
                    placeholder="Case title"
                    maxLength={CASE_TITLE_LIMIT}
                    onChange={(e) => setEditGroupForm({ ...editGroupForm, title: autoCapitalize(e.target.value.slice(0, CASE_TITLE_LIMIT)) })}
                    className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-full"
                  />
                ) : (
                  <p className="text-sm font-medium text-on-surface leading-relaxed break-words">
                    {groupTitle}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">
                  Case Type
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editGroupForm.caseType}
                    list="group-case-case-type-options"
                    maxLength={CASE_TYPE_LIMIT}
                    onChange={(e) => setEditGroupForm({ ...editGroupForm, caseType: autoCapitalize(e.target.value.slice(0, CASE_TYPE_LIMIT)) })}
                    className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-full"
                  />
                ) : (
                  <p className="text-sm font-medium text-on-surface leading-relaxed">
                    {caseType}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">
                  Date
                </label>
                <p className="text-sm font-medium text-on-surface">
                  {formatDateTime(earliestDate)}
                </p>
              </div>

              <div className="md:col-span-3 min-w-0">
                <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">
                  Description
                </label>
                {isEditing ? (
                  <textarea
                    value={editGroupForm.description}
                    maxLength={TEXT_FIELD_LIMIT}
                    onChange={(e) => setEditGroupForm({ ...editGroupForm, description: e.target.value.slice(0, TEXT_FIELD_LIMIT) })}
                    className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-full h-28 resize-none"
                  />
                ) : (
                  <p className="text-sm font-medium text-on-surface leading-relaxed text-justify whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                    {description}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Attached Proofs Section */}
      <div className="mt-8 print:hidden">
        <div className="flex justify-between items-center mb-5">
          <h3 className="section-header-h2 mb-0 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">attachment</span>
            <span>Documentation & Proofs</span>
          </h3>
        </div>

        {allProofs.length === 0 ? (
          <div className="text-center bg-surface border border-dashed border-outline-variant p-8 rounded-xl text-secondary text-sm">
            No documentation uploaded for this case.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {allProofs.map((proof, index) => (
              <div
                key={`${proof.name}-${proof.created_at}-${index}`}
                className="group relative bg-surface border border-outline-variant rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer aspect-video flex items-center justify-center bg-surface-container"
                onClick={() => {
                  setIsProofLightboxClosing(false);
                  setSelectedProofUrl(proof.data);
                }}
              >
                <img
                  src={proof.data}
                  alt={proof.name}
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="material-symbols-outlined text-white text-3xl">visibility</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Update History Section */}
      <div className="mt-8 mb-12 print:hidden bg-surface border border-outline-variant rounded-2xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-6 pb-3 border-b border-outline-variant">
          <h3 className="section-header-h2 mb-0 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">history</span>
            <span>Update History</span>
          </h3>
          <span className="text-xs font-semibold text-secondary bg-surface-container px-2.5 py-1 rounded-full border border-outline-variant">
            {updateHistory.length} {updateHistory.length === 1 ? "Record" : "Records"}
          </span>
        </div>

        {updateHistory.length === 0 ? (
          <div className="text-center text-secondary text-sm italic py-6">
            No history recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/50">
            {updateHistory.map((entry: any, i: number) => {
              let text = entry.action;
              let diffs: Array<{ label: string; oldVal: string; newVal: string }> = [];

              if (typeof entry.action === "string") {
                try {
                  const parsedAction = JSON.parse(entry.action);
                  if (parsedAction && typeof parsedAction === "object") {
                    text = parsedAction.text || entry.action;
                    if (Array.isArray(parsedAction.diffs)) {
                      diffs = parsedAction.diffs;
                    }
                  }
                } catch {
                  // ignore
                }
              }

              return (
                <div key={i} className="py-4 first:pt-0 last:pb-0 flex flex-col gap-2">
                  <p className="text-sm font-semibold text-on-surface leading-snug">
                    {text}
                  </p>
                  <p className="text-xs text-secondary font-normal">
                    {formatDateTime(entry.timestamp)}
                  </p>

                  {diffs.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-2.5 items-center">
                      {diffs.map((diff, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 text-xs">
                          {diffs.length > 1 && (
                            <span className="font-semibold text-secondary text-[11px] uppercase tracking-wider mr-0.5">
                              {diff.label}:
                            </span>
                          )}
                          <span className="px-2.5 py-0.5 rounded-md border border-rose-200 bg-rose-50 dark:bg-rose-950/50 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 text-xs font-semibold line-through">
                            {diff.oldVal}
                          </span>
                          <span className="material-symbols-outlined text-[15px] text-secondary">arrow_forward</span>
                          <span className="px-2.5 py-0.5 rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 dark:border-emerald-800/60 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                            {diff.newVal}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add a Student Modal */}
      {isAddStudentOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-8">
          <div
            className={`absolute inset-0 bg-black/50 ${
              isAddStudentClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"
            }`}
            style={{ backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
            onClick={closeAddStudentModal}
          />
          <div
            className={`relative bg-surface rounded-2xl border border-outline-variant shadow-2xl max-w-[780px] w-full flex flex-col overflow-hidden max-h-[90vh] ${
              isAddStudentClosing ? "modal-panel-exit" : "modal-panel-enter"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-8 py-5 border-b border-outline-variant bg-surface-container-low flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                  <span className="material-symbols-outlined text-2xl">person_add</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-on-surface">Add a Student</h3>
                  <p className="text-xs text-secondary mt-0.5">
                    Link an additional respondent or complainant/subject to this group case record.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeAddStudentModal}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[22px]">close</span>
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleAddStudentSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-8 overflow-y-auto max-h-[calc(85vh-140px)] flex flex-col gap-6">
                {addStudentError && (
                  <div className="text-xs text-error bg-error-container/60 p-4 rounded-xl border border-error/30 flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-[20px] text-error shrink-0">error</span>
                    <span className="font-semibold">{addStudentError}</span>
                  </div>
                )}

                {/* Student info inputs */}
                <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 flex flex-col gap-5">
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Student Information</p>

                  {/* Row 1: Names */}
                  <div className="flex flex-col sm:flex-row gap-4 items-start">
                    <div className="flex-1 w-full min-w-0">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider mb-2">
                        Last name
                        <span className="material-symbols-outlined text-error" style={{ fontSize: 10 }}>emergency</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={newStudentForm.lastName}
                        placeholder="e.g. Dela Cruz"
                        onChange={(e) => setNewStudentForm({ ...newStudentForm, lastName: autoCapitalize(e.target.value) })}
                        onBlur={() => setNewStudentForm((p) => ({ ...p, lastName: capitalizeWords(p.lastName) }))}
                        className="w-full bg-surface-container-low border border-outline-variant rounded-xl py-2.5 px-3.5 text-sm text-on-surface placeholder:text-muted focus:ring-2 focus:ring-primary focus:outline-none"
                      />
                    </div>
                    <div className="flex-1 w-full min-w-0">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider mb-2">
                        First name
                        <span className="material-symbols-outlined text-error" style={{ fontSize: 10 }}>emergency</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={newStudentForm.firstName}
                        placeholder="e.g. Juan"
                        onChange={(e) => setNewStudentForm({ ...newStudentForm, firstName: autoCapitalize(e.target.value) })}
                        onBlur={() => setNewStudentForm((p) => ({ ...p, firstName: capitalizeWords(p.firstName) }))}
                        className="w-full bg-surface-container-low border border-outline-variant rounded-xl py-2.5 px-3.5 text-sm text-on-surface placeholder:text-muted focus:ring-2 focus:ring-primary focus:outline-none"
                      />
                    </div>
                    <div className="w-full sm:w-16 shrink-0">
                      <label className="block text-xs font-bold text-secondary uppercase tracking-wider mb-2 whitespace-nowrap text-center sm:text-left">
                        M.I.
                      </label>
                      <input
                        type="text"
                        maxLength={3}
                        value={newStudentForm.middleInitial}
                        placeholder="e.g. M"
                        onChange={(e) => setNewStudentForm({ ...newStudentForm, middleInitial: e.target.value.replace(/\s+/g, "").toUpperCase() })}
                        onBlur={() => setNewStudentForm((p) => ({ ...p, middleInitial: normalizeMiddleInitial(p.middleInitial) }))}
                        className="w-full bg-surface-container-low border border-outline-variant rounded-xl py-2.5 px-2 text-sm text-on-surface placeholder:text-muted focus:ring-2 focus:ring-primary focus:outline-none text-center"
                      />
                    </div>
                  </div>

                  {/* Row 2: Role, Grade Level, Adviser */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider mb-2">
                        Role
                        <span className="material-symbols-outlined text-error" style={{ fontSize: 10 }}>emergency</span>
                      </label>
                      <RoleDropdown
                        value={newStudentForm.role}
                        onChange={(val) => setNewStudentForm({ ...newStudentForm, role: val })}
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider mb-2">
                        Grade level
                      </label>
                      <input
                        type="text"
                        list="group-case-grade-level-options"
                        value={newStudentForm.level}
                        placeholder="e.g. Grade 10"
                        maxLength={GRADE_LEVEL_LIMIT}
                        onChange={(e) => setNewStudentForm({ ...newStudentForm, level: e.target.value.slice(0, GRADE_LEVEL_LIMIT) })}
                        onBlur={() => setNewStudentForm((p) => ({ ...p, level: normalizeGradeLevel(p.level) }))}
                        className="w-full bg-surface-container-low border border-outline-variant rounded-xl py-2.5 px-3.5 text-sm text-on-surface placeholder:text-muted focus:ring-2 focus:ring-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider mb-2">
                        Adviser
                      </label>
                      <input
                        type="text"
                        value={newStudentForm.adviser}
                        placeholder="e.g. Mr. Santos"
                        maxLength={ADVISER_LIMIT}
                        onChange={(e) => setNewStudentForm({ ...newStudentForm, adviser: autoCapitalize(e.target.value.slice(0, ADVISER_LIMIT)) })}
                        onBlur={() => setNewStudentForm((p) => ({ ...p, adviser: capitalizeWords(p.adviser).slice(0, ADVISER_LIMIT) }))}
                        className="w-full bg-surface-container-low border border-outline-variant rounded-xl py-2.5 px-3.5 text-sm text-on-surface placeholder:text-muted focus:ring-2 focus:ring-primary focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Row 3: Sanction / Action Taken */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider mb-2">
                      Sanction / action taken
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Describe the sanction or action taken…"
                      value={newStudentForm.sanction}
                      maxLength={TEXT_FIELD_LIMIT}
                      onChange={(e) => setNewStudentForm({ ...newStudentForm, sanction: e.target.value.slice(0, TEXT_FIELD_LIMIT) })}
                      className="w-full bg-surface-container-low border border-outline-variant rounded-xl py-2.5 px-3.5 text-sm text-on-surface placeholder:text-muted focus:ring-2 focus:ring-primary focus:outline-none resize-none leading-relaxed"
                    />
                    <p className="mt-1.5 text-right text-[10px] font-medium text-secondary">
                      {newStudentForm.sanction.length}/{TEXT_FIELD_LIMIT}
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-8 py-5 bg-surface-container-low border-t border-outline-variant flex justify-end gap-3.5 shrink-0">
                <button
                  type="button"
                  onClick={closeAddStudentModal}
                  disabled={isAddingStudent}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingStudent}
                  className="btn-primary"
                >
                  {isAddingStudent ? (
                    <>
                      <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                      <span>Adding...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">person_add</span>
                      <span>Add Student</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Lightbox for proof preview */}
      {selectedProofUrl && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className={`absolute inset-0 bg-black/70 backdrop-blur-sm ${
              isProofLightboxClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"
            }`}
            onClick={closeProofLightbox}
          />
          <div
            className={`relative z-10 max-w-4xl max-h-[90vh] bg-surface rounded-2xl overflow-hidden shadow-2xl border border-outline-variant ${
              isProofLightboxClosing ? "modal-panel-exit" : "modal-panel-enter"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-4 py-3 border-b border-outline-variant bg-surface-container-low">
              <span className="text-sm font-bold text-on-surface">Attachment Preview</span>
              <button
                onClick={closeProofLightbox}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="p-4 flex items-center justify-center max-h-[calc(90vh-60px)] overflow-auto">
              <img src={selectedProofUrl} alt="Attachment" className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-sm" />
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* PDF Target Export Portal Container */}
      {createPortal(
        <div
          ref={pdfRef}
          style={{
            position: "absolute",
            left: "-9999px",
            top: "-9999px",
            width: "210mm",
            background: "#fff",
            color: "#000",
            opacity: 0,
            visibility: "hidden",
            overflow: "hidden",
            zIndex: -9999,
          }}
        >
          <div style={{ width: "210mm", minHeight: "297mm", boxSizing: "border-box", padding: "32px 48px 80px", background: "#fff", position: "relative", fontFamily: "serif" }}>
            {pdfFirstHeader}

            {/* Student Information Table */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#002F87", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e5e7eb", paddingBottom: 4, marginBottom: 8, fontFamily: "sans-serif" }}>STUDENT INFORMATION</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "sans-serif", fontSize: 10 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                    {["FULL NAME", "GRADE", "ADVISER", "SANCTION TAKEN", "CASE STATUS"].map((h) => (
                      <th key={h} style={{ padding: "6px 8px 6px 0", textAlign: h === "CASE STATUS" ? "center" : "left", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6b7280" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allRespondents.map(({ student, caseRecord: c }, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "6px 8px 6px 0", fontWeight: 600, color: "#111827" }}>{student.lastName}, {student.firstName}{student.middleInitial ? ` ${student.middleInitial}.` : ""}</td>
                      <td style={{ padding: "6px 8px 6px 0", color: "#4b5563" }}>{student.level || "—"}</td>
                      <td style={{ padding: "6px 8px 6px 0", color: "#4b5563" }}>{student.adviser || "—"}</td>
                      <td style={{ padding: "6px 8px 6px 0", color: "#4b5563", fontSize: 9 }}>{student.sanction || "—"}</td>
                      <td style={{ padding: "6px 8px 6px 0", textAlign: "center", ...getBadgeInlineStyle(c.progress), fontWeight: 700, fontSize: 9, textTransform: "uppercase" }}>{c.progress}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Case metadata */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#002F87", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e5e7eb", paddingBottom: 4, marginBottom: 8, fontFamily: "sans-serif" }}>CASE INFORMATION</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 24px", fontFamily: "sans-serif", fontSize: 11, marginBottom: 12 }}>
                <div>
                  <div style={{ color: "#6b7280", fontWeight: 700, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em" }}>CASE TITLE</div>
                  <div style={{ color: "#111827", fontWeight: 600, marginTop: 2 }}>{groupTitle}</div>
                </div>
                <div>
                  <div style={{ color: "#6b7280", fontWeight: 700, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em" }}>CASE TYPE</div>
                  <div style={{ color: "#111827", fontWeight: 600, marginTop: 2 }}>{caseType}</div>
                </div>
                <div>
                  <div style={{ color: "#6b7280", fontWeight: 700, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em" }}>DATE</div>
                  <div style={{ color: "#111827", marginTop: 2 }}>{formatDateTime(earliestDate)}</div>
                </div>
              </div>

              <div>
                <div style={{ color: "#6b7280", fontWeight: 700, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>DESCRIPTION</div>
                <p style={{ fontSize: 11, color: "#374151", lineHeight: 1.6, whiteSpace: "pre-wrap", textAlign: "justify", fontFamily: "sans-serif", margin: 0 }}>
                  {description}
                </p>
              </div>
            </div>

            {/* Signature block */}
            <div style={{ marginTop: 40, fontFamily: "sans-serif" }}>
              <div style={{ borderTop: "1px solid #d1d5db", paddingTop: 8, marginBottom: 32, textAlign: "center", fontSize: 9, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.1em" }}>End of Group Case Record</div>
              <div style={{ display: "flex", justifyContent: "space-around", width: "80%", margin: "0 auto" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 160, textAlign: "center" }}>
                  <div style={{ borderBottom: "1px solid #1f2937", width: "100%", marginBottom: 4 }} />
                  <div style={{ fontWeight: 700, fontSize: 11, color: "#000" }}>Guidance Counselor</div>
                  <div style={{ fontSize: 9, color: "#6b7280" }}>Prepared by</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 160, textAlign: "center" }}>
                  <div style={{ borderBottom: "1px solid #1f2937", width: "100%", marginBottom: 4 }} />
                  <div style={{ fontWeight: 700, fontSize: 11, color: "#000" }}>School Principal</div>
                  <div style={{ fontSize: 9, color: "#6b7280" }}>Noted by</div>
                </div>
              </div>
            </div>

            {pdfFooter(1, 1 + allProofs.length)}
          </div>

          {/* Attachments */}
          {allProofs.map((proof, idx) => (
            <div key={`pdf-att-${idx}`} style={{ width: "210mm", minHeight: "297mm", boxSizing: "border-box", padding: "32px 48px 80px", background: "#fff", position: "relative", fontFamily: "serif" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "1px solid #e5e7eb", paddingBottom: 12, marginBottom: 24, fontFamily: "sans-serif" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em", color: "#000" }}>Laguna College Guidance Office</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#4b5563", marginTop: 2 }}>Group Case Record</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 9, color: "#6b7280" }}>Case ID: GC-2026-{repCase?.id.toString().padStart(4, "0")}</div>
                  <div style={{ fontSize: 8, color: "#9ca3af", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.1em", marginTop: 2 }}>{`Attachment ${idx + 1}: ${proof.name}`}</div>
                </div>
              </div>
              <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", width: "100%", marginTop: 16 }}>
                <img src={proof.data} alt={proof.name} style={{ maxWidth: "100%", maxHeight: "210mm", objectFit: "contain", border: "1px solid #e5e7eb", borderRadius: 4 }} />
              </div>
              {pdfFooter(idx + 2, 1 + allProofs.length)}
            </div>
          ))}
        </div>,
        document.body
      )}

      {isExporting && createPortal(
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/45 backdrop-blur-sm">
          <div className="bg-surface border border-outline-variant p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 max-w-xs w-full text-center">
            <span className="material-symbols-outlined text-4xl animate-spin text-primary">sync</span>
            <div>
              <h3 className="text-sm font-bold text-on-surface">Generating Group PDF</h3>
              <p className="text-xs text-secondary mt-1">Compiling official group case record document...</p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
