import { useState, useMemo, Fragment, useEffect, useRef } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { ImportRow, ParseFileResult } from "../types";

const collapseSpaces = (value: string) => value.replace(/\s+/g, " ").trim();

const capitalizeWords = (value: string) =>
  collapseSpaces(value)
    .split(" ")
    .map((word) => word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : "")
    .join(" ");

const formatDateToMMDDYY = (dateStr: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-');
    return `${m}/${d}/${y.slice(2)}`;
  }
  return dateStr;
};

const autoCapitalize = (val: string) => {
  return val.replace(/(^|\s)\p{L}/gu, (match) => match.toUpperCase());
};

const GRADE_LEVEL_OPTIONS = ["Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];
const SECTION_OPTIONS = ["A", "B", "C", "D", "E", "F", "G", "STEM", "ABM", "HUMSS", "GAS"];
const PROGRESS_OPTIONS = ["Pending", "Resolved", "Closed", "Reprimand"];

const normalizeGradeLevel = (value: string) => {
  const cleaned = collapseSpaces(value);
  const match = cleaned.match(/^(?:grade\s*)?(\d{1,2})$/i);
  if (match) {
    const grade = Number(match[1]);
    if (grade >= 7 && grade <= 12) return `Grade ${grade}`;
  }
  return capitalizeWords(cleaned).slice(0, 8);
};

const normalizeSection = (value: string) => {
  const cleaned = collapseSpaces(value);
  const upper = cleaned.toUpperCase();
  if (SECTION_OPTIONS.includes(upper)) return upper.slice(0, 10);
  return capitalizeWords(cleaned).slice(0, 10);
};

export default function ImportReview() {
  const location = useLocation();
  const navigate = useNavigate();
  
  const state = location.state as { parseResult: ParseFileResult, filename: string } | null;

  const fallbackRows = useMemo(() => {
    try {
      const stored = localStorage.getItem("lc_pending_import_rows");
      return stored ? JSON.parse(stored) as ImportRow[] : null;
    } catch {
      return null;
    }
  }, []);

  const fallbackFilename = useMemo(() => {
    return localStorage.getItem("lc_pending_import_filename") || "";
  }, []);
  
  if (!state && !fallbackRows) {
    return <Navigate to="/catalog" replace />;
  }

  const [rows, setRows] = useState<ImportRow[]>(() => {
    if (state) return state.parseResult.rows;
    if (fallbackRows) return fallbackRows;
    return [];
  });
  
  const [filename] = useState(() => {
    if (state) return state.filename;
    if (fallbackFilename) return fallbackFilename;
    return "";
  });
  const [isImporting, setIsImporting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const toastTimerRef = useRef<number | null>(null);

  // Categorize rows based on their status
  const issuesRows = useMemo(() => {
    return rows.map((row, index) => ({ row, index })).filter(({ row }) => row.has_errors);
  }, [rows]);

  const duplicatesRows = useMemo(() => {
    return rows.map((row, index) => ({ row, index })).filter(({ row }) => row.is_duplicate && !row.has_errors);
  }, [rows]);

  const readyRows = useMemo(() => {
    return rows.map((row, index) => ({ row, index })).filter(({ row }) => !row.has_errors && !row.is_duplicate);
  }, [rows]);

  // Default active tab: Issues if there are any, else Duplicates, else Ready
  const [activeTab, setActiveTab] = useState<"issues" | "duplicates" | "ready">(() => {
    const initialRows = state ? state.parseResult.rows : (fallbackRows || []);
    if (initialRows.some(r => r.has_errors)) return "issues";
    if (initialRows.some(r => r.is_duplicate)) return "duplicates";
    return "ready";
  });

  // Edit Modal state
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [editData, setEditData] = useState<ImportRow | null>(null);
  const [isSavingRow, setIsSavingRow] = useState(false);
  const [isProgressDropdownOpen, setIsProgressDropdownOpen] = useState(false);
  const progressDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (progressDropdownRef.current && !progressDropdownRef.current.contains(event.target as Node)) {
        setIsProgressDropdownOpen(false);
      }
    };
    if (isProgressDropdownOpen) {
      document.addEventListener("click", handleClickOutside);
    }
    return () => document.removeEventListener("click", handleClickOutside);
  }, [isProgressDropdownOpen]);

  // Duplicate Comparison state (stores index of expanded duplicate row)
  const [expandedDuplicateIndex, setExpandedDuplicateIndex] = useState<number | null>(null);

  // Sync to localStorage
  useEffect(() => {
    if (rows.length > 0) {
      localStorage.setItem("lc_pending_import_rows", JSON.stringify(rows));
      localStorage.setItem("lc_pending_import_filename", filename);
    } else {
      localStorage.removeItem("lc_pending_import_rows");
      localStorage.removeItem("lc_pending_import_filename");
    }
  }, [rows, filename]);

  const [isDeleteAllConfirmOpen, setIsDeleteAllConfirmOpen] = useState(false);

  const handleDisregard = (index: number) => {
    if (window.confirm("Are you sure you want to disregard and remove this row from the import list?")) {
      const newRows = rows.filter((_, i) => i !== index);
      setRows(newRows);
      setExpandedDuplicateIndex(null);
      setEditingRowIndex(null);
      showToast("success", "Row removed from import list.");
    }
  };

  const executeDeleteAll = () => {
    const tabLabel =
      activeTab === "issues"
        ? "Issues"
        : activeTab === "duplicates"
        ? "Duplicates"
        : "Ready to Import";
    const indicesToRemove = new Set(currentTabRows.map((r) => r.index));

    const updatedRows = rows.filter((_, idx) => !indicesToRemove.has(idx));
    setRows(updatedRows);
    setExpandedDuplicateIndex(null);
    setEditingRowIndex(null);
    setIsDeleteAllConfirmOpen(false);
    showToast("success", `Removed all ${currentTabRows.length} row(s) from '${tabLabel}'.`);
  };

  const parseStudents = (studentsStr: string) => {
    try {
      return JSON.parse(studentsStr) || [];
    } catch (e) {
      return [];
    }
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

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

  const handleEditStart = (index: number, row: ImportRow) => {
    setEditingRowIndex(index);
    setEditData({
      ...row,
      full_name: row.full_name || (row.last_name ? `${row.last_name}, ${row.first_name} ${row.middle_initial}`.trim() : "")
    });
    setExpandedDuplicateIndex(null);
  };
  
  const handleEditChange = (field: keyof ImportRow, value: string) => {
    if (editData) {
      setEditData({ ...editData, [field]: value });
    }
  };

  const handleEditSave = async (index: number) => {
    if (!editData) return;
    try {
      setIsSavingRow(true);
      let updatedRow = await invoke<ImportRow>("validate_import_row", { row: editData });
      
      const newRows = [...rows];
      
      if (!updatedRow.is_duplicate && !updatedRow.has_errors) {
        const duplicateIndex = newRows.findIndex((r, idx) => {
          if (idx === index) return false;
          return r.first_name.trim().toLowerCase() === updatedRow.first_name.trim().toLowerCase()
            && r.last_name.trim().toLowerCase() === updatedRow.last_name.trim().toLowerCase()
            && r.middle_initial.trim().toLowerCase() === updatedRow.middle_initial.trim().toLowerCase()
            && r.level.trim().toLowerCase() === updatedRow.level.trim().toLowerCase()
            && r.section.trim().toLowerCase() === updatedRow.section.trim().toLowerCase()
            && r.date.trim().toLowerCase() === updatedRow.date.trim().toLowerCase()
            && r.adviser.trim().toLowerCase() === updatedRow.adviser.trim().toLowerCase()
            && r.case.trim().toLowerCase() === updatedRow.case.trim().toLowerCase()
            && r.sanction.trim().toLowerCase() === updatedRow.sanction.trim().toLowerCase()
            && r.progress.trim().toLowerCase() === updatedRow.progress.trim().toLowerCase();
        });

        if (duplicateIndex !== -1) {
          const prev = newRows[duplicateIndex];
          updatedRow.is_duplicate = true;
          updatedRow.existing_case = {
            id: 0,
            first_name: prev.first_name,
            last_name: prev.last_name,
            middle_initial: prev.middle_initial,
            level: prev.level,
            section: prev.section,
            date: prev.date,
            date_filed: prev.date_filed,
            adviser: prev.adviser,
            case: prev.case,
            description: prev.description,
            sanction: prev.sanction,
            progress: prev.progress,
            proofs: prev.proofs,
            students: prev.students,
            title: prev.title,
            update_history: "",
          };
        }
      }

      newRows[index] = updatedRow;
      setRows(newRows);
      
      setEditingRowIndex(null);
      setEditData(null);
    } catch (e) {
      showToast("error", `Validation failed: ${e}`);
    } finally {
      setIsSavingRow(false);
    }
  };

  const handleEditCancel = () => {
    setEditingRowIndex(null);
    setEditData(null);
  };

  const handleImportReady = async () => {
    if (readyRows.length === 0) return;
    try {
      setIsImporting(true);
      const rowsToImport = readyRows.map(item => item.row);
      
      const result = await invoke<{ success: boolean; inserted_count: number; failed_count: number; errors: string[] }>("batch_import_cases", {
        rows: rowsToImport
      });

      if (result.success || result.inserted_count > 0) {
        const readyIndices = new Set(readyRows.map(item => item.index));
        const remainingRows = rows.filter((_, idx) => !readyIndices.has(idx));
        setRows(remainingRows);
        if (remainingRows.length === 0) {
          localStorage.removeItem("lc_pending_import_rows");
          localStorage.removeItem("lc_pending_import_filename");
        }
        navigate("/catalog", { state: { toastMessage: `Successfully imported ${result.inserted_count} records.` } });
      } else {
        showToast("error", `Import failed. ${result.failed_count} errors. ${result.errors.join(" ")}`);
      }
    } catch (e) {
      showToast("error", `Batch import failed: ${e}`);
    } finally {
      setIsImporting(false);
    }
  };

  const currentTabRows = useMemo(() => {
    if (activeTab === "issues") return issuesRows;
    if (activeTab === "duplicates") return duplicatesRows;
    return readyRows;
  }, [activeTab, issuesRows, duplicatesRows, readyRows]);

  return (
    <div className="flex flex-col h-full bg-surface-container-lowest relative overflow-hidden animate-fade-in">
      {toast && createPortal(
        <div className={`app-toast fixed bottom-5 right-5 z-[99999999] flex items-start gap-2 rounded-xl px-4 py-3 shadow-xl transition-[transform,opacity] duration-1000 ease-out ${
          toast.type === "success"
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

      {/* Header (styled exactly like layout TopAppBar) */}
      <div className="app-topbar-surface h-16 border-b border-outline-variant flex items-center justify-between px-margin-page sticky top-0 z-20 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate("/catalog")}
            className="text-secondary hover:text-primary transition-colors duration-500 flex items-center justify-center cursor-pointer"
            title="Go Back"
          >
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </button>
          <h2 className="font-serif text-lg font-semibold text-primary dark:text-primary-fixed-dim text-left flex items-center gap-2">
            Import Review
            <span className="text-xs font-normal text-on-surface-variant bg-surface-variant/70 dark:bg-surface-variant/30 border border-outline-variant px-2 py-0.5 rounded-full font-body-md">
              {filename}
            </span>
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleImportReady}
            disabled={readyRows.length === 0 || isImporting}
            className="btn-primary"
          >
            {isImporting ? (
              <span className="material-symbols-outlined animate-spin text-[20px]">sync</span>
            ) : (
              <span className="material-symbols-outlined text-[20px]">publish</span>
            )}
            <span>Import All Ready Rows ({readyRows.length})</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-outline-variant bg-surface px-6 pt-2 gap-2 shrink-0">
        <div className="flex gap-2">
          <TabButton
            label="Issues"
            count={issuesRows.length}
            isActive={activeTab === "issues"}
            onClick={() => {
              setActiveTab("issues");
              setExpandedDuplicateIndex(null);
              handleEditCancel();
            }}
            badgeColor="text-[#C5221F] bg-[#FCE8E6] dark:text-[#ffdad6] dark:bg-[#93000a]/50"
            activeColor="border-error text-error"
          />
          <TabButton
            label="Duplicates"
            count={duplicatesRows.length}
            isActive={activeTab === "duplicates"}
            onClick={() => {
              setActiveTab("duplicates");
              setExpandedDuplicateIndex(null);
              handleEditCancel();
            }}
            badgeColor="text-[#B06000] bg-[#FEF7E0] dark:text-[#ffe0b2] dark:bg-[#e65100]/40"
            activeColor="border-[#B06000] text-[#B06000] dark:border-[#ffb74d] dark:text-[#ffb74d]"
          />
          <TabButton
            label="Ready to Import"
            count={readyRows.length}
            isActive={activeTab === "ready"}
            onClick={() => {
              setActiveTab("ready");
              setExpandedDuplicateIndex(null);
              handleEditCancel();
            }}
            badgeColor="text-[#137333] bg-[#E6F4EA] dark:text-[#a8fab3] dark:bg-[#137333]/40"
            activeColor="border-[#137333] text-[#137333] dark:border-[#34A06A] dark:text-[#34A06A]"
          />
        </div>

        {currentTabRows.length > 0 && (
          <button
            type="button"
            onClick={() => setIsDeleteAllConfirmOpen(true)}
            className="self-end sm:self-center mb-2 px-3 py-1.5 text-xs font-bold text-error bg-error/10 hover:bg-error/20 active:scale-95 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            title={`Delete all rows under ${activeTab === "issues" ? "Issues" : activeTab === "duplicates" ? "Duplicates" : "Ready to Import"}`}
          >
            <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
            <span>
              {activeTab === "issues"
                ? `Delete All Issues (${issuesRows.length})`
                : activeTab === "duplicates"
                ? `Delete All Duplicates (${duplicatesRows.length})`
                : `Delete All Ready (${readyRows.length})`}
            </span>
          </button>
        )}
      </div>

      {/* Main Table Content */}
      <div className="flex-1 overflow-auto p-6 min-h-[300px]">
        {currentTabRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-on-surface-variant bg-surface border border-outline-variant rounded-2xl p-8 shadow-sm">
            <span className="material-symbols-outlined text-5xl mb-3 text-secondary">
              {activeTab === "issues" ? "check_circle" : activeTab === "duplicates" ? "verified" : "hourglass_empty"}
            </span>
            <h3 className="text-base font-bold text-on-surface mb-1">
              {activeTab === "issues"
                ? "No Formatting or Field Issues!"
                : activeTab === "duplicates"
                ? "No Duplicate Records Found!"
                : "No Cases Ready to Import"}
            </h3>
            <p className="text-xs text-on-surface-variant max-w-md text-center leading-relaxed">
              {activeTab === "issues"
                ? "All data formats and required fields are valid. You have zero issues to correct."
                : activeTab === "duplicates"
                ? "All clean rows are unique and do not overlap with existing entries in the database."
                : "Correct the remaining issues under the 'Issues' tab to make them ready for import."}
            </p>
          </div>
        ) : (
          <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container border-b border-outline-variant micro-label text-on-surface-variant">
                  <th className="py-3 px-4 w-16 text-center bg-surface-container-low/70">Row</th>
                  <th className="py-3 px-4 min-w-[150px] text-left">Student Name</th>
                  <th className="py-3 px-4 min-w-[120px] text-left">Incident Date</th>
                  <th className="py-3 px-4 min-w-[150px] text-center">Case Type</th>
                  
                  {activeTab === "issues" && <th className="py-3 px-4 min-w-[220px] text-left">Issues</th>}
                  {activeTab === "duplicates" && <th className="py-3 px-4 min-w-[160px] text-left">Database Match</th>}
                  {activeTab === "ready" && <th className="py-3 px-4 w-28 text-left">Status</th>}
                  
                  <th className="py-3 px-4 w-52 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 text-on-surface">
                {currentTabRows.map(({ row, index }) => {
                  return (
                    <Fragment key={index}>
                      <tr className={`hover:bg-surface-container-low transition-colors ${row.has_errors ? "bg-[#FCE8E6]/10 dark:bg-[#ba1a1a]/5" : row.is_duplicate ? "bg-[#FEF7E0]/10 dark:bg-[#b06000]/5" : ""}`}>
                        {/* Row number */}
                        <td className="py-2.5 px-4 font-semibold text-center text-on-surface-variant bg-surface-container-low/30 text-sm">
                          {index + 2}
                        </td>

                        {/* Student Name */}
                        <td className="py-2.5 px-4 font-semibold text-on-surface text-sm">
                          {row.full_name || `${row.last_name}, ${row.first_name} ${row.middle_initial}`.trim()}
                        </td>

                        {/* Incident Date */}
                        <td className="py-2.5 px-4 font-data-mono text-sm">
                          {row.date}
                        </td>

                        {/* Case Type */}
                        <td className="py-2.5 px-4 text-sm text-center">
                          <span className="bg-surface-variant/40 px-2 py-0.5 rounded font-medium text-on-surface-variant border border-outline-variant">{row.case}</span>
                        </td>

                        {/* Tab-specific Columns */}
                        {activeTab === "issues" && (
                          <td className="py-2.5 px-4">
                            <div className="text-xs text-[#C5221F] bg-[#FCE8E6]/60 dark:text-[#ffdad6] dark:bg-[#93000a]/30 p-2.5 rounded-xl border border-[#FAD2CF] dark:border-[#ffb4ab]/30 whitespace-pre-wrap leading-tight">
                              <ul className="list-disc list-inside space-y-0.5 font-medium">
                                {row.errors.map((err, i) => (
                                  <li key={i}>{err}</li>
                                ))}
                              </ul>
                            </div>
                          </td>
                        )}

                        {activeTab === "duplicates" && (
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-semibold text-[#B06000] bg-[#FEF7E0] dark:text-[#ffe0b2] dark:bg-[#e65100]/30 border border-[#FEEFC3] dark:border-[#ffb74d]/30 px-2 py-0.5 rounded">
                                {row.existing_case?.id === 0 ? "Duplicate in Excel Sheet" : "Matches Existing Case"}
                              </span>
                              <button
                                onClick={() => setExpandedDuplicateIndex(expandedDuplicateIndex === index ? null : index)}
                                className="text-[11px] font-bold text-primary dark:text-primary-fixed-dim underline hover:opacity-80 flex items-center gap-0.5"
                              >
                                <span className="material-symbols-outlined text-[12px]">{expandedDuplicateIndex === index ? "expand_less" : "expand_more"}</span>
                                {expandedDuplicateIndex === index ? "Hide Match" : "Compare Case"}
                              </button>
                            </div>
                          </td>
                        )}

                        {activeTab === "ready" && (
                          <td className="py-2.5 px-4">
                            <span className="inline-flex items-center gap-1 text-[10px] text-[#137333] bg-[#E6F4EA] dark:text-[#a8fab3] dark:bg-[#137333]/30 border border-[#CEEAD6] dark:border-[#34a06a]/30 px-2 py-0.5 rounded-full font-bold">
                              <span className="material-symbols-outlined text-[10px]">check_circle</span>
                              Ready
                            </span>
                          </td>
                        )}

                        {/* Actions */}
                        <td className="py-2.5 px-4 text-center">
                          <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                            <button
                              onClick={() => handleEditStart(index, row)}
                              className="px-3 py-1.5 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 active:scale-95 rounded-xl transition-all flex items-center justify-center gap-1 whitespace-nowrap"
                              title="Edit and correct info"
                            >
                              <span className="material-symbols-outlined text-[14px]">edit_note</span>
                              {activeTab === "issues" ? "Fix Issues" : activeTab === "duplicates" ? "Edit Details" : "Edit Row"}
                            </button>
                            <button
                              onClick={() => handleDisregard(index)}
                              className="px-3 py-1.5 text-xs font-bold text-error bg-error/10 hover:bg-error/20 active:scale-95 rounded-xl transition-all flex items-center justify-center gap-1 whitespace-nowrap"
                              title="Disregard and remove row"
                            >
                              <span className="material-symbols-outlined text-[14px]">delete</span>
                              Disregard
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Duplicate Comparison Panel Row */}
                      {activeTab === "duplicates" && expandedDuplicateIndex === index && row.existing_case && (
                        <tr className="bg-surface-container-low/30 border-b border-outline-variant">
                          <td colSpan={6} className="p-4">
                            <div className="bg-surface rounded-xl border border-outline-variant p-4 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-200 shadow-inner">
                              <div className="flex justify-between items-center border-b border-outline-variant pb-2 shrink-0">
                                <h3 className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                                  <span className="material-symbols-outlined text-[#B06000] dark:text-[#ffb74d] text-[18px]">difference</span>
                                  Database Match Comparison
                                </h3>
                                <button
                                  onClick={() => setExpandedDuplicateIndex(null)}
                                  className="text-[11px] font-bold text-secondary hover:text-on-surface"
                                >
                                  Close comparison
                                </button>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                {/* Left Column: Excel data */}
                                <div className="flex flex-col gap-2 p-3 bg-[#FEF7E0]/15 dark:bg-[#e65100]/10 rounded-lg border border-[#FEEFC3]/40 dark:border-[#ffb74d]/20">
                                  <h4 className="font-bold text-[#B06000] dark:text-[#ffb74d] uppercase tracking-wider text-[10px] mb-0.5">Importing Data (Excel Row {index + 2})</h4>
                                  <div className="grid grid-cols-3 gap-y-1">
                                    <div className="text-on-surface-variant font-medium">Student:</div>
                                    <div className="col-span-2 font-semibold">{row.first_name} {row.last_name}</div>
                                    <div className="text-on-surface-variant font-medium">Grade/Section:</div>
                                    <div className="col-span-2 font-semibold">{row.level} - {row.section}</div>
                                    <div className="text-on-surface-variant font-medium">Date:</div>
                                    <div className="col-span-2 font-semibold font-data-mono">{formatDateToMMDDYY(row.date)}</div>
                                    <div className="text-on-surface-variant font-medium">Adviser:</div>
                                    <div className="col-span-2 font-semibold">{row.adviser}</div>
                                    <div className="text-on-surface-variant font-medium">Case Type:</div>
                                    <div className="col-span-2 font-semibold">{row.case}</div>
                                    <div className="text-on-surface-variant font-medium">Sanction:</div>
                                    <div className="col-span-2 font-semibold">{row.sanction || "None"}</div>
                                    <div className="text-on-surface-variant font-medium">Progress:</div>
                                    <div className="col-span-2 font-semibold">{row.progress}</div>
                                  </div>
                                </div>
                                {/* Right Column: Database data */}
                                <div className="flex flex-col gap-2 p-3 bg-surface-container-low rounded-lg border border-outline-variant">
                                  <h4 className="font-bold text-primary dark:text-primary-fixed-dim uppercase tracking-wider text-[10px] mb-0.5 font-display-title">
                                    {row.existing_case.id === 0 ? "Duplicate Entry in Excel Sheet" : `Existing Record (ID: #${String(row.existing_case.id).padStart(4, '0')})`}
                                  </h4>
                                  <div className="grid grid-cols-3 gap-y-1">
                                    {(() => {
                                      const dbStudents = parseStudents(row.existing_case.students);
                                      const firstStudent = dbStudents[0] || {};
                                      return (
                                        <>
                                          <div className="text-on-surface-variant font-medium">Student:</div>
                                          <div className="col-span-2 font-semibold">
                                            {firstStudent.firstName || ""} {firstStudent.lastName || ""}
                                            {dbStudents.length > 1 && ` (+${dbStudents.length - 1} others)`}
                                          </div>
                                          <div className="text-on-surface-variant font-medium">Grade/Section:</div>
                                          <div className="col-span-2 font-semibold">
                                            {firstStudent.level || ""} {firstStudent.section ? `- ${firstStudent.section}` : ""}
                                          </div>
                                          <div className="text-on-surface-variant font-medium">Date:</div>
                                          <div className="col-span-2 font-semibold font-data-mono">{formatDateToMMDDYY(row.existing_case.date)}</div>
                                          <div className="text-on-surface-variant font-medium">Adviser:</div>
                                          <div className="col-span-2 font-semibold">{firstStudent.adviser || "None"}</div>
                                          <div className="text-on-surface-variant font-medium">Case Type:</div>
                                          <div className="col-span-2 font-semibold">{row.existing_case.case}</div>
                                          <div className="text-on-surface-variant font-medium">Sanction:</div>
                                          <div className="col-span-2 font-semibold">{row.existing_case.sanction || "None"}</div>
                                          <div className="text-on-surface-variant font-medium">Progress:</div>
                                          <div className="col-span-2 font-semibold">{row.existing_case.progress}</div>
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Form Modal */}
      {editingRowIndex !== null && editData && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface rounded-3xl w-full max-w-2xl shadow-xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh]">
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-5 border-b border-outline-variant bg-surface-container-low shrink-0">
              <div>
                <h2 className="text-lg font-bold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary">edit_note</span>
                  Edit Row {editingRowIndex + 2}
                </h2>
                <p className="text-xs text-on-surface-variant">Update the row data to resolve any validation issues.</p>
              </div>
              <button 
                onClick={handleEditCancel}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto flex flex-col gap-5 text-sm">
              {/* Error messages if any */}
              {rows[editingRowIndex].has_errors && (
                <div className="text-xs text-[#C5221F] bg-[#FCE8E6]/60 dark:text-[#ffdad6] dark:bg-[#93000a]/20 p-4 rounded-xl border border-[#FAD2CF] dark:border-[#ffb4ab]/30 flex flex-col gap-1.5 animate-in fade-in duration-200">
                  <h4 className="font-bold flex items-center gap-1.5 text-[#C5221F] dark:text-[#ffdad6]">
                    <span className="material-symbols-outlined text-[16px]">error</span>
                    Validation Errors to Fix:
                  </h4>
                  <ul className="list-disc list-inside space-y-1 pl-1 font-medium text-[#C5221F] dark:text-[#ffdad6]">
                    {rows[editingRowIndex].errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Form grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider text-[10px]">full name (Lastname, Firstname M.I.)</label>
                  <input
                    type="text"
                    value={editData.full_name || ""}
                    onChange={e => handleEditChange("full_name", e.target.value)}
                    placeholder="e.g. Smith, Jane A."
                    className="w-full border border-outline-variant rounded-lg p-2.5 text-sm bg-surface text-on-surface focus:border-primary focus:outline-none placeholder:text-muted font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider text-[10px]">DATE (mm/dd/yyyy)</label>
                  <input
                    type="text"
                    value={editData.date}
                    onChange={e => handleEditChange("date", e.target.value)}
                    className="w-full border border-outline-variant rounded-lg p-2.5 text-sm bg-surface text-on-surface focus:border-primary focus:outline-none placeholder:text-muted font-data-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider text-[10px]">case type</label>
                  <input
                    type="text"
                    value={editData.case}
                    onChange={e => handleEditChange("case", autoCapitalize(e.target.value))}
                    onBlur={() => handleEditChange("case", capitalizeWords(editData.case))}
                    className="w-full border border-outline-variant rounded-lg p-2.5 text-sm bg-surface text-on-surface focus:border-primary focus:outline-none placeholder:text-muted"
                  />
                </div>
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider text-[10px]">sanction</label>
                  <input
                    type="text"
                    value={editData.sanction}
                    maxLength={250}
                    onChange={e => handleEditChange("sanction", e.target.value.slice(0, 250))}
                    className="w-full border border-outline-variant rounded-lg p-2.5 text-sm bg-surface text-on-surface focus:border-primary focus:outline-none placeholder:text-muted"
                  />
                  <p className="mt-0.5 text-right text-[9px] font-medium text-secondary">
                    {(editData.sanction || "").length}/250
                  </p>
                </div>
                <div ref={progressDropdownRef} className="relative">
                  <label className="block font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider text-[10px]">progress</label>
                  <button
                    type="button"
                    onClick={() => setIsProgressDropdownOpen((open) => !open)}
                    className={`group flex h-[38px] w-full items-center gap-2 rounded-lg border bg-surface dark:bg-surface-container px-3 text-left text-sm transition-all duration-300 ease-out ${isProgressDropdownOpen
                        ? "border-primary bg-surface-container ring-2 ring-primary/20 shadow-sm"
                        : "border-outline-variant hover:border-primary/60 hover:bg-surface-container"
                      }`}
                  >
                    <span className="material-symbols-outlined text-secondary dark:text-on-surface-variant transition-colors duration-300 group-hover:text-primary" style={{ fontSize: 16 }}>filter_list</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-gray-700 dark:text-on-surface">
                      {editData.progress || "Select progress"}
                    </span>
                    <span
                      className={`material-symbols-outlined text-secondary dark:text-on-surface-variant transition-transform duration-300 ${isProgressDropdownOpen ? "rotate-180" : "rotate-0"
                        }`}
                      style={{ fontSize: 18 }}
                    >
                      expand_more
                    </span>
                  </button>

                  {isProgressDropdownOpen && (
                    <div className="absolute left-0 top-full z-30 mt-2 w-full overflow-hidden rounded-xl border border-outline-variant bg-surface p-1.5 shadow-lg filter-dropdown-enter">
                      {PROGRESS_OPTIONS.map((status) => {
                        const isSelected = editData.progress === status;
                        return (
                          <button
                            key={status}
                            type="button"
                            onClick={() => {
                              handleEditChange("progress", status);
                              setIsProgressDropdownOpen(false);
                            }}
                            className={`group/status flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-all duration-300 ${isSelected
                                ? "bg-[#EEEDFE] dark:bg-primary/20 text-[#3C3489] dark:text-primary"
                                : "text-gray-700 dark:text-on-surface hover:bg-gray-100 dark:hover:bg-surface-container-high"
                              }`}
                          >
                            <span className={`h-2 w-2 rounded-full transition-colors duration-300 ${status === "Pending" ? "bg-[#f59e0b]" :
                                status === "Resolved" ? "bg-[#22c55e]" :
                                  status === "Closed" ? "bg-[#9ca3af]" :
                                    status === "Reprimand" ? "bg-[#ef4444]" :
                                      "bg-[#7B6FE8]"
                              }`} />
                            <span className="flex-1 font-medium">{status}</span>
                            {isSelected && (
                              <span className="material-symbols-outlined text-[#7B6FE8] dark:text-primary" style={{ fontSize: 16 }}>check</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider text-[10px]">grade</label>
                  <input
                    type="text"
                    list="grade-level-options"
                    value={editData.level}
                    onChange={e => handleEditChange("level", e.target.value)}
                    onBlur={() => handleEditChange("level", normalizeGradeLevel(editData.level))}
                    className="w-full border border-outline-variant rounded-lg p-2.5 text-sm bg-surface text-on-surface focus:border-primary focus:outline-none placeholder:text-muted"
                  />
                  <datalist id="grade-level-options">
                    {GRADE_LEVEL_OPTIONS.map(opt => <option key={opt} value={opt} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider text-[10px]">section</label>
                  <input
                    type="text"
                    list="section-options"
                    value={editData.section}
                    onChange={e => handleEditChange("section", e.target.value)}
                    onBlur={() => handleEditChange("section", normalizeSection(editData.section))}
                    className="w-full border border-outline-variant rounded-lg p-2.5 text-sm bg-surface text-on-surface focus:border-primary focus:outline-none placeholder:text-muted"
                  />
                  <datalist id="section-options">
                    {SECTION_OPTIONS.map(opt => <option key={opt} value={opt} />)}
                  </datalist>
                </div>
                <div className="md:col-span-2">
                  <label className="block font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider text-[10px]">adviser</label>
                  <input
                    type="text"
                    value={editData.adviser}
                    maxLength={20}
                    onChange={e => handleEditChange("adviser", autoCapitalize(e.target.value).slice(0, 20))}
                    onBlur={() => handleEditChange("adviser", capitalizeWords(editData.adviser))}
                    className="w-full border border-outline-variant rounded-lg p-2.5 text-sm bg-surface text-on-surface focus:border-primary focus:outline-none placeholder:text-muted"
                  />
                  <p className="mt-0.5 text-right text-[9px] font-medium text-secondary">
                    {(editData.adviser || "").length}/20
                  </p>
                </div>

              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-surface-container-low border-t border-outline-variant flex justify-end gap-3 shrink-0">
              <button
                onClick={handleEditCancel}
                disabled={isSavingRow}
                className="btn-secondary"
              >
                <span className="material-symbols-outlined text-sm">close</span>
                <span>Cancel</span>
              </button>
              <button
                onClick={() => handleEditSave(editingRowIndex)}
                disabled={isSavingRow}
                className="btn-primary"
              >
                {isSavingRow ? (
                  <>
                    <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">check</span>
                    <span>Save & Validate</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {isDeleteAllConfirmOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm modal-backdrop-enter"
            onClick={() => setIsDeleteAllConfirmOpen(false)}
          />
          <div
            className="relative z-10 bg-surface border border-outline-variant p-6 rounded-2xl shadow-xl max-w-sm w-full modal-panel-enter text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-error/15 text-error flex items-center justify-center mb-3 mx-auto">
              <span className="material-symbols-outlined text-[26px]">delete_sweep</span>
            </div>
            <h3 className="text-base font-bold text-on-surface mb-2">
              Delete All {activeTab === "issues" ? "Issues" : activeTab === "duplicates" ? "Duplicates" : "Ready Rows"}?
            </h3>
            <p className="text-on-surface-variant text-xs mb-6 leading-relaxed">
              Are you sure you want to remove all <strong className="text-on-surface">{currentTabRows.length}</strong> row(s) in the <strong>'{activeTab === "issues" ? "Issues" : activeTab === "duplicates" ? "Duplicates" : "Ready to Import"}'</strong> tab? This action cannot be undone.
            </p>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setIsDeleteAllConfirmOpen(false)}
                className="btn-secondary flex-1 text-xs py-2 justify-center"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDeleteAll}
                className="btn-primary bg-error hover:bg-error/90 text-white flex-1 text-xs py-2 justify-center"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                <span>Yes, Delete All</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Tab Button Component ───────────────────────────────────────────────────
function TabButton({
  label,
  count,
  isActive,
  onClick,
  badgeColor,
  activeColor
}: {
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
  badgeColor: string;
  activeColor: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 border-b-2 font-bold text-sm transition-all duration-300 ${
        isActive
          ? `${activeColor} border-current`
          : "border-transparent text-secondary hover:text-on-surface hover:border-outline-variant"
      }`}
    >
      <span>{label}</span>
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badgeColor} transition-colors duration-300`}>
        {count}
      </span>
    </button>
  );
}
