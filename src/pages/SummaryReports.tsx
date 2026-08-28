import { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import AcademicMonthRangePicker from "../components/AcademicMonthRangePicker";
import { useAcademicYearFilter } from "../context/AcademicYearFilterContext";
import { CaseRecord } from "../types";
import {
  PaperSize,
  ReportConfig,
  SignatureConfig,
  useReportGenerator,
  ReportViewer,
} from "../reports";

const DEFAULT_SIGNATURE_CONFIG: SignatureConfig = {
  sig1: {
    show: true,
    label: "Prepared by:",
    title: "Guidance Counselor",
  },
  sig2: {
    show: true,
    label: "Noted by:",
    title: "School Principal",
  },
};

export default function SummaryReports() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [scope, setScope] = useState<"all" | "specific">("all");
  const [selectedGrade, setSelectedGrade] = useState("Grade 7");
  const [selectedStatus, setSelectedStatus] = useState<"all" | "Pending" | "Reprimand" | "Resolved" | "Closed">("all");
  const [paperSize, setPaperSize] = useState<PaperSize>("A4");

  const [includes, setIncludes] = useState({
    summary: true,
    signature: true,
  });
  const [signatureConfig, setSignatureConfig] = useState<SignatureConfig>(DEFAULT_SIGNATURE_CONFIG);
  const [visibleColumns, setVisibleColumns] = useState({
    date: true,
    student: true,
    class: true,
    adviser: true,
    type: true,
    description: true,
    sanction: true,
    status: true,
  });

  const [isExporting, setIsExporting] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement | null>(null);

  const [isGradeDropdownOpen, setIsGradeDropdownOpen] = useState(false);
  const gradeDropdownRef = useRef<HTMLDivElement | null>(null);

  const [isPaperSizeDropdownOpen, setIsPaperSizeDropdownOpen] = useState(false);
  const paperSizeDropdownRef = useRef<HTMLDivElement | null>(null);

  const {
    allYears,
    selectedSchoolYear,
    setSelectedSchoolYear,
    startDate,
    endDate,
    setDateRange,
    isYearsLoading,
  } = useAcademicYearFilter();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
      if (gradeDropdownRef.current && !gradeDropdownRef.current.contains(event.target as Node)) {
        setIsGradeDropdownOpen(false);
      }
      if (paperSizeDropdownRef.current && !paperSizeDropdownRef.current.contains(event.target as Node)) {
        setIsPaperSizeDropdownOpen(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isYearsLoading || selectedSchoolYear === null) return;

    const loadCases = async () => {
      try {
        const queryYear = selectedSchoolYear === "all" || (startDate && endDate) ? null : selectedSchoolYear;
        const loadedCases = await invoke<CaseRecord[]>("get_cases", {
          schoolYear: queryYear,
        });
        setCases(loadedCases);
      } catch (err) {
        console.error("Failed to load cases", err);
      }
    };
    loadCases();

    const handleCasesChanged = () => loadCases();
    window.addEventListener("cases:changed", handleCasesChanged);
    return () => window.removeEventListener("cases:changed", handleCasesChanged);
  }, [selectedSchoolYear, isYearsLoading, startDate, endDate]);

  const reportConfig: ReportConfig = useMemo(
    () => ({
      scope,
      selectedGrade,
      status: selectedStatus,
      startDate,
      endDate,
      paperSize,
      includes,
      columns: visibleColumns,
      signatureConfig,
    }),
    [scope, selectedGrade, selectedStatus, startDate, endDate, paperSize, includes, visibleColumns, signatureConfig]
  );

  // Document-based PDF generation pipeline
  const {
    state,
    error,
    pdfBlobUrl,
    exportPdf,
    printPdf,
    regenerate,
  } = useReportGenerator(reportConfig, cases);

  const handleExportPDF = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await exportPdf();
    } catch (err) {
      alert("Failed to export PDF: " + err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearFilters = () => {
    setScope("all");
    setSelectedGrade("Grade 7");
    setSelectedStatus("all");
    setPaperSize("A4");
    setDateRange("", "");
    setIncludes({
      summary: true,
      signature: true,
    });
    setSignatureConfig(DEFAULT_SIGNATURE_CONFIG);
    setVisibleColumns({
      date: true,
      student: true,
      class: true,
      adviser: true,
      type: true,
      description: true,
      sanction: true,
      status: true,
    });
  };

  const handleSelectAllColumns = () => {
    setVisibleColumns({
      date: true,
      student: true,
      class: true,
      adviser: true,
      type: true,
      description: true,
      sanction: true,
      status: true,
    });
  };

  const handleSelectNoneColumns = () => {
    setVisibleColumns({
      date: false,
      student: false,
      class: false,
      adviser: false,
      type: false,
      description: false,
      sanction: false,
      status: false,
    });
  };

  const activeColumnsCount = Object.values(visibleColumns).filter(Boolean).length;

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-10 h-full">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:justify-between lg:items-end">
        <div>
          <h1 className="page-header-h1 m-0">Reports</h1>
          <p className="text-sm text-secondary mt-1">
            Generate, customize, and export guidance office reports with live PDF preview.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <button
            onClick={handleExportPDF}
            disabled={isExporting || state === "generating" || !pdfBlobUrl}
            className="btn-secondary"
          >
            <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
            <span>{isExporting ? "Exporting..." : "Export PDF"}</span>
          </button>
          <button
            onClick={printPdf}
            disabled={state === "generating" || !pdfBlobUrl}
            className="btn-primary"
          >
            <span className="material-symbols-outlined text-sm">print</span>
            <span>Print</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Redesigned 3-Section Report Settings Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
          {/* SECTION 1: Scope & Filters */}
          <div className="bg-surface border border-outline-variant rounded-2xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              {/* Section Header with integrated Reset action */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-outline-variant">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-primary">tune</span>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-secondary dark:text-secondary">
                    Scope & Filters
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="text-xs text-secondary hover:text-primary transition-colors flex items-center gap-1 font-medium px-2 py-1 rounded-md hover:bg-surface-container"
                  title="Reset all filters to default"
                >
                  <span className="material-symbols-outlined text-[15px]">restart_alt</span>
                  <span>Clear filters</span>
                </button>
              </div>

              <div className="space-y-4">
                {/* Scope Selection */}
                <div>
                  <label className="text-[11px] font-bold text-secondary uppercase tracking-wider block mb-2">
                    Scope
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer select-none transition-all ${
                        scope === "all"
                          ? "bg-primary/10 border-primary text-primary font-semibold shadow-xs"
                          : "border-outline-variant bg-surface-container-low text-on-surface hover:bg-surface-container"
                      }`}
                    >
                      <input
                        type="radio"
                        name="scope"
                        value="all"
                        checked={scope === "all"}
                        onChange={() => setScope("all")}
                        className="w-3.5 h-3.5 text-primary accent-primary"
                      />
                      <span className="text-xs truncate">All Year Levels</span>
                    </label>

                    <label
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer select-none transition-all ${
                        scope === "specific"
                          ? "bg-primary/10 border-primary text-primary font-semibold shadow-xs"
                          : "border-outline-variant bg-surface-container-low text-on-surface hover:bg-surface-container"
                      }`}
                    >
                      <input
                        type="radio"
                        name="scope"
                        value="specific"
                        checked={scope === "specific"}
                        onChange={() => setScope("specific")}
                        className="w-3.5 h-3.5 text-primary accent-primary"
                      />
                      <span className="text-xs truncate">Specific Grade</span>
                    </label>
                  </div>

                  {scope === "specific" && (
                    <div className="mt-2 animate-in fade-in slide-in-from-top-1" ref={gradeDropdownRef}>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setIsGradeDropdownOpen((open) => !open)}
                          className={`group flex h-[38px] w-full items-center gap-2 rounded-lg border bg-surface dark:bg-surface-container px-3 text-left text-sm transition-all duration-300 ease-out ${
                            isGradeDropdownOpen
                              ? "border-primary bg-surface-container ring-2 ring-primary/20 shadow-sm"
                              : "border-outline-variant hover:border-outline hover:bg-surface-container"
                          }`}
                        >
                          <span
                            className="material-symbols-outlined text-secondary dark:text-on-surface-variant transition-colors duration-300 group-hover:text-primary"
                            style={{ fontSize: 18 }}
                          >
                            school
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium text-gray-700 dark:text-on-surface">
                            {selectedGrade}
                          </span>
                          <span
                            className={`material-symbols-outlined text-secondary dark:text-on-surface-variant transition-transform duration-300 ${
                              isGradeDropdownOpen ? "rotate-180" : "rotate-0"
                            }`}
                            style={{ fontSize: 18 }}
                          >
                            expand_more
                          </span>
                        </button>

                        {isGradeDropdownOpen && (
                          <div className="absolute left-0 top-full z-30 mt-2 w-full overflow-hidden rounded-xl border border-outline-variant bg-surface dark:bg-surface-container p-1.5 shadow-lg filter-dropdown-enter">
                            {["Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"].map((grade) => {
                              const isSelected = selectedGrade === grade;
                              return (
                                <button
                                  key={grade}
                                  type="button"
                                  onClick={() => {
                                    setSelectedGrade(grade);
                                    setIsGradeDropdownOpen(false);
                                  }}
                                  className={`group/grade flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-all duration-300 ${
                                    isSelected
                                      ? "bg-[#EEEDFE] dark:bg-[#1A233D] text-[#3C3489] dark:text-[#b4c5ff]"
                                      : "text-on-surface hover:bg-surface-container"
                                  }`}
                                >
                                  <span className="flex-1 font-medium">{grade}</span>
                                  {isSelected && (
                                    <span className="material-symbols-outlined text-[#7B6FE8] dark:text-[#b4c5ff]" style={{ fontSize: 16 }}>
                                      check
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Status Dropdown */}
                <div ref={statusDropdownRef} className="relative">
                  <label className="text-[11px] font-bold text-secondary uppercase tracking-wider block mb-1.5">
                    Status Filter
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsStatusDropdownOpen((open) => !open)}
                    className={`group flex h-[38px] w-full items-center gap-2 rounded-lg border bg-surface dark:bg-surface-container px-3 text-left text-sm transition-all duration-300 ease-out ${
                      isStatusDropdownOpen
                        ? "border-primary bg-surface-container ring-2 ring-primary/20 shadow-sm"
                        : "border-outline-variant hover:border-outline hover:bg-surface-container"
                    }`}
                  >
                    <span
                      className="material-symbols-outlined text-secondary dark:text-on-surface-variant transition-colors duration-300 group-hover:text-primary"
                      style={{ fontSize: 16 }}
                    >
                      filter_list
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-gray-700 dark:text-on-surface">
                      {selectedStatus === "all" ? "All statuses" : selectedStatus}
                    </span>
                    <span
                      className={`material-symbols-outlined text-secondary dark:text-on-surface-variant transition-transform duration-300 ${
                        isStatusDropdownOpen ? "rotate-180" : "rotate-0"
                      }`}
                      style={{ fontSize: 18 }}
                    >
                      expand_more
                    </span>
                  </button>

                  {isStatusDropdownOpen && (
                    <div className="absolute left-0 top-full z-30 mt-2 w-full overflow-hidden rounded-xl border border-outline-variant bg-surface dark:bg-surface-container p-1.5 shadow-lg filter-dropdown-enter">
                      {(["all", "Pending", "Resolved", "Closed", "Reprimand"] as const).map((status) => {
                        const isSelected = selectedStatus === status;
                        return (
                          <button
                            key={status}
                            type="button"
                            onClick={() => {
                              setSelectedStatus(status);
                              setIsStatusDropdownOpen(false);
                            }}
                            className={`group/status flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-all duration-300 ${
                              isSelected
                                ? "bg-[#EEEDFE] dark:bg-[#1A233D] text-[#3C3489] dark:text-[#b4c5ff]"
                                : "text-gray-700 dark:text-on-surface hover:bg-gray-100 dark:hover:bg-surface-container-high"
                            }`}
                          >
                            <span
                              className={`h-2 w-2 rounded-full transition-colors duration-300 ${
                                status === "Pending"
                                  ? "bg-[#f59e0b]"
                                  : status === "Resolved"
                                  ? "bg-[#22c55e]"
                                  : status === "Closed"
                                  ? "bg-[#9ca3af]"
                                  : status === "Reprimand"
                                  ? "bg-[#ef4444]"
                                  : "bg-[#7B6FE8] dark:bg-[#94AAF0]"
                              }`}
                            />
                            <span className="flex-1 font-medium">{status === "all" ? "All statuses" : status}</span>
                            {isSelected && (
                              <span
                                className="material-symbols-outlined text-[#7B6FE8] dark:text-[#b4c5ff]"
                                style={{ fontSize: 16 }}
                              >
                                check
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Paper Size Dropdown */}
                <div ref={paperSizeDropdownRef} className="relative">
                  <label className="text-[11px] font-bold text-secondary uppercase tracking-wider block mb-1.5">
                    Paper Size
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsPaperSizeDropdownOpen((open) => !open)}
                    className={`group flex h-[38px] w-full items-center gap-2 rounded-lg border bg-surface dark:bg-surface-container px-3 text-left text-sm transition-all duration-300 ease-out ${
                      isPaperSizeDropdownOpen
                        ? "border-primary bg-surface-container ring-2 ring-primary/20 shadow-sm"
                        : "border-outline-variant hover:border-outline hover:bg-surface-container"
                    }`}
                  >
                    <span
                      className="material-symbols-outlined text-secondary dark:text-on-surface-variant transition-colors duration-300 group-hover:text-primary"
                      style={{ fontSize: 16 }}
                    >
                      description
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-gray-700 dark:text-on-surface">
                      {paperSize === "A4"
                        ? "A4 (210 × 297 mm)"
                        : paperSize === "LETTER"
                        ? "Letter (8.5 × 11 in)"
                        : paperSize === "FOLIO"
                        ? "Folio / Long (8.5 × 13 in)"
                        : "Legal (8.5 × 14 in)"}
                    </span>
                    <span
                      className={`material-symbols-outlined text-secondary dark:text-on-surface-variant transition-transform duration-300 ${
                        isPaperSizeDropdownOpen ? "rotate-180" : "rotate-0"
                      }`}
                      style={{ fontSize: 18 }}
                    >
                      expand_more
                    </span>
                  </button>

                  {isPaperSizeDropdownOpen && (
                    <div className="absolute left-0 top-full z-30 mt-2 w-full overflow-hidden rounded-xl border border-outline-variant bg-surface dark:bg-surface-container p-1.5 shadow-lg filter-dropdown-enter">
                      {[
                        { id: "A4", label: "A4 (210 × 297 mm)" },
                        { id: "LETTER", label: "Letter (8.5 × 11 in)" },
                        { id: "FOLIO", label: "Folio / Long (8.5 × 13 in)" },
                        { id: "LEGAL", label: "Legal (8.5 × 14 in)" },
                      ].map((size) => {
                        const isSelected = paperSize === size.id;
                        return (
                          <button
                            key={size.id}
                            type="button"
                            onClick={() => {
                              setPaperSize(size.id as PaperSize);
                              setIsPaperSizeDropdownOpen(false);
                            }}
                            className={`group/size flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-all duration-300 ${
                              isSelected
                                ? "bg-[#EEEDFE] dark:bg-[#1A233D] text-[#3C3489] dark:text-[#b4c5ff]"
                                : "text-gray-700 dark:text-on-surface hover:bg-gray-100 dark:hover:bg-surface-container-high"
                            }`}
                          >
                            <span className="flex-1 font-medium">{size.label}</span>
                            {isSelected && (
                              <span
                                className="material-symbols-outlined text-[#7B6FE8] dark:text-[#b4c5ff]"
                                style={{ fontSize: 16 }}
                              >
                                check
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Reporting Period */}
                <div>
                  <label className="text-[11px] font-bold text-secondary uppercase tracking-wider block mb-1.5">
                    Reporting Period
                  </label>
                  <AcademicMonthRangePicker
                    allYears={allYears}
                    schoolYear={selectedSchoolYear}
                    onSelectSchoolYear={setSelectedSchoolYear}
                    isLoadingYears={isYearsLoading}
                    startDate={startDate}
                    endDate={endDate}
                    className="w-full"
                    placeholder="All Records"
                    onRangeChange={(start, end) => setDateRange(start, end)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: Report Content & Signatures */}
          <div className="bg-surface border border-outline-variant rounded-2xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              {/* Section Header */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-outline-variant">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-primary">view_quilt</span>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-secondary dark:text-secondary">
                    Report Content
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {/* Summary statistics toggle */}
                <label className="flex items-center justify-between p-3 rounded-xl border border-outline-variant bg-surface-container-low hover:bg-surface-container cursor-pointer transition-all select-none">
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-[18px] text-secondary">analytics</span>
                    <div>
                      <div className="text-xs font-semibold text-on-surface">Summary Statistics</div>
                      <div className="text-[11px] text-secondary">Metric boxes for Total, Pending, Resolved</div>
                    </div>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      checked={includes.summary}
                      onChange={(e) => setIncludes({ ...includes, summary: e.target.checked })}
                      className="peer custom-checkbox-box appearance-none w-4 h-4 border border-outline-variant rounded bg-surface checked:bg-primary checked:border-primary focus:outline-none cursor-pointer"
                    />
                    <span
                      className="material-symbols-outlined custom-checkbox-icon absolute text-white pointer-events-none left-1/2 top-1/2"
                      style={{ fontSize: "12px", fontWeight: "bold" }}
                    >
                      check
                    </span>
                  </div>
                </label>

                {/* Signature block section */}
                <div className="border border-outline-variant rounded-xl overflow-hidden bg-surface-container-low transition-all">
                  <label className="flex items-center justify-between p-3 hover:bg-surface-container cursor-pointer select-none">
                    <div className="flex items-center gap-2.5">
                      <span className="material-symbols-outlined text-[18px] text-secondary">draw</span>
                      <div>
                        <div className="text-xs font-semibold text-on-surface">Signature Block</div>
                        <div className="text-[11px] text-secondary">End-of-report signoff section</div>
                      </div>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type="checkbox"
                        checked={includes.signature}
                        onChange={(e) => setIncludes({ ...includes, signature: e.target.checked })}
                        className="peer custom-checkbox-box appearance-none w-4 h-4 border border-outline-variant rounded bg-surface checked:bg-primary checked:border-primary focus:outline-none cursor-pointer"
                      />
                      <span
                        className="material-symbols-outlined custom-checkbox-icon absolute text-white pointer-events-none left-1/2 top-1/2"
                        style={{ fontSize: "12px", fontWeight: "bold" }}
                      >
                        check
                      </span>
                    </div>
                  </label>

                  {/* Nested Progressive Disclosure for Signatures */}
                  {includes.signature && (
                    <div className="p-3 pt-1 space-y-2.5 border-t border-outline-variant animate-in fade-in slide-in-from-top-1">
                      {/* Signature 1 sub-card */}
                      <div className="bg-surface border border-outline-variant rounded-lg p-2.5 space-y-2">
                        <label className="flex items-center justify-between cursor-pointer select-none">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-on-surface">Signature 1</span>
                            <span className="text-[10px] text-secondary">(e.g. Prepared by)</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={signatureConfig.sig1.show}
                            onChange={(e) =>
                              setSignatureConfig({
                                ...signatureConfig,
                                sig1: { ...signatureConfig.sig1, show: e.target.checked },
                              })
                            }
                            className="w-3.5 h-3.5 text-primary accent-primary cursor-pointer"
                          />
                        </label>

                        {signatureConfig.sig1.show && (
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <div>
                              <span className="text-[10px] text-secondary font-medium block mb-1">
                                Label
                              </span>
                              <input
                                type="text"
                                value={signatureConfig.sig1.label}
                                onChange={(e) =>
                                  setSignatureConfig({
                                    ...signatureConfig,
                                    sig1: { ...signatureConfig.sig1, label: e.target.value },
                                  })
                                }
                                placeholder="Prepared by:"
                                className="w-full text-xs px-2 py-1 border border-outline-variant rounded bg-surface text-on-surface focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                              />
                            </div>
                            <div>
                              <span className="text-[10px] text-secondary font-medium block mb-1">
                                Name / Title
                              </span>
                              <input
                                type="text"
                                value={signatureConfig.sig1.title}
                                onChange={(e) =>
                                  setSignatureConfig({
                                    ...signatureConfig,
                                    sig1: { ...signatureConfig.sig1, title: e.target.value },
                                  })
                                }
                                placeholder="Guidance Counselor"
                                className="w-full text-xs px-2 py-1 border border-outline-variant rounded bg-surface text-on-surface focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Signature 2 sub-card */}
                      <div className="bg-surface border border-outline-variant rounded-lg p-2.5 space-y-2">
                        <label className="flex items-center justify-between cursor-pointer select-none">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-on-surface">Signature 2</span>
                            <span className="text-[10px] text-secondary">(e.g. Noted by)</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={signatureConfig.sig2.show}
                            onChange={(e) =>
                              setSignatureConfig({
                                ...signatureConfig,
                                sig2: { ...signatureConfig.sig2, show: e.target.checked },
                              })
                            }
                            className="w-3.5 h-3.5 text-primary accent-primary cursor-pointer"
                          />
                        </label>

                        {signatureConfig.sig2.show && (
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <div>
                              <span className="text-[10px] text-secondary font-medium block mb-1">
                                Label
                              </span>
                              <input
                                type="text"
                                value={signatureConfig.sig2.label}
                                onChange={(e) =>
                                  setSignatureConfig({
                                    ...signatureConfig,
                                    sig2: { ...signatureConfig.sig2, label: e.target.value },
                                  })
                                }
                                placeholder="Noted by:"
                                className="w-full text-xs px-2 py-1 border border-outline-variant rounded bg-surface text-on-surface focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                              />
                            </div>
                            <div>
                              <span className="text-[10px] text-secondary font-medium block mb-1">
                                Name / Title
                              </span>
                              <input
                                type="text"
                                value={signatureConfig.sig2.title}
                                onChange={(e) =>
                                  setSignatureConfig({
                                    ...signatureConfig,
                                    sig2: { ...signatureConfig.sig2, title: e.target.value },
                                  })
                                }
                                placeholder="School Principal"
                                className="w-full text-xs px-2 py-1 border border-outline-variant rounded bg-surface text-on-surface focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: Table Columns */}
          <div className="bg-surface border border-outline-variant rounded-2xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              {/* Section Header with Bulk Select Actions */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-outline-variant">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-primary">view_column</span>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-secondary dark:text-secondary">
                    Table Columns
                  </span>
                  <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                    {activeColumnsCount}/8
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={handleSelectAllColumns}
                    className="text-[11px] text-secondary hover:text-primary transition-colors font-medium px-1.5 py-0.5 rounded hover:bg-surface-container"
                  >
                    All
                  </button>
                  <span className="text-outline-variant text-[10px]">|</span>
                  <button
                    type="button"
                    onClick={handleSelectNoneColumns}
                    className="text-[11px] text-secondary hover:text-primary transition-colors font-medium px-1.5 py-0.5 rounded hover:bg-surface-container"
                  >
                    None
                  </button>
                </div>
              </div>

              {/* Clustered Column Checkboxes */}
              <div className="space-y-3.5">
                {/* Cluster 1: Record Identity */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-secondary/80 block mb-1.5">
                    Record Identity
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "date", label: "Date" },
                      { id: "student", label: "Student" },
                      { id: "class", label: "Grade Level" },
                      { id: "adviser", label: "Adviser" },
                    ].map((col) => (
                      <label
                        key={col.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                          visibleColumns[col.id as keyof typeof visibleColumns]
                            ? "bg-primary/10 border-primary text-on-surface font-medium"
                            : "bg-surface-container-low border-outline-variant text-secondary hover:bg-surface-container"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={visibleColumns[col.id as keyof typeof visibleColumns]}
                          onChange={(e) =>
                            setVisibleColumns({
                              ...visibleColumns,
                              [col.id]: e.target.checked,
                            })
                          }
                          className="w-3.5 h-3.5 text-primary accent-primary cursor-pointer"
                        />
                        <span className="truncate">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Cluster 2: Case Details */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-secondary/80 block mb-1.5">
                    Case Details
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "type", label: "Case Type" },
                      { id: "description", label: "Description" },
                      { id: "sanction", label: "Sanction" },
                    ].map((col) => (
                      <label
                        key={col.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                          visibleColumns[col.id as keyof typeof visibleColumns]
                            ? "bg-primary/10 border-primary text-on-surface font-medium"
                            : "bg-surface-container-low border-outline-variant text-secondary hover:bg-surface-container"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={visibleColumns[col.id as keyof typeof visibleColumns]}
                          onChange={(e) =>
                            setVisibleColumns({
                              ...visibleColumns,
                              [col.id]: e.target.checked,
                            })
                          }
                          className="w-3.5 h-3.5 text-primary accent-primary cursor-pointer"
                        />
                        <span className="truncate">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Cluster 3: Status */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-secondary/80 block mb-1.5">
                    Status
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "status", label: "Progress Status" },
                    ].map((col) => (
                      <label
                        key={col.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                          visibleColumns[col.id as keyof typeof visibleColumns]
                            ? "bg-primary/10 border-primary text-on-surface font-medium"
                            : "bg-surface-container-low border-outline-variant text-secondary hover:bg-surface-container"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={visibleColumns[col.id as keyof typeof visibleColumns]}
                          onChange={(e) =>
                            setVisibleColumns({
                              ...visibleColumns,
                              [col.id]: e.target.checked,
                            })
                          }
                          className="w-3.5 h-3.5 text-primary accent-primary cursor-pointer"
                        />
                        <span className="truncate">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Vector PDF Document Preview */}
        <ReportViewer
          pdfBlobUrl={pdfBlobUrl}
          state={state}
          error={error}
          onRetry={regenerate}
        />
      </div>
    </div>
  );
}
