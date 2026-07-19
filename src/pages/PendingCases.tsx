import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";

// ── Types ────────────────────────────────────────────────────────────────────
interface StudentInfo {
  firstName: string;
  lastName: string;
  middleInitial: string;
  level: string;
  section: string;
  adviser: string;
}

interface Case {
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

interface ProofItem {
  name: string;
  data: string;
  created_at: string;
}

const parseStudents = (studentsStr: string): StudentInfo[] => {
  try {
    return JSON.parse(studentsStr) || [];
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

// ── Category colour mapping ──────────────────────────────────────────────────
const CATEGORY_MAP: Record<string, { color: string; bg: string; border: string; label: string }> = {
  academic:     { color: "#185FA5", bg: "#E6F1FB", border: "#B5D4F4", label: "Academic" },
  personal:     { color: "#0F6E56", bg: "#E1F5EE", border: "#9FE1CB", label: "Personal / Social" },
  career:       { color: "#534AB7", bg: "#EEEDFE", border: "#CECBF6", label: "Career" },
  behavioural:  { color: "#854F0B", bg: "#FAEEDA", border: "#FAC775", label: "Behavioural" },
  crisis:       { color: "#A32D2D", bg: "#FCEBEB", border: "#F7C1C1", label: "Crisis / Mental Health" },
};

const ACADEMIC_CASES = ["Poor academic performance","Learning difficulties","Study skills & habits","Absenteeism / tardiness","Course selection","Dropout prevention"];
const PERSONAL_CASES = ["Peer relationship issues","Family problems","Self-esteem & identity","Adjustment difficulties","Grief & loss","Gender & sexuality","Substance use","Social media issues"];
const CAREER_CASES   = ["Career exploration","College / university prep","Scholarships & financial aid","Vocational / tech tracks","Goal setting","Work readiness"];
const BEHAVIOURAL_CASES = ["Defiance / non-compliance","Classroom disruption","Bullying","Truancy / skipping","Vandalism / property damage","Theft & dishonesty","Inappropriate language","Gang-related behaviour","Substance possession"];
const CRISIS_CASES   = ["Physical fighting","Assault on staff","Weapons possession","Threats & intimidation","Self-harm & suicide risk","Sexual harassment","Anxiety & depression","Trauma & abuse","Crisis intervention"];

function getCategoryForCase(caseName: string) {
  if (ACADEMIC_CASES.includes(caseName))    return CATEGORY_MAP.academic;
  if (PERSONAL_CASES.includes(caseName))    return CATEGORY_MAP.personal;
  if (CAREER_CASES.includes(caseName))      return CATEGORY_MAP.career;
  if (BEHAVIOURAL_CASES.includes(caseName)) return CATEGORY_MAP.behavioural;
  if (CRISIS_CASES.includes(caseName))      return CATEGORY_MAP.crisis;
  return { color: "#5F5E5A", bg: "#F1EFE8", border: "#D3D1C7", label: "Other" };
}

function getPendingIndicator(dateStr: string) {
  if (!dateStr) return null;
  const createdDate = new Date(dateStr);
  if (isNaN(createdDate.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const created = new Date(createdDate);
  created.setHours(0, 0, 0, 0);
  
  const diffTime = today.getTime() - created.getTime();
  const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

  let label = "";
  if (diffDays === 0) {
    label = "Today";
  } else if (diffDays === 1) {
    label = "1 day pending";
  } else {
    label = `${diffDays} days pending`;
  }

  let color = ""; 
  let bg = "";    
  let border = "";

  if (diffDays >= 14) {
    // 2 weeks or more: Red
    color = "#A32D2D";
    bg = "#FCEBEB";
    border = "#F7C1C1";
  } else if (diffDays >= 6) {
    // 6-14 days: Orange
    color = "#C25E00";
    bg = "#FFF3E6";
    border = "#FFE0B2";
  } else {
    // 1-5 days: Amber/Yellow
    color = "#854F0B";
    bg = "#FAEEDA";
    border = "#FAC775";
  }

  return { label, color, bg, border, days: diffDays };
}

function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

// ── Component ────────────────────────────────────────────────────────────────
export default function PendingCases() {
  const [cases, setCases]               = useState<Case[]>([]);
  const [selectedId, setSelectedId]     = useState<number | null>(null);
  const [isLoading, setIsLoading]       = useState(false);
  const [resolvingId, setResolvingId]   = useState<number | null>(null);
  const [confirmState, setConfirmState] = useState<"idle" | "resolving" | "reprimanding" | "closing">("idle");
  const [resolvedIds, setResolvedIds]   = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery]   = useState("");
  const [dateSort, setDateSort]         = useState<"desc" | "asc">("desc");
  const [selectedProofs, setSelectedProofs] = useState<ProofItem[]>([]);

  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setIsToastVisible(false);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    window.requestAnimationFrame(() => setIsToastVisible(true));
    toastTimerRef.current = window.setTimeout(() => {
      setIsToastVisible(false);
      window.setTimeout(() => setToast(null), 1000);
    }, 2800);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const selectedCase = cases.find((c) => c.id === selectedId) ?? null;

  const loadPendingCases = useCallback(async () => {
    setIsLoading(true);
    try {
      const all = await invoke<Case[]>("get_cases");
      const pending = all.filter((c) => c.progress === "Pending");
      pending.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setCases(pending);
      setSelectedId((prev) => {
        if (prev !== null && pending.find((c) => c.id === prev)) return prev;
        return pending[0]?.id ?? null;
      });
    } catch (err) {
      console.error("Failed to load pending cases", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setResolvedIds(new Set());
    setConfirmState("idle");
    setSearchQuery("");
    loadPendingCases();
  }, [loadPendingCases]);

  useEffect(() => {
    const handler = () => loadPendingCases();
    window.addEventListener("cases:changed", handler);
    return () => window.removeEventListener("cases:changed", handler);
  }, [loadPendingCases]);

  useEffect(() => {
    if (!selectedCase) {
      setSelectedProofs([]);
      return;
    }
    setSelectedProofs(parseProofs(selectedCase.proofs));
  }, [selectedCase?.id, selectedCase?.proofs]);

  const handleUpdateProgress = async (caseId: number, newProgress: string) => {
    const caseRecord = cases.find(c => c.id === caseId);
    if (!caseRecord) return;
    setResolvingId(caseId);
    try {
      await invoke("update_case", { 
        id: caseRecord.id,
        students: caseRecord.students,
        date: caseRecord.date,
        dateFiled: caseRecord.date_filed,
        case: caseRecord.case,
        description: caseRecord.description,
        sanction: caseRecord.sanction,
        progress: newProgress,
        proofs: caseRecord.proofs,
        title: caseRecord.title,
        reportingStudent: caseRecord.reporting_student || "",
        groupId: caseRecord.group_id || null
      });
      
      const caseIdFormatted = `#${caseId.toString().padStart(4, "0")}`;
      showToast("success", `Case ${caseIdFormatted} successfully marked as ${newProgress}.`);

      setResolvedIds((prev) => new Set(prev).add(caseId));

      setTimeout(() => {
        setCases((prev) => {
          const remaining = prev.filter((c) => c.id !== caseId);
          setSelectedId((sel) => {
            if (sel === caseId) return remaining[0]?.id ?? null;
            return sel;
          });
          return remaining;
        });
        setResolvedIds((prev) => {
          const next = new Set(prev);
          next.delete(caseId);
          return next;
        });
      }, 500);

      window.dispatchEvent(new Event("cases:changed"));
    } catch (err) {
      console.error("Failed to update case", err);
      showToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setResolvingId(null);
      setConfirmState("idle");
    }
  };

  const filteredCases = cases.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const students = parseStudents(c.students);
    const matchesStudent = students.some(s => {
      const nameStr = `${s.firstName} ${s.middleInitial} ${s.lastName}`.toLowerCase();
      return s.firstName.toLowerCase().includes(q) ||
             s.lastName.toLowerCase().includes(q) ||
             s.middleInitial.toLowerCase().includes(q) ||
             nameStr.includes(q) ||
             s.level.toLowerCase().includes(q) ||
             s.section.toLowerCase().includes(q);
    });

    return (
      c.case.toLowerCase().includes(q) ||
      matchesStudent
    );
  });

  const sortedCases = useMemo(() => {
    return [...filteredCases].sort((a, b) => {
      const timeA = new Date(a.date_filed || a.date).getTime();
      const timeB = new Date(b.date_filed || b.date).getTime();
      return dateSort === "desc" ? timeB - timeA : timeA - timeB;
    });
  }, [filteredCases, dateSort]);

  const cat = selectedCase ? getCategoryForCase(selectedCase.case) : null;
  const detailIndicator = selectedCase ? getPendingIndicator(selectedCase.date_filed || selectedCase.date) : null;

  return (
    <>
      {toast && createPortal(
        <div className={`app-toast fixed bottom-5 right-5 z-[99999999] flex items-start gap-2 rounded-xl px-4 py-3 shadow-xl transition-[transform,opacity] duration-1000 ease-out ${
          toast.type === "success"
            ? "border border-green-500/30 bg-green-50 text-green-900"
            : "border border-error/30 bg-error-container text-on-error-container"
        } ${isToastVisible ? "case-toast-x-enter" : "case-toast-x-exit"}`}>
          <span className={`material-symbols-outlined ${toast.type === "success" ? "text-green-600" : "text-error"}`} style={{ fontSize: 18 }}>
            {toast.type === "success" ? "check_circle" : "error"}
          </span>
          <p className="text-xs font-bold">{toast.message}</p>
        </div>,
        document.body
      )}

      <div 
        className="flex flex-col bg-surface-container-low border border-outline-variant rounded-2xl overflow-hidden shadow-sm w-full"
        style={{ height: "calc(100vh - 144px)" }}
      >
      <style>{`
        @keyframes fadeSlideOut {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(20px); }
        }
        .case-row-exit { animation: fadeSlideOut 0.45s ease forwards; }
      `}</style>

      {/* ── Panel header ── */}
      <div className="px-6 py-4 bg-surface border-b border-outline-variant flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div 
            className="group w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-500 cursor-pointer active:scale-95" 
            style={{ background: "#FAEEDA" }}
          >
            <span 
              className="material-symbols-outlined transition-[font-variation-settings] duration-300 group-hover:[font-variation-settings:'FILL'_1]" 
              style={{ fontSize: 18, color: "#854F0B" }}
            >
              pending_actions
            </span>
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-secondary">Action Queue</p>
            <h2 className="text-[19px] font-extrabold text-on-surface leading-tight">Pending Cases</h2>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {cases.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
              style={{ background: "#FAEEDA", color: "#633806", border: "1px solid #FAC775" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>schedule</span>
              {cases.length} pending
            </div>
          )}
        </div>
      </div>

      {/* ── Body: two-column master-detail ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── LEFT: Case list ── */}
        <div className="w-[320px] shrink-0 border-r border-outline-variant flex flex-col bg-surface h-full overflow-hidden">
          {/* Search & Sort */}
          <div className="px-3 py-3 border-b border-outline-variant flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 bg-surface-container-low border border-outline-variant rounded-lg px-2.5 py-1.5 min-w-0">
              <span className="material-symbols-outlined text-secondary" style={{ fontSize: 15 }}>search</span>
              <input
                type="text"
                placeholder="Search cases…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-xs text-on-surface placeholder:text-secondary focus:outline-none min-w-0"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="text-secondary hover:text-on-surface transition-colors duration-500">
                  <span className="material-symbols-outlined transition-colors duration-500" style={{ fontSize: 14 }}>close</span>
                </button>
              )}
            </div>
            <button
              onClick={() => setDateSort((prev) => (prev === "desc" ? "asc" : "desc"))}
              title={dateSort === "desc" ? "Sort Oldest First" : "Sort Newest First"}
              className="w-8 h-8 rounded-lg border border-outline-variant flex items-center justify-center bg-surface-container-low hover:bg-surface-container transition-colors duration-500 text-secondary hover:text-on-surface shrink-0"
            >
              <span className="material-symbols-outlined transition-colors duration-500" style={{ fontSize: 18 }}>
                {dateSort === "desc" ? "arrow_downward" : "arrow_upward"}
              </span>
            </button>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {isLoading ? (
              <div className="flex flex-col gap-2 p-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 bg-surface-container rounded-xl animate-pulse" />
                ))}
              </div>
            ) : sortedCases.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center py-12">
                {searchQuery ? (
                  <>
                    <span className="material-symbols-outlined text-secondary" style={{ fontSize: 36 }}>search_off</span>
                    <p className="text-sm font-bold text-on-surface">No results</p>
                    <p className="text-xs text-secondary">Try a different name or case type.</p>
                  </>
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-1" style={{ background: "#E1F5EE" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 28, color: "#0F6E56" }}>task_alt</span>
                    </div>
                    <p className="text-sm font-bold text-on-surface">All caught up</p>
                    <p className="text-xs text-secondary leading-relaxed">No pending cases right now. New cases filed as "Pending" will appear here.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="p-2 flex flex-col gap-1">
                {sortedCases.map((c) => {
                  const isSelected = selectedId === c.id;
                  const isExiting  = resolvedIds.has(c.id);
                  const itemCat    = getCategoryForCase(c.case);
                  const indicator  = getPendingIndicator(c.date_filed || c.date);
                  return (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedId(c.id); setConfirmState("idle"); }}
                      className={`w-full text-left rounded-xl px-3 py-3 transition-all duration-500 border ${isExiting ? "case-row-exit" : ""} ${
                        isSelected
                          ? "bg-[#0B1E43]/6 border-[#0B1E43]/20"
                          : "border-transparent hover:bg-surface-container"
                      }`}
                    >
                      <div className="flex items-start gap-2.5 transition-colors duration-500">
                        <div className="w-2 h-2 rounded-full mt-1.5 shrink-0 transition-colors duration-500" style={{ background: itemCat.color }} />
                        <div className="flex-1 min-w-0 transition-colors duration-500">
                          <div className="flex items-start justify-between gap-1.5 transition-colors duration-500">
                            <p className="text-sm font-bold text-on-surface truncate flex-1 transition-colors duration-500">
                              {(() => {
                                const students = parseStudents(c.students);
                                if (students.length === 0) return "—";
                                const firstStudent = students[0];
                                const name = `${firstStudent.lastName}, ${firstStudent.firstName}${firstStudent.middleInitial ? ` ${firstStudent.middleInitial}.` : ""}`;
                                return students.length > 1 ? `${name} (+${students.length - 1} others)` : name;
                              })()}
                            </p>
                            {indicator && (
                              <span 
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold border shrink-0 mt-0.5 leading-none transition-colors duration-500"
                                style={{ backgroundColor: indicator.bg, color: indicator.color, borderColor: indicator.border }}
                              >
                                {indicator.days === 0 ? "Today" : `${indicator.days}d`}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-secondary truncate mt-0.5 transition-colors duration-500">{c.case}</p>
                          <div className="flex items-center gap-1.5 mt-1.5 transition-colors duration-500">
                            <span className="text-[10px] text-secondary font-medium transition-colors duration-500">
                              {(() => {
                                const students = parseStudents(c.students);
                                if (students.length === 0) return "—";
                                const firstStudent = students[0];
                                return firstStudent.level;
                              })()}
                            </span>
                            {(() => {
                                const students = parseStudents(c.students);
                                if (students.length === 0 || !students[0].section) return null;
                                return (
                                  <>
                                    <span className="text-[10px] text-secondary opacity-40 transition-colors duration-500">·</span>
                                    <span className="text-[10px] text-secondary font-medium transition-colors duration-500">{students[0].section}</span>
                                  </>
                                );
                            })()}
                            <span className="text-[10px] text-secondary opacity-40 ml-auto transition-colors duration-500">{formatDate(c.date)}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Case detail ── */}
        <div className="flex-1 flex flex-col min-w-0 bg-surface h-full overflow-hidden">
          {!selectedCase ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "#F1EFE8" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 28, color: "#888780" }}>folder_open</span>
              </div>
              <p className="text-sm font-bold text-on-surface">Select a case</p>
              <p className="text-xs text-secondary">Pick a case from the list to see its details and resolve it.</p>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Detail header */}
              <div className="px-6 py-4 border-b border-outline-variant bg-surface shrink-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-extrabold text-on-surface leading-tight">
                      {(() => {
                        const students = parseStudents(selectedCase.students);
                        if (students.length === 0) return "—";
                        const firstStudent = students[0];
                        const name = `${firstStudent.lastName}, ${firstStudent.firstName}${firstStudent.middleInitial ? ` ${firstStudent.middleInitial}.` : ""}`;
                        return students.length > 1 ? `${name} (+${students.length - 1} others)` : name;
                      })()}
                    </h3>
                    <p className="text-sm text-secondary mt-0.5">
                      {(() => {
                        const students = parseStudents(selectedCase.students);
                        if (students.length === 0) return "";
                        const firstStudent = students[0];
                        return [firstStudent.level, firstStudent.section, firstStudent.adviser && `Adviser: ${firstStudent.adviser}`].filter(Boolean).join(" · ");
                      })()}
                    </p>
                  </div>
                  <span
                    className="text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 mt-0.5"
                    style={{ background: cat?.bg, color: cat?.color, border: `1px solid ${cat?.border}` }}
                  >
                    {cat?.label}
                  </span>
                </div>
              </div>

              {/* Detail body */}
              <div className="flex-1 px-6 py-5 flex flex-col gap-4 overflow-y-auto">

                {/* Case info card */}
                <div className="bg-surface rounded-xl border border-outline-variant overflow-hidden shrink-0">
                  <div className="px-4 py-2.5 border-b border-outline-variant">
                    <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Case information</p>
                  </div>
                  <div className="px-4 py-4 grid grid-cols-2 gap-x-6 gap-y-4">
                    <div>
                      <p className="text-[10px] text-secondary font-bold uppercase tracking-wider mb-1">Case type</p>
                      <p className="text-sm font-bold text-on-surface">{selectedCase.case || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-secondary font-bold uppercase tracking-wider mb-1">Date filed</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-on-surface">{formatDate(selectedCase.date_filed)}</p>
                        {detailIndicator && (
                          <span 
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded border inline-flex items-center gap-1"
                            style={{ backgroundColor: detailIndicator.bg, color: detailIndicator.color, borderColor: detailIndicator.border }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 10 }}>schedule</span>
                            {detailIndicator.label}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[10px] text-secondary font-bold uppercase tracking-wider mb-1">Description</p>
                      <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">
                        {selectedCase.description || <span className="italic text-secondary">No description recorded.</span>}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[10px] text-secondary font-bold uppercase tracking-wider mb-1">Sanction / action taken</p>
                      <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">
                        {selectedCase.sanction || <span className="italic text-secondary">No sanction recorded.</span>}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Student info card */}
                <div className="bg-surface rounded-xl border border-outline-variant overflow-hidden shrink-0">
                  <div className="px-4 py-2.5 border-b border-outline-variant">
                    <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Students Involved</p>
                  </div>
                  <div className="divide-y divide-outline-variant">
                    {(() => {
                      const students = parseStudents(selectedCase.students);
                      if (students.length === 0) return <div className="px-4 py-4 text-sm text-secondary italic">No students recorded.</div>;
                      return students.map((student, idx) => (
                        <div key={idx} className="px-4 py-4 grid grid-cols-2 gap-x-6 gap-y-4">
                          {[
                            { label: "Full name",    value: `${student.lastName}, ${student.firstName}${student.middleInitial ? ` ${student.middleInitial}.` : ""}` },
                            { label: "Grade level",  value: student.level },
                            { label: "Section",      value: student.section },
                            { label: "Adviser",      value: student.adviser },
                          ].map(({ label, value }) => (
                            <div key={label}>
                              <p className="text-[10px] text-secondary font-bold uppercase tracking-wider mb-1">{label}</p>
                              <p className="text-sm font-bold text-on-surface">{value || "—"}</p>
                            </div>
                          ))}
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {selectedProofs.length > 0 && (
                  <div className="bg-surface rounded-xl border border-outline-variant overflow-hidden shrink-0">
                    <div className="px-4 py-2.5 border-b border-outline-variant flex items-center justify-between">
                      <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Attachments</p>
                      <span className="text-[10px] text-secondary">{selectedProofs.length} file{selectedProofs.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="px-4 py-3 grid grid-cols-3 gap-2">
                      {selectedProofs.map((proof, index) => (
                        <div
                          key={`${proof.name}-${proof.created_at}-${index}`}
                          className="aspect-video rounded-lg overflow-hidden border border-outline-variant cursor-pointer"
                          onClick={() => window.open(proof.data, "_blank")}
                        >
                          <img src={proof.data} alt={proof.name} className="w-full h-full object-cover hover:scale-105 transition-transform duration-200" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Resolve / Action bar ── */}
              <div className="px-6 py-4 border-t border-outline-variant bg-surface shrink-0">
                {confirmState === "idle" && (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-secondary flex-1">Update the status of this case:</p>
                    <button
                      onClick={() => setConfirmState("reprimanding")}
                      disabled={resolvingId !== null}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg border text-xs font-bold transition-all duration-500 disabled:opacity-50 hover:bg-[#F7C1C1]/50"
                      style={{ borderColor: "#F7C1C1", color: "#A32D2D", background: "#FCEBEB" }}
                    >
                      <span className="material-symbols-outlined transition-colors duration-500" style={{ fontSize: 14 }}>gavel</span>
                      Mark reprimand
                    </button>
                    <button
                      onClick={() => setConfirmState("closing")}
                      disabled={resolvingId !== null}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg border text-xs font-bold transition-all duration-500 disabled:opacity-50 hover:bg-[#EDF3F8]/70"
                      style={{ borderColor: "#C8D7E4", color: "#35414C", background: "#EDF3F8" }}
                    >
                      <span className="material-symbols-outlined transition-colors duration-500" style={{ fontSize: 14 }}>inventory_2</span>
                      Mark closed
                    </button>
                    <button
                      onClick={() => setConfirmState("resolving")}
                      disabled={resolvingId !== null}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-500 disabled:opacity-50 hover:bg-black"
                      style={{ background: "#0B1E43", color: "#fff" }}
                    >
                      <span className="material-symbols-outlined transition-colors duration-500" style={{ fontSize: 14 }}>check_circle</span>
                      Resolve case
                    </button>
                  </div>
                )}

                {confirmState === "resolving" && (
                  <div className="flex items-center gap-3 bg-surface-container rounded-xl px-4 py-3 border border-outline-variant">
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#0F6E56" }}>check_circle</span>
                    <p className="text-sm text-on-surface flex-1">
                      Mark case <span className="font-bold">#{selectedCase.id}</span> as <span className="font-bold">Resolved</span>?
                    </p>
                    <button
                      onClick={() => setConfirmState("idle")}
                      className="text-xs font-bold text-secondary hover:text-on-surface px-3 py-1.5 rounded-lg hover:bg-surface transition-colors duration-500"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleUpdateProgress(selectedCase.id, "Resolved")}
                      disabled={resolvingId === selectedCase.id}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-500 disabled:opacity-60 hover:bg-green-800"
                      style={{ background: "#0F6E56", color: "#fff" }}
                    >
                      {resolvingId === selectedCase.id ? (
                        <span className="material-symbols-outlined animate-spin transition-colors duration-500" style={{ fontSize: 14 }}>progress_activity</span>
                      ) : (
                        <span className="material-symbols-outlined transition-colors duration-500" style={{ fontSize: 14 }}>check</span>
                      )}
                      {resolvingId === selectedCase.id ? "Saving…" : "Confirm resolve"}
                    </button>
                  </div>
                )}

                {confirmState === "closing" && (
                  <div className="flex items-center gap-3 bg-surface-container rounded-xl px-4 py-3 border border-outline-variant">
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#4D5A66" }}>inventory_2</span>
                    <p className="text-sm text-on-surface flex-1">
                      Mark case <span className="font-bold">#{selectedCase.id}</span> as <span className="font-bold">Closed</span>?
                    </p>
                    <button
                      onClick={() => setConfirmState("idle")}
                      className="text-xs font-bold text-secondary hover:text-on-surface px-3 py-1.5 rounded-lg hover:bg-surface transition-colors duration-500"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleUpdateProgress(selectedCase.id, "Closed")}
                      disabled={resolvingId === selectedCase.id}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-500 disabled:opacity-60"
                      style={{ background: "#4D5A66", color: "#fff" }}
                    >
                      {resolvingId === selectedCase.id ? (
                        <span className="material-symbols-outlined animate-spin transition-colors duration-500" style={{ fontSize: 14 }}>progress_activity</span>
                      ) : (
                        <span className="material-symbols-outlined transition-colors duration-500" style={{ fontSize: 14 }}>inventory_2</span>
                      )}
                      Confirm closed
                    </button>
                  </div>
                )}

                {confirmState === "reprimanding" && (
                  <div className="flex items-center gap-3 bg-surface-container rounded-xl px-4 py-3 border border-outline-variant">
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#A32D2D" }}>gavel</span>
                    <p className="text-sm text-on-surface flex-1">
                      Mark case <span className="font-bold">#{selectedCase.id}</span> as <span className="font-bold">Reprimand</span>?
                    </p>
                    <button
                      onClick={() => setConfirmState("idle")}
                      className="text-xs font-bold text-secondary hover:text-on-surface px-3 py-1.5 rounded-lg hover:bg-surface transition-colors duration-500"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleUpdateProgress(selectedCase.id, "Reprimand")}
                      disabled={resolvingId === selectedCase.id}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-500 disabled:opacity-60 hover:bg-red-800"
                      style={{ background: "#A32D2D", color: "#fff" }}
                    >
                      {resolvingId === selectedCase.id ? (
                        <span className="material-symbols-outlined animate-spin transition-colors duration-500" style={{ fontSize: 14 }}>progress_activity</span>
                      ) : (
                        <span className="material-symbols-outlined transition-colors duration-500" style={{ fontSize: 14 }}>gavel</span>
                      )}
                      {resolvingId === selectedCase.id ? "Saving…" : "Confirm reprimand"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
