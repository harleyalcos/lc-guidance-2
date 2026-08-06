import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";

interface StudentInfo {
  firstName: string;
  lastName: string;
  middleInitial: string;
  level: string;
  section: string;
  adviser: string;
  role?: string;
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

function formatDateTime(dateStr: string) {
  if (!dateStr) return "—";
  const parsed = new Date(dateStr);

  if (Number.isNaN(parsed.getTime())) {
    return dateStr;
  }

  const hasTime = dateStr.includes("T") || dateStr.includes(":") || dateStr.includes(" ");

  if (!hasTime) {
    return parsed.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };

  let formatted = parsed.toLocaleString("en-PH", options);
  formatted = formatted.replace(" at ", ", ");
  return formatted;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function PendingCases() {
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [confirmState, setConfirmState] = useState<"idle" | "resolving" | "reprimanding" | "closing">("idle");
  const [resolvedIds, setResolvedIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [dateSort] = useState<"desc" | "asc">("desc");
  const [selectedProofs, setSelectedProofs] = useState<ProofItem[]>([]);
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);
  const [isProofLightboxClosing, setIsProofLightboxClosing] = useState(false);

  const [highlightStyle, setHighlightStyle] = useState({ top: 0, height: 0, opacity: 0 });
  const listContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;

    const measure = () => {
      if (!active) return;
      if (selectedId === null || !listContainerRef.current) {
        setHighlightStyle((prev) => ({ ...prev, opacity: 0 }));
        return;
      }
      
      const container = listContainerRef.current;
      const activeEl = container.querySelector(`[data-case-id="${selectedId}"]`) as HTMLElement;
      
      if (activeEl) {
        setHighlightStyle({
          top: activeEl.offsetTop,
          height: activeEl.offsetHeight,
          opacity: 1,
        });
      } else {
        setHighlightStyle((prev) => ({ ...prev, opacity: 0 }));
      }
    };

    // Run measurement on next frame to guarantee DOM layout is ready
    const animId = requestAnimationFrame(measure);

    return () => {
      active = false;
      cancelAnimationFrame(animId);
    };
  }, [selectedId, cases, searchQuery, isLoading]);

  const closeProofLightbox = () => {
    setIsProofLightboxClosing(true);
    window.setTimeout(() => {
      setSelectedProofUrl(null);
      setIsProofLightboxClosing(false);
    }, 200);
  };

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
        payload: {
          students: parseStudents(caseRecord.students),
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
        }
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
    const idStr = c.id.toString();
    const idStrPadded = `#${idStr.padStart(4, "0")}`;
    const students = parseStudents(c.students);
    const matchesStudent = students.some(s => {
      const nameStr = `${s.firstName} ${s.middleInitial} ${s.lastName}`.toLowerCase();
      return s.firstName.toLowerCase().includes(q) ||
        s.lastName.toLowerCase().includes(q) ||
        s.middleInitial.toLowerCase().includes(q) ||
        nameStr.includes(q) ||
        (s.level || "").toLowerCase().includes(q) ||
        (s.section || "").toLowerCase().includes(q);
    });

