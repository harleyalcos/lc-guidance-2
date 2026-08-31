import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import AcademicMonthRangePicker from "../components/AcademicMonthRangePicker";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import ImportExcelModal from "../components/ImportExcelModal";
import ExportExcelModal, { ExportOptions, ExportColumns } from "../components/ExportExcelModal";
import FileNewCaseModal from "../components/FileNewCaseModal";
import lcOfficialLogo from "../assets/lc-official-logo.jpg";
import guidanceLogo from "../assets/guidance-logo.png";
import { useAcademicYearFilter } from "../context/AcademicYearFilterContext";
import StatCard from "../components/StatCard";

import { CaseRecord, StudentInfo } from "../types";

const formatCaseId = (id: number) => `#${id.toString().padStart(4, "0")}`;

const getMissingFields = (c: CaseRecord): string[] => {
  const missing: string[] = [];
  const students = parseStudents(c.students);
  const firstStudent = students[0];

  const level = firstStudent?.level || c.level;
  const adviser = firstStudent?.adviser || c.adviser;
  const description = c.description;
  const sanction = firstStudent?.sanction || c.sanction;

  if (!level || !level.trim()) missing.push("Grade");
  if (!adviser || !adviser.trim()) missing.push("Adviser");
  if (!description || !description.trim()) missing.push("Description");
  if (!sanction || !sanction.trim()) missing.push("Sanction");

  return missing;
};
const CASES_PER_PAGE = 20;
const ELLIPSIS = "...";
const MODAL_EXIT_MS = 200;
const STATUS_FILTER_OPTIONS = ["All Statuses", "Pending", "Resolved", "Closed", "Reprimand"];

const normalizeRole = (value?: string) => {
  const normalized = value?.trim() ?? "";
  const lower = normalized.toLowerCase();
  if (!normalized || lower === "reporter") return "Respondent";
  if (lower === "accused" || lower === "respondent") return "Respondent";
  if (lower === "complainant" || lower === "complainant / subject") return "Complainant / Subject";
  return normalized;
};

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

const isComplainantSubjectCaseRecord = (caseRecord: CaseRecord) => {
  const firstStudent = parseStudents(caseRecord.students)[0];
  return normalizeRole(firstStudent?.role) === "Complainant / Subject";
};

const getTodayDateString = () => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};



