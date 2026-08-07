import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import html2pdf from "html2pdf.js";
import lcOfficialLogo from "../assets/lc-official-logo.jpg";
import guidanceLogo from "../assets/guidance-logo.png";


import { CaseRecord, StudentInfo } from "../types";

const parseStudents = (studentsStr: string): StudentInfo[] => {
  try {
    const parsed = JSON.parse(studentsStr) || [];
    return Array.isArray(parsed)
      ? parsed.map((student) => ({ ...student, role: normalizeRole(student.role) }))
      : [];
  } catch (e) {
    return [];
  }
};



interface ProofItem {
  name: string;
  data: string;
  created_at: string;
}

const GRADE_LEVEL_OPTIONS = ["Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];
const SECTION_OPTIONS = ["A", "B", "C", "D", "E", "F", "G", "STEM", "ABM", "HUMSS", "GAS"];
const TEXT_FIELD_LIMIT = 250;
const CASE_TITLE_LIMIT = 20;
const ADVISER_LIMIT = 20;
const GRADE_LEVEL_LIMIT = 8;
const SECTION_LIMIT = 10;
const CASE_TYPE_LIMIT = 25;
const MODAL_EXIT_MS = 200;
const CASE_TYPE_OPTIONS = [
  "Poor academic performance",
  "Learning difficulties",
  "Study skills & habits",
  "Absenteeism / tardiness",
  "Course selection",
  "Dropout prevention",
  "Peer relationship issues",
  "Family problems",
  "Self-esteem & identity",
  "Adjustment difficulties",
  "Grief & loss",
  "Gender & sexuality",
  "Substance use",
  "Social media issues",
  "Physical fighting",
  "Assault on staff",
  "Weapons possession",
  "Threats & intimidation",
  "Self-harm & suicide risk",
  "Sexual harassment",
  "Anxiety & depression",
  "Trauma & abuse",
  "Crisis intervention",
  "Defiance / non-compliance",
  "Classroom disruption",
  "Bullying",
  "Truancy / skipping",
  "Vandalism / property damage",
  "Theft & dishonesty",
  "Inappropriate language",
  "Gang-related behaviour",
  "Substance possession",
];

const PROGRESS_OPTIONS = [
  {
    value: "Pending",
    label: "Pending",
    dot: "#854F0B",
    bg: "#FAEEDA",
    border: "#FAC775",
    text: "#633806",
  },
  {
    value: "Reprimand",
    label: "Reprimand",
    dot: "#A32D2D",
    bg: "#FCEBEB",
    border: "#F7C1C1",
    text: "#791F1F",
  },
  {
    value: "Resolved",
    label: "Resolved",
    dot: "#0F6E56",
    bg: "#E1F5EE",
    border: "#9FE1CB",
    text: "#085041",
  },
  {
    value: "Closed",
    label: "Closed",
    dot: "#4D5A66",
    bg: "#EDF3F8",
    border: "#C8D7E4",
    text: "#35414C",
  },
];

const getTodayDateString = () => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const collapseSpaces = (value: string) => value.replace(/\s+/g, " ").trim();

const capitalizeWords = (value: string) =>
  collapseSpaces(value)
    .split(" ")
    .map((word) => word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : "")
    .join(" ");

const autoCapitalize = (val: string) => {
  return val.replace(/(^|\s)\p{L}/gu, (match) => match.toUpperCase());
};

const normalizeCaseType = (value: string) => capitalizeWords(value).slice(0, CASE_TYPE_LIMIT);

const normalizeMiddleInitial = (value: string) => value.replace(/\s+/g, "").toUpperCase();

const normalizeGradeLevel = (value: string) => {
  const cleaned = collapseSpaces(value);
  const match = cleaned.match(/^(?:grade\s*)?(\d{1,2})$/i);
  if (match) {
    const grade = Number(match[1]);
    if (grade >= 7 && grade <= 12) return `Grade ${grade}`.slice(0, GRADE_LEVEL_LIMIT);
  }
  return capitalizeWords(cleaned).slice(0, GRADE_LEVEL_LIMIT);
};

const normalizeSection = (value: string) => {
  const cleaned = collapseSpaces(value);
  const upper = cleaned.toUpperCase();
  if (SECTION_OPTIONS.includes(upper)) return upper.slice(0, SECTION_LIMIT);
  return capitalizeWords(cleaned).slice(0, SECTION_LIMIT);
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

const normalizeStudent = (student: StudentInfo): StudentInfo => ({
  firstName: capitalizeWords(student.firstName),
  lastName: capitalizeWords(student.lastName),
  middleInitial: normalizeMiddleInitial(student.middleInitial),
  level: normalizeGradeLevel(student.level),
  section: normalizeSection(student.section),
  adviser: capitalizeWords(student.adviser).slice(0, ADVISER_LIMIT),
  role: normalizeRole(student.role),
});

const parseProofs = (value: string): ProofItem[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as ProofItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const formatDate = (dateString: string) => {
  if (!dateString) return "";
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) {
    return dateString;
  }
  return parsed.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

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

export default function CaseDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [caseRecord, setCaseRecord] = useState<CaseRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelConfirmClosing, setIsCancelConfirmClosing] = useState(false);

  // Editing State
  const [isEditing, setIsEditing] = useState(false);
  const [showComplainant, setShowComplainant] = useState(true);
  const [editForm, setEditForm] = useState({
    students: [] as StudentInfo[],
    date: "",
    date_filed: "",
    case: "",
    description: "",
    sanction: "",
    progress: "Pending",
    title: "",
  });

  // Proofs State
  const [uploadedProofs, setUploadedProofs] = useState<ProofItem[]>([]);
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);
  const [isProofLightboxClosing, setIsProofLightboxClosing] = useState(false);
  const [deleteProofIndex, setDeleteProofIndex] = useState<number | null>(null);
  const [isDeleteProofConfirmClosing, setIsDeleteProofConfirmClosing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  // ─── PDF helpers (mirror SummaryReports style) ───────────────────────────

  const getBadgeInlineStyle = (progress: string): React.CSSProperties => {
    const p = progress.toLowerCase();
    if (p === "closed")   return { color: "#4b5563" };
    if (p === "resolved") return { color: "#15803d" };
    if (p === "pending")  return { color: "#a16207" };
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
        <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "sans-serif", color: "#000" }}>Individual Case Record</div>
        <div style={{ fontSize: 10, color: "#6b7280", fontFamily: "sans-serif", marginTop: 2 }}>Official Guidance Office Record</div>
      </div>
    </>
  );

  const pdfSmallHeader = (label: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "1px solid #e5e7eb", paddingBottom: 12, marginBottom: 24, fontFamily: "sans-serif" }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em", color: "#000" }}>Laguna College Guidance Office</div>
        <div style={{ fontSize: 9, fontWeight: 700, color: "#4b5563", marginTop: 2 }}>Individual Case Record</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 9, color: "#6b7280" }}>Case ID: GC-2026-{caseRecord?.id.toString().padStart(4, "0")}</div>
        <div style={{ fontSize: 8, color: "#9ca3af", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.1em", marginTop: 2 }}>{label}</div>
      </div>
    </div>
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

  // ─── Export handler ───────────────────────────────────────────────────────

  const handleExportPDF = () => {
    if (!caseRecord || isExporting) return;
    setIsExporting(true);
  };

  useEffect(() => {
    if (!isExporting) return;

    let isMounted = true;
    const runExport = async () => {
      // Give React one tick to render the portal, then capture via ref
      await new Promise<void>((resolve) => setTimeout(resolve, 200));

      const element = pdfRef.current;
      if (!element) {
        if (isMounted) setIsExporting(false);
        return;
      }

      // Make the element actually paintable for html2canvas
      element.style.position = "relative";
      element.style.left = "0";
      element.style.top = "0";
      element.style.opacity = "1";
      element.style.visibility = "visible";
      element.style.overflow = "visible";
      // Force a layout pass so the browser paints it
      element.getBoundingClientRect();

      const filename = `GC-2026-${caseRecord?.id.toString().padStart(4, "0")}.pdf`;
      const opt = {
        margin: 0,
        filename,
        image: { type: "jpeg" as const, quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#FFFFFF",
          scrollX: 0,
          scrollY: 0,
          windowWidth: element.scrollWidth,
          windowHeight: element.scrollHeight,
          onclone: (clonedDoc: Document) => {
            clonedDoc.documentElement.classList.remove("dark");
            const el = clonedDoc.querySelector(".cd-pdf-root") as HTMLElement | null;
            if (el) {
              el.style.position = "relative";
              el.style.left = "0";
              el.style.top = "0";
              el.style.width = "210mm";
              el.style.opacity = "1";
              el.style.visibility = "visible";
              el.style.overflow = "visible";
              el.style.pointerEvents = "auto";
            }
          },
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
      };

      try {
        const pdfBase64 = await html2pdf().from(element).set(opt).outputPdf("datauristring");
        if (isMounted) {
          const base64Data = pdfBase64.split(",")[1];
          await invoke("save_pdf", { base64Data, filename });
        }
      } catch (err) {
        alert("Failed to export PDF: " + err);
      } finally {
        if (isMounted) setIsExporting(false);
      }
    };

    runExport();

    return () => { isMounted = false; };
  }, [isExporting, caseRecord]);

  const resetEditForm = useCallback((record: CaseRecord) => {
    setEditForm({
      students: parseStudents(record.students),
      date: record.date,
      date_filed: record.date_filed,
      case: record.case,
      description: record.description,
      sanction: record.sanction,
      progress: record.progress,
      title: record.title || "",
    });
  }, []);

  const handleEditStudentChange = (index: number, field: keyof StudentInfo, value: string) => {
    let processedValue = value;
    if (field === "firstName" || field === "lastName" || field === "adviser") {
      processedValue = autoCapitalize(value);
    } else if (field === "middleInitial") {
      processedValue = value.replace(/\s+/g, "").toUpperCase();
    }
    if (field === "adviser") {
      processedValue = processedValue.slice(0, ADVISER_LIMIT);
    } else if (field === "level") {
      processedValue = processedValue.slice(0, GRADE_LEVEL_LIMIT);
    } else if (field === "section") {
      processedValue = processedValue.slice(0, SECTION_LIMIT);
    }

    setEditForm((previous) => ({
      ...previous,
      students: previous.students.map((student, studentIndex) =>
        studentIndex === index ? { ...student, [field]: processedValue } : student
      ),
    }));
  };

  const handleEditStudentBlur = (index: number, field: keyof StudentInfo) => {
    setEditForm((previous) => ({
      ...previous,
      students: previous.students.map((student, studentIndex) => {
        if (studentIndex !== index) return student;
        if (field === "adviser") {
          return { ...student, adviser: capitalizeWords(student.adviser).slice(0, ADVISER_LIMIT) };
        }
        if (field === "firstName" || field === "lastName" || field === "role") {
          return { ...student, [field]: capitalizeWords(student[field] || "") };
        }
        if (field === "middleInitial") return { ...student, middleInitial: normalizeMiddleInitial(student.middleInitial) };
        if (field === "level") return { ...student, level: normalizeGradeLevel(student.level) };
        if (field === "section") return { ...student, section: normalizeSection(student.section) };
        return student;
      }),
    }));
  };



  const isFormDirty = () => {
    if (!caseRecord) return false;
    const initialStudents = parseStudents(caseRecord.students);
    
    if (initialStudents.length !== editForm.students.length) return true;
    for (let i = 0; i < initialStudents.length; i++) {
      const s1 = initialStudents[i];
      const s2 = editForm.students[i];
      if (
        s1.firstName !== s2.firstName ||
        s1.lastName !== s2.lastName ||
        s1.middleInitial !== s2.middleInitial ||
        s1.level !== s2.level ||
        s1.section !== s2.section ||
        s1.adviser !== s2.adviser ||
        s1.role !== s2.role ||
        (s1.sanction ?? "") !== (s2.sanction ?? "")
      ) {
        return true;
      }
    }

    if (
      editForm.date !== caseRecord.date ||
      editForm.date_filed !== caseRecord.date_filed ||
      editForm.case !== caseRecord.case ||
      editForm.description !== caseRecord.description ||
      editForm.sanction !== caseRecord.sanction ||
      editForm.progress !== caseRecord.progress ||
      editForm.title !== (caseRecord.title || "")
    ) {
      return true;
    }

    return false;
  };

  const closeCancelConfirm = (discardChanges = false) => {
    setIsCancelConfirmClosing(true);
    window.setTimeout(() => {
      if (discardChanges && caseRecord) {
        resetEditForm(caseRecord);
        setIsEditing(false);
      }
      setShowCancelConfirm(false);
      setIsCancelConfirmClosing(false);
    }, MODAL_EXIT_MS);
  };

  const closeProofLightbox = () => {
    setIsProofLightboxClosing(true);
    window.setTimeout(() => {
      setSelectedProofUrl(null);
      setIsProofLightboxClosing(false);
    }, MODAL_EXIT_MS);
  };

  const closeDeleteProofConfirm = (afterClose?: () => void) => {
    setIsDeleteProofConfirmClosing(true);
    window.setTimeout(() => {
      setDeleteProofIndex(null);
      setIsDeleteProofConfirmClosing(false);
      afterClose?.();
    }, MODAL_EXIT_MS);
  };

  // Load Case Record
  const loadCase = useCallback(async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      const data = await invoke<CaseRecord>("get_case", { id: Number(id) });
      setCaseRecord(data);
      resetEditForm(data);
      let proofs = parseProofs(data.proofs);
      const stored = localStorage.getItem(`case_proofs_${id}`);
      if (proofs.length === 0 && stored) {
        proofs = (JSON.parse(stored) as { name: string; data: string }[]).map((proof) => ({
          ...proof,
          created_at: new Date().toISOString(),
        }));
        await invoke("update_case", {
          id: data.id,
          payload: {
            students: parseStudents(data.students),
            date: data.date,
            dateFiled: data.date_filed,
            case: data.case,
            description: data.description,
            sanction: data.sanction,
            progress: data.progress,
            proofs: JSON.stringify(proofs),
            title: data.title,
            reportingStudent: data.reporting_student || "",
            groupId: data.group_id || null
          }
        });
        localStorage.removeItem(`case_proofs_${id}`);
      }
      setUploadedProofs(proofs);
      setCaseRecord((prev) => prev ? { ...prev, proofs: JSON.stringify(proofs) } : prev);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [id, resetEditForm]);

  useEffect(() => {
    loadCase();
  }, [loadCase]);

  const saveProofs = useCallback(async (proofs: ProofItem[], updateLog?: string) => {
    if (!caseRecord) return;
    await invoke("update_case", {
      id: caseRecord.id,
      payload: {
        students: parseStudents(caseRecord.students),
        date: caseRecord.date,
        dateFiled: caseRecord.date_filed,
        case: caseRecord.case,
        description: caseRecord.description,
        sanction: caseRecord.sanction,
        progress: caseRecord.progress,
        proofs: JSON.stringify(proofs),
        title: caseRecord.title,
        reportingStudent: caseRecord.reporting_student || "",
        groupId: caseRecord.group_id || null,
      },
      updateLog
    });
    setUploadedProofs(proofs);
    setCaseRecord({ ...caseRecord, proofs: JSON.stringify(proofs) });
    window.dispatchEvent(new Event("cases:changed"));
  }, [caseRecord]);

  // Handle Proof Upload
  const handleUploadProof = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        await saveProofs([
          ...uploadedProofs,
          {
          name: file.name,
          data: reader.result as string,
            created_at: new Date().toISOString(),
          },
        ], `Uploaded proof: ${file.name}`);
      } catch (err) {
        alert("Failed to upload proof: " + err);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle Proof Delete
  const handleDeleteProofRequest = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setIsDeleteProofConfirmClosing(false);
    setDeleteProofIndex(index);
  };

  const confirmDeleteProof = () => {
    if (deleteProofIndex === null) return;
    const indexToDelete = deleteProofIndex;
    closeDeleteProofConfirm(async () => {
      try {
        const deletedProof = uploadedProofs[indexToDelete];
        await saveProofs(
            uploadedProofs.filter((_, i) => i !== indexToDelete),
            `Deleted proof: ${deletedProof?.name || "unknown"}`
        );
      } catch (err) {
        alert("Failed to delete proof: " + err);
      }
    });
  };

  // Handle Save Edits
  const handleSaveEdits = async () => {
    if (!caseRecord) return;
    const parsedDate = new Date(editForm.date);
    const isFuture = !Number.isNaN(parsedDate.getTime()) && parsedDate > new Date();
    const date = isFuture ? getTodayDateString() : editForm.date;
    const normalizedStudents = editForm.students.map(normalizeStudent);
    const normalizedTitle = caseRecord.group_id ? capitalizeWords(editForm.title).slice(0, CASE_TITLE_LIMIT) : "";
    const diffs: Array<{ label: string; oldVal: string; newVal: string }> = [];
    let oldStatus: string | undefined = undefined;
    let newStatus: string | undefined = undefined;

    if (editForm.progress !== caseRecord.progress) {
      oldStatus = caseRecord.progress;
      newStatus = editForm.progress;
      diffs.push({ label: "Case Status", oldVal: caseRecord.progress, newVal: editForm.progress });
    }
    if (normalizeCaseType(editForm.case) !== caseRecord.case) {
      diffs.push({ label: "Case Type", oldVal: caseRecord.case, newVal: normalizeCaseType(editForm.case) });
    }
    if (editForm.sanction.trim() !== caseRecord.sanction) {
      diffs.push({ label: "Sanction", oldVal: caseRecord.sanction || "None", newVal: editForm.sanction.trim() || "None" });
    }
    if (date !== caseRecord.date) {
      diffs.push({ label: "Incident Date", oldVal: formatDate(caseRecord.date), newVal: formatDate(date) });
    }
    if (editForm.description.trim() !== caseRecord.description) {
      diffs.push({ label: "Description", oldVal: "Previous description", newVal: "Updated description" });
    }

    let actionText = "Case details were updated.";
    if (diffs.length > 0) {
      actionText = `Updated ${diffs.map((d) => d.label).join(", ")}.`;
    }

    const updateLog = JSON.stringify({
      text: actionText,
      oldStatus,
      newStatus,
      diffs,
    });

    try {
      await invoke("update_case", {
        id: caseRecord.id,
        payload: {
          students: normalizedStudents,
          date,
          dateFiled: editForm.date_filed,
          case: normalizeCaseType(editForm.case),
          description: editForm.description.trim().slice(0, TEXT_FIELD_LIMIT),
          sanction: editForm.sanction.trim().slice(0, TEXT_FIELD_LIMIT),
          progress: editForm.progress,
          proofs: caseRecord.proofs,
          title: normalizedTitle,
          reportingStudent: caseRecord.reporting_student || "",
          groupId: caseRecord.group_id || null,
        },
        updateLog
      });
      setIsEditing(false);
      window.dispatchEvent(new Event("cases:changed"));
      loadCase();
    } catch (err) {
      alert("Failed to save case details: " + err);
    }
  };

  const displayedProofs = uploadedProofs;
  const displayedStudents = caseRecord ? parseStudents(caseRecord.students) : [];
  const displayedRespondents = displayedStudents.filter(isRespondent);
  const displayedComplainantSubjects = displayedStudents.filter(isComplainantSubject);
  const hasLinkedGroup = Boolean(caseRecord?.group_id);
  const updateHistory = useMemo(() => {
    if (!caseRecord || !caseRecord.update_history) return [];
    try {
      const history = JSON.parse(caseRecord.update_history);
      return Array.isArray(history) ? history.reverse() : [];
    } catch (e) {
      return [];
    }
  }, [caseRecord?.update_history]);
  const editRespondents = editForm.students
    .map((student, index) => ({ student, index }))
    .filter(({ student }) => isRespondent(student));

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 mt-6 animate-pulse">
        <div className="h-10 bg-surface-container rounded-lg w-1/3" />
        <div className="h-[400px] bg-surface-container rounded-xl w-full" />
      </div>
    );
  }

  if (error || !caseRecord) {
    return (
      <div className="text-center mt-12 bg-surface border border-outline-variant p-8 rounded-xl max-w-md mx-auto shadow-sm">
        <span className="material-symbols-outlined text-error text-5xl mb-3">error</span>
        <h3 className="text-lg font-bold text-on-surface mb-2">Case Record Not Found</h3>
        <p className="text-sm text-secondary mb-6">{error || "The requested case could not be retrieved."}</p>
        <button
          onClick={() => navigate("/catalog")}
          className="px-6 py-2 bg-[#0F172A] hover:bg-black text-white text-sm font-bold rounded-lg transition-all duration-500"
        >
          Return to Catalog
        </button>
      </div>
    );
  }

  return (
    <>
      <datalist id="case-details-grade-level-options">
        {GRADE_LEVEL_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <datalist id="case-details-section-options">
        {SECTION_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <datalist id="case-details-case-type-options">
        {CASE_TYPE_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>


      {/* Sub-header / Actions matching the design layout */}
      <div className="flex justify-between items-center mb-4 mt-2 print:hidden">
        <span className="font-data-mono text-xs font-semibold bg-surface border border-outline-variant px-3 py-1.5 rounded-lg text-secondary">
          ID: GC-2026-{caseRecord.id.toString().padStart(4, "0")}
        </span>
        <div className="flex gap-3">
          {isEditing ? (
            <>
              <button
                onClick={handleSaveEdits}
                className="btn-primary bg-[#15803d] hover:bg-green-700 text-white font-bold"
              >
                <span className="material-symbols-outlined text-sm">save</span>
                <span>Save</span>
              </button>
              <button
                onClick={() => {
                  if (isFormDirty()) {
                    setIsCancelConfirmClosing(false);
                    setShowCancelConfirm(true);
                  } else {
                    setIsEditing(false);
                  }
                }}
                className="btn-secondary"
              >
                <span className="material-symbols-outlined text-sm">close</span>
                <span>Cancel</span>
              </button>
            </>
          ) : (
            <>
              {displayedComplainantSubjects.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowComplainant(!showComplainant)}
                  className="btn-secondary"
                >
                  <span className="material-symbols-outlined text-sm">
                    {showComplainant ? "visibility_off" : "visibility"}
                  </span>
                  <span>{showComplainant ? "Hide Complainant" : "Show Complainant"}</span>
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

          {isEditing && (
            <div className="mt-4 flex justify-end print:hidden">
              <div className="flex flex-col items-end gap-1.5">
                <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mr-2">Status</label>
                <div className="flex gap-2">
                  {PROGRESS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEditForm({ ...editForm, progress: opt.value })}
                      className={`center-fill-option px-3 py-1.5 rounded font-bold text-xs border transition-all duration-500 text-center ${
                        editForm.progress.toLowerCase() === opt.value.toLowerCase() ? "center-fill-option-selected" : ""
                      }`}
                      style={editForm.progress.toLowerCase() === opt.value.toLowerCase()
                        ? { background: opt.bg, borderColor: opt.dot, color: opt.text }
                        : {
                          background: "transparent",
                          borderColor: "var(--color-outline-variant)",
                          color: "var(--color-secondary)",
                          ["--fill-hover-bg" as string]: opt.bg,
                          ["--fill-hover-border" as string]: opt.border,
                        }
                      }
                    >
                      <span className="relative z-10 transition-colors duration-500">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Content Body Grid */}
        <div className="p-8 space-y-8">
          {/* Left Column — Student Information */}
          <div className="space-y-4">
            <div className="flex items-center gap-4 mb-4">
              <span className="text-base font-medium text-on-surface uppercase tracking-widest whitespace-nowrap">Student Information</span>
            </div>

            {isEditing ? (
              editRespondents.map(({ student, index: idx }) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-[2.5fr_1fr_1fr_1.5fr] gap-x-8 gap-y-5 border-b border-outline-variant pb-4 mb-4 last:border-0 last:pb-0 last:mb-0">
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Full Name</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={student.lastName}
                        placeholder="Last Name"
                        onChange={(e) => handleEditStudentChange(idx, "lastName", autoCapitalize(e.target.value))}
                        onBlur={() => handleEditStudentBlur(idx, "lastName")}
                        className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary min-w-0 flex-1"
                      />
                      <input
                        type="text"
                        value={student.firstName}
                        placeholder="First Name"
                        onChange={(e) => handleEditStudentChange(idx, "firstName", autoCapitalize(e.target.value))}
                        onBlur={() => handleEditStudentBlur(idx, "firstName")}
                        className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary min-w-0 flex-1"
                      />
                      <input
                        type="text"
                        value={student.middleInitial}
                        placeholder="M.I."
                        maxLength={3}
                        onChange={(e) => handleEditStudentChange(idx, "middleInitial", e.target.value.replace(/\s+/g, "").toUpperCase())}
                        onBlur={() => handleEditStudentBlur(idx, "middleInitial")}
                        className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-16"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Level</label>
                    <input
                      type="text"
                      value={student.level}
                      list="case-details-grade-level-options"
                      placeholder="e.g. Grade 10"
                      maxLength={GRADE_LEVEL_LIMIT}
                      onChange={(e) => handleEditStudentChange(idx, "level", e.target.value)}
                      onBlur={() => handleEditStudentBlur(idx, "level")}
                      className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-full"
                    />
                    <p className="mt-1 text-right text-[10px] font-medium text-secondary">
                      {student.level.length}/{GRADE_LEVEL_LIMIT}
                    </p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Section</label>
                    <input
                      type="text"
                      value={student.section}
                      list="case-details-section-options"
                      placeholder="e.g. STEM"
                      maxLength={SECTION_LIMIT}
                      onChange={(e) => handleEditStudentChange(idx, "section", e.target.value)}
                      onBlur={() => handleEditStudentBlur(idx, "section")}
                      className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-full"
                    />
                    <p className="mt-1 text-right text-[10px] font-medium text-secondary">
                      {student.section.length}/{SECTION_LIMIT}
                    </p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Adviser</label>
                    <input
                      type="text"
                      value={student.adviser}
                      placeholder="e.g. Mr. Santos"
                      maxLength={ADVISER_LIMIT}
                      onChange={(e) => handleEditStudentChange(idx, "adviser", autoCapitalize(e.target.value))}
                      onBlur={() => handleEditStudentBlur(idx, "adviser")}
                      className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-full"
                    />
                    <p className="mt-1 text-right text-[10px] font-medium text-secondary">
                      {student.adviser.length}/{ADVISER_LIMIT}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              displayedRespondents.map((student, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-[2.5fr_1fr_1fr_1fr_1.5fr] gap-x-8 gap-y-5 border-b border-outline-variant pb-4 mb-4 last:border-0 last:pb-0 last:mb-0">
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Full Name</label>
                    <p className="text-sm font-medium text-on-surface">
                      {student.lastName}, {student.firstName}{student.middleInitial ? ` ${student.middleInitial}.` : ""}
                    </p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Role</label>
                    <p className="text-sm font-medium text-on-surface">{student.role || "—"}</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Level</label>
                    <p className="text-sm font-medium text-on-surface">{student.level || "—"}</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Section</label>
                    <p className="text-sm font-medium text-on-surface">{student.section || "—"}</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Adviser</label>
                    <p className="text-sm font-medium text-on-surface">{student.adviser || "—"}</p>
                  </div>
                </div>
              ))
            )}
          </div>



          {showComplainant && displayedComplainantSubjects.length > 0 && (
            <div className="space-y-4 border-t border-outline-variant pt-8">
              {displayedComplainantSubjects.map((student, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-[2.5fr_1fr_1fr_1fr_1.5fr] gap-x-8 gap-y-5 border-b border-outline-variant pb-4 mb-4 last:border-0 last:pb-0 last:mb-0">
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Full Name</label>
                    <p className="text-sm font-medium text-on-surface">
                      {student.lastName}, {student.firstName}{student.middleInitial ? ` ${student.middleInitial}.` : ""}
                    </p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Role</label>
                    <p className="text-sm font-medium text-on-surface">{student.role || "—"}</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Level</label>
                    <p className="text-sm font-medium text-on-surface">{student.level || "—"}</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Section</label>
                    <p className="text-sm font-medium text-on-surface">{student.section || "—"}</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Adviser</label>
                    <p className="text-sm font-medium text-on-surface">{student.adviser || "—"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Right Column — Case Information */}
          <div className="space-y-6 border-t border-outline-variant pt-8">
            <div className="flex items-center gap-4 mb-4">
              <span className="text-base font-medium text-on-surface uppercase tracking-widest whitespace-nowrap">Case Information</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-x-8 gap-y-6">
              {((hasLinkedGroup && caseRecord.title) || (isEditing && hasLinkedGroup)) && (
                <div>
                  <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Case Title</label>
                  {isEditing ? (
                    <div className="w-44 max-w-full">
                      <input
                        type="text"
                        value={editForm.title}
                        placeholder="Case title"
                        maxLength={CASE_TITLE_LIMIT}
                        onChange={(e) => setEditForm({ ...editForm, title: autoCapitalize(e.target.value.slice(0, CASE_TITLE_LIMIT)) })}
                        onBlur={() => setEditForm((p) => ({ ...p, title: capitalizeWords(p.title).slice(0, CASE_TITLE_LIMIT) }))}
                        className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-full"
                      />
                      <p className="mt-1 text-right text-[10px] font-medium text-secondary">
                        {editForm.title.length}/{CASE_TITLE_LIMIT}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-on-surface leading-relaxed break-words [overflow-wrap:anywhere]">{caseRecord.title}</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Case Type</label>
                {isEditing ? (
                  <>
                    <input
                      type="text"
                      value={editForm.case}
                      list="case-details-case-type-options"
                      maxLength={CASE_TYPE_LIMIT}
                      onChange={(e) => setEditForm({ ...editForm, case: autoCapitalize(e.target.value).slice(0, CASE_TYPE_LIMIT) })}
                      onBlur={() => setEditForm((p) => ({ ...p, case: normalizeCaseType(p.case) }))}
                      className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-full"
                    />
                    <p className="mt-1 text-right text-[10px] font-medium text-secondary">
                      {editForm.case.length}/{CASE_TYPE_LIMIT}
                    </p>
                  </>
                ) : (
                  <p className="text-sm font-medium text-on-surface leading-relaxed">{caseRecord.case}</p>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Date Filed</label>
                <p className="text-sm font-medium text-on-surface">{formatDateTime(caseRecord.date_filed)}</p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Date of Incident</label>
                {isEditing ? (
                  <input
                    type="date"
                    value={editForm.date}
                    max={getTodayDateString()}
                    onChange={(e) => {
                      const nextDate = e.target.value;
                      setEditForm({ ...editForm, date: nextDate > getTodayDateString() ? getTodayDateString() : nextDate });
                    }}
                    className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-full"
                  />
                ) : (
                  <p className="text-sm font-medium text-on-surface">{formatDate(caseRecord.date)}</p>
                )}
              </div>

              {!isEditing && (
                <div>
                  <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Case Status</label>
                  <p className={`text-sm font-bold uppercase tracking-wider ${
                    caseRecord.progress.toLowerCase() === "resolved"
                      ? "text-[#15803d] dark:text-[#34A06A]"
                      : caseRecord.progress.toLowerCase() === "closed"
                      ? "text-[#4b5563] dark:text-[#9ca3af]"
                      : caseRecord.progress.toLowerCase() === "reprimand"
                      ? "text-[#dc2626] dark:text-[#ef4444]"
                      : "text-[#d97706] dark:text-[#D9A23B]"
                  }`}>
                    {caseRecord.progress}
                  </p>
                </div>
              )}

              <div className="md:col-start-1 md:col-span-2 min-w-0">
                <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Sanction/Action Taken</label>
                {isEditing ? (
                  <>
                    <textarea
                      value={editForm.sanction}
                      maxLength={TEXT_FIELD_LIMIT}
                      onChange={(e) => setEditForm({ ...editForm, sanction: e.target.value.slice(0, TEXT_FIELD_LIMIT) })}
                      className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-full h-28 resize-none"
                    />
                    <p className="mt-1 text-right text-[10px] font-medium text-secondary">
                      {editForm.sanction.length}/{TEXT_FIELD_LIMIT}
                    </p>
                  </>
                ) : (
                  <p className="text-sm font-medium text-on-surface leading-relaxed text-justify whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                    {caseRecord.sanction || "No action taken logged yet."}
                  </p>
                )}
              </div>

              <div className="md:col-span-2 min-w-0">
                <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Description</label>
                {isEditing ? (
                  <>
                    <textarea
                      value={editForm.description}
                      maxLength={TEXT_FIELD_LIMIT}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value.slice(0, TEXT_FIELD_LIMIT) })}
                      className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-full h-28 resize-none"
                    />
                    <p className="mt-1 text-right text-[10px] font-medium text-secondary">
                      {editForm.description.length}/{TEXT_FIELD_LIMIT}
                    </p>
                  </>
                ) : (
                  <p className="text-sm font-medium text-on-surface leading-relaxed text-justify whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                    {caseRecord.description || "No description provided."}
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
          <div>
            <label className="btn-primary cursor-pointer">
              <span className="material-symbols-outlined text-[18px]">upload_file</span>
              <span>Upload Proof</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUploadProof}
              />
            </label>
          </div>
        </div>

        {displayedProofs.length === 0 ? (
          <div className="text-center bg-surface border border-dashed border-outline-variant p-8 rounded-xl text-secondary text-sm">
            No documentation uploaded for this case yet. Click "Upload Proof" to add images or documents.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {displayedProofs.map((proof, index) => (
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
                <div className="absolute top-2 right-2 flex gap-1.5 z-10">
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        const parts = proof.data.split(",");
                        const base64Data = parts[1] || parts[0];
                        await invoke("save_file", { base64Data, filename: proof.name });
                      } catch (err) {
                        console.error("Failed to download attachment", err);
                      }
                    }}
                    className="bg-primary text-white rounded-full w-7 h-7 opacity-0 group-hover:opacity-100 hover:bg-primary-container transition-all duration-500 shadow-md flex items-center justify-center"
                    title="Download attachment"
                  >
                    <span className="material-symbols-outlined text-[16px] transition-colors duration-500">download</span>
                  </button>
                  {isEditing && (
                    <button
                      type="button"
                      onClick={(e) => handleDeleteProofRequest(e, index)}
                      className="bg-red-600 text-white rounded-full w-7 h-7 opacity-0 group-hover:opacity-100 hover:bg-red-700 transition-all duration-500 shadow-md flex items-center justify-center"
                      title="Delete attachment"
                    >
                      <span className="material-symbols-outlined text-[16px] transition-colors duration-500">delete</span>
                    </button>
                  )}
                </div>
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2.5 text-white text-xs truncate font-medium">
                  {proof.name}
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
              let oldStatus: string | undefined = undefined;
              let newStatus: string | undefined = undefined;
              let diffs: Array<{ label: string; oldVal: string; newVal: string }> = [];

              if (typeof entry.action === "string") {
                try {
                  const parsedAction = JSON.parse(entry.action);
                  if (parsedAction && typeof parsedAction === "object") {
                    text = parsedAction.text || entry.action;
                    oldStatus = parsedAction.oldStatus;
                    newStatus = parsedAction.newStatus;
                    if (Array.isArray(parsedAction.diffs)) {
                      diffs = parsedAction.diffs;
                    }
                  }
                } catch {
                  const match = entry.action.match(/from\s+([A-Za-z\s]+)\s+to\s+([A-Za-z\s]+)/i);
                  if (match) {
                    oldStatus = match[1].trim();
                    newStatus = match[2].trim();
                  }
                }
              }

              // Fallback to oldStatus/newStatus single diff if no diffs array present
              if (diffs.length === 0 && oldStatus && newStatus) {
                diffs.push({ label: "Case Status", oldVal: oldStatus, newVal: newStatus });
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

      {deleteProofIndex !== null && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className={`absolute inset-0 bg-black/60 backdrop-blur-sm ${
              isDeleteProofConfirmClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"
            }`}
            onClick={() => closeDeleteProofConfirm()}
          />
          <div className={`relative z-10 bg-surface border border-outline-variant max-w-sm w-full rounded-2xl p-6 shadow-2xl flex flex-col gap-4 text-center ${
            isDeleteProofConfirmClosing ? "modal-panel-exit" : "modal-panel-enter"
          }`}>
            <span className="material-symbols-outlined text-5xl mx-auto text-error">delete</span>
            <div>
              <h3 className="text-base font-bold text-on-surface">Delete attachment?</h3>
              <p className="text-xs text-secondary mt-1.5 leading-relaxed">
                This will permanently remove <strong className="text-on-surface font-semibold">{uploadedProofs[deleteProofIndex]?.name ?? "this attachment"}</strong> from this case record.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => closeDeleteProofConfirm()}
                className="btn-secondary flex-1"
              >
                <span className="material-symbols-outlined text-sm">close</span>
                <span>Cancel</span>
              </button>
              <button
                type="button"
                onClick={confirmDeleteProof}
                className="btn-primary bg-error hover:bg-red-700 flex-1"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Lightbox Modal for Full Image View */}
      {selectedProofUrl && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className={`absolute inset-0 bg-black/80 backdrop-blur-sm ${
              isProofLightboxClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"
            }`}
            onClick={closeProofLightbox}
          />
          <div className={`relative max-w-4xl max-h-[85vh] z-10 overflow-hidden bg-surface rounded-xl shadow-2xl flex flex-col ${
            isProofLightboxClosing ? "modal-panel-exit" : "modal-panel-enter"
          }`}>
            <button
              onClick={closeProofLightbox}
              className="absolute top-3 right-3 w-8 h-8 bg-black/60 text-white hover:bg-black rounded-full flex items-center justify-center transition-all duration-500"
            >
              <span className="material-symbols-outlined text-[20px] transition-colors duration-500">close</span>
            </button>
            <img
              src={selectedProofUrl}
              alt="Full size proof documentation"
              className="max-w-full max-h-[80vh] object-contain rounded-xl"
            />
          </div>
        </div>,
        document.body
      )}

      {showCancelConfirm && createPortal(
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm ${
          isCancelConfirmClosing ? "unsaved-confirm-backdrop-exit" : "unsaved-confirm-backdrop-enter"
        }`}>
          <div className={`bg-surface border border-outline-variant max-w-sm w-full rounded-2xl p-6 shadow-2xl flex flex-col gap-4 text-center ${
            isCancelConfirmClosing ? "unsaved-confirm-panel-exit" : "unsaved-confirm-panel-enter"
          }`}>
            <span className="material-symbols-outlined text-5xl mx-auto" style={{ color: "#d97706" }}>warning</span>
            <div>
              <h3 className="text-base font-bold text-on-surface">Discard changes?</h3>
              <p className="text-xs text-secondary mt-1.5 leading-relaxed">
                Your edits on this case will be lost if you continue.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => closeCancelConfirm(true)}
                className="btn-primary bg-error hover:bg-red-700 w-full"
              >
                <span className="material-symbols-outlined text-sm">warning</span>
                <span>Discard changes</span>
              </button>
              <button
                type="button"
                onClick={() => closeCancelConfirm(false)}
                className="btn-secondary w-full"
              >
                <span className="material-symbols-outlined text-sm">edit</span>
                <span>Keep editing</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── A4 portrait PDF layout captured via pdfRef ── */}
      {isExporting && createPortal(
        <div
          ref={pdfRef}
          className="cd-pdf-root"
          style={{
            position: "fixed",
            top: 0,
            left: "-200vw",
            width: "210mm",
            margin: 0,
            background: "#ffffff",
            opacity: 1,
            visibility: "visible",
            overflow: "visible",
            pointerEvents: "none",
            zIndex: -9999,
          }}
        >
          {/* ── PAGE 1: Case details ── */}
          <div style={{ width: "210mm", minHeight: "297mm", boxSizing: "border-box", padding: "32px 48px 80px", background: "#fff", position: "relative", fontFamily: "serif" }}>
            {pdfFirstHeader}

            {/* Student Information */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#002F87", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e5e7eb", paddingBottom: 4, marginBottom: 8, fontFamily: "sans-serif" }}>Student Information</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "sans-serif", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                    {["Student Name", "Role", "Grade & Section", "Adviser"].map(h => (
                      <th key={h} style={{ padding: "6px 8px 6px 0", textAlign: "left", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6b7280" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayedRespondents.map((s, idx) => (
                    <tr key={`r${idx}`} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "6px 8px 6px 0", fontWeight: 600, color: "#111827" }}>{s.lastName}, {s.firstName}{s.middleInitial ? ` ${s.middleInitial}.` : ""}</td>
                      <td style={{ padding: "6px 8px 6px 0", color: "#4b5563" }}>{s.role || "Respondent"}</td>
                      <td style={{ padding: "6px 8px 6px 0", color: "#4b5563" }}>{s.level}{s.section ? ` - ${s.section}` : ""}</td>
                      <td style={{ padding: "6px 8px 6px 0", color: "#4b5563" }}>{s.adviser || "—"}</td>
                    </tr>
                  ))}
                  {showComplainant && displayedComplainantSubjects.map((s, idx) => (
                    <tr key={`c${idx}`} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "6px 8px 6px 0", fontWeight: 600, color: "#111827" }}>{s.lastName}, {s.firstName}{s.middleInitial ? ` ${s.middleInitial}.` : ""}</td>
                      <td style={{ padding: "6px 8px 6px 0", color: "#4b5563" }}>{s.role || "Complainant / Subject"}</td>
                      <td style={{ padding: "6px 8px 6px 0", color: "#4b5563" }}>{s.level}{s.section ? ` - ${s.section}` : ""}</td>
                      <td style={{ padding: "6px 8px 6px 0", color: "#4b5563" }}>{s.adviser || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Case metadata */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#002F87", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e5e7eb", paddingBottom: 4, marginBottom: 8, fontFamily: "sans-serif" }}>Case Information</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 32px", fontFamily: "sans-serif", fontSize: 11 }}>
                {caseRecord.title && (
                  <div style={{ display: "flex" }}>
                    <span style={{ width: 120, flexShrink: 0, color: "#6b7280", fontWeight: 700, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em" }}>Case Title</span>
                    <span style={{ color: "#111827" }}>{caseRecord.title}</span>
                  </div>
                )}
                <div style={{ display: "flex" }}>
                  <span style={{ width: 120, flexShrink: 0, color: "#6b7280", fontWeight: 700, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em" }}>Case Type</span>
                  <span style={{ color: "#111827" }}>{caseRecord.case}</span>
                </div>
                <div style={{ display: "flex" }}>
                  <span style={{ width: 120, flexShrink: 0, color: "#6b7280", fontWeight: 700, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em" }}>Date Filed</span>
                  <span style={{ color: "#111827" }}>{formatDateTime(caseRecord.date_filed)}</span>
                </div>
                <div style={{ display: "flex" }}>
                  <span style={{ width: 120, flexShrink: 0, color: "#6b7280", fontWeight: 700, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em" }}>Date of Incident</span>
                  <span style={{ color: "#111827" }}>{formatDate(caseRecord.date)}</span>
                </div>
                <div style={{ display: "flex" }}>
                  <span style={{ width: 120, flexShrink: 0, color: "#6b7280", fontWeight: 700, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</span>
                  <span style={{ ...getBadgeInlineStyle(caseRecord.progress), fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>{caseRecord.progress}</span>
                </div>
              </div>
            </div>

            {/* Description */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#002F87", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e5e7eb", paddingBottom: 4, marginBottom: 8, fontFamily: "sans-serif" }}>Description</div>
              <p style={{ fontSize: 11, color: "#374151", lineHeight: 1.6, whiteSpace: "pre-wrap", textAlign: "justify", fontFamily: "sans-serif", margin: 0 }}>
                {caseRecord.description || "No description provided."}
              </p>
            </div>

            {/* Sanction */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#002F87", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e5e7eb", paddingBottom: 4, marginBottom: 8, fontFamily: "sans-serif" }}>Sanction / Action Taken</div>
              <p style={{ fontSize: 11, color: "#374151", lineHeight: 1.6, whiteSpace: "pre-wrap", textAlign: "justify", fontFamily: "sans-serif", margin: 0 }}>
                {caseRecord.sanction || "No action taken logged yet."}
              </p>
            </div>

            {/* "End of Record" + signature block */}
            <div style={{ marginTop: 40, fontFamily: "sans-serif" }}>
              <div style={{ borderTop: "1px solid #d1d5db", paddingTop: 8, marginBottom: 32, textAlign: "center", fontSize: 9, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.1em" }}>End of Case Record</div>
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

            {pdfFooter(1, 1 + displayedProofs.length)}
          </div>

          {/* ── SUBSEQUENT PAGES: Attachments ── */}
          {displayedProofs.map((proof, idx) => (
            <div key={`pdf-att-${idx}`} style={{ width: "210mm", minHeight: "297mm", boxSizing: "border-box", padding: "32px 48px 80px", background: "#fff", position: "relative", fontFamily: "serif" }}>
              {pdfSmallHeader(`Attachment ${idx + 1}: ${proof.name}`)}
              <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", width: "100%", marginTop: 16 }}>
                <img src={proof.data} alt={proof.name} style={{ maxWidth: "100%", maxHeight: "210mm", objectFit: "contain", border: "1px solid #e5e7eb", borderRadius: 4 }} />
              </div>
              {pdfFooter(idx + 2, 1 + displayedProofs.length)}
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
              <h3 className="text-sm font-bold text-on-surface">Generating PDF</h3>
              <p className="text-xs text-secondary mt-1">This may take a few seconds as we compile page layouts and attachments...</p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
