import { useState, useEffect, Fragment, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ProofItem {
  name: string;
  data: string;
  created_at?: string;
}

interface FileNewCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCaseFiled?: () => void;
}

type StudentInfo = {
  firstName: string;
  lastName: string;
  middleInitial: string;
  level: string;
  section: string;
  adviser: string;
  sanction: string;
  role: string;
};

// ── Case category data ──────────────────────────────────────────────────────
const CASE_CATEGORIES = [
  {
    id: "academic",
    label: "Academic",
    color: "#185FA5",
    bg: "#E6F1FB",
    border: "#B5D4F4",
    cases: [
      "Poor academic performance",
      "Learning difficulties",
      "Study skills & habits",
      "Absenteeism / tardiness",
      "Course selection",
      "Dropout prevention",
    ],
  },
  {
    id: "personal",
    label: "Personal / Social",
    color: "#0F6E56",
    bg: "#E1F5EE",
    border: "#9FE1CB",
    cases: [
      "Peer relationship issues",
      "Family problems",
      "Self-esteem & identity",
      "Adjustment difficulties",
      "Grief & loss",
      "Gender & sexuality",
      "Substance use",
      "Social media issues",
    ],
  },
  {
    id: "behavioural",
    label: "Behavioural",
    color: "#854F0B",
    bg: "#FAEEDA",
    border: "#FAC775",
    cases: [
      "Defiance / non-compliance",
      "Classroom disruption",
      "Bullying",
      "Truancy / skipping",
      "Vandalism / property damage",
      "Theft & dishonesty",
      "Inappropriate language",
      "Gang-related behaviour",
      "Substance possession",
    ],
  },
  {
    id: "crisis",
    label: "Crisis, Violence & Mental Health",
    color: "#A32D2D",
    bg: "#FCEBEB",
    border: "#F7C1C1",
    cases: [
      "Physical fighting",
      "Assault on staff",
      "Weapons possession",
      "Threats & intimidation",
      "Self-harm & suicide risk",
      "Sexual harassment",
      "Anxiety & depression",
      "Trauma & abuse",
      "Crisis intervention",
    ],
  },
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
const OTHER_CASE_CATEGORY = {
  id: "other",
  label: "Other",
  color: "#4D5A66",
  bg: "#EDF3F8",
  border: "#C8D7E4",
};

// ── Helper ──────────────────────────────────────────────────────────────────
function getCategoryForCase(caseStr: string) {
  const normalizedCase = collapseSpaces(caseStr).toLowerCase();
  for (const cat of CASE_CATEGORIES) {
    if (cat.cases.some((caseName) => caseName.toLowerCase() === normalizedCase)) return cat;
  }
  return null;
}

const getTodayDateTimeString = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

const emptyStudentInfo = (): StudentInfo => ({
  firstName: "",
  lastName: "",
  middleInitial: "",
  level: "",
  section: "",
  adviser: "",
  sanction: "",
  role: "",
});

const emptyFormData = () => ({
  ...emptyStudentInfo(),
  role: "Respondent",
  date: getTodayDateTimeString(),
  case: "",
  caseCategory: "",
  description: "",
  progress: "Pending",
  title: "",
  additionalStudents: [] as StudentInfo[],
  uploadedProofs: [] as ProofItem[],
});

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
    if (grade >= 7 && grade <= 12) return `Grade ${grade}`;
  }
  return capitalizeWords(cleaned).slice(0, GRADE_LEVEL_LIMIT);
};

const normalizeSection = (value: string) => {
  const cleaned = collapseSpaces(value);
  const upper = cleaned.toUpperCase();
  if (SECTION_OPTIONS.includes(upper)) return upper.slice(0, SECTION_LIMIT);
  return capitalizeWords(cleaned).slice(0, SECTION_LIMIT);
};

const normalizeRole = (value: string | undefined, fallback = "") => {
  const normalized = capitalizeWords(value ?? "");
  const lower = normalized.toLowerCase();
  if (!normalized) return fallback;
  if (lower === "reporter") return "Respondent";
  if (lower === "accused" || lower === "respondent") return "Respondent";
  if (lower === "complainant" || lower === "complainant / subject") return "Complainant / Subject";
  return normalized;
};

const isComplainantSubject = (student: StudentInfo) => normalizeRole(student.role) === "Complainant / Subject";
const isRespondent = (student: StudentInfo) => normalizeRole(student.role, "Respondent") === "Respondent";

const getFieldLimit = (key: string) => {
  if (key === "adviser") return ADVISER_LIMIT;
  if (key === "level") return GRADE_LEVEL_LIMIT;
  if (key === "section") return SECTION_LIMIT;
  if (key === "case") return CASE_TYPE_LIMIT;
  return undefined;
};

const limitFieldValue = (key: string, value: string) => {
  const limit = getFieldLimit(key);
  return limit ? value.slice(0, limit) : value;
};

const normalizeStudentInfo = (data: ReturnType<typeof emptyFormData>) => ({
  ...data,
  title: capitalizeWords(data.title).slice(0, CASE_TITLE_LIMIT),
  firstName: capitalizeWords(data.firstName),
  lastName: capitalizeWords(data.lastName),
  middleInitial: normalizeMiddleInitial(data.middleInitial),
  level: normalizeGradeLevel(data.level),
  section: normalizeSection(data.section),
  adviser: capitalizeWords(data.adviser).slice(0, ADVISER_LIMIT),
  sanction: data.sanction.slice(0, TEXT_FIELD_LIMIT),
  role: data.additionalStudents.length === 0 ? "Respondent" : normalizeRole(data.role, "Respondent"),
  additionalStudents: data.additionalStudents.map((student) => normalizeStudent(student)),
});

const normalizeStudent = (student: StudentInfo): StudentInfo => ({
  firstName: capitalizeWords(student.firstName),
  lastName: capitalizeWords(student.lastName),
  middleInitial: normalizeMiddleInitial(student.middleInitial),
  level: normalizeGradeLevel(student.level),
  section: normalizeSection(student.section),
  adviser: capitalizeWords(student.adviser).slice(0, ADVISER_LIMIT),
  sanction: (student.sanction ?? "").slice(0, TEXT_FIELD_LIMIT),
  role: normalizeRole(student.role),
});

const isStudentComplete = (student: StudentInfo) =>
  Boolean(
    student.lastName.trim() &&
    student.firstName.trim() &&
    student.level.trim() &&
    student.section.trim() &&
    student.adviser.trim() &&
    student.role.trim()
  );

