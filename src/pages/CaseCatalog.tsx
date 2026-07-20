import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import MonthYearRangePicker from "../components/MonthYearRangePicker";
import ExcelJS from "exceljs";
import ImportExcelModal from "../components/ImportExcelModal";
import lcOfficialLogo from "../assets/lc-official-logo.jpg";
import guidanceLogo from "../assets/guidance-logo.png";

interface StudentInfo {
  firstName: string;
  lastName: string;
  middleInitial: string;
  level: string;
  section: string;
  adviser: string;
  role?: string;
}

interface CaseRecord {
  id: number;
  first_name: string;
  last_name: string;
  middle_initial: string;
  level: string;
  section: string;
  date: string;
  date_filed: string;
  adviser: string;
  case: string;
  description: string;
  sanction: string;
  progress: string;
  proofs: string;
  students: string;
  title: string;
  group_id?: string | null;
  reporting_student?: string;
}

const formatCaseId = (id: number) => `#${id.toString().padStart(4, "0")}`;
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
      <span className="text-[11px] text-secondary mt-0.5">{relative.primary}</span>
    </div>
  );
};



const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
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
const isPending = (progress: string) => progress.toLowerCase() === "pending";
const isClosed = (progress: string) => progress.toLowerCase() === "closed";
const isReprimand = (caseRecord: CaseRecord) =>
  caseRecord.sanction.toLowerCase().includes("reprimand") ||
  caseRecord.progress.toLowerCase().includes("reprimand");

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

export interface CaseGroup {
  groupId: string | null;
  cases: CaseRecord[];
}

