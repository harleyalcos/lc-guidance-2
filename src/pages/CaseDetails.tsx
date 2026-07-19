import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import html2pdf from "html2pdf.js";
import lcOfficialLogo from "../assets/lc-official-logo.jpg";
import guidanceLogo from "../assets/guidance-logo.png";


interface StudentInfo {
  firstName: string;
  lastName: string;
  middleInitial: string;
  level: string;
  section: string;
  adviser: string;
  role: string;
  sanction?: string;
}

interface CaseRecord {
  id: number;
  students: string;
  date: string;
  date_filed: string;
  case: string;
  description: string;
  sanction: string;
  progress: string;
  proofs: string;
  title: string;
  reporting_student?: string;
  group_id?: string | null;
}

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
const ROLE_OPTIONS = ["Complainant / Subject", "Respondent"];
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

  const handleExportPDF = () => {
    if (!caseRecord || isExporting) return;
    setIsExporting(true);
  };

  useEffect(() => {
    if (!isExporting) return;

    let isMounted = true;
    const runExport = async () => {
      const element = document.querySelector(".case-details-document") as HTMLElement;
      if (!element) {
        setIsExporting(false);
        return;
      }

      const filename = `GC-2026-${caseRecord?.id.toString().padStart(4, "0")}.pdf`;
      const opt = {
        margin: 0,
        filename,
        image: { type: "jpeg" as const, quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#FAF9F5",
          onclone: (clonedDocument: Document) => {
            clonedDocument.documentElement.classList.remove("dark");
          },
        },
        jsPDF: { unit: "in", format: "letter", orientation: "landscape" as const },
        pagebreak: { mode: ["css", "legacy"] }
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
        if (isMounted) {
          setIsExporting(false);
        }
      }
    };

    const timer = setTimeout(() => {
      runExport();
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
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
          return { ...student, [field]: capitalizeWords(student[field]) };
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
          students: data.students,
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

  const saveProofs = useCallback(async (proofs: ProofItem[]) => {
    if (!caseRecord) return;
    await invoke("update_case", {
      id: caseRecord.id,
      students: caseRecord.students,
      date: caseRecord.date,
      dateFiled: caseRecord.date_filed,
      case: caseRecord.case,
      description: caseRecord.description,
      sanction: caseRecord.sanction,
      progress: caseRecord.progress,
      proofs: JSON.stringify(proofs),
      title: caseRecord.title,
      reportingStudent: caseRecord.reporting_student || "",
      groupId: caseRecord.group_id || null
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
        ]);
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
        await saveProofs(uploadedProofs.filter((_, i) => i !== indexToDelete));
      } catch (err) {
        alert("Failed to delete proof: " + err);
      }
    });
  };

  // Handle Save Edits
  const handleSaveEdits = async () => {
    if (!caseRecord) return;
    const date = editForm.date > getTodayDateString() ? getTodayDateString() : editForm.date;
    const normalizedStudents = editForm.students.map(normalizeStudent);
    const normalizedTitle = caseRecord.group_id ? capitalizeWords(editForm.title).slice(0, CASE_TITLE_LIMIT) : "";
    try {
      await invoke("update_case", {
        id: caseRecord.id,
        students: JSON.stringify(normalizedStudents),
        date,
        dateFiled: editForm.date_filed,
        case: normalizeCaseType(editForm.case),
        description: editForm.description.trim().slice(0, TEXT_FIELD_LIMIT),
        sanction: editForm.sanction.trim().slice(0, TEXT_FIELD_LIMIT),
        progress: editForm.progress,
        proofs: caseRecord.proofs,
        title: normalizedTitle,
        reportingStudent: caseRecord.reporting_student || "",
        groupId: caseRecord.group_id || null
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
                className="bg-[#15803d] text-white font-bold py-2 px-5 rounded-lg flex items-center gap-1.5 hover:bg-green-700 transition-colors duration-500 shadow-sm text-xs print:hidden"
              >
                <span className="material-symbols-outlined text-sm transition-colors duration-500">save</span>
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
                className="border border-outline-variant bg-surface text-on-surface font-bold py-2 px-5 rounded-lg flex items-center gap-1.5 hover:bg-surface-container transition-colors duration-500 text-xs print:hidden"
              >
                <span className="material-symbols-outlined text-sm transition-colors duration-500">close</span>
                <span>Cancel</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleExportPDF}
                disabled={isExporting}
                className="border border-outline-variant bg-surface text-on-surface font-bold py-2 px-5 rounded flex items-center gap-1.5 hover:bg-surface-container transition-colors duration-500 text-xs print:hidden disabled:opacity-50"
              >
                {isExporting ? (
                  <>
                    <span className="material-symbols-outlined text-sm transition-colors duration-500 animate-spin">sync</span>
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm transition-colors duration-500">picture_as_pdf</span>
                    <span>Export PDF</span>
                  </>
                )}
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="border border-outline-variant bg-surface text-on-surface font-bold py-2 px-5 rounded flex items-center gap-1.5 hover:bg-surface-container transition-colors duration-500 text-xs print:hidden"
              >
                <span className="material-symbols-outlined text-sm transition-colors duration-500">edit</span>
                <span>Edit</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Guidance Card Document */}
      <div className={`case-details-document bg-[#FAF9F5] dark:bg-surface-container-low relative overflow-hidden flex flex-col mb-8 print:mb-0 print:border-0 print:shadow-none print:rounded-none ${
        isExporting
          ? "border-0 shadow-none rounded-none"
          : "border border-outline-variant rounded shadow-[0px_1px_3px_rgba(0,0,0,0.05)]"
      }`}>
        {/* Official document header */}
        <div className="px-8 py-5 border-b border-outline-variant bg-white shrink-0">
          <div className="grid grid-cols-[92px_1fr_92px] items-center gap-6">
            <img src={lcOfficialLogo} alt="Laguna College Logo" className="w-[78px] h-[78px] object-contain justify-self-start" />
            <div className="text-center text-black" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
              <h2 className="m-0 text-[18px] leading-[20px] font-black uppercase tracking-[0.02em] text-black">LAGUNA COLLEGE</h2>
              <p className="m-0 mt-1 text-[13px] leading-[15px] font-bold text-black">San Pablo City</p>
              <p className="m-0 mt-1 text-[23px] leading-[25px] font-black text-black">Guidance Office</p>
            </div>
            <img src={guidanceLogo} alt="Guidance Office Logo" className="w-[78px] h-[78px] object-contain justify-self-end" />
          </div>

          {!isExporting && isEditing && (
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
                <div key={idx} className="grid grid-cols-1 md:grid-cols-[2.5fr_1fr_1fr_1fr_1.5fr] gap-x-8 gap-y-5 border-b border-outline-variant pb-4 mb-4 last:border-0 last:pb-0 last:mb-0">
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
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">Role</label>
                    <select
                      value={student.role}
                      onChange={(e) => handleEditStudentChange(idx, "role", e.target.value)}
                      className="bg-white dark:bg-surface border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-full"
                    >
                      <option value="" disabled>Select a role</option>
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
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



          {displayedComplainantSubjects.length > 0 && (
            <div className="space-y-4 border-t border-outline-variant/70 pt-8">
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
          <div className="space-y-6 border-t border-outline-variant/70 pt-8">
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

          {!isEditing && !isExporting && (
              <div className="flex justify-end mt-4 print:hidden">
                <div
                  className={`pdf-status-indicator border-[3px] font-black text-lg px-6 py-1.5 rounded uppercase tracking-widest transform -rotate-[6deg] inline-block select-none ${
                    caseRecord.progress.toLowerCase() === "resolved"
                      ? "border-[#15803d] text-[#15803d] dark:border-[#34A06A]/70 dark:text-[#34A06A]"
                      : caseRecord.progress.toLowerCase() === "closed"
                      ? "border-[#4b5563] text-[#4b5563] dark:border-[#9ca3af]/70 dark:text-[#9ca3af]"
                      : caseRecord.progress.toLowerCase() === "reprimand"
                      ? "border-[#dc2626] text-[#dc2626] dark:border-[#ef4444]/70 dark:text-[#ef4444]"
                      : "border-[#d97706] text-[#d97706] dark:border-[#D9A23B]/70 dark:text-[#D9A23B]"
                  }`}
                >
                  {caseRecord.progress}
                </div>
              </div>
            )}
          </div>
        </div>

        {isExporting && (
          <div className="flex justify-end px-8 pb-8 mt-4 shrink-0">
            <div className="w-56 border-t border-outline-variant pt-1 text-center">
              <span className="text-[9px] font-bold text-secondary/65 uppercase tracking-widest">Authorized Signature Area</span>
            </div>
          </div>
        )}

        {/* Dynamic PDF Attachments */}
        {isExporting && displayedProofs.length > 0 && (
          <div className="pdf-attachments-container border-t border-outline-variant/30 pt-8 mt-4">
            {displayedProofs.map((proof, idx) => (
              <div 
                key={`pdf-page-${idx}`} 
                style={{ pageBreakBefore: "always", breakBefore: "page" }}
                className="flex flex-col p-8 bg-[#FAF9F5] dark:bg-surface-container-low min-h-[9.5in] box-border"
              >
                <div className="flex justify-between items-center border-b border-outline-variant/50 pb-3 mb-6 w-full">
                  <h4 className="text-xs font-extrabold text-secondary uppercase tracking-wider">
                    Attachment {idx + 1}: {proof.name}
                  </h4>
                  <span className="text-[10px] text-secondary">
                    {proof.created_at ? new Date(proof.created_at).toLocaleDateString() : ""}
                  </span>
                </div>
                <div className="flex-1 flex justify-center items-center max-h-[7.5in] w-full">
                  <img 
                    src={proof.data} 
                    alt={proof.name} 
                    className="max-w-full max-h-[7.2in] object-contain rounded border border-outline-variant shadow-sm"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attached Proofs Section */}
      <div className="mt-8 print:hidden">
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-section-header text-section-header text-on-surface flex items-center gap-2 font-bold text-lg">
            <span className="material-symbols-outlined text-primary text-xl">attachment</span>
            <span>Documentation & Proofs</span>
          </h3>
          <div>
            <label className="bg-[#0B1E43] dark:bg-primary text-white hover:bg-opacity-95 dark:hover:bg-opacity-80 font-bold text-xs py-2 px-4 rounded transition-all duration-500 cursor-pointer flex items-center gap-1.5 shadow-sm">
              <span className="material-symbols-outlined text-[16px]">upload_file</span>
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
                <button
                  onClick={(e) => handleDeleteProofRequest(e, index)}
                  className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-700 transition-all duration-500 shadow-md"
                >
                  <span className="material-symbols-outlined text-[16px] transition-colors duration-500">delete</span>
                </button>
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2.5 text-white text-xs truncate font-medium">
                  {proof.name}
                </div>
              </div>
            ))}
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
                onClick={() => closeDeleteProofConfirm()}
                className="flex-1 py-2.5 border border-outline-variant text-on-surface font-bold text-xs rounded-xl hover:bg-surface-container transition-colors duration-500"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteProof}
                className="flex-1 py-2.5 bg-error text-white font-bold text-xs rounded-xl hover:bg-[#b91c1c] transition-colors duration-500"
              >
                Delete
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
              className="absolute top-3 right-3 bg-black/60 text-white hover:bg-black rounded-full p-2 transition-all duration-500"
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
                onClick={() => closeCancelConfirm(true)}
                className="w-full py-2.5 bg-[#0B1E43] text-white font-bold text-xs rounded-xl hover:bg-[#0F2451] transition-colors duration-500"
              >
                Discard changes
              </button>
              <button
                onClick={() => closeCancelConfirm(false)}
                className="w-full py-2.5 border border-outline-variant text-on-surface font-bold text-xs rounded-xl hover:bg-surface-container transition-colors duration-500"
              >
                Keep editing
              </button>
            </div>
          </div>
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