const formatIncidentDate = (dateStr: string) => {
  if (!dateStr) return "—";
  const parsed = new Date(dateStr);

  if (Number.isNaN(parsed.getTime())) {
    return dateStr;
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatIncidentDateWithRelative = (dateStr: string) => {
  if (!dateStr) return "—";
  const parsed = new Date(dateStr);

  if (Number.isNaN(parsed.getTime())) {
    return dateStr;
  }

  const dateFormatted = parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const relative = formatRelativeFiled(dateStr);

  return (
    <div className="flex flex-col leading-tight py-0.5">
      <span className="font-bold text-on-surface text-[13px]">{dateFormatted}</span>
      <span className="text-[11px] text-muted mt-0.5">{relative.primary}</span>
    </div>
  );
};



const arrayBufferToBase64 = (buffer: ArrayBuffer | Uint8Array) => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
};

const imageUrlToBase64 = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load export logo: ${url}`);
  }

  const blob = await response.blob();

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
};

const formatRelativeFiled = (dateStr: string) => {
  if (!dateStr) return { primary: "—", secondary: "" };
  const parsed = new Date(dateStr);

  if (Number.isNaN(parsed.getTime())) {
    return { primary: dateStr, secondary: "" };
  }

  const today = new Date();
  const todayZero = new Date(today);
  todayZero.setHours(0, 0, 0, 0);
  const parsedZero = new Date(parsed);
  parsedZero.setHours(0, 0, 0, 0);

  const diffTime = todayZero.getTime() - parsedZero.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const timeFormatted = parsed.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase());
    return {
      primary: "Today",
      secondary: timeFormatted,
    };
  } else if (diffDays === 1) {
    const timeFormatted = parsed.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase());
    return {
      primary: "Yesterday",
      secondary: timeFormatted,
    };
  } else {
    const dateFormatted = parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return {
      primary: `${diffDays} days ago`,
      secondary: dateFormatted,
    };
  }
};

const isResolved = (progress: string) => progress.toLowerCase() === "resolved";
const isClosed = (progress: string) => progress.toLowerCase() === "closed";
const isReprimand = (caseRecord: CaseRecord) => {
  if ((caseRecord.sanction || "").toLowerCase().includes("reprimand")) {
    return true;
  }
  if ((caseRecord.progress || "").toLowerCase().includes("reprimand")) {
    return true;
  }
  const students = parseStudents(caseRecord.students);
  return students.some((s) => (s.sanction || "").toLowerCase().includes("reprimand"));
};
const isPending = (progress: string) => {
  const normProgress = (progress || "").toLowerCase();
  return normProgress !== "resolved" && normProgress !== "closed";
};

const getBadgeClass = (progress: string) => {
  const normalizedProgress = progress.toLowerCase();

  if (normalizedProgress === "resolved") {
    return "badge-resolved";
  }

  if (normalizedProgress === "closed") {
    return "badge-closed";
  }

  if (normalizedProgress.includes("reprimand")) {
    return "badge-reprimand";
  }

  return "badge-pending";
};

const getRoleBadgeStyles = (role: string) => {
  const normalized = role?.toLowerCase() || "";
  if (normalized === "complainant / subject") {
    return "text-green-600 dark:text-green-400";
  }
  if (normalized === "respondent") {
    return "text-red-600 dark:text-red-400";
  }
  return "text-gray-500 dark:text-gray-400";
};

const getRoleAvatarBgClass = (role?: string) => {
  const normalized = role?.toLowerCase() || "";
  if (normalized === "complainant / subject") return "bg-green-600 dark:bg-green-500";
  if (normalized === "respondent") return "bg-red-600 dark:bg-red-500";
  return "bg-gray-500 dark:bg-gray-650"; // default gray
};

const getInitials = (student: StudentInfo) => {
  const first = student.firstName?.charAt(0)?.toUpperCase() || "";
  const last = student.lastName?.charAt(0)?.toUpperCase() || "";
  return `${first}${last}`;
};

const getAggregateStatusInfo = (groupCases: CaseRecord[]) => {
  const statusCounts = new Map<string, number>();
  groupCases.forEach(c => {
    let status: string;
    if (isReprimand(c)) {
      status = "reprimand";
    } else if (isClosed(c.progress)) {
      status = "closed";
    } else if (isResolved(c.progress)) {
      status = "resolved";
    } else {
      status = "pending";
    }
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
  });
  const entries = Array.from(statusCounts.entries());
  if (entries.length === 1) {
    const [status, count] = entries[0];
    const displayMap: Record<string, string> = {
      reprimand: "reprimanded",
      resolved: "resolved",
      closed: "closed",
      pending: "pending",
    };
    return {
      text: `${count} ${displayMap[status] || status}`,
      badgeClass: `badge-${status}`,
    };
  }
  const severityOrder = ["reprimand", "pending", "resolved", "closed"];
  const sorted = [...entries].sort((a, b) =>
    severityOrder.indexOf(a[0]) - severityOrder.indexOf(b[0])
  );
  const text = sorted.map(([s, count]) => `${count} ${s}`).join(", ");
  const dominantStatus = sorted[0][0];
  return {
    text,
    badgeClass: `badge-${dominantStatus}`,
  };
};

interface CaseGroup {
  groupId: string | null;
  cases: CaseRecord[];
}

export default function CaseCatalog() {
  const navigate = useNavigate();
  const location = useLocation();
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => sessionStorage.getItem("case_catalog_search") || "");
  const [sortBy, setSortBy] = useState<"date_filed" | "date">("date_filed");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState(() => sessionStorage.getItem("case_catalog_status") || "All Statuses");

  const [currentPage, setCurrentPage] = useState<number>(() => {
    const stored = sessionStorage.getItem("case_catalog_current_page");
    return stored ? Number(stored) || 1 : 1;
  });
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isFileNewCaseModalOpen, setIsFileNewCaseModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [isToastVisible, setIsToastVisible] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    try {
      const stored = sessionStorage.getItem("case_catalog_expanded_groups");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [collapsingGroups, setCollapsingGroups] = useState<Set<string>>(new Set());
  const [warningPopover, setWarningPopover] = useState<{
    id: number;
    fields: string[];
    top: number;
    left: number;
    placeAbove: boolean;
    isExiting: boolean;
  } | null>(null);
  const warningCloseTimerRef = useRef<NodeJS.Timeout | null>(null);

  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const isRestoredRef = useRef(false);
  const isFirstRender = useRef(true);

  const handleWarningMouseEnter = (e: React.MouseEvent<HTMLDivElement>, caseRecord: CaseRecord, missingFields: string[]) => {
    if (warningCloseTimerRef.current) {
      clearTimeout(warningCloseTimerRef.current);
      warningCloseTimerRef.current = null;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const modalHeight = 135;
    const modalWidth = 240;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < modalHeight + 16 && rect.top > modalHeight;

    const top = placeAbove
      ? rect.top - modalHeight - 6
      : rect.bottom + 6;

    const left = Math.max(12, Math.min(rect.left - 20, window.innerWidth - modalWidth - 12));

    setWarningPopover({
      id: caseRecord.id,
      fields: missingFields,
      top,
      left,
      placeAbove,
      isExiting: false,
    });
  };

  const handleWarningMouseLeave = () => {
    if (warningCloseTimerRef.current) {
      clearTimeout(warningCloseTimerRef.current);
    }
    setWarningPopover((prev) => (prev ? { ...prev, isExiting: true } : null));
    warningCloseTimerRef.current = setTimeout(() => {
      setWarningPopover(null);
    }, 150);
  };

  const renderCaseIdWithWarning = (caseRecord: CaseRecord) => {
    const missingFields = getMissingFields(caseRecord);
    const formattedId = formatCaseId(caseRecord.id);

    if (missingFields.length === 0) {
      return <span className="case-id px-2 py-0.5 rounded text-data-mono font-data-mono inline-block">{formattedId}</span>;
    }

    return (
      <div className="inline-flex items-center gap-1.5 align-middle">
        <div
          className="inline-flex items-center justify-center cursor-pointer text-amber-500 hover:text-amber-600 transition-colors shrink-0"
          onMouseEnter={(e) => handleWarningMouseEnter(e, caseRecord, missingFields)}
          onMouseLeave={handleWarningMouseLeave}
          title="Incomplete Record - Hover to view missing fields"
        >
          <span className="material-symbols-outlined text-[16px] leading-none text-amber-500 hover:scale-110 transition-transform">
            warning
          </span>
        </div>
        <span className="case-id px-2 py-0.5 rounded text-data-mono font-data-mono inline-block">{formattedId}</span>
      </div>
    );
  };
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleteConfirmClosing, setIsDeleteConfirmClosing] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const statusDropdownRef = useRef<HTMLDivElement | null>(null);

  const handleRowClick = (caseId: number) => {
    const tableScroll = tableContainerRef.current ? tableContainerRef.current.scrollTop : 0;
    const windowScroll = window.scrollY || document.documentElement.scrollTop || 0;
    const mainScroll = document.querySelector("main")?.scrollTop || 0;

    sessionStorage.setItem("case_catalog_table_scroll_top", String(tableScroll));
    sessionStorage.setItem("case_catalog_window_scroll_y", String(windowScroll));
    sessionStorage.setItem("case_catalog_main_scroll_top", String(mainScroll));

    navigate(`/case/${caseId}`);
  };

  useEffect(() => {
    sessionStorage.setItem("case_catalog_search", searchQuery);
    sessionStorage.setItem("case_catalog_status", statusFilter);
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    sessionStorage.setItem("case_catalog_current_page", String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    sessionStorage.setItem("case_catalog_expanded_groups", JSON.stringify(Array.from(expandedGroups)));
  }, [expandedGroups]);

  useEffect(() => {
    const container = tableContainerRef.current;
    const handleScroll = () => {
      if (!isRestoredRef.current) return;

      if (container) {
        sessionStorage.setItem("case_catalog_table_scroll_top", String(container.scrollTop));
      }
      const winScroll = window.scrollY || document.documentElement.scrollTop || 0;
      sessionStorage.setItem("case_catalog_window_scroll_y", String(winScroll));
      const mainEl = document.querySelector("main");
      if (mainEl) {
        sessionStorage.setItem("case_catalog_main_scroll_top", String(mainEl.scrollTop));
      }
    };

    if (container) {
      container.addEventListener("scroll", handleScroll, { passive: true });
    }
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      if (container) {
        container.removeEventListener("scroll", handleScroll);
      }
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useLayoutEffect(() => {
    if (!isLoading) {
      const savedTableScroll = sessionStorage.getItem("case_catalog_table_scroll_top");
      const savedWindowScroll = sessionStorage.getItem("case_catalog_window_scroll_y");
      const savedMainScroll = sessionStorage.getItem("case_catalog_main_scroll_top");

      const targetTable = savedTableScroll ? Number(savedTableScroll) : 0;
      const targetWindow = savedWindowScroll ? Number(savedWindowScroll) : 0;
      const targetMain = savedMainScroll ? Number(savedMainScroll) : 0;

      if (targetTable === 0 && targetWindow === 0 && targetMain === 0) {
        isRestoredRef.current = true;
        return;
      }

      let attempts = 0;
      const maxAttempts = 20; // Try for 2 seconds max

      const restore = () => {
        let restoredTable = false;
        let restoredWindow = false;
        let restoredMain = false;

        if (targetTable > 0 && tableContainerRef.current) {
          tableContainerRef.current.scrollTop = targetTable;
          if (Math.abs(tableContainerRef.current.scrollTop - targetTable) < 2) {
            restoredTable = true;
          }
        } else {
          restoredTable = true;
        }

        if (targetWindow > 0) {
          window.scrollTo({ top: targetWindow, behavior: "instant" });
          document.documentElement.scrollTop = targetWindow;
          document.body.scrollTop = targetWindow;
          const currentWin = window.scrollY || document.documentElement.scrollTop || 0;
          if (Math.abs(currentWin - targetWindow) < 2) {
            restoredWindow = true;
          }
        } else {
          restoredWindow = true;
        }

        if (targetMain > 0) {
          const mainEl = document.querySelector("main");
          if (mainEl) {
            mainEl.scrollTop = targetMain;
            if (Math.abs(mainEl.scrollTop - targetMain) < 2) {
              restoredMain = true;
            }
          }
        } else {
          restoredMain = true;
        }

        return restoredTable && restoredWindow && restoredMain;
      };

      const interval = setInterval(() => {
        const success = restore();
        attempts++;
        if (success || attempts >= maxAttempts) {
          clearInterval(interval);
          requestAnimationFrame(() => {
            isRestoredRef.current = true;
          });
        }
      }, 100);

      // Immediate attempts
      restore();
      requestAnimationFrame(restore);

      return () => {
        clearInterval(interval);
      };
    }
  }, [isLoading]);

  const {
    allYears,
    selectedSchoolYear,
    setSelectedSchoolYear,
    startDate,
    endDate,
    setDateRange,
    isYearsLoading,
  } = useAcademicYearFilter();

  const loadCases = useCallback(async () => {
    if (isYearsLoading || selectedSchoolYear === null) return;
    try {
      setIsLoading(true);
      const queryYear = (selectedSchoolYear === 'all' || (startDate && endDate)) ? null : selectedSchoolYear;
      const loadedCases = await invoke<CaseRecord[]>("get_cases", { 
        schoolYear: queryYear 
      });
      setCases(loadedCases);
      setError(null);
    } catch (err) {
      setCases([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [selectedSchoolYear, isYearsLoading, startDate, endDate]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  useEffect(() => {
    window.addEventListener("cases:changed", loadCases);
    return () => {
      window.removeEventListener("cases:changed", loadCases);
    };
  }, [loadCases]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (location.state && (location.state as any).toastMessage) {
      showToast((location.state as any).toastMessage);
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
    };

    if (isStatusDropdownOpen) {
      document.addEventListener("click", handleClickOutside);
    }

    return () => document.removeEventListener("click", handleClickOutside);
  }, [isStatusDropdownOpen]);

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

  const toggleGroupExpanded = (groupId: string) => {
    if (expandedGroups.has(groupId)) {
      setCollapsingGroups((prev) => new Set(prev).add(groupId));
      setExpandedGroups((prev) => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
      setTimeout(() => {
        setCollapsingGroups((prev) => {
          const next = new Set(prev);
          next.delete(groupId);
          return next;
        });
      }, 300);
    } else {
      setCollapsingGroups((prev) => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
      setExpandedGroups((prev) => new Set(prev).add(groupId));
    }
  };

  const handleViewGroupCase = (group: CaseGroup) => {
    if (!group.groupId) return;
    const tableScroll = tableContainerRef.current ? tableContainerRef.current.scrollTop : 0;
    const windowScroll = window.scrollY || document.documentElement.scrollTop || 0;
    const mainScroll = document.querySelector("main")?.scrollTop || 0;

    sessionStorage.setItem("case_catalog_table_scroll_top", String(tableScroll));
    sessionStorage.setItem("case_catalog_window_scroll_y", String(windowScroll));
    sessionStorage.setItem("case_catalog_main_scroll_top", String(mainScroll));

    navigate(`/group-case/${group.groupId}`);
  };

  const displayCases = useMemo(
    () => cases.filter((caseRecord) => !isComplainantSubjectCaseRecord(caseRecord)),
    [cases]
  );

  const stats = useMemo(() => {
    return {
      totalCases: displayCases.length,
      pendingReview: displayCases.filter((caseRecord) => isPending(caseRecord.progress)).length,
      resolvedAllTime: displayCases.filter((caseRecord) => isResolved(caseRecord.progress)).length,
      reprimandedCases: displayCases.filter(isReprimand).length,
      closedCases: displayCases.filter((caseRecord) => isClosed(caseRecord.progress)).length,
    };
  }, [displayCases]);



  const filteredAndSortedGroups = useMemo(() => {
    let result = displayCases;

    // Search query filter (search Name or Case Type only)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((c) => {
        const students = parseStudents(c.students);
        let matchesName = false;
        
        if (students.length > 0) {
          matchesName = students.some(s => {
            const fullName = `${s.firstName} ${s.middleInitial} ${s.lastName}`.toLowerCase();
            return s.firstName.toLowerCase().includes(q) ||
              s.lastName.toLowerCase().includes(q) ||
              s.middleInitial.toLowerCase().includes(q) ||
              fullName.includes(q);
          });
        } else {
          const fullName = `${c.first_name} ${c.middle_initial} ${c.last_name}`.toLowerCase();
          matchesName = c.first_name.toLowerCase().includes(q) ||
            c.last_name.toLowerCase().includes(q) ||
            c.middle_initial.toLowerCase().includes(q) ||
            fullName.includes(q);
        }

        const matchesCaseType = c.case.toLowerCase().includes(q);

        return matchesName || matchesCaseType;
      });
    }





    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      result = result.filter((c) => {
        const dateVal = new Date(c.date_filed || c.date);
        return dateVal >= start;
      });
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      result = result.filter((c) => {
        const dateVal = new Date(c.date_filed || c.date);
        return dateVal <= end;
      });
    }

    result = [...result].sort((a, b) => {
      const dateA = new Date(sortBy === "date_filed" ? (a.date_filed || a.date) : a.date).getTime();
      const dateB = new Date(sortBy === "date_filed" ? (b.date_filed || b.date) : b.date).getTime();

      if (dateA !== dateB) {
        if (sortOrder === "asc") return dateA - dateB;
        return dateB - dateA;
      }
      return b.id - a.id;
    });

    const groupsMap = new Map<string, CaseRecord[]>();
    const unlinkedGroups: CaseGroup[] = [];

    result.forEach(c => {
      if (c.group_id) {
        if (!groupsMap.has(c.group_id)) {
          groupsMap.set(c.group_id, []);
        }
        groupsMap.get(c.group_id)!.push(c);
      } else {
        unlinkedGroups.push({ groupId: null, cases: [c] });
      }
    });

    const linkedGroups: CaseGroup[] = Array.from(groupsMap.entries()).map(([groupId, items]) => ({
      groupId,
      cases: items.sort((a, b) => {
        const roleOrder = (role: string) => {
          const r = role.toLowerCase();
          if (r === "complainant / subject") return 1;
          if (r === "respondent") return 2;
          return 4;
        };
        const roleA = parseStudents(a.students)[0]?.role || "";
        const roleB = parseStudents(b.students)[0]?.role || "";
        if (roleOrder(roleA) !== roleOrder(roleB)) {
          return roleOrder(roleA) - roleOrder(roleB);
        }
        return b.id - a.id;
      })
    }));

    const matchesStatusFilter = (caseRecord: CaseRecord) => {
      if (statusFilter === "Pending") return isPending(caseRecord.progress);
      if (statusFilter === "Resolved") return isResolved(caseRecord.progress);
      if (statusFilter === "Closed") return isClosed(caseRecord.progress);
      if (statusFilter === "Reprimand") return isReprimand(caseRecord);
      return true;
    };

    const allGroups = [...linkedGroups, ...unlinkedGroups]
      .filter((group) => statusFilter === "All Statuses" || group.cases.some(matchesStatusFilter))
      .sort((a, b) => {
      const repA = a.cases[0];
      const repB = b.cases[0];
      const dateA = new Date(sortBy === "date_filed" ? (repA.date_filed || repA.date) : repA.date).getTime();
      const dateB = new Date(sortBy === "date_filed" ? (repB.date_filed || repB.date) : repB.date).getTime();

      if (dateA !== dateB) {
        if (sortOrder === "asc") return dateA - dateB;
        return dateB - dateA;
      }
      return repB.id - repA.id;
    });

    return allGroups;
  }, [displayCases, searchQuery, sortBy, sortOrder, statusFilter, startDate, endDate]);

  const filteredAndSortedCases = useMemo(() => {
    return filteredAndSortedGroups.flatMap((g) => g.cases);
  }, [filteredAndSortedGroups]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedGroups.length / CASES_PER_PAGE));
  const paginatedGroups = useMemo(() => {
    const startIndex = (currentPage - 1) * CASES_PER_PAGE;
    return filteredAndSortedGroups.slice(startIndex, startIndex + CASES_PER_PAGE);
  }, [filteredAndSortedGroups, currentPage]);
  const visiblePageItems = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => String(index + 1));
    }

    const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
    if (currentPage <= 4) {
      [2, 3, 4, 5].forEach((page) => pages.add(page));
    }
    if (currentPage >= totalPages - 3) {
      [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1].forEach((page) => pages.add(page));
    }

    const sortedPages = Array.from(pages)
      .filter((page) => page >= 1 && page <= totalPages)
      .sort((a, b) => a - b);

    return sortedPages.flatMap((page, index) => {
      const previousPage = sortedPages[index - 1];
      if (index > 0 && previousPage && page - previousPage > 1) {
        return [ELLIPSIS, String(page)];
      }
      return [String(page)];
    });
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setCurrentPage(1);
  }, [searchQuery, statusFilter, startDate, endDate]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const handleSort = (field: "date_filed" | "date") => {
    if (sortBy === field) {
      setSortOrder((order) => order === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  const handlePreviousPage = () => {
    setCurrentPage((page) => Math.max(1, page - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((page) => Math.min(totalPages, page + 1));
  };




  const isFilterModified =
    searchQuery !== "" ||
    statusFilter !== "All Statuses" ||
    startDate !== "" ||
    endDate !== "";

  const resetFilters = () => {
    setSearchQuery("");
    setStatusFilter("All Statuses");
    setDateRange("", "");
  };

  const handleDeleteCase = async () => {
    if (deleteConfirmId === null) return;
    if (deleteConfirmText !== `Confirm${formatCaseId(deleteConfirmId)}`) return;
    try {
      await invoke("delete_case", { id: deleteConfirmId });
      closeDeleteConfirm();
      window.dispatchEvent(new Event("cases:changed"));
    } catch (err) {
      alert("Failed to delete case: " + err);
    }
  };

  const closeDeleteConfirm = () => {
    setIsDeleteConfirmClosing(true);
    window.setTimeout(() => {
      setDeleteConfirmId(null);
      setDeleteConfirmText("");
      setIsDeleteConfirmClosing(false);
    }, MODAL_EXIT_MS);
  };

  const handleExportExcelWithOptions = async (options: ExportOptions) => {
    const targetCases = cases.filter((c) => {
      // 1. Scope filter
      if (options.scope === "specific") {
        if (!c.level || c.level.trim().toLowerCase() !== options.selectedGrade.toLowerCase()) {
          return false;
        }
      }

      // 2. Status filter
      if (options.selectedStatus !== "all" && options.selectedStatus !== "All Statuses") {
        if (c.progress?.toLowerCase() !== options.selectedStatus.toLowerCase()) {
          return false;
        }
      }

      // 3. Date range filter
      if (options.startDate || options.endDate) {
        const caseDateStr = c.date;
        if (caseDateStr) {
          if (options.startDate && caseDateStr < options.startDate) return false;
          if (options.endDate && caseDateStr > options.endDate) return false;
        }
      }

      // 4. Search query filter
      if (options.searchQuery.trim()) {
        const query = options.searchQuery.trim().toLowerCase();
        let nameMatch = false;

        try {
          if (c.students) {
            const arr = JSON.parse(c.students);
            if (Array.isArray(arr)) {
              nameMatch = arr.some((s: any) =>
                `${s.firstName} ${s.lastName}`.toLowerCase().includes(query)
              );
            }
          }
        } catch {
          // ignore
        }

        if (!nameMatch) {
          const fullName = `${c.first_name} ${c.last_name}`.toLowerCase();
          const caseTitle = (c.case || "").toLowerCase();
          const section = (c.section || "").toLowerCase();
          const adviser = (c.adviser || "").toLowerCase();

          if (
            !fullName.includes(query) &&
            !caseTitle.includes(query) &&
            !section.includes(query) &&
            !adviser.includes(query)
          ) {
            return false;
          }
        }
      }

      return true;
    });

    if (targetCases.length === 0) {
      showToast("No cases match the selected export criteria.");
      return;
    }

    const getStudentFullName = (c: CaseRecord) => {
      try {
        if (c.students) {
          const studentsArr = JSON.parse(c.students);
          if (Array.isArray(studentsArr) && studentsArr.length > 0) {
            return studentsArr.map((s: any) => {
              const mi = s.middleInitial ? ` ${s.middleInitial}.` : "";
              return `${s.lastName}, ${s.firstName}${mi}`;
            }).join("\n");
          }
        }
      } catch {
        // fallback
      }
      const mi = c.middle_initial ? ` ${c.middle_initial}.` : "";
      return `${c.last_name}, ${c.first_name}${mi}`;
    };

    const getStudentRoles = (c: CaseRecord) => {
      try {
        if (c.students) {
          const studentsArr = JSON.parse(c.students);
          if (Array.isArray(studentsArr) && studentsArr.length > 0) {
            return studentsArr.map((s: any) => {
              const r = s.role || "Respondent";
              return `${s.lastName}, ${s.firstName}: ${r}`;
            }).join("\n");
          }
        }
      } catch {
        // fallback
      }
      return "Respondent";
    };

    const getProofsCount = (c: CaseRecord) => {
      if (!c.proofs) return "0";
      try {
        const parsed = JSON.parse(c.proofs);
        return Array.isArray(parsed) ? `${parsed.length}` : "0";
      } catch {
        return "0";
      }
    };

    const getUpdateHistorySummary = (c: CaseRecord) => {
      if (!c.update_history) return "None";
      try {
        const history = JSON.parse(c.update_history);
        return Array.isArray(history) && history.length > 0 ? `${history.length} update(s)` : "None";
      } catch {
        return "None";
      }
    };

    const formatDateFiled = (dateStr?: string) => {
      if (!dateStr) return "—";
      try {
        return new Date(dateStr).toLocaleString();
      } catch {
        return dateStr;
      }
    };

    const allColumnDefs = [
      // First 8 standard importable fields (Default = true)
      { key: "fullName", header: "Full Name", width: 26, getValue: getStudentFullName },
      { key: "date", header: "Date", width: 18, getValue: (c: CaseRecord) => c.date || "" },
      { key: "case", header: "Case", width: 22, getValue: (c: CaseRecord) => c.case || "" },
      { key: "sanction", header: "Sanction", width: 24, getValue: (c: CaseRecord) => c.sanction || "" },
      { key: "progress", header: "Progress", width: 16, getValue: (c: CaseRecord) => c.progress || "" },
      { key: "level", header: "Grade", width: 16, getValue: (c: CaseRecord) => c.level || "" },
      { key: "section", header: "Section", width: 22, getValue: (c: CaseRecord) => c.section || "" },
      { key: "adviser", header: "Adviser", width: 22, getValue: (c: CaseRecord) => c.adviser || "" },

      // Additional case details fields (Default = false)
      { key: "caseId", header: "Case ID", width: 14, getValue: (c: CaseRecord) => `#${c.id.toString().padStart(4, "0")}` },
      { key: "title", header: "Case Title", width: 28, getValue: (c: CaseRecord) => c.title || "—" },
      { key: "dateFiled", header: "Date", width: 22, getValue: (c: CaseRecord) => formatDateFiled(c.date_filed) },
      { key: "description", header: "Description", width: 35, getValue: (c: CaseRecord) => c.description || "—" },
      { key: "role", header: "Student Roles", width: 26, getValue: getStudentRoles },
      { key: "reportingStudent", header: "Reporting Student", width: 24, getValue: (c: CaseRecord) => c.reporting_student || "—" },
      { key: "schoolYear", header: "Year", width: 18, getValue: (c: CaseRecord) => c.school_year || (c.date ? c.date.slice(0, 4) : "—") },
      { key: "groupId", header: "Group ID", width: 26, getValue: (c: CaseRecord) => c.group_id || "—" },
      { key: "proofsCount", header: "Attached Proofs", width: 18, getValue: getProofsCount },
      { key: "updateHistory", header: "Update History", width: 20, getValue: getUpdateHistorySummary },
    ];

    const activeCols = allColumnDefs.filter((col) => options.columns[col.key as keyof ExportColumns]);

    if (activeCols.length === 0) {
      showToast("Please select at least one column to export.");
      return;
    }

    const filenameParts: string[] = ["cases_export"];
    if (options.selectedStatus !== "all" && options.selectedStatus !== "All Statuses") {
      filenameParts.push(options.selectedStatus.toLowerCase());
    }
    if (options.scope === "specific") {
      filenameParts.push(options.selectedGrade.toLowerCase().replace(/\s+/g, "_"));
    }
    if (options.startDate || options.endDate) {
      const start = options.startDate ? options.startDate.replace(/-/g, "") : "Any";
      const end = options.endDate ? options.endDate.replace(/-/g, "") : "Any";
      filenameParts.push(`${start}_to_${end}`);
    }
    if (options.searchQuery.trim()) {
      filenameParts.push(`search_${options.searchQuery.trim().replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}`);
    }
    if (filenameParts.length === 1) {
      filenameParts.push(getTodayDateString());
    }
    const filename = `${filenameParts.join("_")}.xlsx`;

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "LC Guidance";
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet("Cases");

      activeCols.forEach((col, index) => {
        worksheet.getColumn(index + 1).width = col.width;
      });

      // Official document header
      worksheet.addRow([]);
      worksheet.addRow([]);
      worksheet.addRow([]);
      worksheet.addRow([]);

      const colEndLetter = String.fromCharCode(65 + Math.max(1, activeCols.length - 1));
      worksheet.mergeCells(`B1:${colEndLetter}1`);
      worksheet.mergeCells(`B2:${colEndLetter}2`);
      worksheet.mergeCells(`B3:${colEndLetter}3`);

      worksheet.getCell("B1").value = "LAGUNA COLLEGE";
      worksheet.getCell("B2").value = "San Pablo City";
      worksheet.getCell("B3").value = "Guidance Office";

      worksheet.getRow(1).height = 20;
      worksheet.getRow(2).height = 17;
      worksheet.getRow(3).height = 27;
      worksheet.getRow(4).height = 6;

      worksheet.getCell("B1").font = { name: "Georgia", bold: true, size: 13, color: { argb: "FF000000" } };
      worksheet.getCell("B2").font = { name: "Georgia", bold: true, size: 11, color: { argb: "FF000000" } };
      worksheet.getCell("B3").font = { name: "Georgia", bold: true, size: 18, color: { argb: "FF000000" } };

      ["B1", "B2", "B3"].forEach((cellRef) => {
        worksheet.getCell(cellRef).alignment = { horizontal: "center", vertical: "middle" };
      });

      const [lcLogoBase64, guidanceLogoBase64] = await Promise.all([
        imageUrlToBase64(lcOfficialLogo),
        imageUrlToBase64(guidanceLogo),
      ]);

      const lcImageId = workbook.addImage({
        base64: lcLogoBase64,
        extension: "jpeg",
      });
      const guidanceImageId = workbook.addImage({
        base64: guidanceLogoBase64,
        extension: "png",
      });

      worksheet.addImage(lcImageId, {
        tl: { col: 0.5, row: 0 },
        ext: { width: 86, height: 86 },
        editAs: "oneCell",
      });
      worksheet.addImage(guidanceImageId, {
        tl: { col: Math.max(2, activeCols.length - 0.5), row: 0 },
        ext: { width: 86, height: 86 },
        editAs: "oneCell",
      });

      worksheet.addRow([`Date of Export: ${new Date().toLocaleDateString()}`]);

      let filterText = "Filters: None";
      const activeFilters = [];
      if (options.scope === "specific") activeFilters.push(`Scope: ${options.selectedGrade}`);
      if (options.selectedStatus !== "all" && options.selectedStatus !== "All Statuses") activeFilters.push(`Status: ${options.selectedStatus}`);
      if (options.startDate || options.endDate) activeFilters.push(`Date Range: ${options.startDate || 'Any'} to ${options.endDate || 'Any'}`);
      if (options.searchQuery) activeFilters.push(`Search: ${options.searchQuery}`);
      if (activeFilters.length > 0) filterText = `Filters: ${activeFilters.join(" | ")}`;

      worksheet.addRow([filterText]);
      worksheet.addRow([]); // Empty row

      worksheet.views = [{ state: "frozen", ySplit: 8 }];

      const headers = activeCols.map((c) => c.header);
      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF002F87" },
      };

      targetCases.forEach((c) => {
        const rowData = activeCols.map((col) => col.getValue(c));
        worksheet.addRow(rowData);
      });

      worksheet.eachRow((row: ExcelJS.Row, rowNumber: number) => {
        if (rowNumber <= 7) return;
        row.eachCell((cell: ExcelJS.Cell) => {
          cell.alignment = { vertical: "top", wrapText: true };
          cell.border = {
            top: { style: "thin", color: { argb: "FF9CA3AF" } },
            left: { style: "thin", color: { argb: "FF9CA3AF" } },
            bottom: { style: "thin", color: { argb: "FF9CA3AF" } },
            right: { style: "thin", color: { argb: "FF9CA3AF" } },
          };
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const isZipExport = options.columns.proofsCount || options.columns.updateHistory;

      if (isZipExport) {
        const zip = new JSZip();
        // Add the main Excel spreadsheet to the root of the ZIP
        zip.file(filename, buffer);

        // 1. Add attached_proofs/ folder if Attached Proofs is checked
        if (options.columns.proofsCount) {
          const proofsFolder = zip.folder("attached_proofs");
          targetCases.forEach((c) => {
            if (c.proofs) {
              try {
                const parsedProofs = JSON.parse(c.proofs);
                if (Array.isArray(parsedProofs) && parsedProofs.length > 0) {
                  const caseIdStr = `#${c.id.toString().padStart(4, "0")}`;
                  const safeName = getStudentFullName(c).replace(/[\r\n,]+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "_");
                  const caseFolder = proofsFolder?.folder(`Case_${caseIdStr}_${safeName}`);

                  parsedProofs.forEach((proof: any, idx: number) => {
                    if (proof.data && typeof proof.data === "string") {
                      const match = proof.data.match(/^data:([^;]+);base64,(.+)$/);
                      const base64Str = match ? match[2] : proof.data;
                      try {
                        const binaryStr = atob(base64Str);
                        const bytes = new Uint8Array(binaryStr.length);
                        for (let i = 0; i < binaryStr.length; i++) {
                          bytes[i] = binaryStr.charCodeAt(i);
                        }
                        const cleanFileName = (proof.name || `proof_${idx + 1}.png`).replace(/[^a-zA-Z0-9._-]/g, "_");
                        caseFolder?.file(cleanFileName, bytes);
                      } catch (err) {
                        console.error("Failed to parse proof data", err);
                      }
                    }
                  });
                }
              } catch {
                // ignore invalid proof JSON
              }
            }
          });
        }

        // 2. Add update_history/ folder if Update History is checked
        if (options.columns.updateHistory) {
          const historyFolder = zip.folder("update_history");
          targetCases.forEach((c) => {
            if (c.update_history) {
              try {
                const parsedHistory = JSON.parse(c.update_history);
                const caseIdStr = `#${c.id.toString().padStart(4, "0")}`;
                const safeName = getStudentFullName(c).replace(/[\r\n,]+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "_");

                let logTxt = `==================================================\n`;
                logTxt += `CASE UPDATE HISTORY LOG - Case ${caseIdStr}\n`;
                logTxt += `Student(s) : ${getStudentFullName(c).replace(/\n/g, "; ")}\n`;
                logTxt += `Case Type  : ${c.case || "—"}\n`;
                logTxt += `Sanction   : ${c.sanction || "—"}\n`;
                logTxt += `Progress   : ${c.progress || "—"}\n`;
                logTxt += `Date       : ${c.date_filed || "—"}\n`;
                logTxt += `Year       : ${c.school_year || (c.date ? c.date.slice(0, 4) : "—")}\n`;
                logTxt += `==================================================\n\n`;

                if (Array.isArray(parsedHistory) && parsedHistory.length > 0) {
                  logTxt += `LOGGED UPDATES & AUDIT TRAIL (${parsedHistory.length}):\n`;
                  logTxt += `--------------------------------------------------\n`;
                  parsedHistory.forEach((item: any, idx: number) => {
                    logTxt += `[Update #${idx + 1}]\n`;
                    if (item.timestamp || item.date) logTxt += `Date/Time : ${item.timestamp || item.date}\n`;
                    if (item.action) logTxt += `Action    : ${item.action}\n`;
                    if (item.field) logTxt += `Field     : ${item.field}\n`;
                    if (item.oldValue !== undefined) logTxt += `Previous  : ${typeof item.oldValue === 'object' ? JSON.stringify(item.oldValue) : item.oldValue}\n`;
                    if (item.newValue !== undefined) logTxt += `New Value : ${typeof item.newValue === 'object' ? JSON.stringify(item.newValue) : item.newValue}\n`;
                    if (item.user) logTxt += `User      : ${item.user}\n`;
                    if (item.note) logTxt += `Note      : ${item.note}\n`;
                    logTxt += `--------------------------------------------------\n`;
                  });
                } else {
                  logTxt += `No updates logged for this record.\n`;
                }

                historyFolder?.file(`Case_${caseIdStr}_${safeName}_history.txt`, logTxt);
              } catch {
                // ignore invalid update history JSON
              }
            }
          });
        }

        const zipFilename = filename.replace(/\.xlsx$/i, ".zip");
        const zipContent = await zip.generateAsync({ type: "uint8array" });
        const base64Data = arrayBufferToBase64(zipContent);
        await invoke("save_file", { base64Data, filename: zipFilename });
        showToast(`Successfully exported ZIP archive (${zipFilename}) with Excel sheet & folders.`);
      } else {
        const base64Data = arrayBufferToBase64(buffer as ArrayBuffer);
        await invoke("save_file", { base64Data, filename });
        showToast(`Successfully exported ${targetCases.length} case(s) to Excel.`);
      }
    } catch (err) {
      alert("Failed to export: " + err);
    }
  };

  return (
    <>
      {toastMessage && createPortal(
        <div className={`app-toast fixed bottom-5 right-5 z-[70] flex items-start gap-2 rounded-xl border border-primary/30 bg-[#EEF2FC] dark:bg-[#1A233D] px-4 py-3 text-[#002F87] dark:text-[#b4c5ff] shadow-xl ${isToastVisible ? "case-toast-x-enter" : "case-toast-x-exit"}`}>
          <span className="material-symbols-outlined text-primary dark:text-[#b4c5ff]" style={{ fontSize: 18 }}>info</span>
          <p className="text-xs font-bold">{toastMessage}</p>
        </div>,
        document.body
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h1 className="page-header-h1 m-0">Case Catalog</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="btn-secondary"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            <span>Import Excel</span>
          </button>
          <button
            onClick={() => {
              if (cases.length === 0) {
                showToast("No cases available to export.");
                return;
              }
              setIsExportModalOpen(true);
            }}
            className="btn-secondary"
          >
            <span className="material-symbols-outlined text-[18px]">table_view</span>
            <span>Export to Excel</span>
          </button>
          <button
            onClick={() => setIsFileNewCaseModalOpen(true)}
            className="btn-primary"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>File New Case</span>
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Total Cases" value={isLoading ? "..." : stats.totalCases} icon="analytics" colorClass="text-primary bg-primary/5" />
        <StatCard label="Pending Cases" value={isLoading ? "..." : stats.pendingReview} icon="pending_actions" colorClass="text-[#D9A23B] bg-[#D9A23B]/5" />
        <StatCard label="Resolved Cases" value={isLoading ? "..." : stats.resolvedAllTime} icon="task_alt" colorClass="text-[#15803D] bg-[#15803D]/5" />
        <StatCard label="Closed Cases" value={isLoading ? "..." : stats.closedCases} icon="cancel" colorClass="text-[#4B5563] bg-[#4B5563]/5" />
        <StatCard label="Reprimanded" value={isLoading ? "..." : stats.reprimandedCases} icon="gavel" colorClass="text-[#6B7280] bg-[#6B7280]/5" />
      </div>

      {/* Search & Filters System */}
      <div className="bg-surface px-4 py-4 border border-outline-variant rounded-xl shadow-sm w-full flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-grow md:max-w-md">
            <span className="material-symbols-outlined text-secondary absolute left-3 top-1/2 -translate-y-1/2" style={{ fontSize: '18px' }}>search</span>
            <input
              type="text"
              placeholder="Search by Name or Case Type"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 h-10 bg-surface border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-on-surface placeholder:text-on-surface-variant/70"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-on-surface flex items-center justify-center transition-colors duration-500"
              >
                <span className="material-symbols-outlined transition-colors duration-500" style={{ fontSize: '16px' }}>close</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative" ref={statusDropdownRef}>
              <button
                type="button"
                onClick={() => setIsStatusDropdownOpen((open) => !open)}
                className={`group inline-flex h-[38px] w-[205px] items-center gap-2 rounded-lg border bg-surface px-3 text-left text-[13px] transition-all duration-300 ease-out ${isStatusDropdownOpen
                    ? "border-primary bg-surface-container ring-2 ring-primary/20 shadow-sm"
                    : "border-outline-variant hover:border-primary/60 hover:bg-surface-container"
                  }`}
              >
                <span className="material-symbols-outlined text-secondary transition-colors duration-300 group-hover:text-primary" style={{ fontSize: 16 }}>filter_list</span>
                <span className="text-xs font-bold uppercase tracking-wider text-secondary">Status</span>
                <span className="min-w-0 flex-1 truncate font-bold text-on-surface">
                  {statusFilter === "All Statuses" ? "All" : statusFilter}
                </span>
                <span
                  className={`material-symbols-outlined text-secondary transition-transform duration-300 ${isStatusDropdownOpen ? "rotate-180" : "rotate-0"
                    }`}
                  style={{ fontSize: 18 }}
                >
                  expand_more
                </span>
              </button>

              {isStatusDropdownOpen && (
                <div className="absolute left-0 top-full z-30 mt-2 w-[205px] overflow-hidden rounded-xl border border-outline-variant bg-surface dark:bg-surface-container p-1.5 shadow-lg filter-dropdown-enter">
                  {STATUS_FILTER_OPTIONS.map((status) => {
                    const isSelected = statusFilter === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => {
                          setStatusFilter(status);
                          setIsStatusDropdownOpen(false);
                        }}
                        className={`group/status flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-all duration-300 ${isSelected
                            ? "bg-[#EEEDFE] dark:bg-[#1A233D] text-[#3C3489] dark:text-[#b4c5ff]"
                            : "text-on-surface hover:bg-surface-container"
                          }`}
                      >
                        <span className={`h-2 w-2 rounded-full transition-colors duration-300 ${status === "Pending" ? "bg-[#f59e0b]" :
                            status === "Resolved" ? "bg-[#22c55e]" :
                              status === "Closed" ? "bg-[#9ca3af]" :
                                status === "Reprimand" ? "bg-[#ef4444]" :
                                  "bg-[#7B6FE8] dark:bg-[#94AAF0]"
                          }`} />
                        <span className="flex-1 font-medium">{status === "All Statuses" ? "All" : status}</span>
                        {isSelected && (
                          <span className="material-symbols-outlined text-[#7B6FE8] dark:text-[#b4c5ff]" style={{ fontSize: 16 }}>check</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <AcademicMonthRangePicker
              allYears={allYears}
              schoolYear={selectedSchoolYear}
              onSelectSchoolYear={setSelectedSchoolYear}
              isLoadingYears={isYearsLoading}
              startDate={startDate}
              endDate={endDate}
              placeholder="All Records"
              onRangeChange={(start, end) => setDateRange(start, end)}
            />
          </div>
        </div>

        {/* Active Filters Row */}
        {isFilterModified && (
          <div className="flex flex-wrap items-center gap-2 pt-3 mt-3 border-t border-outline-variant">
            {searchQuery && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container border border-outline-variant text-xs text-on-surface">
                <span className="font-medium">"{searchQuery}"</span>
                <button onClick={() => setSearchQuery("")} className="text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors duration-500">
                  <span className="material-symbols-outlined transition-colors duration-500" style={{ fontSize: '14px' }}>close</span>
                </button>
              </div>
            )}

            {statusFilter !== "All Statuses" && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container border border-outline-variant text-xs text-on-surface">
                <span className="text-on-surface-variant">Status:</span>
                <span className="font-medium">{statusFilter}</span>
                <button onClick={() => setStatusFilter("All Statuses")} className="text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors duration-500">
                  <span className="material-symbols-outlined transition-colors duration-500" style={{ fontSize: '14px' }}>close</span>
                </button>
              </div>
            )}



            {(startDate || endDate) && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container border border-outline-variant text-xs text-on-surface">
                <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '14px' }}>calendar_today</span>
                <span className="font-medium">
                  {startDate ? formatIncidentDate(startDate) : "Any"} - {endDate ? formatIncidentDate(endDate) : "Any"}
                </span>
                <button onClick={() => setDateRange("", "")} className="text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors duration-500">
                  <span className="material-symbols-outlined transition-colors duration-500" style={{ fontSize: '14px' }}>close</span>
                </button>
              </div>
            )}

            <button onClick={resetFilters} className="text-xs text-primary hover:text-primary/80 font-medium ml-1 transition-colors duration-500">
              Clear all
            </button>
          </div>
        )}
      </div>

      <div className="bg-surface border border-outline-variant rounded-lg overflow-hidden shadow-sm flex flex-col">
        <div ref={tableContainerRef} className="overflow-x-auto overflow-y-scroll h-[calc(100vh-310px)] min-h-[250px] [scrollbar-gutter:stable]">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead className="sticky top-0 z-10">
              <tr className="bg-surface-container font-section-header text-sm text-on-surface">
                <th className="p-table-cell-padding micro-label border-b border-outline-variant">ID</th>
                <th
                  className="p-table-cell-padding micro-label cursor-pointer select-none group border-b border-outline-variant hover:bg-surface-variant transition-colors"
                  onClick={() => handleSort("date_filed")}
                >
                  <div className="flex items-center gap-1">
                    Date
                    <span className={`material-symbols-outlined text-[16px] transition-[color,opacity,transform] duration-300 ease-out ${sortBy === "date_filed" ? "text-primary" : "text-secondary opacity-30 group-hover:opacity-100"
                      } ${sortBy === "date_filed" && sortOrder === "desc" ? "rotate-180" : "rotate-0"}`}>
                      arrow_upward
                    </span>
                  </div>
                </th>
                <th className="p-table-cell-padding micro-label border-b border-outline-variant">Student(s) Involved</th>
                <th className="p-table-cell-padding micro-label border-b border-outline-variant">Case Type</th>
                <th className="p-table-cell-padding micro-label text-center border-b border-outline-variant">Status</th>
                <th className="p-table-cell-padding micro-label border-b border-outline-variant">Adviser</th>
                <th className="py-1 px-4 border-b border-outline-variant"></th>
              </tr>
            </thead>
            {isLoading && (
              <tbody className="font-body-md text-sm text-on-surface">
                <tr>
                  <td className="p-table-cell-padding text-on-surface-variant text-center" colSpan={7}>
                    Loading cases...
                  </td>
                </tr>
              </tbody>
            )}
            {!isLoading && error && (
              <tbody className="font-body-md text-sm text-on-surface">
                <tr>
                  <td className="p-table-cell-padding text-on-surface-variant text-center" colSpan={7}>
                    Backend unavailable. Open with npm run tauri -- dev to load cases.
                  </td>
                </tr>
              </tbody>
            )}
            {!isLoading && !error && filteredAndSortedGroups.length === 0 && (
              <tbody className="font-body-md text-sm text-on-surface">
                <tr>
                  <td className="p-table-cell-padding text-on-surface-variant text-center" colSpan={7}>
                    {isFilterModified ? "No results found." : "No records found."}
                  </td>
                </tr>
              </tbody>
            )}
            {!isLoading && !error && paginatedGroups.map((group) => {
              const isCollapsible = group.groupId !== null && group.cases.length >= 3;
              const isExpanded = group.groupId ? expandedGroups.has(group.groupId) : false;
              const isCollapsing = group.groupId ? collapsingGroups.has(group.groupId) : false;
              const showSubRows = isExpanded || isCollapsing;

              if (isCollapsible) {
                const rep = group.cases[0];
                const aggregateStatus = getAggregateStatusInfo(group.cases);
                const headerBorderB = "border-b border-outline-variant";

                return (
                  <tbody key={group.groupId!} className="font-body-md text-sm text-on-surface">
                    <tr
                      className={`catalog-page-enter cursor-pointer transition-all duration-300 select-none group/row ${
                        isExpanded ? "bg-primary/5 dark:bg-primary/10" : ""
                      }`}
                      onClick={() => toggleGroupExpanded(group.groupId!)}
                      aria-expanded={isExpanded}
                    >
                      <td className={`p-table-cell-padding transition-colors duration-300 border-l-[3px] ${isExpanded ? "border-l-primary" : "border-l-outline-variant"} bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40 ${headerBorderB}`}>
                        <span
                          className="material-symbols-outlined text-[18px] text-secondary transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] inline-block"
                          style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                        >
                          chevron_right
                        </span>
                      </td>
                      <td className={`p-table-cell-padding transition-colors duration-300 bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40 ${headerBorderB}`}>
                        {formatIncidentDateWithRelative(rep.date_filed || rep.date)}
                      </td>
                       <td className={`p-table-cell-padding transition-colors duration-300 bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40 ${headerBorderB}`}>
                        <div className="flex items-center">
                          {group.cases.map((c, i) => {
                            const students = parseStudents(c.students);
                            const student = students[0];
                            if (!student) return null;
                            return (
                              <div
                                key={c.id}
                                className={`w-6 h-6 rounded-full ${getRoleAvatarBgClass(student.role)} text-white text-[10px] font-bold flex items-center justify-center border-2 border-surface shrink-0`}
                                style={{ marginLeft: i === 0 ? 0 : -8, zIndex: group.cases.length - i, position: 'relative' }}
                                title={`${student.firstName} ${student.lastName}`}
                              >
                                {getInitials(student)}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td className={`p-table-cell-padding transition-colors duration-300 bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40 ${headerBorderB}`}>
                        <div className="flex flex-col">
                          <span className="text-[13px] font-bold text-on-surface">{rep.case}</span>
                          {rep.title && (
                            <span className="text-[11px] text-secondary mt-0.5 leading-tight">{rep.title}</span>
                          )}
                        </div>
                      </td>
                      <td className={`p-table-cell-padding transition-colors duration-300 text-center bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40 ${headerBorderB}`}>
                        <span className={`${aggregateStatus.badgeClass} border px-2 py-1 rounded font-label-caps text-[10px] tracking-wider uppercase inline-block min-w-[76px] text-center whitespace-nowrap`}>
                          {aggregateStatus.text}
                        </span>
                      </td>
                      <td className={`p-table-cell-padding transition-colors duration-300 bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40 ${headerBorderB}`}></td>
                      <td className={`py-1 px-4 transition-colors duration-300 text-right bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40 ${headerBorderB}`}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewGroupCase(group);
                            }}
                            className="text-secondary hover:text-primary transition-all duration-300 p-1.5 rounded-full hover:bg-primary/10 inline-flex items-center justify-center align-middle"
                            title="View Group Case Details"
                          >
                            <span className="material-symbols-outlined text-[18px]">groups</span>
                          </button>
                          {/* Placeholder spacer for delete button slot so the group button aligns with other rows */}
                          <div className="w-[30px] h-[30px] shrink-0" aria-hidden="true" />
                        </div>
                      </td>
                    </tr>
                    {showSubRows && group.cases.map((caseRecord, subIndex) => {
                      const subBorderClass = "border-b border-outline-variant";
                      const animClass = isCollapsing ? "group-row-collapse" : "group-row-expand";
                      const delay = isCollapsing
                        ? (group.cases.length - 1 - subIndex) * 20
                        : subIndex * 25;
                      return (
                        <tr
                          key={caseRecord.id}
                          className={`${animClass} cursor-pointer group/row`}
                          style={{ animationDelay: `${delay}ms` }}
                          onClick={() => handleRowClick(caseRecord.id)}
                        >
                          <td className={`p-table-cell-padding transition-colors duration-300 border-l-[3px] border-l-outline-variant bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40 ${subBorderClass}`}>
                            <div className="td-inner">
                              {renderCaseIdWithWarning(caseRecord)}
                            </div>
                          </td>
                          <td className={`p-table-cell-padding transition-colors duration-300 bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40 ${subBorderClass}`}>
                            <div className="td-inner" />
                          </td>
                          <td className={`p-table-cell-padding transition-colors duration-300 bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40 ${subBorderClass}`}>
                            <div className="td-inner">
                              {(() => {
                                const students = parseStudents(caseRecord.students);
                                if (students.length === 0) return "—";
                                const firstStudent = students[0];
                                const name = `${firstStudent.lastName}, ${firstStudent.firstName}${firstStudent.middleInitial ? ` ${firstStudent.middleInitial}.` : ""}`;
                                const role = firstStudent.role;
                                return (
                                  <div className="flex flex-col gap-0.5 py-1">
                                    <span className="font-bold text-on-surface leading-tight text-[13px]">{name}</span>
                                    {role && role.toLowerCase() !== 'respondent' && (
                                      <div className="flex items-center gap-1 mt-0.5">
                                        <span className={`h-1.5 w-1.5 rounded-full ${role.toLowerCase() === 'complainant / subject' ? 'bg-green-500' : 'bg-purple-500'}`} />
                                        <span className={`text-[11px] font-medium ${getRoleBadgeStyles(role)}`}>
                                          {role}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          </td>
                          <td className={`p-table-cell-padding transition-colors duration-300 bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40 ${subBorderClass}`}>
                            <div className="td-inner" />
                          </td>
                          <td className={`p-table-cell-padding transition-colors duration-300 text-center bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40 ${subBorderClass}`}>
                            <div className="td-inner flex justify-center items-center">
                              <span className={`${getBadgeClass(caseRecord.progress)} px-2 py-1 rounded font-label-caps text-[10px] tracking-wider uppercase inline-block min-w-[76px] text-center`}>{caseRecord.progress}</span>
                            </div>
                          </td>
                          <td className={`p-table-cell-padding transition-colors duration-300 text-on-surface-variant bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40 ${subBorderClass}`}>
                            <div className="td-inner">
                              {(() => {
                                const students = parseStudents(caseRecord.students);
                                if (students.length === 0) return "—";
                                return students[0].adviser;
                              })()}
                            </div>
                          </td>
                          <td className={`py-1 px-4 transition-colors duration-300 text-right bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40 ${subBorderClass}`}>
                            <div className="td-inner td-inner-action flex justify-end items-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIsDeleteConfirmClosing(false);
                                  setDeleteConfirmText("");
                                  setDeleteConfirmId(caseRecord.id);
                                }}
                                className="text-secondary hover:text-error transition-all duration-500 p-1.5 rounded-full hover:bg-error-container/60 inline-flex items-center justify-center align-middle"
                                title="Delete Record"
                              >
                                <span className="material-symbols-outlined text-[18px] transition-colors duration-500">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                );
              }

              return (
              <tbody
                key={group.groupId || group.cases[0].id}
                className="font-body-md text-sm text-on-surface group/body"
              >
                {group.cases.map((caseRecord, index) => {
                  const isFirstInGroup = index === 0;
                  const groupLength = group.cases.length;
                  const isGrouped = groupLength > 1;
                  const borderClass = "border-b border-outline-variant";
                  const groupBorderClass = "border-b border-outline-variant";

                  return (
                    <tr
                      key={caseRecord.id}
                      className="catalog-page-enter transition-colors cursor-pointer group/row"
                      onClick={() => handleRowClick(caseRecord.id)}
                    >
                      <td className={`p-table-cell-padding transition-colors duration-300 ${isGrouped ? "border-l-[3px] border-l-outline-variant bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40" : "group-hover/row:bg-surface-container"} ${borderClass}`}>
                        {renderCaseIdWithWarning(caseRecord)}
                      </td>
                      {isFirstInGroup && (
                        <td className={`p-table-cell-padding transition-colors duration-300 ${isGrouped ? "bg-surface-container-highest/20 group-hover/body:bg-surface-container-highest/40" : "group-hover/row:bg-surface-container"} ${groupBorderClass}`} rowSpan={groupLength}>
                          {formatIncidentDateWithRelative(caseRecord.date_filed || caseRecord.date)}
                        </td>
                      )}
                      <td className={`p-table-cell-padding transition-colors duration-300 font-medium ${isGrouped ? "bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40" : "group-hover/row:bg-surface-container"} ${borderClass}`}>
                        {(() => {
                          const students = parseStudents(caseRecord.students);
                          if (students.length === 0) return "—";
                          const firstStudent = students[0];
                          const name = `${firstStudent.lastName}, ${firstStudent.firstName}${firstStudent.middleInitial ? ` ${firstStudent.middleInitial}.` : ""}`;
                          const role = firstStudent.role;
                          return (
                            <div className="flex flex-col gap-0.5 py-1">
                              <span className="font-bold text-on-surface leading-tight text-[13px]">{name}</span>
                              {role && role.toLowerCase() !== 'respondent' && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <span className={`h-1.5 w-1.5 rounded-full ${role.toLowerCase() === 'complainant / subject' ? 'bg-green-500' : 'bg-purple-500'}`} />
                                  <span className={`text-[11px] font-medium ${getRoleBadgeStyles(role)}`}>
                                    {role}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      {isFirstInGroup && (
                        <td className={`p-table-cell-padding transition-colors duration-300 ${isGrouped ? "bg-surface-container-highest/20 group-hover/body:bg-surface-container-highest/40" : "group-hover/row:bg-surface-container"} ${groupBorderClass}`} rowSpan={groupLength}>
                          <div className="flex flex-col">
                            <span className="text-[13px] font-bold text-on-surface">{caseRecord.case}</span>
                            {caseRecord.title && (
                              <span className="text-[11px] text-secondary mt-0.5 leading-tight">{caseRecord.title}</span>
                            )}
                            {isGrouped && (
                              <div className="mt-1.5 inline-flex items-center gap-1 bg-surface border border-outline-variant rounded px-1.5 py-0.5 w-fit">
                                <span className="material-symbols-outlined text-[12px] text-secondary">link</span>
                                <span className="text-[10px] font-medium text-secondary">{groupLength} linked records</span>
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                      <td className={`p-table-cell-padding transition-colors duration-300 text-center ${isGrouped ? "bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40" : "group-hover/row:bg-surface-container"} ${borderClass}`}>
                        <span className={`${getBadgeClass(caseRecord.progress)} px-2 py-1 rounded font-label-caps text-[10px] tracking-wider uppercase inline-block min-w-[76px] text-center`}>{caseRecord.progress}</span>
                      </td>
                      <td className={`p-table-cell-padding transition-colors duration-300 text-on-surface-variant ${isGrouped ? "bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40" : "group-hover/row:bg-surface-container"} ${borderClass}`}>
                        {(() => {
                          const students = parseStudents(caseRecord.students);
                          if (students.length === 0) return "—";
                          const firstStudent = students[0];
                          return firstStudent.adviser;
                        })()}
                      </td>
                      <td className={`py-1 px-4 transition-colors duration-300 text-right ${isGrouped ? "bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40" : "group-hover/row:bg-surface-container"} ${borderClass}`}>
                        <div className="flex items-center justify-end gap-1">
                          {isGrouped && isFirstInGroup && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewGroupCase(group);
                              }}
                              className="text-secondary hover:text-primary transition-all duration-300 p-1.5 rounded-full hover:bg-primary/10 inline-flex items-center justify-center align-middle"
                              title="View Group Case Details"
                            >
                              <span className="material-symbols-outlined text-[18px]">groups</span>
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsDeleteConfirmClosing(false);
                              setDeleteConfirmText("");
                              setDeleteConfirmId(caseRecord.id);
                            }}
                            className="text-secondary hover:text-error transition-all duration-500 p-1.5 rounded-full hover:bg-error-container/60 inline-flex items-center justify-center align-middle"
                            title="Delete Record"
                          >
                            <span className="material-symbols-outlined text-[18px] transition-colors duration-500">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              );
            })}
          </table>
        </div>

        <div className="bg-surface border-t border-outline-variant px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-on-surface-variant">
            {(() => {
              if (isLoading) return "Loading entries";
              if (filteredAndSortedCases.length === 0) return "Showing 0 to 0 of 0 entries";
              
              const casesBeforeCurrentPage = filteredAndSortedGroups
                .slice(0, (currentPage - 1) * CASES_PER_PAGE)
                .reduce((acc, group) => acc + group.cases.length, 0);
              
              const casesOnCurrentPage = paginatedGroups.reduce((acc, group) => acc + group.cases.length, 0);
              
              const startEntry = casesBeforeCurrentPage + 1;
              const endEntry = casesBeforeCurrentPage + casesOnCurrentPage;
              
              return `Showing ${startEntry} to ${endEntry} of ${filteredAndSortedCases.length} entries`;
            })()}
          </span>
          <div key={currentPage} className="catalog-page-enter flex flex-wrap items-center justify-end gap-1">
            <button
              onClick={handlePreviousPage}
              className="px-3 py-1 border border-outline-variant rounded bg-surface hover:bg-surface-container-low text-on-surface-variant disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-colors duration-500"
              disabled={currentPage === 1}
            >
              Previous
            </button>
            {visiblePageItems.map((item, index) => {
              if (item === ELLIPSIS) {
                return (
                  <span key={`${item}-${index}`} className="px-2 py-1 text-sm text-on-surface-variant">
                    ...
                  </span>
                );
              }

              const page = Number(item);
              const isActive = page === currentPage;
              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`min-w-8 px-3 py-1 border rounded text-sm transition-colors duration-500 ${isActive
                      ? "border-primary-container bg-primary-container text-white"
                      : "border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container-low"
                    }`}
                >
                  {page}
                </button>
              );
            })}
            <button
              onClick={handleNextPage}
              className="px-3 py-1 border border-outline-variant rounded bg-surface hover:bg-surface-container-low text-on-surface-variant disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-colors duration-500"
              disabled={currentPage === totalPages}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {deleteConfirmId !== null && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className={`absolute inset-0 bg-black/45 ${isDeleteConfirmClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"
              }`}
            style={{ backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
            onClick={closeDeleteConfirm}
          />
          <div className={`relative bg-surface p-6 rounded-2xl shadow-xl max-w-sm w-full border border-outline-variant ${isDeleteConfirmClosing ? "modal-panel-exit" : "modal-panel-enter"
            }`}>
            <div className="flex items-center gap-3 text-error mb-3">
              <span className="material-symbols-outlined text-[28px]">warning</span>
              <h3 className="text-xl font-bold">Confirm Deletion</h3>
            </div>
            <p className="text-secondary text-sm mb-6 leading-relaxed">
              Are you sure you want to delete case record <span className="font-bold text-on-surface">{formatCaseId(deleteConfirmId)}</span>? This action cannot be undone and will permanently remove this record from the database.
            </p>
            <label className="block text-xs font-bold text-secondary uppercase tracking-wider mb-1.5">
              Type <span className="normal-case text-on-surface">Confirm{formatCaseId(deleteConfirmId)}</span> to continue
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && deleteConfirmText === `Confirm${formatCaseId(deleteConfirmId)}`) {
                  handleDeleteCase();
                }
              }}
              placeholder={`Confirm${formatCaseId(deleteConfirmId)}`}
              autoFocus
              autoComplete="off"
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-2 px-3 mb-6 text-sm font-data-mono text-on-surface focus:ring-2 focus:ring-error focus:outline-none"
            />
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={closeDeleteConfirm}
                className="btn-secondary flex-1 px-2 whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
                <span>Cancel</span>
              </button>
              <button
                type="button"
                onClick={handleDeleteCase}
                disabled={deleteConfirmText !== `Confirm${formatCaseId(deleteConfirmId)}`}
                className="btn-primary bg-error hover:bg-red-700 disabled:bg-error/50 flex-1 px-2 whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                <span>Delete Record</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <ImportExcelModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={loadCases}
      />

      <ExportExcelModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        cases={cases}
        initialStatusFilter={statusFilter}
        initialStartDate={startDate}
        initialEndDate={endDate}
        initialSearchQuery={searchQuery}
        onExport={handleExportExcelWithOptions}
      />

      <FileNewCaseModal
        isOpen={isFileNewCaseModalOpen}
        onClose={() => setIsFileNewCaseModalOpen(false)}
        onCaseFiled={() => {
          setIsFileNewCaseModalOpen(false);
          loadCases();
          showToast("Case filed successfully.");
        }}
      />

      {warningPopover && createPortal(
        <div
          className={`fixed z-[9999] w-60 p-3 bg-surface dark:bg-surface-container-high border border-amber-400/80 dark:border-amber-600/70 rounded-xl shadow-2xl backdrop-blur-md pointer-events-none transform ${
            warningPopover.placeAbove ? "origin-bottom-left" : "origin-top-left"
          } ${
            warningPopover.isExiting
              ? "opacity-0 scale-95 transition-all duration-150 ease-in"
              : "opacity-100 scale-100 transition-all duration-200 ease-out"
          }`}
          style={{
            top: warningPopover.top,
            left: warningPopover.left,
          }}
        >
          <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-outline-variant">
            <span className="material-symbols-outlined text-amber-500 text-base">warning</span>
            <span className="text-xs font-bold text-on-surface">Incomplete Record</span>
          </div>
          <p className="text-[11px] text-on-surface-variant mb-2 font-medium">The following fields are empty:</p>
          <div className="flex flex-wrap gap-1.5">
            {warningPopover.fields.map((field) => (
              <span
                key={field}
                className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {field}
              </span>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}


