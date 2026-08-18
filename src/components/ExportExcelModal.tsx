import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CaseRecord } from "../types";

export interface ExportColumns {
  // First 8 standard importable fields (Default checked = true)
  fullName: boolean;
  date: boolean;
  case: boolean;
  sanction: boolean;
  progress: boolean;
  level: boolean;
  section: boolean;
  adviser: boolean;

  // Additional Case Details (Default checked = false)
  caseId: boolean;
  title: boolean;
  dateFiled: boolean;
  description: boolean;
  role: boolean;
  reportingStudent: boolean;
  schoolYear: boolean;
  groupId: boolean;
  proofsCount: boolean;
  updateHistory: boolean;
}

export interface ExportOptions {
  scope: "all" | "specific";
  selectedGrade: string;
  selectedStatus: string;
  startDate: string;
  endDate: string;
  searchQuery: string;
  columns: ExportColumns;
}

export interface ExportExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  cases: CaseRecord[];
  initialStatusFilter?: string;
  initialStartDate?: string;
  initialEndDate?: string;
  initialSearchQuery?: string;
  onExport: (options: ExportOptions) => Promise<void>;
}

const MODAL_EXIT_MS = 200;

const DEFAULT_COLUMNS: ExportColumns = {
  fullName: true,
  date: true,
  case: true,
  sanction: true,
  progress: true,
  level: true,
  section: true,
  adviser: true,

  caseId: false,
  title: false,
  dateFiled: false,
  description: false,
  role: false,
  reportingStudent: false,
  schoolYear: false,
  groupId: false,
  proofsCount: false,
  updateHistory: false,
};

const STANDARD_COLUMN_LABELS: { key: keyof ExportColumns; label: string; desc: string }[] = [
  { key: "fullName", label: "Full Name", desc: "Student full name(s)" },
  { key: "date", label: "Date", desc: "Case date" },
  { key: "case", label: "Case Category", desc: "Type of incident / case" },
  { key: "sanction", label: "Sanction", desc: "Applied sanction" },
  { key: "progress", label: "Progress Status", desc: "Pending, Resolved, Closed, Reprimand" },
  { key: "level", label: "Grade Level", desc: "Grade 7 to 12" },
  { key: "adviser", label: "Adviser", desc: "Class adviser name" },
];

const ADDITIONAL_COLUMN_LABELS: { key: keyof ExportColumns; label: string; desc: string }[] = [
  { key: "caseId", label: "Case ID", desc: "Formatted case reference (e.g. #0042)" },
  { key: "title", label: "Case Title", desc: "Title / subject of group incident" },
  { key: "dateFiled", label: "Date", desc: "Date & time record was logged" },
  { key: "description", label: "Description", desc: "Full case narrative / details" },
  { key: "role", label: "Student Roles", desc: "Respondent, Complainant / Subject" },
  { key: "reportingStudent", label: "Reporting Student", desc: "Student who reported the case" },
  { key: "schoolYear", label: "School Year", desc: "Academic school year (e.g. 2026-2027)" },
  { key: "groupId", label: "Group ID", desc: "Linked group case tracking ID" },
  { key: "proofsCount", label: "Attached Proofs", desc: "Number of uploaded documentation files" },
  { key: "updateHistory", label: "Update History", desc: "Audit log of updates & status changes" },
];