export default function CaseCatalog() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => sessionStorage.getItem("case_catalog_search") || "");
  const [sortBy, setSortBy] = useState<"date_filed" | "date">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState(() => sessionStorage.getItem("case_catalog_status") || "All Statuses");
  const [startDate, setStartDate] = useState(() => sessionStorage.getItem("case_catalog_start_date") || "");
  const [endDate, setEndDate] = useState(() => sessionStorage.getItem("case_catalog_end_date") || "");
  const [currentPage, setCurrentPage] = useState<number>(() => {
    const stored = sessionStorage.getItem("case_catalog_current_page");
    return stored ? Number(stored) || 1 : 1;
  });
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
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

  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const isRestoredRef = useRef(false);
  const isFirstRender = useRef(true);
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
    sessionStorage.setItem("case_catalog_start_date", startDate);
    sessionStorage.setItem("case_catalog_end_date", endDate);
  }, [searchQuery, statusFilter, startDate, endDate]);

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

  const loadCases = useCallback(async () => {
    try {
      setIsLoading(true);
      const loadedCases = await invoke<CaseRecord[]>("get_cases");
      setCases(loadedCases);
      setError(null);
    } catch (err) {
      setCases([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

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
      }, 260);
    } else {
      setCollapsingGroups((prev) => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
      setExpandedGroups((prev) => new Set(prev).add(groupId));
    }
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
    };
  }, [displayCases]);



  const filteredAndSortedGroups = useMemo(() => {
    let result = displayCases;

    // Search query filter (search Case ID or Name or case type)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((c) => {
        const idStr = `#${c.id.toString().padStart(4, "0")}`;
        const students = parseStudents(c.students);
        const matchesStudent = students.some(s => {
          const nameStr = `${s.firstName} ${s.middleInitial} ${s.lastName}`.toLowerCase();
          return s.firstName.toLowerCase().includes(q) ||
            s.lastName.toLowerCase().includes(q) ||
            s.middleInitial.toLowerCase().includes(q) ||
            nameStr.includes(q) ||
            (s.adviser && s.adviser.toLowerCase().includes(q));
        });

        return (
          idStr.toLowerCase().includes(q) ||
          c.case.toLowerCase().includes(q) ||
          (c.title && c.title.toLowerCase().includes(q)) ||
          matchesStudent
        );
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
    setStartDate("");
    setEndDate("");
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

  const handleExportExcel = async () => {
    if (filteredAndSortedCases.length === 0) {
      showToast("No cases to export.");
      return;
    }

    const filenameParts: string[] = ["cases_export"];
    if (statusFilter !== "All Statuses") {
      filenameParts.push(statusFilter.toLowerCase());
    }

    if (startDate || endDate) {
      const start = startDate ? startDate.replace(/-/g, "") : "Any";
      const end = endDate ? endDate.replace(/-/g, "") : "Any";
      filenameParts.push(`${start}_to_${end}`);
    }

    if (searchQuery.trim()) {
      filenameParts.push(`search_${searchQuery.trim().replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}`);
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
      [10, 20, 20, 15, 16, 16, 16, 22, 22, 28, 42, 28, 18, 48].forEach((width, index) => {
        worksheet.getColumn(index + 1).width = width;
      });

      // Official document header
      worksheet.addRow([]);
      worksheet.addRow([]);
      worksheet.addRow([]);
      worksheet.addRow([]);

      worksheet.mergeCells("D1:K1");
      worksheet.mergeCells("D2:K2");
      worksheet.mergeCells("D3:K3");

      worksheet.getCell("D1").value = "LAGUNA COLLEGE";
      worksheet.getCell("D2").value = "San Pablo City";
      worksheet.getCell("D3").value = "Guidance Office";

      worksheet.getRow(1).height = 20;
      worksheet.getRow(2).height = 17;
      worksheet.getRow(3).height = 27;
      worksheet.getRow(4).height = 6;

      worksheet.getCell("D1").font = { name: "Georgia", bold: true, size: 13, color: { argb: "FF000000" } };
      worksheet.getCell("D2").font = { name: "Georgia", bold: true, size: 11, color: { argb: "FF000000" } };
      worksheet.getCell("D3").font = { name: "Georgia", bold: true, size: 18, color: { argb: "FF000000" } };

      ["D1", "D2", "D3"].forEach((cellRef) => {
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
        tl: { col: 5.7, row: 0 },
        ext: { width: 86, height: 86 },
        editAs: "oneCell",
      });
      worksheet.addImage(guidanceImageId, {
        tl: { col: 9.65, row: 0 },
        ext: { width: 86, height: 86 },
        editAs: "oneCell",
      });

      worksheet.addRow([`Date of Export: ${new Date().toLocaleDateString()}`]);

      let filterText = "Filters: None";
      const activeFilters = [];
      if (statusFilter !== "All Statuses") activeFilters.push(`Status: ${statusFilter}`);

      if (startDate || endDate) activeFilters.push(`Date Range: ${startDate || 'Any'} to ${endDate || 'Any'}`);
      if (searchQuery) activeFilters.push(`Search: ${searchQuery}`);
      if (activeFilters.length > 0) filterText = `Filters: ${activeFilters.join(" | ")}`;
      worksheet.addRow([filterText]);
      worksheet.addRow([]); // Empty row

      worksheet.mergeCells("A5:N5");
      worksheet.mergeCells("A6:N6");
      worksheet.getCell("A5").font = { bold: true, color: { argb: "FF000000" } };
      worksheet.getCell("A6").font = { italic: true, color: { argb: "FF4B5563" } };
      worksheet.views = [{ state: "frozen", ySplit: 8 }];

      const headers = [
        "Case ID",
        "First Name",
        "Last Name",
        "Middle Initial",
        "Grade Level",
        "Section",
        "Incident Date",
        "Date Filed",
        "Adviser",
        "Case Type",
        "Description",
        "Sanction",
        "Progress",
        "Proofs"
      ];

      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF002F87" },
      };

      filteredAndSortedCases.forEach((c) => {
        let proofsText = "";
        let hasImages = false;
        let proofsArr: any[] = [];
        try {
          if (c.proofs) {
            proofsArr = JSON.parse(c.proofs);
            if (Array.isArray(proofsArr)) {
              const nonImages = proofsArr.filter((p: any) => {
                const isImg = p.data && p.data.match(/^data:image\/(png|jpeg|jpg|gif);/i);
                if (isImg) hasImages = true;
                return !isImg;
              });
              proofsText = nonImages.map((p: any) => p.name).join("\n");
            }
          }
        } catch (e) { }

        let firstNames = c.first_name;
        let lastNames = c.last_name;
        let middleInitials = c.middle_initial;

        try {
          if (c.students) {
            const studentsArr = JSON.parse(c.students);
            if (Array.isArray(studentsArr) && studentsArr.length > 0) {
              firstNames = studentsArr.map((s: any) => s.firstName).join("\n");
              lastNames = studentsArr.map((s: any) => s.lastName).join("\n");
              middleInitials = studentsArr.map((s: any) => s.middleInitial).join("\n");
            }
          }
        } catch (e) { }

        const row = worksheet.addRow([
          c.id,
          firstNames,
          lastNames,
          middleInitials,
          c.level,
          c.section,
          c.date,
          c.date_filed,
          c.adviser,
          c.case,
          c.description,
          c.sanction,
          c.progress,
          proofsText,
        ]);

        const rIndex = row.number;

        if (hasImages && Array.isArray(proofsArr)) {
          row.height = 75; // Set row height in points (e.g. 75 points ~ 100px)

          let imgIndex = 0;
          proofsArr.forEach((p: any) => {
            const match = p.data && p.data.match(/^data:image\/(png|jpeg|jpg|gif);base64,(.+)$/i);
            if (match) {
              let ext = match[1].toLowerCase();
              if (ext === 'jpg') ext = 'jpeg';
              const base64 = match[2];

              try {
                const imageId = workbook.addImage({
                  base64: base64,
                  extension: ext as 'png' | 'jpeg' | 'gif',
                });

                // Position side-by-side: 65x65px thumbnail
                // Space them out by 75px (65px img + 10px margin)
                const xOffsetPx = 10 + (imgIndex * 75);
                const proofsColumnWidthPx = 336;

                worksheet.addImage(imageId, {
                  tl: { col: 13 + (xOffsetPx / proofsColumnWidthPx), row: rIndex - 0.95 },
                  ext: { width: 65, height: 65 },
                  editAs: 'oneCell'
                });
                imgIndex++;
              } catch (err) {
                console.error("Error adding image to excel:", err);
              }
            }
          });
        }
      });

      worksheet.eachRow((row: ExcelJS.Row, rowNumber: number) => {
        if (rowNumber <= 7) {
          return;
        }
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
      const base64Data = arrayBufferToBase64(buffer as ArrayBuffer);
      await invoke("save_file", { base64Data, filename });
    } catch (err) {
      alert("Failed to export Excel file: " + err);
    }
  };

  return (
    <>
      {toastMessage && createPortal(
        <div className={`app-toast fixed bottom-5 right-5 z-[70] flex items-start gap-2 rounded-xl border border-error/30 bg-error-container px-4 py-3 text-on-error-container shadow-xl ${isToastVisible ? "case-toast-x-enter" : "case-toast-x-exit"}`}>
          <span className="material-symbols-outlined text-error" style={{ fontSize: 18 }}>error</span>
          <p className="text-xs font-bold">{toastMessage}</p>
        </div>,
        document.body
      )}

      <div className="flex justify-between items-end mb-4">
        <h2 className="font-section-header text-section-header text-on-surface">Case Catalog</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="btn-secondary"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            <span>Import Excel</span>
          </button>
          <button
            onClick={handleExportExcel}
            className="btn-secondary"
          >
            <span className="material-symbols-outlined text-[18px]">table_view</span>
            <span>Export to Excel</span>
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-surface border border-surface-variant rounded-lg p-3 px-4 py-2.5 border-t-4 border-t-secondary-container shadow-sm">
          <h3 className="font-body-md text-on-surface-variant text-xs mb-0.5">Total Cases</h3>
          <div className="font-data-mono text-2xl text-on-surface mt-1">{isLoading ? "..." : stats.totalCases}</div>
        </div>
        <div className="bg-surface border border-surface-variant rounded-lg p-3 px-4 py-2.5 border-t-4 border-t-[#f59e0b] shadow-sm">
          <h3 className="font-body-md text-on-surface-variant text-xs mb-0.5">Pending Cases</h3>
          <div className="font-data-mono text-2xl text-on-surface mt-1">{isLoading ? "..." : stats.pendingReview}</div>
        </div>
        <div className="bg-surface border border-surface-variant rounded-lg p-3 px-4 py-2.5 border-t-4 border-t-[#22c55e] shadow-sm">
          <h3 className="font-body-md text-on-surface-variant text-xs mb-0.5">Resolved Cases</h3>
          <div className="font-data-mono text-2xl text-on-surface mt-1">{isLoading ? "..." : stats.resolvedAllTime}</div>
        </div>
        <div className="bg-surface border border-surface-variant rounded-lg p-3 px-4 py-2.5 border-t-4 border-t-[#ef4444] shadow-sm">
          <h3 className="font-body-md text-on-surface-variant text-xs mb-0.5">Reprimanded Cases</h3>
          <div className="font-data-mono text-2xl text-on-surface mt-1">{isLoading ? "..." : stats.reprimandedCases}</div>
        </div>
      </div>

      {/* Search & Filters System */}
      <div className="bg-surface px-4 py-4 border border-outline-variant rounded-xl shadow-sm w-full flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-grow">
            <span className="material-symbols-outlined text-secondary absolute left-3 top-1/2 -translate-y-1/2" style={{ fontSize: '18px' }}>search</span>
            <input
              type="text"
              placeholder="Search by Case ID, Name, or Case Type"
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
                <div className="absolute left-0 top-full z-30 mt-2 w-[205px] overflow-hidden rounded-xl border border-outline-variant bg-surface p-1.5 shadow-lg filter-dropdown-enter">
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
                            ? "bg-[#EEEDFE] text-[#3C3489]"
                            : "text-on-surface hover:bg-surface-container"
                          }`}
                      >
                        <span className={`h-2 w-2 rounded-full transition-colors duration-300 ${status === "Pending" ? "bg-[#f59e0b]" :
                            status === "Resolved" ? "bg-[#22c55e]" :
                              status === "Closed" ? "bg-[#9ca3af]" :
                                status === "Reprimand" ? "bg-[#ef4444]" :
                                  "bg-[#7B6FE8]"
                          }`} />
                        <span className="flex-1 font-medium">{status === "All Statuses" ? "All" : status}</span>
                        {isSelected && (
                          <span className="material-symbols-outlined text-[#7B6FE8]" style={{ fontSize: 16 }}>check</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <MonthYearRangePicker
              startDate={startDate}
              endDate={endDate}
              placeholder="Pick range"
              onRangeChange={(start, end) => {
                setStartDate(start);
                setEndDate(end);
              }}
            />
          </div>
        </div>

        {/* Active Filters Row */}
        {isFilterModified && (
          <div className="flex flex-wrap items-center gap-2 pt-3 mt-3 border-t border-outline-variant/40">
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
                <button onClick={() => { setStartDate(""); setEndDate(""); }} className="text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors duration-500">
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

      <div className="bg-surface border border-surface-variant rounded-lg overflow-hidden shadow-sm flex flex-col">
        <div ref={tableContainerRef} className="overflow-x-auto overflow-y-scroll h-[calc(100vh-310px)] min-h-[250px] [scrollbar-gutter:stable]">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead className="sticky top-0 z-10">
              <tr className="bg-surface-container font-section-header text-sm text-on-surface">
                <th className="p-table-cell-padding font-semibold border-b border-surface-variant">ID</th>
                <th
                  className="p-table-cell-padding font-semibold cursor-pointer select-none group border-b border-surface-variant"
                  onClick={() => handleSort("date")}
                >
                  <div className="flex items-center gap-1 text-[11px] tracking-wider uppercase text-secondary">
                    Incident Date
                    <span className={`material-symbols-outlined text-[16px] transition-[color,opacity,transform] duration-300 ease-out ${sortBy === "date" ? "text-primary" : "text-secondary opacity-30 group-hover:opacity-100"
                      } ${sortBy === "date" && sortOrder === "desc" ? "rotate-180" : "rotate-0"}`}>
                      arrow_upward
                    </span>
                  </div>
                </th>
                <th className="p-table-cell-padding font-semibold border-b border-surface-variant">Student(s) Involved</th>
                <th className="p-table-cell-padding font-semibold border-b border-surface-variant">Case Type</th>
                <th className="p-table-cell-padding font-semibold text-center border-b border-surface-variant">Status</th>
                <th className="p-table-cell-padding font-semibold border-b border-surface-variant">Adviser</th>
                <th className="py-1 px-4 font-semibold text-right border-b border-surface-variant"></th>
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
                const headerBorderB = isExpanded ? "border-b border-b-surface-variant/40" : "border-b border-b-surface-variant";

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
                        {formatIncidentDateWithRelative(rep.date)}
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
                      <td className={`py-1 px-4 transition-colors duration-300 bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40 ${headerBorderB}`}></td>
                    </tr>
                    {showSubRows && group.cases.map((caseRecord, subIndex) => {
                      const isLastSubRow = subIndex === group.cases.length - 1;
                      const subBorderClass = isLastSubRow ? "border-b border-b-surface-variant" : "border-b border-b-surface-variant/40";
                      const animClass = isCollapsing ? "group-row-collapse" : "group-row-expand";
                      const delay = isCollapsing
                        ? (group.cases.length - 1 - subIndex) * 25
                        : subIndex * 35;
                      return (
                        <tr
                          key={caseRecord.id}
                          className={`${animClass} transition-all duration-300 cursor-pointer group/row`}
                          style={{ animationDelay: `${delay}ms` }}
                          onClick={() => handleRowClick(caseRecord.id)}
                        >
                          <td className={`p-table-cell-padding transition-colors duration-300 border-l-[3px] border-l-outline-variant bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40 ${subBorderClass}`}>
                            <span className="case-id px-2 py-0.5 rounded text-data-mono font-data-mono inline-block">{formatCaseId(caseRecord.id)}</span>
                          </td>
                          <td className={`p-table-cell-padding transition-colors duration-300 bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40 ${subBorderClass}`}></td>
                          <td className={`p-table-cell-padding transition-colors duration-300 bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40 ${subBorderClass}`}>
                            {(() => {
                              const students = parseStudents(caseRecord.students);
                              if (students.length === 0) return "—";
                              const firstStudent = students[0];
                              const name = `${firstStudent.lastName}, ${firstStudent.firstName}${firstStudent.middleInitial ? ` ${firstStudent.middleInitial}.` : ""}`;
                              const role = firstStudent.role;
                              return (
                                <div className="flex flex-col gap-0.5 py-1">
                                  <span className="font-bold text-on-surface leading-tight text-[13px]">{name}</span>
                                  {role && (
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <span className={`h-1.5 w-1.5 rounded-full ${role.toLowerCase() === 'complainant / subject' ? 'bg-green-500' : role.toLowerCase() === 'respondent' ? 'bg-red-500' : 'bg-purple-500'}`} />
                                      <span className={`text-[11px] font-medium ${getRoleBadgeStyles(role)}`}>
                                        {role}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td className={`p-table-cell-padding transition-colors duration-300 bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40 ${subBorderClass}`}></td>
                          <td className={`p-table-cell-padding transition-colors duration-300 text-center bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40 ${subBorderClass}`}>
                            <span className={`${getBadgeClass(caseRecord.progress)} border px-2 py-1 rounded font-label-caps text-[10px] tracking-wider uppercase inline-block min-w-[76px] text-center`}>{caseRecord.progress}</span>
                          </td>
                          <td className={`p-table-cell-padding transition-colors duration-300 text-on-surface-variant bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40 ${subBorderClass}`}>
                            {(() => {
                              const students = parseStudents(caseRecord.students);
                              if (students.length === 0) return "—";
                              return students[0].adviser;
                            })()}
                          </td>
                          <td className={`py-1 px-4 transition-colors duration-300 text-right bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40 ${subBorderClass}`}>
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
                  const borderClass = isGrouped
                    ? (index === groupLength - 1 ? "border-b border-b-surface-variant" : "border-b border-b-surface-variant/40")
                    : "border-b border-b-surface-variant/50";
                  const groupBorderClass = isGrouped ? "border-b border-b-surface-variant" : "border-b border-b-surface-variant/50";

                  return (
                    <tr
                      key={caseRecord.id}
                      className="catalog-page-enter transition-colors cursor-pointer group/row"
                      onClick={() => handleRowClick(caseRecord.id)}
                    >
                      <td className={`p-table-cell-padding transition-colors duration-300 ${isGrouped ? "border-l-[3px] border-l-outline-variant bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40" : "group-hover/row:bg-surface-container"} ${borderClass}`}>
                        <span className="case-id px-2 py-0.5 rounded text-data-mono font-data-mono inline-block">{formatCaseId(caseRecord.id)}</span>
                      </td>
                      {isFirstInGroup && (
                        <td className={`p-table-cell-padding transition-colors duration-300 ${isGrouped ? "bg-surface-container-highest/20 group-hover/body:bg-surface-container-highest/40" : "group-hover/row:bg-surface-container"} ${groupBorderClass}`} rowSpan={groupLength}>
                          {formatIncidentDateWithRelative(caseRecord.date)}
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
                              {role && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <span className={`h-1.5 w-1.5 rounded-full ${role.toLowerCase() === 'complainant / subject' ? 'bg-green-500' : role.toLowerCase() === 'respondent' ? 'bg-red-500' : 'bg-purple-500'}`} />
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
                              <div className="mt-1.5 inline-flex items-center gap-1 bg-surface border border-outline-variant/60 rounded px-1.5 py-0.5 w-fit">
                                <span className="material-symbols-outlined text-[12px] text-secondary">link</span>
                                <span className="text-[10px] font-medium text-secondary">{groupLength} linked records</span>
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                      <td className={`p-table-cell-padding transition-colors duration-300 text-center ${isGrouped ? "bg-surface-container-highest/20 group-hover/row:bg-surface-container-highest/40" : "group-hover/row:bg-surface-container"} ${borderClass}`}>
                        <span className={`${getBadgeClass(caseRecord.progress)} border px-2 py-1 rounded font-label-caps text-[10px] tracking-wider uppercase inline-block min-w-[76px] text-center`}>{caseRecord.progress}</span>
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              );
            })}
          </table>
        </div>

        <div className="bg-surface border-t border-surface-variant px-4 py-3 flex items-center justify-between">
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
    </>
  );
}