    return (
      (c.case || "").toLowerCase().includes(q) ||
      (c.title || "").toLowerCase().includes(q) ||
      (c.description || "").toLowerCase().includes(q) ||
      idStr.includes(q) ||
      idStrPadded.includes(q) ||
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


  return (
    <>
      {toast && createPortal(
        <div className={`app-toast fixed bottom-5 right-5 z-[99999999] flex items-start gap-2 rounded-xl px-4 py-3 shadow-xl transition-[transform,opacity] duration-1000 ease-out ${toast.type === "success"
            ? "border border-primary/30 bg-[#EEF2FC] dark:bg-[#1A233D] text-[#002F87] dark:text-[#b4c5ff]"
            : "border border-error/30 bg-error-container text-on-error-container"
          } ${isToastVisible ? "case-toast-x-enter" : "case-toast-x-exit"}`}>
          <span className={`material-symbols-outlined ${toast.type === "success" ? "text-primary dark:text-[#b4c5ff]" : "text-error"}`} style={{ fontSize: 18 }}>
            {toast.type === "success" ? "info" : "error"}
          </span>
          <p className="text-xs font-bold">{toast.message}</p>
        </div>,
        document.body
      )}

      <div
        className="flex flex-col bg-surface dark:bg-surface-container-lowest w-full h-full overflow-hidden animate-fade-in"
      >
        <style>{`
          @keyframes fadeSlideOut {
            from { opacity: 1; transform: translateX(0); }
            to   { opacity: 0; transform: translateX(20px); }
          }
          .case-row-exit { animation: fadeSlideOut 0.45s ease forwards; }
        `}</style>

        {/* ── Body: two-column master-detail ── */}
        <div className="flex flex-1 min-h-0">

          {/* ── LEFT: Case list ── */}
          <div className="w-[340px] shrink-0 border-r border-outline-variant flex flex-col bg-white dark:bg-surface-container h-full overflow-hidden">
            {/* Header / Active Queue */}
            <div className="px-5 py-4 flex items-center justify-between bg-white dark:bg-surface-container shrink-0">
              <span className="text-xs font-bold tracking-widest uppercase text-secondary dark:text-slate-400">Active Queue</span>
              {cases.length > 0 && (
                <span className="bg-[#fee2e2] text-[#b91c1c] text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                  {cases.length} PENDING
                </span>
              )}
            </div>

            {/* Search Input */}
            <div className="px-4 pb-3 border-b border-outline-variant shrink-0 bg-white dark:bg-surface-container">
              <div className="flex items-center gap-2 bg-[#FAF9F6] dark:bg-surface-container-high/40 border border-outline-variant rounded-xl px-3 py-2">
                <span className="material-symbols-outlined text-secondary dark:text-slate-400 text-[18px]">search</span>
                <input
                  type="text"
                  placeholder="Search active queue..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent text-xs text-on-surface dark:text-slate-200 placeholder:text-secondary focus:outline-none w-full"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="text-secondary dark:text-slate-400 hover:text-on-surface dark:text-slate-200 transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">close</span>
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            <div
              ref={listContainerRef}
              className="relative overflow-y-auto flex-1 flex flex-col bg-white dark:bg-surface-container"
            >
              {/* Sliding Highlight Indicator Bar */}
              <div
                className="absolute left-0 w-[4px] bg-[#07132c] dark:bg-primary pointer-events-none transition-all duration-300 cubic-bezier(0.22, 1, 0.36, 1)"
                style={{
                  top: 0,
                  height: highlightStyle.height,
                  transform: `translateY(${highlightStyle.top}px)`,
                  opacity: highlightStyle.opacity,
                  willChange: "transform, height, opacity",
                  zIndex: 10,
                }}
              />
              {isLoading ? (
                <div className="flex flex-col gap-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-16 bg-surface-container dark:bg-surface-container rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : sortedCases.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center py-12">
                  {searchQuery ? (
                    <>
                      <span className="material-symbols-outlined text-secondary dark:text-slate-400" style={{ fontSize: 36 }}>search_off</span>
                      <p className="text-sm font-bold text-on-surface dark:text-slate-200">No results</p>
                      <p className="text-xs text-secondary dark:text-slate-400">Try a different name or case type.</p>
                    </>
                  ) : (
                    <>
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-1 bg-[#E1F5EE] dark:bg-emerald-900/40">
                        <span className="material-symbols-outlined text-[#0F6E56] dark:text-emerald-400" style={{ fontSize: 28 }}>task_alt</span>
                      </div>
                      <p className="text-sm font-bold text-on-surface dark:text-slate-200">All caught up</p>
                      <p className="text-xs text-secondary dark:text-slate-400 leading-relaxed">No pending cases right now. New cases filed as "Pending" will appear here.</p>
                    </>
                  )}
                </div>
              ) : (
                sortedCases.map((c) => {
                  const isSelected = selectedId === c.id;
                  const isExiting = resolvedIds.has(c.id);
                  const indicator = getPendingIndicator(c.date_filed || c.date);
                  return (
                    <button
                      key={c.id}
                      data-case-id={c.id}
                      onClick={() => { setSelectedId(c.id); setConfirmState("idle"); }}
                      className={`relative z-[1] w-full text-left p-4 border-b border-outline-variant transition-all duration-300 ${isSelected
                          ? "bg-[#0B1E43]/10"
                          : "bg-white dark:bg-surface-container hover:bg-[#FAF9F6] dark:hover:bg-surface-container-high/40"
                        } ${isExiting ? "case-row-exit" : ""}`}
                    >
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <div className="flex items-start justify-between gap-1.5">
                          <p className="text-sm font-bold text-primary dark:text-[#7f9cf8] truncate flex-1">
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
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-extrabold border shrink-0 mt-0.5 leading-none"
                              style={{ backgroundColor: indicator.bg, color: indicator.color, borderColor: indicator.border }}
                            >
                              {indicator.days === 0 ? "Today" : `${indicator.days}d`}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-secondary dark:text-slate-400 truncate italic leading-none">{c.case}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-secondary dark:text-slate-400 font-medium">
                          <span>
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
                                <span className="opacity-40">·</span>
                                <span>{students[0].section}</span>
                              </>
                            );
                          })()}
                          <span className="ml-auto opacity-70">{formatDate(c.date)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ── RIGHT: Case detail ── */}
          <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-surface-container h-full overflow-hidden">
            {!selectedCase ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center bg-surface dark:bg-surface-container-lowest">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-surface-container dark:bg-surface-container">
                  <span className="material-symbols-outlined text-secondary dark:text-slate-500" style={{ fontSize: 28 }}>folder_open</span>
                </div>
                <p className="text-sm font-bold text-on-surface dark:text-slate-200">Select a case</p>
                <p className="text-xs text-secondary dark:text-slate-400">Pick a case from the list to see its details and resolve it.</p>
              </div>
            ) : (
              <div className="flex flex-col h-full bg-white dark:bg-surface-container">
                {/* Detail body */}
                <div className="flex-1 px-8 py-6 flex flex-col gap-6 overflow-y-auto bg-white dark:bg-surface-container">

                  {/* Case Title Section */}
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-secondary dark:text-slate-400">
                      Case no. {selectedCase.group_id || `2026-${selectedCase.id.toString().padStart(4, "0")}`}
                    </p>
                    <h3 className="text-2xl font-bold text-primary dark:text-[#7f9cf8] leading-tight">
                      {(() => {
                        const students = parseStudents(selectedCase.students);
                        if (students.length === 0) return "—";
                        const firstStudent = students[0];
                        const name = `${firstStudent.lastName}, ${firstStudent.firstName}${firstStudent.middleInitial ? ` ${firstStudent.middleInitial}.` : ""}`;
                        if (students.length > 1) {
                          const count = students.length - 1;
                          return `${name} and ${count} other respondent${count > 1 ? "s" : ""}`;
                        }
                        return name;
                      })()}
                    </h3>
                    <p className="text-xs text-secondary dark:text-slate-400 mt-0.5">
                      {(() => {
                        const students = parseStudents(selectedCase.students);
                        if (students.length === 0) return "";
                        const firstStudent = students[0];
                        return [
                          firstStudent.level && `Grade ${firstStudent.level.replace("Grade ", "")}`,
                          firstStudent.section && `Section ${firstStudent.section}`,
                          firstStudent.adviser && `Adviser: ${firstStudent.adviser}`
                        ].filter(Boolean).join(" · ");
                      })()}
                    </p>
                  </div>

                  <hr className="border-outline-variant" />

                  {/* Case information */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-4">
                    <div>
                      <p className="text-[11px] text-secondary dark:text-slate-400 font-bold uppercase tracking-wider mb-1">Case type</p>
                      <p className="text-sm font-bold text-on-surface dark:text-slate-200">{selectedCase.case || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-secondary dark:text-slate-400 font-bold uppercase tracking-wider mb-1">Date of Incident</p>
                      <p className="text-sm font-medium text-on-surface dark:text-slate-200">
                        {selectedCase.date.includes('T')
                          ? `${formatDate(selectedCase.date)} ${new Date(selectedCase.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
                          : formatDate(selectedCase.date)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-secondary dark:text-slate-400 font-bold uppercase tracking-wider mb-1">Date filed</p>
                      <p className="text-sm font-medium text-on-surface dark:text-slate-200">{formatDateTime(selectedCase.date_filed || selectedCase.date)}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[11px] text-secondary dark:text-slate-400 font-bold uppercase tracking-wider mb-1">Description</p>
                      <p className="text-sm text-on-surface dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                        {selectedCase.description || <span className="italic text-secondary dark:text-slate-400">No description recorded.</span>}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[11px] text-secondary dark:text-slate-400 font-bold uppercase tracking-wider mb-1">Sanction / action taken</p>
                      <p className="text-sm text-on-surface dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                        {selectedCase.sanction || <span className="italic text-secondary dark:text-slate-400">No sanction recorded.</span>}
                      </p>
                    </div>
                  </div>

                  <hr className="border-outline-variant" />

                  {/* Students Involved section */}
                  <div className="flex flex-col gap-3">
                    <h4 className="text-sm font-bold text-on-surface dark:text-slate-200">Students Involved</h4>
                    {(() => {
                      const students = parseStudents(selectedCase.students);
                      if (students.length === 0) return <p className="text-xs text-secondary dark:text-slate-400 italic">No students recorded.</p>;
                      return (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-outline-variant">
                                <th className="py-2 micro-label text-left">Full name</th>
                                <th className="py-2 micro-label text-left w-24">Grade level</th>
                                <th className="py-2 micro-label text-left w-24">Section</th>
                                <th className="py-2 micro-label text-left w-36">Adviser</th>
                                <th className="py-2 micro-label text-left w-36">Role</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-outline-variant">
                              {students.map((student, idx) => (
                                <tr key={idx} className="hover:bg-surface-container dark:hover:bg-surface-container-high/40 dark:bg-surface-container/10">
                                  <td className="py-3 font-bold text-primary dark:text-[#7f9cf8]">
                                    {`${student.lastName}, ${student.firstName}${student.middleInitial ? ` ${student.middleInitial}.` : ""}`}
                                  </td>
                                  <td className="py-3 text-secondary dark:text-slate-400">
                                    {student.level || "—"}
                                  </td>
                                  <td className="py-3 text-secondary dark:text-slate-400">
                                    {student.section || "—"}
                                  </td>
                                  <td className="py-3 text-secondary dark:text-slate-400">
                                    {student.adviser || "—"}
                                  </td>
                                  <td className="py-3 text-secondary dark:text-slate-400">
                                    {student.role || "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </div>

                  {selectedProofs.length > 0 && (
                    <>
                      <hr className="border-outline-variant" />
                      <div className="flex flex-col gap-3">
                        <h4 className="text-sm font-bold text-on-surface dark:text-slate-200">Attachments</h4>
                        <div className="grid grid-cols-3 gap-3">
                          {selectedProofs.map((proof, index) => (
                            <div
                              key={`${proof.name}-${proof.created_at}-${index}`}
                              className="group relative bg-[#FAF9F6] dark:bg-surface-container-high/40 border border-outline-variant rounded-xl overflow-hidden cursor-pointer aspect-video flex items-center justify-center bg-surface-container dark:bg-surface-container"
                              onClick={() => setSelectedProofUrl(proof.data)}
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
                              </div>
                              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2.5 text-white text-xs truncate font-medium">
                                {proof.name}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                </div>

                {/* ── Resolve / Action bar ── */}
                <div className="px-8 py-4 border-t border-outline-variant bg-white dark:bg-surface-container shrink-0 flex items-center">
                  {confirmState === "idle" && (
                    <div className="flex items-center gap-4 w-full">
                      <p className="text-xs font-bold text-secondary dark:text-slate-400 flex-1">Update the status of this case:</p>
                      <button
                        type="button"
                        onClick={() => setConfirmState("reprimanding")}
                        disabled={resolvingId !== null}
                        className="btn-secondary text-error border-error hover:bg-error/5 font-bold text-xs flex items-center gap-1.5 shadow-sm px-5 py-2.5 bg-white dark:bg-surface-container cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">gavel</span>
                        <span>Mark reprimand</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmState("closing")}
                        disabled={resolvingId !== null}
                        className="btn-secondary text-secondary dark:text-slate-400 border-outline-variant hover:bg-surface-container dark:hover:bg-surface-container-high/40 dark:bg-surface-container font-bold text-xs flex items-center gap-1.5 shadow-sm px-5 py-2.5 bg-white dark:bg-surface-container cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">inventory_2</span>
                        <span>Mark closed</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmState("resolving")}
                        disabled={resolvingId !== null}
                        className="btn-primary flex items-center gap-1.5 text-xs font-bold px-6 py-2.5 bg-[#0B1E43] hover:bg-[#0F2451]"
                      >
                        <span className="material-symbols-outlined text-[16px]">check_circle</span>
                        <span>Resolve case</span>
                      </button>
                    </div>
                  )}

                  {confirmState === "resolving" && (
                    <div className="flex items-center gap-3 bg-surface-container dark:bg-surface-container rounded-xl px-4 py-3 border border-outline-variant w-full">
                      <span className="material-symbols-outlined text-[#0F6E56] dark:text-emerald-400" style={{ fontSize: 18 }}>check_circle</span>
                      <p className="text-sm text-on-surface dark:text-slate-200 flex-1">
                        Mark case <span className="font-bold">#{selectedCase.id}</span> as <span className="font-bold">Resolved</span>?
                      </p>
                      <button
                        type="button"
                        onClick={() => setConfirmState("idle")}
                        className="btn-secondary py-1.5 px-4 text-xs font-bold bg-white dark:bg-surface-container"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                        <span>Cancel</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateProgress(selectedCase.id, "Resolved")}
                        disabled={resolvingId === selectedCase.id}
                        className="btn-primary bg-[#0F6E56] hover:bg-green-800 text-xs font-bold"
                      >
                        {resolvingId === selectedCase.id ? (
                          <span className="material-symbols-outlined animate-spin" style={{ fontSize: 14 }}>progress_activity</span>
                        ) : (
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check</span>
                        )}
                        <span>{resolvingId === selectedCase.id ? "Saving…" : "Confirm resolve"}</span>
                      </button>
                    </div>
                  )}

                  {confirmState === "closing" && (
                    <div className="flex items-center gap-3 bg-surface-container dark:bg-surface-container rounded-xl px-4 py-3 border border-outline-variant w-full">
                      <span className="material-symbols-outlined text-[#4D5A66] dark:text-slate-400" style={{ fontSize: 18 }}>inventory_2</span>
                      <p className="text-sm text-on-surface dark:text-slate-200 flex-1">
                        Mark case <span className="font-bold">#{selectedCase.id}</span> as <span className="font-bold">Closed</span>?
                      </p>
                      <button
                        type="button"
                        onClick={() => setConfirmState("idle")}
                        className="btn-secondary py-1.5 px-4 text-xs font-bold bg-white dark:bg-surface-container"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                        <span>Cancel</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateProgress(selectedCase.id, "Closed")}
                        disabled={resolvingId === selectedCase.id}
                        className="btn-primary bg-[#4D5A66] hover:bg-slate-700 text-xs font-bold"
                      >
                        {resolvingId === selectedCase.id ? (
                          <span className="material-symbols-outlined animate-spin" style={{ fontSize: 14 }}>progress_activity</span>
                        ) : (
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>inventory_2</span>
                        )}
                        <span>Confirm closed</span>
                      </button>
                    </div>
                  )}

                  {confirmState === "reprimanding" && (
                    <div className="flex items-center gap-3 bg-surface-container dark:bg-surface-container rounded-xl px-4 py-3 border border-outline-variant w-full">
                      <span className="material-symbols-outlined text-[#A32D2D] dark:text-red-400" style={{ fontSize: 18 }}>gavel</span>
                      <p className="text-sm text-on-surface dark:text-slate-200 flex-1">
                        Mark case <span className="font-bold">#{selectedCase.id}</span> as <span className="font-bold">Reprimand</span>?
                      </p>
                      <button
                        type="button"
                        onClick={() => setConfirmState("idle")}
                        className="btn-secondary py-1.5 px-4 text-xs font-bold bg-white dark:bg-surface-container"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                        <span>Cancel</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateProgress(selectedCase.id, "Reprimand")}
                        disabled={resolvingId === selectedCase.id}
                        className="btn-primary bg-[#A32D2D] hover:bg-red-800 text-xs font-bold"
                      >
                        {resolvingId === selectedCase.id ? (
                          <span className="material-symbols-outlined animate-spin" style={{ fontSize: 14 }}>progress_activity</span>
                        ) : (
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>gavel</span>
                        )}
                        <span>{resolvingId === selectedCase.id ? "Saving…" : "Confirm reprimand"}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox Modal for Full Image View */}
      {selectedProofUrl && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className={`absolute inset-0 bg-black/80 backdrop-blur-sm ${isProofLightboxClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"
              }`}
            onClick={closeProofLightbox}
          />
          <div className={`relative max-w-4xl max-h-[85vh] z-10 overflow-hidden bg-surface dark:bg-surface-container-lowest rounded-xl shadow-2xl flex flex-col ${isProofLightboxClosing ? "modal-panel-exit" : "modal-panel-enter"
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
    </>
  );
}
