import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import html2pdf from "html2pdf.js";
import lcOfficialLogo from "../assets/lc-official-logo.jpg";
import guidanceLogo from "../assets/guidance-logo.png";
import AcademicMonthRangePicker from "../components/AcademicMonthRangePicker";
import { useAcademicYearFilter } from "../context/AcademicYearFilterContext";

import { CaseRecord } from "../types";

interface StudentInfo {
  firstName: string;
  lastName: string;
  middleInitial: string;
  level: string;
  section: string;
  adviser: string;
  role?: string;
}

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

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatReportDateRange = (startStr: string, endStr: string, casesList: CaseRecord[]) => {
  let oldestStr = "";
  let latestStr = "";
  
  if (casesList && casesList.length > 0) {
    let oldest: Date | null = null;
    let latest: Date | null = null;
    for (const c of casesList) {
      const d = new Date(c.date_filed || c.date);
      if (!isNaN(d.getTime())) {
        if (!oldest || d.getTime() < oldest.getTime()) oldest = d;
        if (!latest || d.getTime() > latest.getTime()) latest = d;
      }
    }
    if (oldest) oldestStr = oldest.toISOString().split('T')[0];
    if (latest) latestStr = latest.toISOString().split('T')[0];
  }

  const start = startStr || oldestStr;
  const end = endStr || latestStr;

  if (!start && !end) return "No Cases";
  if (start && !end) return `From ${formatDate(start)}`;
  if (!start && end) return `Until ${formatDate(end)}`;
  
  const startDateObj = new Date(start);
  const endDateObj = new Date(end);
  
  if (startDateObj.getTime() === endDateObj.getTime()) {
    return formatDate(start);
  }
  
  // Check if it's a full calendar year
  if (startDateObj.getMonth() === 0 && startDateObj.getDate() === 1 && endDateObj.getMonth() === 11 && endDateObj.getDate() === 31 && startDateObj.getFullYear() === endDateObj.getFullYear()) {
    return `${startDateObj.getFullYear()}`;
  }

  // Check if it's a full calendar month
  if (startDateObj.getDate() === 1 && startDateObj.getFullYear() === endDateObj.getFullYear() && startDateObj.getMonth() === endDateObj.getMonth()) {
    const lastDay = new Date(endDateObj.getFullYear(), endDateObj.getMonth() + 1, 0).getDate();
    if (endDateObj.getDate() === lastDay) {
      return startDateObj.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
  }

  return `${formatDate(start)} – ${formatDate(end)}`;
};

const getBadgeInlineStyle = (progress: string): React.CSSProperties => {
  const normalizedProgress = progress.toLowerCase();
  if (normalizedProgress === "closed") {
    return { color: "#4b5563" }; // Grayish
  }
  if (normalizedProgress === "resolved") {
    return { color: "#15803d" }; // Green
  }
  if (normalizedProgress === "pending") {
    return { color: "#a16207" }; // Yellow/Gold
  }
  return { color: "#b45309" }; // Amber/Orange
};

const getCaseDate = (caseRecord: CaseRecord) => {
  const parsed = new Date(caseRecord.date_filed || caseRecord.date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};



const getCaseGradeLevel = (caseRecord: CaseRecord) => {
  const students = parseStudents(caseRecord.students);
  return students[0]?.level || caseRecord.level || "Unspecified";
};

export interface SignatureItem {
  show: boolean;
  label: string;
  title: string;
}

export interface SignatureConfig {
  sig1: SignatureItem;
  sig2: SignatureItem;
}

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
  const activeColsCount = 1 + Object.values(visibleColumns).filter(Boolean).length;
  const [isExporting, setIsExporting] = useState(false);
  const [paginatedPages, setPaginatedPages] = useState<{ rows: CaseRecord[], isFirstPage: boolean, hasClosing: boolean }[]>([]);
  
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement | null>(null);

  const [isGradeDropdownOpen, setIsGradeDropdownOpen] = useState(false);
  const gradeDropdownRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (gradeDropdownRef.current && !gradeDropdownRef.current.contains(event.target as Node)) {
        setIsGradeDropdownOpen(false);
      }
    };

    if (isGradeDropdownOpen) {
      document.addEventListener("click", handleClickOutside);
    }

    return () => document.removeEventListener("click", handleClickOutside);
  }, [isGradeDropdownOpen]);

  const reportRef = useRef<HTMLDivElement>(null);

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
    if (isYearsLoading || selectedSchoolYear === null) return;
    
    const loadCases = async () => {
      try {
        const queryYear = (selectedSchoolYear === 'all' || (startDate && endDate)) ? null : selectedSchoolYear;
        const loadedCases = await invoke<CaseRecord[]>("get_cases", { 
          schoolYear: queryYear 
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



  const filteredCases = useMemo(() => {
    return cases.filter(c => {
      // 1. Filter by scope
      if (scope === "specific") {
        const grade = getCaseGradeLevel(c);
        if (grade !== selectedGrade) return false;
      }

      // 3. Filter by status
      if (selectedStatus !== "all") {
        const p = (c.progress || "").toLowerCase();
        const statusLower = selectedStatus.toLowerCase();
        
        if (statusLower === "resolved") {
          if (p !== "resolved") return false;
        } else if (statusLower === "closed") {
          if (p !== "closed") return false;
        } else if (statusLower === "reprimand") {
          if (!p.includes("reprimand")) return false;
        } else if (statusLower === "pending") {
          const isPending = p !== "resolved" && p !== "closed" && !p.includes("reprimand");
          if (!isPending) return false;
        }
      }

      return true;
    });
  }, [cases, scope, selectedGrade, selectedStatus]);

  const activeCases = useMemo(() => {
    return filteredCases.filter(c => {
      const d = getCaseDate(c);
      if (!d) return false;

      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (d < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }
      return true;
    });
  }, [filteredCases, startDate, endDate]);

  const stats = useMemo(() => {
    const total = activeCases.length;
    const resolved = activeCases.filter(c => (c.progress || "").toLowerCase() === "resolved").length;
    const closed = activeCases.filter(c => (c.progress || "").toLowerCase() === "closed").length;
    const reprimand = activeCases.filter(c => (c.progress || "").toLowerCase().includes("reprimand")).length;
    const pending = total - resolved - closed - reprimand;

    return { total, pending, resolved, reprimand, closed };
  }, [activeCases]);

  const handleExportPDF = async () => {
    if (!reportRef.current || isExporting) return;
    setIsExporting(true);
    const element = reportRef.current;
    const filenameLabel = formatReportDateRange(startDate, endDate, cases);
    
    const filename = `Guidance_Report_${filenameLabel.replace(/[\s\.,-]/g, '_')}.pdf`;
    const opt = {
      margin:       0,
      filename,
      image:        { type: 'jpeg' as const, quality: 0.98 },
      html2canvas:  { 
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#FFFFFF",
        onclone: (clonedDocument: Document) => {
          clonedDocument.documentElement.classList.remove("dark");
        },
      },
      jsPDF:        { unit: 'mm', format: [297, 210] as [number, number], orientation: 'landscape' as const }
    };
    
    try {
      // Delay slightly to let React render/disable the buttons before generating PDF
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      const pdfBase64 = await html2pdf().from(element).set(opt).outputPdf("datauristring");
      const base64Data = pdfBase64.split(",")[1];
      await invoke("save_pdf", { base64Data, filename });
    } catch (err) {
      alert("Failed to export PDF: " + err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearFilters = () => {
    setScope("all");
    setSelectedGrade("Grade 7");
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

  const handlePrint = () => {
    window.print();
  };



  const renderFirstHeader = () => (
    <>
      <div className="grid grid-cols-[84px_1fr_84px] items-center gap-4 mb-4 font-sans">
        <img src={lcOfficialLogo} alt="Laguna College Logo" className="w-[72px] h-[72px] object-contain justify-self-start rounded-full" />
        <div className="text-center text-black dark:text-on-surface" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
          <h2 className="m-0 text-[15px] leading-[18px] font-black uppercase tracking-[0.02em] text-black dark:text-on-surface">LAGUNA COLLEGE</h2>
          <p className="m-0 mt-0.5 text-[11px] leading-[13px] font-bold text-black dark:text-on-surface">San Pablo City</p>
          <p className="m-0 mt-0.5 text-[18px] leading-[21px] font-black text-black dark:text-on-surface">Guidance Office</p>
        </div>
        <img src={guidanceLogo} alt="Guidance Office Logo" className="w-[72px] h-[72px] object-contain justify-self-end rounded-full" />
      </div>
      
      <div className="h-0.5 w-full bg-primary mb-5"></div>

      <div className="text-center mb-6">
        <h1 className="text-base font-bold uppercase tracking-wider mb-0.5 font-sans">
          Guidance Office Cases Report
        </h1>
        <p className="text-xs text-gray-500 font-sans">Official Case Report</p>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 mb-6 text-xs w-3/4 mx-auto font-sans text-left">
        <div className="flex">
          <span className="w-32 text-gray-500">Reporting period</span>
          <span className="font-medium">{formatReportDateRange(startDate, endDate, cases)}</span>
        </div>
        <div className="flex">
          <span className="w-32 text-gray-500">Scope</span>
          <span className="font-medium">{scope === 'all' ? 'All year levels' : selectedGrade}</span>
        </div>

        <div className="flex">
          <span className="w-32 text-gray-500">Status filter</span>
          <span className="font-medium">{selectedStatus === 'all' ? 'All statuses' : selectedStatus}</span>
        </div>
        <div className="flex">
          <span className="w-32 text-gray-500">Date generated</span>
          <span className="font-medium">
            {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      </div>

      {includes.summary && selectedStatus === "all" && (
        <div className="mb-6 font-sans">
          <h3 className="text-[10px] font-bold text-primary uppercase tracking-wider mb-2 border-b pb-1">Summary</h3>
          <div className="grid grid-cols-5 gap-4">
            <div className="border border-border-subtle rounded-lg py-2 px-3 flex justify-between">
              <span className="text-[9px] leading-5 text-secondary font-bold uppercase tracking-wider">Total Cases</span>
              <span className="text-base leading-5 font-bold text-on-surface">{stats.total}</span>
            </div>
            <div className="border border-border-subtle rounded-lg py-2 px-3 flex justify-between">
              <span className="text-[9px] leading-5 text-secondary font-bold uppercase tracking-wider">Pending Cases</span>
              <span className="text-base leading-5 font-bold text-on-surface">{stats.pending}</span>
            </div>
            <div className="border border-border-subtle rounded-lg py-2 px-3 flex justify-between">
              <span className="text-[9px] leading-5 text-secondary font-bold uppercase tracking-wider">Resolved Cases</span>
              <span className="text-base leading-5 font-bold text-on-surface">{stats.resolved}</span>
            </div>
            <div className="border border-border-subtle rounded-lg py-2 px-3 flex justify-between">
              <span className="text-[9px] leading-5 text-secondary font-bold uppercase tracking-wider">Reprimand Cases</span>
              <span className="text-base leading-5 font-bold text-on-surface">{stats.reprimand}</span>
            </div>
            <div className="border border-border-subtle rounded-lg py-2 px-3 flex justify-between">
              <span className="text-[9px] leading-5 text-secondary font-bold uppercase tracking-wider">Closed Cases</span>
              <span className="text-base leading-5 font-bold text-on-surface">{stats.closed}</span>
            </div>
          </div>
        </div>
      )}
      <div className="flex justify-between items-baseline mb-2 border-b pb-1 font-sans">
        <h3 className="text-[12px] font-bold text-primary uppercase tracking-wider">Case List</h3>
        {selectedStatus !== "all" && (
          <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">
            Total: {stats.total} {selectedStatus} {stats.total === 1 ? "Case" : "Cases"}
          </span>
        )}
      </div>
    </>
  );

  const renderSmallHeader = () => (
    <div className="flex justify-between items-end border-b pb-3 mb-6 font-sans">
      <div>
        <h2 className="m-0 text-[13px] font-black uppercase tracking-wider text-black">Laguna College Guidance Office</h2>
        <p className="m-0 mt-0.5 text-[10px] font-bold text-gray-600">
          Disciplinary Case Report
        </p>
      </div>
      <div className="text-right">
        <p className="m-0 text-[10px] text-gray-500">
          {formatReportDateRange(startDate, endDate, cases)}
        </p>
        <p className="m-0 mt-0.5 text-[9px] text-gray-400 uppercase font-bold tracking-widest">
          Case List (Continued)
        </p>
      </div>
    </div>
  );

  const renderTableHeader = () => (
    <thead>
      <tr className="border-b border-gray-200 text-gray-600 font-bold uppercase text-[11px] tracking-wider font-sans">
        <th className="py-2 pr-2 w-8">#</th>
        {visibleColumns.date && <th className="py-2 pr-2">Date</th>}
        {visibleColumns.student && <th className="py-2 pr-2">Student</th>}
        {visibleColumns.class && <th className="py-2 pr-2">Grade</th>}
        {visibleColumns.adviser && <th className="py-2 pr-2">Adviser</th>}
        {visibleColumns.type && <th className="py-2 pr-2">Type</th>}
        {visibleColumns.description && <th className="py-2 pr-2 max-w-[140px]">Description</th>}
        {visibleColumns.sanction && <th className="py-2 pr-2 max-w-[120px]">Sanction</th>}
        {visibleColumns.status && <th className="py-2 text-right pr-2">Status</th>}
      </tr>
    </thead>
  );

  const renderPageFooter = (currentPage: number, totalPages: number) => (
    <div className="absolute bottom-8 left-12 right-12 flex justify-between items-end text-[10px] text-gray-400 font-sans border-t pt-4 bg-white">
      <div className="flex flex-col">
        <span className="font-bold">Generated by LCGO Information System</span>
        <span>Confidential Student Record</span>
      </div>
      <div className="font-bold">Page {currentPage} of {totalPages}</div>
    </div>
  );

  const renderClosingBlock = () => {
    const showSig1 = includes.signature && signatureConfig.sig1.show;
    const showSig2 = includes.signature && signatureConfig.sig2.show;
    const activeCount = (showSig1 ? 1 : 0) + (showSig2 ? 1 : 0);

    return (
      <div className="mt-6 font-sans">
        <div className="border-t border-gray-300 pt-3 mb-4 text-center text-[10px] font-bold text-gray-500 uppercase tracking-widest">
          End of Report
        </div>
        
        {includes.signature && activeCount > 0 && (
          <div className={`flex ${activeCount === 2 ? 'justify-between w-3/4' : 'justify-center w-full'} mx-auto mt-10`}>
            {showSig1 && (
              <div className="flex flex-col items-center w-56 text-center">
                <div className="border-b border-gray-800 w-full mb-2"></div>
                <div className="font-bold text-sm">{signatureConfig.sig1.title || "Guidance Counselor"}</div>
                <div className="text-xs text-gray-500 mt-1">{signatureConfig.sig1.label || "Prepared by:"}</div>
              </div>
            )}
            {showSig2 && (
              <div className="flex flex-col items-center w-56 text-center">
                <div className="border-b border-gray-800 w-full mb-2"></div>
                <div className="font-bold text-sm">{signatureConfig.sig2.title || "School Principal"}</div>
                <div className="text-xs text-gray-500 mt-1">{signatureConfig.sig2.label || "Noted by:"}</div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderTableRow = (c: CaseRecord, index: number, isHiddenRef?: boolean) => {
    const students = parseStudents(c.students);
    let studentName = "";
    let studentGrade = "";
    let studentAdviser = c.adviser || "—";
    
    if (students.length > 0) {
      const s = students[0];
      studentName = `${s.lastName}, ${s.firstName}${s.middleInitial ? ` ${s.middleInitial}.` : ""}`;
      studentGrade = s.level ? (s.level.startsWith('Grade') ? s.level : `Grade ${s.level}`) : "—";
      studentAdviser = s.adviser || c.adviser || "—";
    } else {
      studentName = `${c.last_name}, ${c.first_name}${c.middle_initial ? ` ${c.middle_initial}.` : ""}`;
      studentGrade = c.level ? (c.level.startsWith('Grade') ? c.level : `Grade ${c.level}`) : "—";
      studentAdviser = c.adviser || "—";
    }
    
    return (
      <tr 
        key={isHiddenRef ? c.id : index}
        {...(isHiddenRef ? { 'data-row': true, 'data-index': index } : {})} 
        className="border-b border-gray-100 last:border-0 text-[12px] even:bg-[#FAFAFA]" 
        style={{ pageBreakInside: 'avoid' }}
      >
        <td className="py-3 pr-2 pl-2 text-gray-500 font-sans font-bold">{index + 1}</td>
        {visibleColumns.date && <td className="py-3 pr-2 text-gray-600 font-sans whitespace-nowrap">{formatDate(c.date_filed || c.date)}</td>}
        {visibleColumns.student && <td className="py-3 pr-2 font-medium text-gray-900 font-sans">{studentName}</td>}
        {visibleColumns.class && <td className="py-3 pr-2 text-gray-600 font-sans whitespace-nowrap">{studentGrade}</td>}
        {visibleColumns.adviser && <td className="py-3 pr-2 text-gray-600 font-sans">{studentAdviser}</td>}
        {visibleColumns.type && <td className="py-3 pr-2 text-gray-600 font-sans">{c.case}</td>}
        {visibleColumns.description && <td className="py-3 pr-2 text-gray-600 font-sans max-w-[140px] break-words">{c.description || "—"}</td>}
        {visibleColumns.sanction && <td className="py-3 pr-2 text-gray-600 font-sans max-w-[120px] break-words">{c.sanction || "—"}</td>}
        {visibleColumns.status && (
          <td style={{ padding: "12px 8px 12px 0", textAlign: "right", verticalAlign: "middle", fontFamily: "sans-serif" }}>
            <span
              style={{
                ...getBadgeInlineStyle(c.progress),
                display: "inline-block",
                fontSize: "11px",
                fontWeight: 700,
                textTransform: "uppercase" as const,
                letterSpacing: "0.05em",
                whiteSpace: "nowrap",
                lineHeight: "1",
                verticalAlign: "middle",
              }}
            >
              {c.progress}
            </span>
          </td>
        )}
      </tr>
    );
  };

  const renderHiddenMeasurementPass = () => (
    <div data-measurement-root="true" style={{ position: "absolute", visibility: "hidden", top: "-9999px", left: "0", pointerEvents: "none" }} aria-hidden="true">
      <div data-page-frame className="bg-white shadow-md print:shadow-none w-[297mm] h-[210mm] px-12 py-8 text-gray-800 font-serif relative overflow-hidden box-border"></div>
      
      <div className="w-[297mm] px-12 py-8 box-border font-serif">
        <div data-first-header className="flex flex-col">
          {renderFirstHeader()}
        </div>
        
        <div data-cont-header className="flex flex-col">
          {renderSmallHeader()}
        </div>
        
        <div data-footer className="relative">
          <div className="flex justify-between items-end text-[10px] text-gray-400 font-sans border-t pt-4 bg-white">
            <div className="flex flex-col">
              <span className="font-bold">Generated by LCGO Information System</span>
              <span>Confidential Student Record</span>
            </div>
            <div className="font-bold">Page X of Y</div>
          </div>
        </div>
        
        <div data-closing className="flex flex-col">
          {renderClosingBlock()}
        </div>
        
        <table className="w-full text-left border-collapse min-w-full">
          {renderTableHeader()}
          <tbody>
            {activeCases.map((c, i) => renderTableRow(c, i, true))}
          </tbody>
        </table>
      </div>
    </div>
  );



  useLayoutEffect(() => {
    const frameEl = document.querySelector('[data-measurement-root] [data-page-frame]');
    if (!frameEl) return;
    
    const PAGE_HEIGHT_PX = frameEl.getBoundingClientRect().height || 793.7;
    
    const firstHeaderH = document.querySelector('[data-measurement-root] [data-first-header]')?.getBoundingClientRect().height || 0;
    const contHeaderH = document.querySelector('[data-measurement-root] [data-cont-header]')?.getBoundingClientRect().height || 0;
    const tableHeaderH = document.querySelector('[data-measurement-root] thead')?.getBoundingClientRect().height || 0;
    const footerH = document.querySelector('[data-measurement-root] [data-footer]')?.getBoundingClientRect().height || 0;
    const closingH = document.querySelector('[data-measurement-root] [data-closing]')?.getBoundingClientRect().height || 0;

    const rowEls = document.querySelectorAll('[data-measurement-root] [data-row]');
    const rowHeights = Array.from(rowEls).map(el => el.getBoundingClientRect().height);
    
    const SAFETY_MARGIN = 20;
    const topPadding = 32;
    const bottomAbsoluteOffset = 32;
    const footerBudget = bottomAbsoluteOffset + footerH;
    
    const contentBudget = PAGE_HEIGHT_PX - topPadding - footerBudget - SAFETY_MARGIN;

    if (activeCases.length === 0) {
      const hasClosing = (firstHeaderH + tableHeaderH + closingH) <= contentBudget;
      const newPages = [{ rows: [] as CaseRecord[], isFirstPage: true, hasClosing }];
      if (!hasClosing) {
        newPages.push({ rows: [] as CaseRecord[], isFirstPage: false, hasClosing: true });
      }
      setPaginatedPages(newPages);
      return;
    }

    const page1Budget = contentBudget - firstHeaderH - tableHeaderH;
    const contBudgetNoClosing = contentBudget - contHeaderH - tableHeaderH;
    const contBudgetWithClosing = contBudgetNoClosing - closingH;

    const getRowHeight = (index: number) => rowHeights[index] || 40;

    // Check if everything fits on a single page
    let totalAllHeight = 0;
    for (let i = 0; i < activeCases.length; i++) {
      totalAllHeight += getRowHeight(i);
    }

    if (totalAllHeight + closingH <= page1Budget) {
      setPaginatedPages([{ rows: activeCases, isFirstPage: true, hasClosing: true }]);
      return;
    }

    // Step 1: Allocate cases to Page 1 up to page1Budget
    const page1Rows: CaseRecord[] = [];
    let page1Height = 0;

    for (let i = 0; i < activeCases.length; i++) {
      const h = getRowHeight(i);
      if (page1Height + h <= page1Budget) {
        page1Rows.push(activeCases[i]);
        page1Height += h;
      } else {
        break;
      }
    }

    if (page1Rows.length === 0 && activeCases.length > 0) {
      page1Rows.push(activeCases[0]);
    }

    const remainingCases = activeCases.slice(page1Rows.length);

    if (remainingCases.length === 0) {
      const shiftCount = Math.min(Math.floor(page1Rows.length / 2), 3);
      if (shiftCount > 0) {
        setPaginatedPages([
          { rows: page1Rows.slice(0, page1Rows.length - shiftCount), isFirstPage: true, hasClosing: false },
          { rows: page1Rows.slice(page1Rows.length - shiftCount), isFirstPage: false, hasClosing: true },
        ]);
      } else {
        setPaginatedPages([
          { rows: page1Rows, isFirstPage: true, hasClosing: false },
          { rows: [], isFirstPage: false, hasClosing: true },
        ]);
      }
      return;
    }

    // Step 2: Check if all remaining cases fit on Page 2 WITH closing block
    let totalRemainingHeight = 0;
    for (let i = 0; i < remainingCases.length; i++) {
      totalRemainingHeight += getRowHeight(page1Rows.length + i);
    }

    if (totalRemainingHeight <= contBudgetWithClosing) {
      setPaginatedPages([
        { rows: page1Rows, isFirstPage: true, hasClosing: false },
        { rows: remainingCases, isFirstPage: false, hasClosing: true },
      ]);
      return;
    }

    // Step 3: Balanced distribution across K continuation pages
    const avgRowHeight = totalRemainingHeight / remainingCases.length || 40;
    const maxRowsPerCont = Math.max(1, Math.floor(contBudgetNoClosing / avgRowHeight));
    const maxRowsLast = Math.max(1, Math.floor(contBudgetWithClosing / avgRowHeight));

    let contPageCount = 1;
    while (true) {
      contPageCount++;
      const totalCapacity = (contPageCount - 1) * maxRowsPerCont + maxRowsLast;
      if (totalCapacity >= remainingCases.length || contPageCount > 50) {
        break;
      }
    }

    const contBuckets: CaseRecord[][] = [];
    let currentIndex = 0;

    for (let p = 0; p < contPageCount; p++) {
      const isLastContPage = p === contPageCount - 1;
      const currentMaxBudget = isLastContPage ? contBudgetWithClosing : contBudgetNoClosing;

      const pageBucket: CaseRecord[] = [];
      let bucketHeight = 0;

      const itemsLeft = remainingCases.length - currentIndex;
      const pagesLeft = contPageCount - p;
      const targetForThisPage = Math.ceil(itemsLeft / pagesLeft);

      while (currentIndex < remainingCases.length) {
        const nextCase = remainingCases[currentIndex];
        const nextH = getRowHeight(page1Rows.length + currentIndex);

        if (bucketHeight + nextH <= currentMaxBudget) {
          pageBucket.push(nextCase);
          bucketHeight += nextH;
          currentIndex++;
          if (pageBucket.length >= targetForThisPage && !isLastContPage) {
            break;
          }
        } else {
          if (pageBucket.length === 0) {
            pageBucket.push(nextCase);
            currentIndex++;
          }
          break;
        }
      }

      contBuckets.push(pageBucket);
    }

    while (currentIndex < remainingCases.length) {
      const lastBucket = contBuckets[contBuckets.length - 1];
      lastBucket.push(remainingCases[currentIndex]);
      currentIndex++;
    }

    const newPages: { rows: CaseRecord[]; isFirstPage: boolean; hasClosing: boolean }[] = [
      { rows: page1Rows, isFirstPage: true, hasClosing: false },
    ];

    contBuckets.forEach((bucket, idx) => {
      newPages.push({
        rows: bucket,
        isFirstPage: false,
        hasClosing: idx === contBuckets.length - 1,
      });
    });

    setPaginatedPages(newPages);
  }, [activeCases, includes, startDate, endDate, scope, selectedGrade, selectedStatus, visibleColumns]);

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-10 h-full">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:justify-between lg:items-end print:hidden">
        <div>
          <h1 className="page-header-h1 m-0">Reports</h1>
          <p className="text-sm text-secondary mt-1">
            Generate, customize, and export guidance office reports.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <button 
            onClick={handleExportPDF}
            disabled={isExporting}
            className="btn-secondary"
          >
            <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
            <span>{isExporting ? "Exporting..." : "Export PDF"}</span>
          </button>
          <button 
            onClick={handlePrint}
            className="btn-primary"
          >
            <span className="material-symbols-outlined text-sm">print</span>
            <span>Print</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6">

        {/* Report settings on top */}
        <div className="w-full bg-surface border border-outline-variant rounded-xl p-6 shadow-sm print:hidden">
          <div className="flex justify-between items-center mb-4">
            <h2 className="section-header-h2 mb-0">Report settings</h2>
            <button
              onClick={handleClearFilters}
              className="btn-secondary py-1.5 px-4 text-xs"
            >
              <span className="material-symbols-outlined text-[16px]">filter_alt_off</span>
              <span>Clear Filters</span>
            </button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
            {/* Scope */}
            <div>
              <label className="text-xs font-bold text-gray-400 dark:text-secondary uppercase tracking-wider mb-3 block">Scope</label>
              <div className="space-y-2">
                <label className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${scope === 'all' ? 'bg-primary/5' : 'hover:bg-gray-50 dark:hover:bg-surface-container-high'}`}>
                  <input 
                    type="radio" 
                    name="scope" 
                    value="all" 
                    checked={scope === "all"}
                    onChange={() => setScope("all")}
                    className="w-4 h-4 text-primary focus:ring-primary accent-primary" 
                  />
                  <span className={`text-sm ${scope === 'all' ? 'font-medium text-primary' : 'text-gray-600 dark:text-on-surface-variant'}`}>All year levels</span>
                </label>
                <label className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${scope === 'specific' ? 'bg-primary/5' : 'hover:bg-gray-50 dark:hover:bg-surface-container-high'}`}>
                  <input 
                    type="radio" 
                    name="scope" 
                    value="specific" 
                    checked={scope === "specific"}
                    onChange={() => setScope("specific")}
                    className="w-4 h-4 text-primary focus:ring-primary accent-primary" 
                  />
                  <span className={`text-sm ${scope === 'specific' ? 'font-medium text-primary' : 'text-gray-600'}`}>Specific year level</span>
                </label>

                {scope === "specific" && (
                  <div className="pl-9 pr-2 mt-2 pb-1 animate-in fade-in slide-in-from-top-1" ref={gradeDropdownRef}>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsGradeDropdownOpen((open) => !open)}
                        className={`group flex h-[38px] w-full max-w-[220px] items-center gap-2 rounded-lg border bg-surface dark:bg-surface-container px-3 text-left text-sm transition-all duration-300 ease-out ${isGradeDropdownOpen
                            ? "border-primary bg-surface-container ring-2 ring-primary/20 shadow-sm"
                            : "border-outline-variant hover:border-primary/60 hover:bg-surface-container"
                          }`}
                      >
                        <span className="material-symbols-outlined text-secondary dark:text-on-surface-variant transition-colors duration-300 group-hover:text-primary" style={{ fontSize: 18 }}>school</span>
                        <span className="min-w-0 flex-1 truncate font-medium text-gray-700 dark:text-on-surface">
                          {selectedGrade}
                        </span>
                        <span
                          className={`material-symbols-outlined text-secondary dark:text-on-surface-variant transition-transform duration-300 ${isGradeDropdownOpen ? "rotate-180" : "rotate-0"
                            }`}
                          style={{ fontSize: 18 }}
                        >
                          expand_more
                        </span>
                      </button>

                      {isGradeDropdownOpen && (
                        <div className="absolute left-0 top-full z-30 mt-2 w-full max-w-[220px] overflow-hidden rounded-xl border border-outline-variant bg-surface p-1.5 shadow-lg filter-dropdown-enter">
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
                                className={`group/grade flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-all duration-300 ${isSelected
                                    ? "bg-[#EEEDFE] text-[#3C3489]"
                                    : "text-on-surface hover:bg-surface-container"
                                  }`}
                              >
                                <span className="flex-1 font-medium">{grade}</span>
                                {isSelected && (
                                  <span className="material-symbols-outlined text-[#7B6FE8]" style={{ fontSize: 16 }}>check</span>
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
            </div>

            {/* Status & Period */}
            <div className="flex flex-col gap-4">
              <div ref={statusDropdownRef} className="relative">
                <label className="text-xs font-bold text-gray-400 dark:text-secondary uppercase tracking-wider mb-2 block">Status</label>
                <button
                  type="button"
                  onClick={() => setIsStatusDropdownOpen((open) => !open)}
                  className={`group flex h-[38px] w-full max-w-[220px] items-center gap-2 rounded-lg border bg-surface dark:bg-surface-container px-3 text-left text-sm transition-all duration-300 ease-out ${isStatusDropdownOpen
                      ? "border-primary bg-surface-container ring-2 ring-primary/20 shadow-sm"
                      : "border-outline-variant hover:border-primary/60 hover:bg-surface-container"
                    }`}
                >
                  <span className="material-symbols-outlined text-secondary dark:text-on-surface-variant transition-colors duration-300 group-hover:text-primary" style={{ fontSize: 16 }}>filter_list</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-gray-700 dark:text-on-surface">
                    {selectedStatus === "all" ? "All statuses" : selectedStatus}
                  </span>
                  <span
                    className={`material-symbols-outlined text-secondary dark:text-on-surface-variant transition-transform duration-300 ${isStatusDropdownOpen ? "rotate-180" : "rotate-0"
                      }`}
                    style={{ fontSize: 18 }}
                  >
                    expand_more
                  </span>
                </button>

                {isStatusDropdownOpen && (
                  <div className="absolute left-0 top-full z-30 mt-2 w-full max-w-[220px] overflow-hidden rounded-xl border border-outline-variant bg-surface p-1.5 shadow-lg filter-dropdown-enter">
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
                          <span className="flex-1 font-medium">{status === "all" ? "All statuses" : status}</span>
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
                <label className="text-xs font-bold text-gray-400 dark:text-secondary uppercase tracking-wider mb-2 block">Period</label>
                <AcademicMonthRangePicker
                  allYears={allYears}
                  schoolYear={selectedSchoolYear}
                  onSelectSchoolYear={setSelectedSchoolYear}
                  isLoadingYears={isYearsLoading}
                  startDate={startDate}
                  endDate={endDate}
                  className="w-full min-w-[280px] max-w-[320px]"
                  placeholder="All Records"
                  onRangeChange={(start, end) => setDateRange(start, end)}
                />
              </div>
            </div>

            {/* Include */}
            <div>
              <label className="text-xs font-bold text-gray-400 dark:text-secondary uppercase tracking-wider mb-3 block">Include</label>
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer group select-none">
                  <div className="relative flex items-center">
                    <input 
                      type="checkbox" 
                      checked={includes.summary}
                      onChange={(e) => setIncludes({ ...includes, summary: e.target.checked })}
                      className="peer custom-checkbox-box appearance-none w-4 h-4 border border-outline-variant rounded bg-surface checked:bg-primary checked:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer" 
                    />
                    <span className="material-symbols-outlined custom-checkbox-icon absolute text-white pointer-events-none left-1/2 top-1/2" style={{ fontSize: '12px', fontWeight: 'bold' }}>check</span>
                  </div>
                  <span className="text-sm text-gray-700 dark:text-on-surface group-hover:text-gray-900 dark:group-hover:text-white transition-colors">Summary statistics</span>
                </label>

                <div>
                  <label className="flex items-center gap-3 cursor-pointer group select-none">
                    <div className="relative flex items-center">
                      <input 
                        type="checkbox" 
                        checked={includes.signature}
                        onChange={(e) => setIncludes({ ...includes, signature: e.target.checked })}
                        className="peer custom-checkbox-box appearance-none w-4 h-4 border border-outline-variant rounded bg-surface checked:bg-primary checked:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer" 
                      />
                      <span className="material-symbols-outlined custom-checkbox-icon absolute text-white pointer-events-none left-1/2 top-1/2" style={{ fontSize: '12px', fontWeight: 'bold' }}>check</span>
                    </div>
                    <span className="text-sm text-gray-700 dark:text-on-surface group-hover:text-gray-900 dark:group-hover:text-white transition-colors">Signature block</span>
                  </label>

                  <div className={`expandable-panel ${includes.signature ? "is-expanded" : ""}`}>
                    <div className="expandable-content mt-3 pl-3 sm:pl-4 space-y-3 border-l-2 border-primary/20">
                      {/* Signature 1 */}
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <div className="relative flex items-center">
                            <input
                              type="checkbox"
                              checked={signatureConfig.sig1.show}
                              onChange={(e) => setSignatureConfig({
                                ...signatureConfig,
                                sig1: { ...signatureConfig.sig1, show: e.target.checked }
                              })}
                              className="peer custom-checkbox-box appearance-none w-3.5 h-3.5 border border-outline-variant rounded bg-surface checked:bg-primary checked:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                            />
                            <span className="material-symbols-outlined custom-checkbox-icon absolute text-white pointer-events-none left-1/2 top-1/2" style={{ fontSize: '10px', fontWeight: 'bold' }}>check</span>
                          </div>
                          <span className="text-xs font-semibold text-gray-700 dark:text-on-surface">Signature 1</span>
                        </label>
                        
                        <div className={`expandable-panel ${signatureConfig.sig1.show ? "is-expanded" : ""}`}>
                          <div className="expandable-content pl-5 pt-1 space-y-1.5">
                            <div>
                              <span className="text-[10px] text-gray-500 dark:text-secondary font-medium block">Label</span>
                              <input
                                type="text"
                                value={signatureConfig.sig1.label}
                                onChange={(e) => setSignatureConfig({
                                  ...signatureConfig,
                                  sig1: { ...signatureConfig.sig1, label: e.target.value }
                                })}
                                placeholder="Prepared by:"
                                className="w-full text-xs px-2 py-1 border border-outline-variant rounded bg-surface text-on-surface focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                              />
                            </div>
                            <div>
                              <span className="text-[10px] text-gray-500 dark:text-secondary font-medium block">Name / Title</span>
                              <input
                                type="text"
                                value={signatureConfig.sig1.title}
                                onChange={(e) => setSignatureConfig({
                                  ...signatureConfig,
                                  sig1: { ...signatureConfig.sig1, title: e.target.value }
                                })}
                                placeholder="Guidance Counselor"
                                className="w-full text-xs px-2 py-1 border border-outline-variant rounded bg-surface text-on-surface focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Signature 2 */}
                      <div className="space-y-1.5 pt-2 border-t border-outline-variant/30">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <div className="relative flex items-center">
                            <input
                              type="checkbox"
                              checked={signatureConfig.sig2.show}
                              onChange={(e) => setSignatureConfig({
                                ...signatureConfig,
                                sig2: { ...signatureConfig.sig2, show: e.target.checked }
                              })}
                              className="peer custom-checkbox-box appearance-none w-3.5 h-3.5 border border-outline-variant rounded bg-surface checked:bg-primary checked:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                            />
                            <span className="material-symbols-outlined custom-checkbox-icon absolute text-white pointer-events-none left-1/2 top-1/2" style={{ fontSize: '10px', fontWeight: 'bold' }}>check</span>
                          </div>
                          <span className="text-xs font-semibold text-gray-700 dark:text-on-surface">Signature 2</span>
                        </label>
                        
                        <div className={`expandable-panel ${signatureConfig.sig2.show ? "is-expanded" : ""}`}>
                          <div className="expandable-content pl-5 pt-1 space-y-1.5">
                            <div>
                              <span className="text-[10px] text-gray-500 dark:text-secondary font-medium block">Label</span>
                              <input
                                type="text"
                                value={signatureConfig.sig2.label}
                                onChange={(e) => setSignatureConfig({
                                  ...signatureConfig,
                                  sig2: { ...signatureConfig.sig2, label: e.target.value }
                                })}
                                placeholder="Noted by:"
                                className="w-full text-xs px-2 py-1 border border-outline-variant rounded bg-surface text-on-surface focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                              />
                            </div>
                            <div>
                              <span className="text-[10px] text-gray-500 dark:text-secondary font-medium block">Name / Title</span>
                              <input
                                type="text"
                                value={signatureConfig.sig2.title}
                                onChange={(e) => setSignatureConfig({
                                  ...signatureConfig,
                                  sig2: { ...signatureConfig.sig2, title: e.target.value }
                                })}
                                placeholder="School Principal"
                                className="w-full text-xs px-2 py-1 border border-outline-variant rounded bg-surface text-on-surface focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Columns Checklist */}
            <div>
              <label className="text-xs font-bold text-gray-400 dark:text-secondary uppercase tracking-wider mb-3 block">Columns</label>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 max-h-[160px] overflow-y-auto pr-1">
                {[
                  { id: 'date', label: 'Date' },
                  { id: 'student', label: 'Student' },
                  { id: 'class', label: 'Grade' },
                  { id: 'adviser', label: 'Adviser' },
                  { id: 'type', label: 'Type' },
                  { id: 'description', label: 'Description' },
                  { id: 'sanction', label: 'Sanction' },
                  { id: 'status', label: 'Status' },
                ].map((col) => (
                  <label key={col.id} className="flex items-center gap-3 cursor-pointer group select-none">
                    <div className="relative flex items-center">
                      <input 
                        type="checkbox" 
                        checked={visibleColumns[col.id as keyof typeof visibleColumns]}
                        onChange={(e) => setVisibleColumns({
                          ...visibleColumns,
                          [col.id]: e.target.checked
                        })}
                        className="peer custom-checkbox-box appearance-none w-4 h-4 border border-outline-variant rounded bg-surface checked:bg-primary checked:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer" 
                      />
                      <span className="material-symbols-outlined custom-checkbox-icon absolute text-white pointer-events-none left-1/2 top-1/2" style={{ fontSize: '12px', fontWeight: 'bold' }}>check</span>
                    </div>
                    <span className="text-xs text-gray-700 dark:text-on-surface group-hover:text-gray-900 dark:group-hover:text-white transition-colors">{col.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Main Preview Area below */}
        <div className="w-full flex flex-col items-center">
          <div className="text-sm text-gray-400 dark:text-secondary mb-2 print:hidden self-start flex items-center gap-2">
            Preview
          </div>
          
          {/* Paper Background Container */}
          <div className="bg-gray-100 dark:bg-surface-container-low rounded-xl p-4 lg:p-8 flex justify-center w-full overflow-hidden print:bg-white print:p-0 print:rounded-none">
            
            {/* The A4 Paper */}
            {renderHiddenMeasurementPass()}
            <div ref={reportRef} className={`report-preview-paper flex flex-col ${isExporting ? 'gap-0' : 'gap-8'} bg-transparent print:bg-white w-[297mm] origin-top`}>
              {paginatedPages.map((page, index) => {
                let globalStartIndex = 0;
                for (let p = 0; p < index; p++) {
                  globalStartIndex += paginatedPages[p].rows.length;
                }

                return (
                  <div key={index} className={`bg-white ${isExporting ? 'shadow-none' : 'shadow-md'} print:shadow-none w-[297mm] h-[210mm] box-border px-12 py-8 text-gray-800 font-serif relative overflow-hidden`}>
                    
                    {page.rows.length === 0 && !page.isFirstPage ? (
                      // Orphaned closing-only page: header + closing block, no table at all
                      <div className="h-full flex flex-col justify-center">
                        {renderClosingBlock()}
                      </div>
                    ) : (
                      <>
                        {page.isFirstPage ? renderFirstHeader() : renderSmallHeader()}
                        <div className="w-full">
                          <table className="w-full text-left border-collapse min-w-full">
                            {renderTableHeader()}
                            <tbody>
                              {page.rows.length > 0 ? (
                                page.rows.map((c, i) => renderTableRow(c, globalStartIndex + i))
                              ) : (
                                <tr>
                                  <td colSpan={activeColsCount} className="py-8 text-center text-gray-500 text-sm font-sans italic">
                                    No cases found for this period.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        {page.hasClosing && !(page.rows.length === 0 && !page.isFirstPage) && renderClosingBlock()}
                      </>
                    )}
                    
                    {renderPageFooter(index + 1, paginatedPages.length)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @media print {
          body {
            background-color: white;
          }
          @page {
            size: A4 landscape;
            margin: 0;
          }
          .report-preview-paper {
            zoom: 1 !important;
          }
        }
        .page-break-inside-avoid {
          page-break-inside: avoid;
        }
        @media (max-width: 1400px) {
          .report-preview-paper {
            zoom: 0.85;
          }
        }
        @media (max-width: 1200px) {
          .report-preview-paper {
            zoom: 0.75;
          }
        }
        @media (max-width: 1000px) {
          .report-preview-paper {
            zoom: 0.6;
          }
        }
        @media (max-width: 800px) {
          .report-preview-paper {
            zoom: 0.45;
          }
        }
        @media (max-width: 600px) {
          .report-preview-paper {
            zoom: 0.35;
          }
        }
      `}</style>
    </div>
  );
}