export default function ExportExcelModal({
  isOpen,
  onClose,
  cases,
  initialStatusFilter = "All Statuses",
  initialStartDate = "",
  initialEndDate = "",
  initialSearchQuery = "",
  onExport,
}: ExportExcelModalProps) {
  const [isVisible, setIsVisible] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Export Filter States
  const [scope, setScope] = useState<"all" | "specific">("all");
  const [selectedGrade, setSelectedGrade] = useState("Grade 7");
  const [selectedStatus, setSelectedStatus] = useState(
    initialStatusFilter === "All Statuses" ? "all" : initialStatusFilter
  );
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [columns, setColumns] = useState<ExportColumns>(DEFAULT_COLUMNS);

  const [isGradeDropdownOpen, setIsGradeDropdownOpen] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setIsClosing(false);
      setSelectedStatus(
        initialStatusFilter === "All Statuses" ? "all" : initialStatusFilter
      );
      setStartDate(initialStartDate);
      setEndDate(initialEndDate);
      setSearchQuery(initialSearchQuery);
      setColumns(DEFAULT_COLUMNS);
      return;
    }

    setIsClosing(true);
    const timer = window.setTimeout(() => {
      setIsVisible(false);
      setIsClosing(false);
    }, MODAL_EXIT_MS);

    return () => window.clearTimeout(timer);
  }, [isOpen, initialStatusFilter, initialStartDate, initialEndDate, initialSearchQuery]);

  const handleClose = () => {
    if (isClosing || isExporting) return;
    setIsClosing(true);
    window.setTimeout(() => {
      setIsVisible(false);
      setIsClosing(false);
      onClose();
    }, MODAL_EXIT_MS);
  };

  // Compute filtered cases matching export settings
  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      // 1. Grade level scope
      if (scope === "specific") {
        if (!c.level || c.level.trim().toLowerCase() !== selectedGrade.toLowerCase()) {
          return false;
        }
      }

      // 2. Status filter
      if (selectedStatus !== "all") {
        if (c.progress?.toLowerCase() !== selectedStatus.toLowerCase()) {
          return false;
        }
      }

      // 3. Date range filter
      if (startDate || endDate) {
        const caseDateStr = c.date;
        if (caseDateStr) {
          if (startDate && caseDateStr < startDate) return false;
          if (endDate && caseDateStr > endDate) return false;
        }
      }

      // 4. Search query
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
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
          // ignore JSON parse error
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
  }, [cases, scope, selectedGrade, selectedStatus, startDate, endDate, searchQuery]);

  const activeColumnsCount = useMemo(() => {
    return Object.values(columns).filter(Boolean).length;
  }, [columns]);

  const totalAvailableColumns = STANDARD_COLUMN_LABELS.length + ADDITIONAL_COLUMN_LABELS.length;

  const toggleColumn = (key: keyof ExportColumns) => {
    setColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleResetToDefault = () => {
    setColumns(DEFAULT_COLUMNS);
  };

  const handleSelectAllColumns = () => {
    setColumns({
      fullName: true,
      date: true,
      case: true,
      sanction: true,
      progress: true,
      level: true,
      section: true,
      adviser: true,
      caseId: true,
      title: true,
      dateFiled: true,
      description: true,
      role: true,
      reportingStudent: true,
      schoolYear: true,
      groupId: true,
      proofsCount: true,
      updateHistory: true,
    });
  };

  const handleClearAllColumns = () => {
    setColumns({
      fullName: false,
      date: false,
      case: false,
      sanction: false,
      progress: false,
      level: false,
      section: false,
      adviser: false,
      caseId: false,
      title: false,
      dateFiled: false,
      description: false,
      role: false,
      reportingStudent: false,
      schoolYear: false,
      groupId: false,
      proofsCount: false,
      updateHistory: false,
    });
  };

  const handleConfirmExport = async () => {
    if (filteredCases.length === 0 || activeColumnsCount === 0 || isExporting) return;
    try {
      setIsExporting(true);
      await onExport({
        scope,
        selectedGrade,
        selectedStatus,
        startDate,
        endDate,
        searchQuery,
        columns,
      });
      handleClose();
    } catch (e) {
      // Handled by caller
    } finally {
      setIsExporting(false);
    }
  };

  if (!isVisible) return null;

  const isZipExport = columns.proofsCount || columns.updateHistory;
  const zipFolders: string[] = [];
  if (columns.proofsCount) zipFolders.push("attached_proofs/");
  if (columns.updateHistory) zipFolders.push("update_history/");

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm ${
          isClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"
        }`}
        onClick={handleClose}
      />

      {/* Modal Dialog */}
      <div
        className={`relative z-10 bg-surface border border-outline-variant rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden ${
          isClosing ? "modal-panel-exit" : "modal-panel-enter"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-outline-variant bg-surface-container-low">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">
                {isZipExport ? "folder_zip" : "table_view"}
              </span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-on-surface">
                {isZipExport ? "Export Cases Archive (.zip)" : "Export Cases to Excel"}
              </h2>
              <p className="text-xs text-secondary mt-0.5">
                {isZipExport
                  ? "Attached proofs and update history will be bundled into a ZIP file along with the Excel sheet."
                  : "Filter case records and choose which columns to include in your spreadsheet."}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Section 1: Filters Settings */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-secondary uppercase tracking-wider">
                1. Export Filters
              </h3>
              <span className="text-xs text-secondary font-medium">
                {filteredCases.length} of {cases.length} case(s) match
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-surface-container-low border border-outline-variant p-4 rounded-2xl">
              {/* Scope Selection */}
              <div>
                <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-2 block">
                  Grade Level Scope
                </label>
                <div className="space-y-2">
                  <label
                    className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-colors ${
                      scope === "all"
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-surface-container text-on-surface-variant"
                    }`}
                  >
                    <input
                      type="radio"
                      name="exportScope"
                      value="all"
                      checked={scope === "all"}
                      onChange={() => setScope("all")}
                      className="w-4 h-4 text-primary focus:ring-primary accent-primary"
                    />
                    <span className="text-sm">All year levels</span>
                  </label>

                  <label
                    className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-colors ${
                      scope === "specific"
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-surface-container text-on-surface-variant"
                    }`}
                  >
                    <input
                      type="radio"
                      name="exportScope"
                      value="specific"
                      checked={scope === "specific"}
                      onChange={() => setScope("specific")}
                      className="w-4 h-4 text-primary focus:ring-primary accent-primary"
                    />
                    <span className="text-sm">Specific year level</span>
                  </label>

                  {scope === "specific" && (
                    <div className="pl-7 mt-2">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setIsGradeDropdownOpen((open) => !open)}
                          className={`flex h-9 w-full items-center justify-between rounded-xl border bg-surface px-3 text-sm transition-all ${
                            isGradeDropdownOpen
                              ? "border-primary ring-2 ring-primary/20"
                              : "border-outline-variant hover:border-primary/60"
                          }`}
                        >
                          <span className="font-medium text-on-surface">
                            {selectedGrade}
                          </span>
                          <span className="material-symbols-outlined text-[18px] text-secondary">
                            expand_more
                          </span>
                        </button>

                        {isGradeDropdownOpen && (
                          <div className="absolute left-0 top-full z-30 mt-1 w-full overflow-hidden rounded-xl border border-outline-variant bg-surface p-1 shadow-lg">
                            {[
                              "Grade 7",
                              "Grade 8",
                              "Grade 9",
                              "Grade 10",
                              "Grade 11",
                              "Grade 12",
                            ].map((grade) => (
                              <button
                                key={grade}
                                type="button"
                                onClick={() => {
                                  setSelectedGrade(grade);
                                  setIsGradeDropdownOpen(false);
                                }}
                                className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs text-left transition-colors ${
                                  selectedGrade === grade
                                    ? "bg-primary/10 text-primary font-bold"
                                    : "text-on-surface hover:bg-surface-container"
                                }`}
                              >
                                <span>{grade}</span>
                                {selectedGrade === grade && (
                                  <span className="material-symbols-outlined text-[14px]">
                                    check
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Selection */}
              <div>
                <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-2 block">
                  Progress Status
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsStatusDropdownOpen((open) => !open)}
                    className={`flex h-10 w-full items-center justify-between rounded-xl border bg-surface px-3 text-sm transition-all ${
                      isStatusDropdownOpen
                        ? "border-primary ring-2 ring-primary/20"
                        : "border-outline-variant hover:border-primary/60"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="material-symbols-outlined text-secondary text-[18px]">
                        filter_list
                      </span>
                      <span className="truncate font-medium text-on-surface">
                        {selectedStatus === "all"
                          ? "All statuses"
                          : selectedStatus}
                      </span>
                    </div>
                    <span className="material-symbols-outlined text-[18px] text-secondary">
                      expand_more
                    </span>
                  </button>

                  {isStatusDropdownOpen && (
                    <div className="absolute left-0 top-full z-30 mt-1 w-full overflow-hidden rounded-xl border border-outline-variant bg-surface p-1 shadow-lg">
                      {[
                        "all",
                        "Pending",
                        "Resolved",
                        "Closed",
                        "Reprimand",
                      ].map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => {
                            setSelectedStatus(st);
                            setIsStatusDropdownOpen(false);
                          }}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-left transition-colors ${
                            selectedStatus === st
                              ? "bg-primary/10 text-primary font-bold"
                              : "text-on-surface hover:bg-surface-container"
                          }`}
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${
                              st === "Pending"
                                ? "bg-[#f59e0b]"
                                : st === "Resolved"
                                ? "bg-[#22c55e]"
                                : st === "Closed"
                                ? "bg-[#9ca3af]"
                                : st === "Reprimand"
                                ? "bg-[#ef4444]"
                                : "bg-primary"
                            }`}
                          />
                          <span className="flex-1">
                            {st === "all" ? "All statuses" : st}
                          </span>
                          {selectedStatus === st && (
                            <span className="material-symbols-outlined text-[14px]">
                              check
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Date range inputs */}
                <div className="mt-3.5 space-y-1.5">
                  <label className="text-[11px] font-medium text-secondary">
                    Date Range (Optional)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-surface border border-outline-variant rounded-xl text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="Start Date"
                    />
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-surface border border-outline-variant rounded-xl text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="End Date"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Columns Selection */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-secondary uppercase tracking-wider">
                  2. Included Columns ({activeColumnsCount} of {totalAvailableColumns})
                </h3>
                <p className="text-[11px] text-secondary mt-0.5">
                  Check the fields you want to include in the exported spreadsheet.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleResetToDefault}
                  className="font-semibold text-primary hover:underline"
                >
                  Default (8)
                </button>
                <span className="text-outline-variant">|</span>
                <button
                  type="button"
                  onClick={handleSelectAllColumns}
                  className="font-semibold text-primary hover:underline"
                >
                  Select All
                </button>
                <span className="text-outline-variant">|</span>
                <button
                  type="button"
                  onClick={handleClearAllColumns}
                  className="font-semibold text-secondary hover:underline"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Standard Importable Fields (8) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary text-[15px]">file_upload</span>
                  <span>Standard Importable Columns (Checked by Default)</span>
                </span>
                <span className="text-[10px] text-secondary bg-surface-container px-2 py-0.5 rounded-full border border-outline-variant font-mono">
                  Default 8
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {STANDARD_COLUMN_LABELS.map((col) => {
                  const isChecked = columns[col.key];
                  return (
                    <div
                      key={col.key}
                      onClick={() => toggleColumn(col.key)}
                      className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer select-none transition-all ${
                        isChecked
                          ? "bg-primary/5 border-primary/40 text-on-surface"
                          : "bg-surface-container-low border-outline-variant text-secondary opacity-60 hover:opacity-100"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleColumn(col.key);
                        }}
                        className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold ${isChecked ? "text-on-surface" : "text-secondary"}`}>
                          {col.label}
                        </p>
                        <p className="text-[10px] text-secondary truncate">{col.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Additional Case Details (10) */}
            <div className="space-y-2 pt-2 border-t border-outline-variant">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-secondary text-[15px]">article</span>
                  <span>Additional Case Details (Optional)</span>
                </span>
                <span className="text-[10px] text-secondary bg-surface-container px-2 py-0.5 rounded-full border border-outline-variant font-mono">
                  Case Details
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ADDITIONAL_COLUMN_LABELS.map((col) => {
                  const isChecked = columns[col.key];
                  const isZipTrigger = col.key === "proofsCount" || col.key === "updateHistory";
                  return (
                    <div
                      key={col.key}
                      onClick={() => toggleColumn(col.key)}
                      className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer select-none transition-all ${
                        isChecked
                          ? isZipTrigger
                            ? "bg-amber-500/10 border-amber-500/40 text-on-surface"
                            : "bg-primary/5 border-primary/40 text-on-surface"
                          : "bg-surface-container-low border-outline-variant text-secondary opacity-60 hover:opacity-100"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleColumn(col.key);
                        }}
                        className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className={`text-xs font-bold ${isChecked ? "text-on-surface" : "text-secondary"}`}>
                            {col.label}
                          </p>
                          {isZipTrigger && (
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300">
                              ZIP
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-secondary truncate">{col.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Export summary pill */}
          <div
            className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
              filteredCases.length > 0 && activeColumnsCount > 0
                ? isZipExport
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300"
                  : "bg-primary/10 border-primary/30 text-primary"
                : "bg-error-container/20 border-error/30 text-error"
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="material-symbols-outlined text-[18px]">
                {filteredCases.length > 0 && activeColumnsCount > 0
                  ? isZipExport
                    ? "folder_zip"
                    : "info"
                  : "warning"}
              </span>
              <span>
                {activeColumnsCount === 0
                  ? "Please select at least 1 column to include in the export."
                  : filteredCases.length === 0
                  ? "No cases match the selected export filters."
                  : isZipExport
                  ? `Ready to export ${filteredCases.length} case record(s) as a ZIP archive (.zip) containing cases_export.xlsx and folder(s) for ${zipFolders.join(" & ")}.`
                  : `Ready to export ${filteredCases.length} case record(s) with ${activeColumnsCount} column(s).`}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-outline-variant bg-surface-container-low">
          <button
            type="button"
            onClick={handleClose}
            disabled={isExporting}
            className="btn-secondary px-5 py-2 text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmExport}
            disabled={filteredCases.length === 0 || activeColumnsCount === 0 || isExporting}
            className="btn-primary px-6 py-2 text-xs flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[18px]">
              {isExporting ? "progress_activity" : isZipExport ? "folder_zip" : "file_download"}
            </span>
            <span>
              {isExporting
                ? "Exporting..."
                : isZipExport
                ? "Export ZIP Archive (.zip)"
                : "Export Excel File"}
            </span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