// ── Component ───────────────────────────────────────────────────────────────
export default function FileNewCaseModal({ isOpen, onClose, onCaseFiled }: FileNewCaseModalProps) {
  const [isVisible, setIsVisible] = useState(isOpen);
  const [currentStep, setCurrentStep] = useState(1);
  const [isEditingReview, setIsEditingReview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [isToastVisible, setIsToastVisible] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [isConfirmCloseClosing, setIsConfirmCloseClosing] = useState(false);
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);
  const [isProofLightboxClosing, setIsProofLightboxClosing] = useState(false);
  const [deleteProofIndex, setDeleteProofIndex] = useState<number | null>(null);
  const [isDeleteProofConfirmClosing, setIsDeleteProofConfirmClosing] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>("behavioural");
  const [removingAdditionalStudents, setRemovingAdditionalStudents] = useState<StudentInfo[]>([]);
  const toastTimerRef = useRef<number | null>(null);

  const [formData, setFormData] = useState(emptyFormData);
  const isPrimaryRoleLocked = formData.additionalStudents.length === 0;

  useEffect(() => {
    if (isPrimaryRoleLocked && formData.role !== "Respondent") {
      setFormData((p) => ({ ...p, role: "Respondent" }));
    }
  }, [isPrimaryRoleLocked, formData.role]);

  const isFormEmpty = () =>
    !formData.firstName.trim() &&
    !formData.lastName.trim() &&
    !formData.middleInitial.trim() &&
    !formData.case.trim() &&
    !formData.description.trim() &&
    !formData.sanction.trim() &&
    !formData.level.trim() &&
    !formData.section.trim() &&
    !formData.adviser.trim() &&
    formData.additionalStudents.length === 0 &&
    formData.uploadedProofs.length === 0;

  const showToast = (message: string) => {
    setToastMessage(message);
    setIsToastVisible(false);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    window.requestAnimationFrame(() => setIsToastVisible(true));
    toastTimerRef.current = window.setTimeout(() => {
      setIsToastVisible(false);
      window.setTimeout(() => setToastMessage(""), 1000);
    }, 2800);
  };

  const handleCloseAttempt = () => {
    if (!isFormEmpty()) {
      setIsConfirmCloseClosing(false);
      setShowConfirmClose(true);
    }
    else onClose();
  };

  const closeConfirmClose = (afterClose?: () => void) => {
    setIsConfirmCloseClosing(true);
    window.setTimeout(() => {
      setShowConfirmClose(false);
      setIsConfirmCloseClosing(false);
      afterClose?.();
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

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    } else {
      const timer = window.setTimeout(() => setIsVisible(false), 220);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setShowConfirmClose(false);
      setIsConfirmCloseClosing(false);
      setIsEditingReview(false);
      setSubmitError("");
      setToastMessage("");
      setIsToastVisible(false);
      setSelectedProofUrl(null);
      setIsProofLightboxClosing(false);
      setDeleteProofIndex(null);
      setIsDeleteProofConfirmClosing(false);
      setRemovingAdditionalStudents([]);
      const saved = localStorage.getItem("new_case_draft");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const base = { ...emptyFormData(), ...parsed };
          setFormData({
            ...base,
            role: normalizeRole(parsed.role, "Respondent"),
            title: (parsed.title ?? "").slice(0, CASE_TITLE_LIMIT),
            sanction: parsed.sanction ?? "",
            additionalStudents: Array.isArray(parsed.additionalStudents)
              ? parsed.additionalStudents.map((student: StudentInfo) => ({ ...emptyStudentInfo(), ...student, sanction: student.sanction ?? "", role: normalizeRole(student.role) }))
              : [],
          });
          const cat = getCategoryForCase(parsed.case);
          if (cat) setExpandedCategory(cat.id);
        } catch {}
      } else {
        setFormData(emptyFormData());
        setExpandedCategory("behavioural");
      }
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleSelectCase = (categoryId: string, caseName: string) => {
    setFormData((p) => ({ ...p, case: caseName, caseCategory: categoryId }));
  };



  const handleUploadProof = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((p) => ({
        ...p,
        uploadedProofs: [...p.uploadedProofs, { name: file.name, data: reader.result as string }],
      }));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleDeleteProofRequest = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setIsDeleteProofConfirmClosing(false);
    setDeleteProofIndex(index);
  };

  const confirmDeleteProof = () => {
    if (deleteProofIndex === null) return;
    const indexToDelete = deleteProofIndex;
    closeDeleteProofConfirm(() => {
      setFormData((p) => ({ ...p, uploadedProofs: p.uploadedProofs.filter((_, i) => i !== indexToDelete) }));
    });
  };

  const handleAddStudent = () => {
    setFormData((p) => ({ ...p, additionalStudents: [...p.additionalStudents, emptyStudentInfo()] }));
  };

  const handleAdditionalStudentChange = (index: number, field: keyof StudentInfo, value: string) => {
    let processedValue = value;
    if (field === "firstName" || field === "lastName" || field === "adviser") {
      processedValue = autoCapitalize(value);
    } else if (field === "middleInitial") {
      processedValue = value.replace(/\s+/g, "").toUpperCase();
    }
    if (field === "adviser") processedValue = processedValue.slice(0, ADVISER_LIMIT);
    if (field === "level") processedValue = processedValue.slice(0, GRADE_LEVEL_LIMIT);
    if (field === "section") processedValue = processedValue.slice(0, SECTION_LIMIT);

    setFormData((p) => ({
      ...p,
      additionalStudents: p.additionalStudents.map((student, studentIndex) =>
        studentIndex === index ? { ...student, [field]: processedValue } : student
      ),
    }));
  };

  const handleAdditionalStudentBlur = (index: number, field: keyof StudentInfo) => {
    setFormData((p) => ({
      ...p,
      additionalStudents: p.additionalStudents.map((student, studentIndex) => {
        if (studentIndex !== index) return student;
        if (field === "firstName" || field === "lastName" || field === "role") {
          return { ...student, [field]: capitalizeWords(student[field]) };
        }
        if (field === "adviser") {
          return { ...student, adviser: capitalizeWords(student.adviser).slice(0, ADVISER_LIMIT) };
        }
        if (field === "middleInitial") return { ...student, middleInitial: normalizeMiddleInitial(student.middleInitial) };
        if (field === "level") return { ...student, level: normalizeGradeLevel(student.level) };
        if (field === "section") return { ...student, section: normalizeSection(student.section) };
        return student;
      }),
    }));
  };

  const handleRemoveAdditionalStudent = (studentToRemove: StudentInfo) => {
    if (removingAdditionalStudents.includes(studentToRemove)) return;
    setRemovingAdditionalStudents((students) => [...students, studentToRemove]);
    window.setTimeout(() => {
      setFormData((p) => ({
        ...p,
        additionalStudents: p.additionalStudents.filter((student) => student !== studentToRemove),
      }));
      setRemovingAdditionalStudents((students) => students.filter((student) => student !== studentToRemove));
    }, 500);
  };

  const handleNext = () => {
    setIsEditingReview(false);
    setSubmitError("");
    if (currentStep === 1) {
      const normalizedCase = normalizeCaseType(formData.case);
      const matchedCategory = getCategoryForCase(normalizedCase);
      setFormData((p) => ({
        ...p,
        case: normalizedCase,
        caseCategory: matchedCategory?.id ?? (normalizedCase ? "other" : ""),
      }));
      if (!normalizedCase.trim()) {
        showToast("Please fill out the required case type field.");
        return;
      }
    }
    if (currentStep === 2) {
      const normalized = normalizeStudentInfo(formData);
      setFormData(normalized);
      const requiredFields = [
        normalized.date,
        normalized.progress,
        normalized.lastName,
        normalized.firstName,
        normalized.level,
        normalized.section,
        normalized.adviser,
        normalized.role,
      ];

      if (requiredFields.some((value) => !value.trim()) || normalized.additionalStudents.some((student) => !isStudentComplete(student))) {
        showToast("Please fill out all required fields before continuing.");
        return;
      }
      if (normalized.date > getTodayDateTimeString()) {
        showToast("Date & Time of incident cannot be later than current time.");
        return;
      }
    }
    if (currentStep === 3 && formData.additionalStudents.length > 0) {
      const normalizedTitle = capitalizeWords(formData.title).slice(0, CASE_TITLE_LIMIT);
      setFormData((p) => ({ ...p, title: normalizedTitle }));
      if (!normalizedTitle) {
        showToast("Case Title is required when multiple students are involved.");
        return;
      }
    }
    setCurrentStep((s) => Math.min(s + 1, 4));
  };
  const handleBack = () => {
    setIsEditingReview(false);
    setSubmitError("");
    setCurrentStep((s) => Math.max(s - 1, 1));
  };

  const resetForm = () => {
    setCurrentStep(1);
    setIsEditingReview(false);
    setSubmitError("");
    setExpandedCategory("behavioural");
    setToastMessage("");
    setFormData(emptyFormData());
  };

  const handleFileCase = async () => {
    setSubmitError("");
    const normalized = normalizeStudentInfo(formData);
    const normalizedCase = normalizeCaseType(normalized.case);
    const matchedCategory = getCategoryForCase(normalizedCase);
    normalized.case = normalizedCase;
    normalized.caseCategory = matchedCategory?.id ?? (normalizedCase ? "other" : "");
    setFormData(normalized);
    if (!normalized.case.trim()) {
      showToast("Please fill out the required case type field.");
      setCurrentStep(1);
      return;
    }
    if (
      !normalized.date.trim() ||
      !normalized.progress.trim() ||
      !normalized.lastName.trim() ||
      !normalized.firstName.trim() ||
      !normalized.level.trim() ||
      !normalized.section.trim() ||
      !normalized.adviser.trim() ||
      !normalized.role.trim() ||
      normalized.additionalStudents.some((student) => !isStudentComplete(student))
    ) {
      showToast("Please fill out all required fields before filing.");
      setCurrentStep(2);
      return;
    }
    if (normalized.date > getTodayDateTimeString()) {
      showToast("Date & Time of incident cannot be later than current time.");
      setCurrentStep(2);
      return;
    }
    if (normalized.additionalStudents.length > 0 && !normalized.title.trim()) {
      showToast("Case Title is required when multiple students are involved.");
      setCurrentStep(3);
      return;
    }
    setIsSubmitting(true);
    try {
      const students = [
        {
          firstName: normalized.firstName,
          lastName: normalized.lastName,
          middleInitial: normalized.middleInitial,
          level: normalized.level,
          section: normalized.section,
          adviser: normalized.adviser,
          sanction: normalized.sanction,
          role: normalizeRole(normalized.role, "Respondent"),
        },
        ...normalized.additionalStudents,
      ];
      const respondents = students.filter(isRespondent);
      const complainantSubjects = students.filter(isComplainantSubject);
      const isGroupedCase = respondents.length > 1;
      if (respondents.length === 0) {
        showToast("At least one respondent is required before filing.");
        setCurrentStep(2);
        setIsSubmitting(false);
        return;
      }
      const dateFiled = new Date().toISOString();
      const proofs = JSON.stringify(normalized.uploadedProofs.map((proof) => ({
        ...proof,
        created_at: proof.created_at ?? dateFiled,
      })));

      if (students.length > 1) {
        const groupId = crypto.randomUUID();
        for (const student of respondents) {
          const caseStudents = [student, ...complainantSubjects];
          await invoke<number>("add_case", {
            students: JSON.stringify(caseStudents),
            date: normalized.date,
            dateFiled,
            case: normalized.case.trim(),
            description: normalized.description.trim().slice(0, TEXT_FIELD_LIMIT),
            sanction: student.sanction.trim().slice(0, TEXT_FIELD_LIMIT),
            progress: normalized.progress,
            proofs,
            title: isGroupedCase ? normalized.title.trim() : "",
            reportingStudent: "",
            groupId: isGroupedCase ? groupId : null,
          });
        }
      } else {
        await invoke<number>("add_case", {
          students: JSON.stringify(students),
          date: normalized.date,
          dateFiled,
          case: normalized.case.trim(),
          description: normalized.description.trim().slice(0, TEXT_FIELD_LIMIT),
          sanction: students[0].sanction.trim().slice(0, TEXT_FIELD_LIMIT),
          progress: normalized.progress,
          proofs,
          title: "",
          reportingStudent: "",
          groupId: null,
        });
      }

      localStorage.removeItem("new_case_draft");

      const autoBackup = localStorage.getItem("backup_settings_auto") !== "false";
      const freq = localStorage.getItem("backup_settings_freq") || "Daily";
      if (autoBackup && freq === "On New Record") {
        try { await invoke("create_backup", { isManual: false }); } catch {}
      }

      window.dispatchEvent(new Event("cases:changed"));
      onCaseFiled?.();
      onClose();
      resetForm();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen && !isVisible) return null;

  const STEPS = ["Case type", "Students and report source", "Proofs and Description", "Review"];
  const activeCat = getCategoryForCase(formData.case);
  const displayCat = formData.case.trim() ? activeCat ?? OTHER_CASE_CATEGORY : null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ease-out ${isOpen ? "opacity-100 new-case-modal-backdrop-enter" : "opacity-0 pointer-events-none modal-backdrop-exit"}`}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCloseAttempt} />

      {/* Panel */}
      <div className={`relative w-full max-w-[960px] bg-surface-container-low rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden transition-all duration-200 ease-out ${isOpen ? "translate-y-0 scale-100 opacity-100 new-case-modal-panel-enter" : "translate-y-4 scale-[0.98] opacity-0 modal-panel-exit"}`}>

        {/* ── Header ── */}
        <div className="px-7 py-4 bg-surface flex items-center justify-between border-b border-outline-variant shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0B1E43] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-white" style={{ fontSize: 18 }}>folder_open</span>
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase text-secondary">Guidance Office</p>
              <h2 className="text-[19px] font-extrabold text-on-surface leading-tight">File New Case</h2>
            </div>
          </div>
          <button onClick={handleCloseAttempt} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-container text-secondary hover:text-on-surface transition-colors duration-500">
            <span className="material-symbols-outlined transition-colors duration-500" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        {/* ── Step Progress Bar ── */}
        <div className="px-7 py-2.5 bg-surface border-b border-outline-variant shrink-0">
          <div className="flex items-center w-full max-w-2xl mx-auto px-4">
            {STEPS.map((label, idx) => {
              const n = idx + 1;
              const isActive = currentStep === n;
              const isDone = currentStep > n;
              return (
                <Fragment key={idx}>
                  <div className={`flex items-center gap-2 shrink-0 py-1.5 px-2.5 rounded-xl transition-all ${isActive ? "bg-[#0B1E43]/6" : ""}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-all ${
                      isDone ? "bg-[#0B1E43] text-white" : isActive ? "bg-[#0B1E43] text-white" : "bg-surface-container text-secondary border border-outline-variant"
                    }`}>
                      {isDone ? (
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check</span>
                      ) : (
                        n
                      )}
                    </div>
                    <span className={`text-xs sm:text-[13px] font-bold transition-colors ${isActive ? "text-on-surface" : "text-secondary"}`}>
                      {label}
                    </span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className={`h-px flex-grow mx-2 sm:mx-4 transition-colors ${isDone ? "bg-[#0B1E43]/40" : "bg-outline-variant"}`} />
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto flex-grow px-7 py-5 bg-surface-container-low">
          <datalist id="grade-level-options">
            {GRADE_LEVEL_OPTIONS.map((option) => <option key={option} value={option} />)}
          </datalist>
          <datalist id="section-options">
            {SECTION_OPTIONS.map((option) => <option key={option} value={option} />)}
          </datalist>


          {/* STEP 1 — Case Type Picker */}
          {currentStep === 1 && (
            <div className="flex flex-col gap-4 max-w-2xl mx-auto animate-fade-in">

              <div className="bg-surface rounded-xl border border-outline-variant p-4">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-secondary uppercase tracking-wider mb-2">
                  Case type
                  <span className="material-symbols-outlined text-error" style={{ fontSize: 10 }}>emergency</span>
                </label>
                <input
                  type="text"
                  placeholder="Select a case type below, or type a custom description."
                  value={formData.case}
                  maxLength={CASE_TYPE_LIMIT}
                  onChange={(e) => setFormData((p) => ({ ...p, case: e.target.value.slice(0, CASE_TYPE_LIMIT), caseCategory: "custom" }))}
                  onBlur={() => setFormData((p) => {
                    const normalizedCase = normalizeCaseType(p.case);
                    const matchedCategory = getCategoryForCase(normalizedCase);
                    return {
                      ...p,
                      case: normalizedCase,
                      caseCategory: matchedCategory?.id ?? (normalizedCase ? "other" : ""),
                    };
                  })}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-2 px-3 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                />
                <p className="mt-1 text-right text-[10px] font-medium text-secondary">
                  {formData.case.length}/{CASE_TYPE_LIMIT}
                </p>
                {displayCat && (
                  <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full"
                    style={{ background: displayCat.bg, color: displayCat.color, border: `1px solid ${displayCat.border}` }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>check_circle</span>
                    {displayCat.label}
                  </div>
                )}
              </div>

              {/* Category accordion */}
              <div className="flex flex-col gap-2">
                {CASE_CATEGORIES.map((cat) => {
                  const isOpen = expandedCategory === cat.id;
                  return (
                    <div key={cat.id} className="rounded-xl border border-outline-variant bg-surface overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedCategory(isOpen ? null : cat.id)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-container transition-colors duration-500"
                      >
                        <div className="flex items-center gap-2.5 transition-colors duration-500">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0 transition-colors duration-500" style={{ background: cat.color }} />
                          <span className="text-sm font-bold text-on-surface transition-colors duration-500">{cat.label}</span>
                          <span className="text-[11px] text-secondary transition-colors duration-500">({cat.cases.length})</span>
                        </div>
                        <span className="material-symbols-outlined text-secondary transition-transform duration-500" style={{ fontSize: 18, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                          expand_more
                        </span>
                      </button>
                      <div className={`grid transition-all duration-200 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                        <div className="overflow-hidden">
                          <div className="px-4 pb-3 pt-0 grid grid-cols-2 gap-1.5">
                            {cat.cases.map((c) => {
                              const isSelected = formData.case === c;
                              return (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => handleSelectCase(cat.id, c)}
                                  className={`center-fill-option text-left text-xs px-3 py-2 rounded-lg border transition-all duration-500 font-medium ${isSelected ? "center-fill-option-selected" : ""}`}
                                  style={isSelected
                                    ? { background: cat.bg, borderColor: cat.color, color: cat.color }
                                    : { background: "transparent", borderColor: "var(--outline-variant, #cac4d0)", color: "var(--on-surface, #1c1b1f)", ["--fill-hover-bg" as string]: cat.bg, ["--fill-hover-border" as string]: cat.border }
                                  }
                                >
                                  <span className="relative z-10 transition-colors duration-500">{c}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          )}

          {/* STEP 2 — Incident Details + Student Info */}
          {currentStep === 2 && (
            <div className="flex flex-col gap-4 max-w-2xl mx-auto animate-fade-in">

              {/* Case badge reminder */}
              {displayCat && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold"
                  style={{ background: displayCat.bg, color: displayCat.color, border: `1px solid ${displayCat.border}` }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>label</span>
                  {formData.case}
                </div>
              )}

              {/* Incident block */}
              <div className="bg-surface rounded-xl border border-outline-variant p-5">
                <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-3">Incident details</p>
                <div className="flex flex-col gap-4">
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider">
                        Date & Time of incident
                        <span className="material-symbols-outlined text-error" style={{ fontSize: 10 }}>emergency</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, date: getTodayDateTimeString() })}
                        className="text-[10px] font-bold text-primary hover:text-primary-hover uppercase tracking-wider bg-primary/5 hover:bg-primary/10 px-2 py-0.5 rounded transition-colors"
                      >
                        Set to Today/Now
                      </button>
                    </div>
                    <input
                      type="datetime-local"
                      value={formData.date}
                      max={getTodayDateTimeString()}
                      onChange={(e) => {
                        const nextDate = e.target.value;
                        if (nextDate > getTodayDateTimeString()) {
                          showToast("Date & Time of incident cannot be later than current time.");
                          setFormData({ ...formData, date: getTodayDateTimeString() });
                          return;
                        }
                        setFormData({ ...formData, date: nextDate });
                      }}
                      className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-2 px-3 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider mb-2">
                      Case status
                      <span className="material-symbols-outlined text-error" style={{ fontSize: 10 }}>emergency</span>
                    </label>
                    <div className="flex gap-2">
                      {PROGRESS_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setFormData({ ...formData, progress: opt.value })}
                          className={`center-fill-option flex-1 py-2.5 px-3 rounded-xl text-xs font-bold border transition-all duration-500 text-center ${formData.progress === opt.value ? "center-fill-option-selected" : ""}`}
                          style={formData.progress === opt.value
                            ? { background: opt.bg, borderColor: opt.dot, color: opt.text }
                            : { background: "transparent", borderColor: "var(--outline-variant)", color: "var(--on-surface-variant)", ["--fill-hover-bg" as string]: opt.bg, ["--fill-hover-border" as string]: opt.border }
                          }
                        >
                          <div className="relative z-10 text-center transition-colors duration-500">
                            {opt.label}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  
                </div>
              </div>



              {/* Student block */}
              <div className="bg-surface rounded-xl border border-outline-variant p-5">
                <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-3">Student(s) involved</p>
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider mb-1.5">
                        Last name
                        <span className="material-symbols-outlined text-error" style={{ fontSize: 10 }}>emergency</span>
                      </label>
                      <input
                        type="text" placeholder="e.g. Dela Cruz"
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: autoCapitalize(e.target.value) })}
                        onBlur={() => setFormData((p) => ({ ...p, lastName: capitalizeWords(p.lastName) }))}
                        className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-2 px-3 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider mb-1.5">
                        First name
                        <span className="material-symbols-outlined text-error" style={{ fontSize: 10 }}>emergency</span>
                      </label>
                      <input
                        type="text" placeholder="e.g. Juan"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: autoCapitalize(e.target.value) })}
                        onBlur={() => setFormData((p) => ({ ...p, firstName: capitalizeWords(p.firstName) }))}
                        className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-2 px-3 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-secondary uppercase tracking-wider mb-1.5">Middle initial</label>
                      <input
                        type="text" placeholder="e.g. M"
                        maxLength={3}
                        value={formData.middleInitial}
                        onChange={(e) => setFormData({ ...formData, middleInitial: e.target.value.replace(/\s+/g, "").toUpperCase() })}
                        onBlur={() => setFormData((p) => ({ ...p, middleInitial: normalizeMiddleInitial(p.middleInitial) }))}
                        className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-2 px-3 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider mb-1.5">
                        Role
                        <span className="material-symbols-outlined text-error" style={{ fontSize: 10 }}>emergency</span>
                      </label>
                      <select
                        value={formData.role}
                        disabled={isPrimaryRoleLocked}
                        title={isPrimaryRoleLocked ? "Add another student to change the role." : undefined}
                        onChange={(e) => {
                          if (isPrimaryRoleLocked) return;
                          setFormData({ ...formData, role: e.target.value });
                        }}
                        className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-2 px-3 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider mb-1.5">
                      Grade level
                      <span className="material-symbols-outlined text-error" style={{ fontSize: 10 }}>emergency</span>
                    </label>
                    <input
                      type="text" placeholder="e.g. Grade 10"
                      list="grade-level-options"
                      value={formData.level}
                      maxLength={GRADE_LEVEL_LIMIT}
                      onChange={(e) => setFormData({ ...formData, level: e.target.value.slice(0, GRADE_LEVEL_LIMIT) })}
                      onBlur={() => setFormData((p) => ({ ...p, level: normalizeGradeLevel(p.level) }))}
                      className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-2 px-3 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                    <p className="mt-1 text-right text-[10px] font-medium text-secondary">
                      {formData.level.length}/{GRADE_LEVEL_LIMIT}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider mb-1.5">
                        Section
                        <span className="material-symbols-outlined text-error" style={{ fontSize: 10 }}>emergency</span>
                      </label>
                      <input
                        type="text" placeholder="e.g. STEM"
                        list="section-options"
                        value={formData.section}
                        maxLength={SECTION_LIMIT}
                        onChange={(e) => setFormData({ ...formData, section: e.target.value.slice(0, SECTION_LIMIT) })}
                        onBlur={() => setFormData((p) => ({ ...p, section: normalizeSection(p.section) }))}
                        className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-2 px-3 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                      />
                      <p className="mt-1 text-right text-[10px] font-medium text-secondary">
                        {formData.section.length}/{SECTION_LIMIT}
                      </p>
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider mb-1.5">
                        Adviser
                        <span className="material-symbols-outlined text-error" style={{ fontSize: 10 }}>emergency</span>
                      </label>
                      <input
                        type="text" placeholder="e.g. Mr. Santos"
                        value={formData.adviser}
                        maxLength={ADVISER_LIMIT}
                        onChange={(e) => setFormData({ ...formData, adviser: autoCapitalize(e.target.value).slice(0, ADVISER_LIMIT) })}
                        onBlur={() => setFormData((p) => ({ ...p, adviser: capitalizeWords(p.adviser).slice(0, ADVISER_LIMIT) }))}
                        className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-2 px-3 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                      />
                      <p className="mt-1 text-right text-[10px] font-medium text-secondary">
                        {formData.adviser.length}/{ADVISER_LIMIT}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider mb-1.5">
                      Sanction / action taken
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Describe the sanction or action taken…"
                      value={formData.sanction}
                      maxLength={TEXT_FIELD_LIMIT}
                      onChange={(e) => setFormData({ ...formData, sanction: e.target.value.slice(0, TEXT_FIELD_LIMIT) })}
                      className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-2 px-3 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none resize-none"
                    />
                    <p className="mt-1 text-right text-[10px] font-medium text-secondary">
                      {formData.sanction.length}/{TEXT_FIELD_LIMIT}
                    </p>
                  </div>
                </div>
              </div>

              {formData.additionalStudents.map((student, index) => {
                const isRemoving = removingAdditionalStudents.includes(student);
                return (
                <div
                  key={index}
                  className={`additional-student-card bg-surface rounded-xl border border-outline-variant p-5 ${
                    isRemoving ? "additional-student-card-exit pointer-events-none" : "additional-student-card-enter"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Student involved {index + 2}</p>
                    <button
                      type="button"
                      onClick={() => handleRemoveAdditionalStudent(student)}
                      className="flex items-center gap-1 text-[10px] font-bold text-error hover:text-on-error-container hover:bg-error-container/60 px-2 py-1 rounded-lg transition-colors duration-500"
                    >
                      <span className="material-symbols-outlined transition-colors duration-500" style={{ fontSize: 13 }}>close</span>
                      Remove
                    </button>
                  </div>
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider mb-1.5">
                          Last name
                          <span className="material-symbols-outlined text-error" style={{ fontSize: 10 }}>emergency</span>
                        </label>
                        <input
                          type="text" placeholder="e.g. Dela Cruz"
                          value={student.lastName}
                          onChange={(e) => handleAdditionalStudentChange(index, "lastName", autoCapitalize(e.target.value))}
                          onBlur={() => handleAdditionalStudentBlur(index, "lastName")}
                          className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-2 px-3 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider mb-1.5">
                          First name
                          <span className="material-symbols-outlined text-error" style={{ fontSize: 10 }}>emergency</span>
                        </label>
                        <input
                          type="text" placeholder="e.g. Juan"
                          value={student.firstName}
                          onChange={(e) => handleAdditionalStudentChange(index, "firstName", autoCapitalize(e.target.value))}
                          onBlur={() => handleAdditionalStudentBlur(index, "firstName")}
                          className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-2 px-3 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-secondary uppercase tracking-wider mb-1.5">Middle initial</label>
                        <input
                          type="text" placeholder="e.g. M"
                          maxLength={3}
                          value={student.middleInitial}
                          onChange={(e) => handleAdditionalStudentChange(index, "middleInitial", e.target.value.replace(/\s+/g, "").toUpperCase())}
                          onBlur={() => handleAdditionalStudentBlur(index, "middleInitial")}
                          className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-2 px-3 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider mb-1.5">
                          Role
                          <span className="material-symbols-outlined text-error" style={{ fontSize: 10 }}>emergency</span>
                        </label>
                        <select
                          value={student.role}
                          onChange={(e) => handleAdditionalStudentChange(index, "role", e.target.value)}
                          className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-2 px-3 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                        >
                          <option value="" disabled>Select a role</option>
                          {ROLE_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider mb-1.5">
                        Grade level
                        <span className="material-symbols-outlined text-error" style={{ fontSize: 10 }}>emergency</span>
                      </label>
                        <input
                          type="text" placeholder="e.g. Grade 10"
                          list="grade-level-options"
                          value={student.level}
                          maxLength={GRADE_LEVEL_LIMIT}
                          onChange={(e) => handleAdditionalStudentChange(index, "level", e.target.value)}
                          onBlur={() => handleAdditionalStudentBlur(index, "level")}
                          className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-2 px-3 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                        />
                        <p className="mt-1 text-right text-[10px] font-medium text-secondary">
                          {student.level.length}/{GRADE_LEVEL_LIMIT}
                        </p>
                      </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider mb-1.5">
                          Section
                          <span className="material-symbols-outlined text-error" style={{ fontSize: 10 }}>emergency</span>
                        </label>
                        <input
                          type="text" placeholder="e.g. STEM"
                          list="section-options"
                          value={student.section}
                          maxLength={SECTION_LIMIT}
                          onChange={(e) => handleAdditionalStudentChange(index, "section", e.target.value)}
                          onBlur={() => handleAdditionalStudentBlur(index, "section")}
                          className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-2 px-3 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                        />
                        <p className="mt-1 text-right text-[10px] font-medium text-secondary">
                          {student.section.length}/{SECTION_LIMIT}
                        </p>
                      </div>
                      <div>
                        <label className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider mb-1.5">
                          Adviser
                          <span className="material-symbols-outlined text-error" style={{ fontSize: 10 }}>emergency</span>
                        </label>
                        <input
                          type="text" placeholder="e.g. Mr. Santos"
                          value={student.adviser}
                          maxLength={ADVISER_LIMIT}
                          onChange={(e) => handleAdditionalStudentChange(index, "adviser", autoCapitalize(e.target.value))}
                          onBlur={() => handleAdditionalStudentBlur(index, "adviser")}
                          className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-2 px-3 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                        />
                        <p className="mt-1 text-right text-[10px] font-medium text-secondary">
                          {student.adviser.length}/{ADVISER_LIMIT}
                        </p>
                      </div>
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider mb-1.5">
                        Sanction / action taken
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Describe the sanction or action taken…"
                        value={student.sanction}
                        maxLength={TEXT_FIELD_LIMIT}
                        onChange={(e) => handleAdditionalStudentChange(index, "sanction", e.target.value.slice(0, TEXT_FIELD_LIMIT))}
                        className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-2 px-3 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none resize-none"
                      />
                      <p className="mt-1 text-right text-[10px] font-medium text-secondary">
                        {student.sanction.length}/{TEXT_FIELD_LIMIT}
                      </p>
                    </div>
                  </div>
                </div>
              );
              })}

              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleAddStudent}
                  className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-2 text-xs font-bold text-primary hover:border-primary hover:bg-primary hover:text-white transition-colors duration-500"
                >
                  <span className="material-symbols-outlined transition-colors duration-500" style={{ fontSize: 16 }}>person_add</span>
                  Add another student
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 — Attach Proofs */}
          {currentStep === 3 && (
            <div className="flex flex-col gap-4 max-w-2xl mx-auto animate-fade-in">
              {formData.additionalStudents.length > 0 && (
                <div className="bg-surface rounded-xl border border-outline-variant p-5">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider mb-1.5">
                    Case Title
                    <span className="material-symbols-outlined text-error" style={{ fontSize: 10 }}>emergency</span>
                  </label>
                  <div className="w-64 max-w-full">
                    <input
                      type="text"
                      placeholder="e.g. Class Incident"
                      value={formData.title}
                      maxLength={CASE_TITLE_LIMIT}
                      onChange={(e) => setFormData({ ...formData, title: autoCapitalize(e.target.value.slice(0, CASE_TITLE_LIMIT)) })}
                      onBlur={() => setFormData((p) => ({ ...p, title: capitalizeWords(p.title).slice(0, CASE_TITLE_LIMIT) }))}
                      className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-2 px-3 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                    <p className="mt-1 text-right text-[10px] font-medium text-secondary">
                      {formData.title.length}/{CASE_TITLE_LIMIT}
                    </p>
                  </div>
                  <p className="mt-1 text-[10px] text-secondary">A title to group these students together.</p>
                </div>
              )}

              <div className="bg-surface rounded-xl border border-outline-variant p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-on-surface">Attach documentation</h3>
                    <p className="text-xs text-secondary mt-0.5">Photos, screenshots, or scanned documents.</p>
                  </div>
                  <label className="flex items-center gap-1.5 bg-[#0B1E43] text-white text-xs font-bold py-2 px-4 rounded-lg cursor-pointer hover:bg-[#0F2451] transition-colors duration-500 shrink-0">
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>upload</span>
                    Add file
                    <input type="file" accept="image/*" className="hidden" onChange={handleUploadProof} />
                  </label>
                </div>

                {formData.uploadedProofs.length === 0 ? (
                  <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-outline-variant rounded-xl p-10 cursor-pointer hover:border-primary hover:bg-primary/5 transition-all duration-500 group">
                    <span className="material-symbols-outlined text-secondary group-hover:text-primary transition-colors" style={{ fontSize: 36 }}>add_photo_alternate</span>
                    <div className="text-center">
                      <p className="text-sm font-bold text-on-surface">Drop files here or click to upload</p>
                      <p className="text-xs text-secondary mt-0.5">Supports JPG, PNG, GIF, WEBP</p>
                    </div>
                    <input type="file" accept="image/*" className="hidden" onChange={handleUploadProof} />
                  </label>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {formData.uploadedProofs.map((proof, idx) => (
                      <div
                        key={idx}
                        className="group relative rounded-xl overflow-hidden border border-outline-variant cursor-pointer aspect-video bg-surface-container"
                        onClick={() => {
                          setIsProofLightboxClosing(false);
                          setSelectedProofUrl(proof.data);
                        }}
                      >
                        <img src={proof.data} alt={proof.name} className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="material-symbols-outlined text-white" style={{ fontSize: 28 }}>zoom_in</span>
                        </div>
                        <button
                          onClick={(e) => handleDeleteProofRequest(e, idx)}
                          className="absolute top-2 right-2 w-7 h-7 bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-700 transition-all duration-500 shadow"
                        >
                          <span className="material-symbols-outlined transition-colors duration-500" style={{ fontSize: 14 }}>delete</span>
                        </button>
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 pt-4 pb-1.5">
                          <p className="text-white text-[10px] font-medium truncate">{proof.name}</p>
                        </div>
                      </div>
                    ))}
                    {/* Add more button */}
                    <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-outline-variant cursor-pointer hover:border-primary hover:bg-primary/5 transition-all duration-500 aspect-video group">
                      <span className="material-symbols-outlined text-secondary group-hover:text-primary transition-colors" style={{ fontSize: 24 }}>add</span>
                      <span className="text-xs text-secondary group-hover:text-primary font-medium transition-colors">Add more</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleUploadProof} />
                    </label>
                  </div>
                )}

                {formData.uploadedProofs.length > 0 && (
                  <p className="text-xs text-secondary mt-3">{formData.uploadedProofs.length} file{formData.uploadedProofs.length !== 1 ? "s" : ""} attached</p>
                )}
              </div>

              <div className="bg-surface rounded-xl border border-outline-variant p-5">
                <div className="mb-3">
                  <h3 className="text-base font-bold text-on-surface">Description</h3>
                  <p className="text-xs text-secondary mt-0.5">Add notes or context for this case.</p>
                </div>
                <textarea
                  rows={4}
                  placeholder="Write a brief description..."
                  value={formData.description}
                  maxLength={TEXT_FIELD_LIMIT}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value.slice(0, TEXT_FIELD_LIMIT) })}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-2 px-3 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none resize-none"
                />
                <p className="mt-1 text-right text-[10px] font-medium text-secondary">
                  {formData.description.length}/{TEXT_FIELD_LIMIT}
                </p>
              </div>
            </div>
          )}

          {/* STEP 4 — Review */}
          {currentStep === 4 && (
            <div className="flex flex-col gap-4 max-w-2xl mx-auto animate-fade-in">

              {/* Edit toggle banner */}
              <div className="flex items-center justify-between bg-surface rounded-xl border border-outline-variant px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-on-surface font-bold">
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{isEditingReview ? "edit" : "fact_check"}</span>
                  {isEditingReview ? "Editing fields — click Done when finished" : "Review before filing"}
                </div>
                <button
                  onClick={() => setIsEditingReview((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-outline-variant hover:bg-surface-container transition-colors duration-500 text-secondary hover:text-on-surface"
                >
                  <span className="material-symbols-outlined transition-colors duration-500" style={{ fontSize: 14 }}>
                    {isEditingReview ? "check" : "edit"}
                  </span>
                  {isEditingReview ? "Done" : "Edit fields"}
                </button>
              </div>

              {/* Case type */}
              <div className="bg-surface rounded-xl border border-outline-variant overflow-hidden">
                <div className="px-4 py-2.5 border-b border-outline-variant">
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Case type</p>
                </div>
                <div className="px-4 py-3 flex items-center gap-3">
                  {displayCat && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: displayCat.bg, color: displayCat.color, border: `1px solid ${displayCat.border}` }}>
                      {displayCat.label}
                    </span>
                  )}
                  {isEditingReview ? (
                    <div className="flex-1">
                      <input
                        type="text" value={formData.case}
                        maxLength={CASE_TYPE_LIMIT}
                        onChange={(e) => setFormData({ ...formData, case: autoCapitalize(e.target.value).slice(0, CASE_TYPE_LIMIT) })}
                        onBlur={() => setFormData((p) => {
                          const normalizedCase = normalizeCaseType(p.case);
                          const matchedCategory = getCategoryForCase(normalizedCase);
                          return {
                            ...p,
                            case: normalizedCase,
                            caseCategory: matchedCategory?.id ?? (normalizedCase ? "other" : ""),
                          };
                        })}
                        className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                      />
                      <p className="mt-1 text-right text-[10px] font-medium text-secondary">
                        {formData.case.length}/{CASE_TYPE_LIMIT}
                      </p>
                    </div>
                  ) : (
                    <span className="text-sm font-bold text-on-surface">{formData.case || <span className="text-secondary italic font-normal">Not set</span>}</span>
                  )}
                </div>
              </div>

              {/* Incident details */}
              <div className="bg-surface rounded-xl border border-outline-variant overflow-hidden">
                <div className="px-4 py-2.5 border-b border-outline-variant">
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Incident details</p>
                </div>
                <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-3">
                  {[
                    { label: "Date of Incident", key: "date" },
                    { label: "Status", key: "progress" },
                  ].map(({ label, key }) => (
                    <div key={key}>
                      <p className="text-[10px] text-secondary font-bold uppercase tracking-wider mb-1">{label}</p>
                      {isEditingReview && key === "date" ? (
                        <div className="flex flex-col gap-1.5 w-full">
                          <input type="datetime-local" value={formData.date}
                            max={getTodayDateTimeString()}
                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                            className="w-full bg-surface-container border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, date: getTodayDateTimeString() })}
                            className="text-[9px] font-bold text-primary hover:text-primary-hover uppercase tracking-wider bg-primary/5 hover:bg-primary/10 px-2 py-0.5 rounded transition-colors self-start"
                          >
                            Set to Today/Now
                          </button>
                        </div>
                      ) : isEditingReview && key === "progress" ? (
                        <select value={formData.progress} onChange={(e) => setFormData({ ...formData, progress: e.target.value })}
                          className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none">
                          {PROGRESS_OPTIONS.map(o => <option key={o.value}>{o.value}</option>)}
                        </select>
                      ) : (
                        <p className="text-sm text-on-surface font-medium">
                          {key === "date" 
                            ? new Date(formData.date).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
                            : (formData as any)[key] || <span className="text-secondary italic font-normal">Not set</span>}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>


              {/* Student info */}
              <div className="bg-surface rounded-xl border border-outline-variant overflow-hidden">
                <div className="px-4 py-2.5 border-b border-outline-variant">
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Student(s) involved</p>
                </div>
                <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-3">
                  {[
                    { label: "Last name", key: "lastName" },
                    { label: "First name", key: "firstName" },
                    { label: "Middle initial", key: "middleInitial" },
                    { label: "Role", key: "role" },
                    { label: "Grade level", key: "level" },
                    { label: "Section", key: "section" },
                    { label: "Adviser", key: "adviser" },
                  ].map(({ label, key }) => (
                    <div key={key}>
                      <p className="text-[10px] text-secondary font-bold uppercase tracking-wider mb-1">{label}</p>
                      {isEditingReview ? (
                        key === "role" ? (
                          <select
                            value={(formData as any)[key]}
                            disabled={isPrimaryRoleLocked}
                            title={isPrimaryRoleLocked ? "Add another student to change the role." : undefined}
                            onChange={(e) => {
                              if (isPrimaryRoleLocked) return;
                              setFormData({ ...formData, [key]: e.target.value });
                            }}
                            className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {!isPrimaryRoleLocked && <option value="" disabled>Select a role</option>}
                            {ROLE_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <>
                            <input type="text" value={(formData as any)[key]}
                              list={key === "level" ? "grade-level-options" : key === "section" ? "section-options" : undefined}
                              maxLength={getFieldLimit(key)}
                              onChange={(e) => {
                                const val = e.target.value;
                                let processed = val;
                                if (key === "firstName" || key === "lastName" || key === "adviser") {
                                  processed = autoCapitalize(val);
                                } else if (key === "middleInitial") {
                                  processed = val.replace(/\s+/g, "").toUpperCase();
                                }
                                setFormData({ ...formData, [key]: limitFieldValue(key, processed) });
                              }}
                              onBlur={() => {
                                if (key === "firstName" || key === "lastName" || key === "adviser") {
                                  setFormData((p) => ({ ...p, [key]: limitFieldValue(key, capitalizeWords((p as any)[key])) }));
                                } else if (key === "middleInitial") {
                                  setFormData((p) => ({ ...p, middleInitial: normalizeMiddleInitial(p.middleInitial) }));
                                } else if (key === "level") {
                                  setFormData((p) => ({ ...p, level: normalizeGradeLevel(p.level) }));
                                } else if (key === "section") {
                                  setFormData((p) => ({ ...p, section: normalizeSection(p.section) }));
                                }
                              }}
                              className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                            />
                            {getFieldLimit(key) && (
                              <p className="mt-1 text-right text-[10px] font-medium text-secondary">
                                {String((formData as any)[key] ?? "").length}/{getFieldLimit(key)}
                              </p>
                            )}
                          </>
                        )
                      ) : (
                        <p className="text-sm text-on-surface font-medium">{(formData as any)[key] || <span className="text-secondary italic font-normal">Not set</span>}</p>
                      )}
                    </div>
                  ))}
                  <div className="col-span-2">
                    <p className="text-[10px] text-secondary font-bold uppercase tracking-wider mb-1">Sanction / action taken</p>
                    {isEditingReview ? (
                      <>
                        <textarea value={formData.sanction} rows={2}
                          maxLength={TEXT_FIELD_LIMIT}
                          onChange={(e) => setFormData({ ...formData, sanction: e.target.value.slice(0, TEXT_FIELD_LIMIT) })}
                          className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none resize-none"
                        />
                        <p className="mt-1 text-right text-[10px] font-medium text-secondary">
                          {formData.sanction.length}/{TEXT_FIELD_LIMIT}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-on-surface font-medium">{formData.sanction || <span className="text-secondary italic font-normal">Not set</span>}</p>
                    )}
                  </div>
                </div>
                {formData.additionalStudents.map((student, index) => {
                  const isRemoving = removingAdditionalStudents.includes(student);
                  return (
                  <div
                    key={index}
                    className={`additional-student-card px-4 py-3 border-t border-outline-variant grid grid-cols-2 gap-x-6 gap-y-3 ${
                      isRemoving ? "additional-student-card-exit pointer-events-none" : "additional-student-card-enter"
                    }`}
                  >
                    <div className="col-span-2 flex items-center justify-between">
                      <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Student {index + 2}</p>
                      {isEditingReview && (
                        <button
                          type="button"
                          onClick={() => handleRemoveAdditionalStudent(student)}
                          className="text-[10px] font-bold text-error hover:text-on-error-container hover:bg-error-container/60 px-2 py-1 rounded-lg transition-colors duration-500"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    {[
                      { label: "Last name", key: "lastName" },
                      { label: "First name", key: "firstName" },
                      { label: "Middle initial", key: "middleInitial" },
                      { label: "Role", key: "role" },
                      { label: "Grade level", key: "level" },
                      { label: "Section", key: "section" },
                      { label: "Adviser", key: "adviser" },
                    ].map(({ label, key }) => (
                      <div key={key}>
                        <p className="text-[10px] text-secondary font-bold uppercase tracking-wider mb-1">{label}</p>
                        {isEditingReview ? (
                          key === "role" ? (
                            <select
                              value={(student as any)[key]}
                              onChange={(e) => handleAdditionalStudentChange(index, key as keyof StudentInfo, e.target.value)}
                              className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                            >
                              <option value="" disabled>Select a role</option>
                              {ROLE_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : (
                            <>
                              <input
                                type="text"
                                value={(student as any)[key]}
                                list={key === "level" ? "grade-level-options" : key === "section" ? "section-options" : undefined}
                                maxLength={getFieldLimit(key)}
                                onChange={(e) => handleAdditionalStudentChange(index, key as keyof StudentInfo, e.target.value)}
                                onBlur={() => handleAdditionalStudentBlur(index, key as keyof StudentInfo)}
                                className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                              />
                              {getFieldLimit(key) && (
                                <p className="mt-1 text-right text-[10px] font-medium text-secondary">
                                  {String((student as any)[key] ?? "").length}/{getFieldLimit(key)}
                                </p>
                              )}
                            </>
                          )
                        ) : (
                          <p className="text-sm text-on-surface font-medium">{(student as any)[key] || <span className="text-secondary italic font-normal">Not set</span>}</p>
                        )}
                      </div>
                    ))}
                    <div className="col-span-2">
                      <p className="text-[10px] text-secondary font-bold uppercase tracking-wider mb-1">Sanction / action taken</p>
                      {isEditingReview ? (
                        <>
                          <textarea
                            value={student.sanction}
                            rows={2}
                            maxLength={TEXT_FIELD_LIMIT}
                            onChange={(e) => handleAdditionalStudentChange(index, "sanction", e.target.value.slice(0, TEXT_FIELD_LIMIT))}
                            className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none resize-none"
                          />
                          <p className="mt-1 text-right text-[10px] font-medium text-secondary">
                            {student.sanction.length}/{TEXT_FIELD_LIMIT}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-on-surface font-medium">{student.sanction || <span className="text-secondary italic font-normal">Not set</span>}</p>
                      )}
                    </div>
                  </div>
                );
                })}
              </div>

              {/* Attachments */}
              <div className="bg-surface rounded-xl border border-outline-variant overflow-hidden">
                <div className="px-4 py-2.5 border-b border-outline-variant flex items-center justify-between">
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Attachments</p>
                  <span className="text-[10px] text-secondary">{formData.uploadedProofs.length} file{formData.uploadedProofs.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="px-4 py-3">
                  {formData.uploadedProofs.length === 0 ? (
                    <p className="text-xs text-secondary italic">No files attached.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {formData.uploadedProofs.map((p, i) => (
                        <div key={i} className="flex items-center gap-1.5 bg-surface-container border border-outline-variant rounded-lg px-2.5 py-1.5 text-xs text-on-surface max-w-[180px]">
                          <span className="material-symbols-outlined text-secondary" style={{ fontSize: 13 }}>image</span>
                          <span className="truncate">{p.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="bg-surface rounded-xl border border-outline-variant overflow-hidden">
                <div className="px-4 py-2.5 border-b border-outline-variant">
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Description</p>
                </div>
                <div className="px-4 py-3">
                  {isEditingReview ? (
                    <>
                      <textarea
                        value={formData.description}
                        rows={3}
                        maxLength={TEXT_FIELD_LIMIT}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value.slice(0, TEXT_FIELD_LIMIT) })}
                        className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-1.5 px-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none resize-none"
                      />
                      <p className="mt-1 text-right text-[10px] font-medium text-secondary">
                        {formData.description.length}/{TEXT_FIELD_LIMIT}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-on-surface font-medium whitespace-pre-wrap">
                      {formData.description || <span className="text-secondary italic font-normal">Not set</span>}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-7 py-3.5 border-t border-outline-variant bg-surface shrink-0 flex items-center justify-between">
          <div>
            {submitError && (
              <p className="text-[11px] font-bold text-error uppercase tracking-widest">{submitError}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {currentStep > 1 && (
              <button onClick={handleBack} className="px-4 py-2 border border-outline-variant text-on-surface hover:bg-surface-container font-bold text-xs rounded-lg transition-colors duration-500">
                Back
              </button>
            )}
            <button onClick={handleCloseAttempt} className="px-4 py-2 border border-outline-variant text-on-surface hover:bg-surface-container font-bold text-xs rounded-lg transition-colors duration-500">
              Cancel
            </button>
            {currentStep < 4 ? (
              <button
                onClick={handleNext}
                className="px-5 py-2 bg-[#0B1E43] text-white hover:bg-[#0F2451] font-bold text-xs rounded-lg transition-colors duration-500 flex items-center gap-1.5"
              >
                Continue
                <span className="material-symbols-outlined transition-colors duration-500" style={{ fontSize: 14 }}>arrow_forward</span>
              </button>
            ) : (
              <button
                onClick={handleFileCase}
                disabled={isSubmitting}
                className="px-5 py-2 bg-[#0B1E43] text-white hover:bg-[#0F2451] disabled:opacity-60 disabled:cursor-not-allowed font-bold text-xs rounded-lg transition-colors duration-500 flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined transition-colors duration-500" style={{ fontSize: 14 }}>check</span>
                {isSubmitting ? "Saving…" : "File case"}
              </button>
            )}
          </div>
        </div>
        {showConfirmClose && (
          <div className={`fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-6 ${
            isConfirmCloseClosing ? "unsaved-confirm-backdrop-exit" : "unsaved-confirm-backdrop-enter"
          }`}>
            <div className={`bg-surface border border-outline-variant max-w-sm w-full rounded-2xl p-6 shadow-2xl flex flex-col gap-4 text-center ${
              isConfirmCloseClosing ? "unsaved-confirm-panel-exit" : "unsaved-confirm-panel-enter"
            }`}>
              <span className="material-symbols-outlined text-5xl mx-auto" style={{ color: "#d97706" }}>warning</span>
              <div>
                <h3 className="text-base font-bold text-on-surface">Unsaved changes</h3>
                <p className="text-xs text-secondary mt-1.5 leading-relaxed">
                  Save as a draft to continue later, or discard your progress.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    localStorage.setItem("new_case_draft", JSON.stringify(formData));
                    closeConfirmClose(onClose);
                  }}
                  className="w-full py-2.5 bg-[#0B1E43] text-white font-bold text-xs rounded-xl hover:bg-[#0F2451] transition-all duration-500"
                >
                  Save draft & close
                </button>
                <button
                  onClick={() => {
                    localStorage.removeItem("new_case_draft");
                    closeConfirmClose(onClose);
                  }}
                  className="w-full py-2.5 border border-red-300 text-red-600 font-bold text-xs rounded-xl hover:bg-red-50 transition-all duration-500"
                >
                  Discard changes
                </button>
                <button
                  onClick={() => closeConfirmClose()}
                  className="w-full py-2.5 border border-outline-variant text-on-surface font-bold text-xs rounded-xl hover:bg-surface-container transition-all duration-500"
                >
                  Keep editing
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Confirm Close Overlay ── */}
      {toastMessage && (
        <div className={`app-toast fixed bottom-5 right-5 z-[70] flex items-start gap-2 rounded-xl border border-error/30 bg-error-container px-4 py-3 text-on-error-container shadow-xl ${isToastVisible ? "case-toast-x-enter" : "case-toast-x-exit"}`}>
          <span className="material-symbols-outlined text-error" style={{ fontSize: 18 }}>error</span>
          <p className="text-xs font-bold">{toastMessage}</p>
        </div>
      )}

      {/* ── Lightbox ── */}
      {deleteProofIndex !== null && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
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
                This will remove <strong className="text-on-surface font-semibold">{formData.uploadedProofs[deleteProofIndex]?.name ?? "this attachment"}</strong> from the proof list.
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
        </div>
      )}

      {selectedProofUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className={`absolute inset-0 bg-black/85 backdrop-blur-sm ${
              isProofLightboxClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"
            }`}
            onClick={closeProofLightbox}
          />
          <div className={`relative z-10 max-w-4xl max-h-[88vh] bg-surface rounded-2xl shadow-2xl overflow-hidden flex flex-col ${
            isProofLightboxClosing ? "modal-panel-exit" : "modal-panel-enter"
          }`}>
            <button
              onClick={closeProofLightbox}
              className="absolute top-3 right-3 w-8 h-8 bg-black/60 text-white hover:bg-black rounded-full flex items-center justify-center transition-all duration-500"
            >
              <span className="material-symbols-outlined transition-colors duration-500" style={{ fontSize: 18 }}>close</span>
            </button>
            <img src={selectedProofUrl} alt="Full size proof" className="max-w-full max-h-[85vh] object-contain rounded-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}
