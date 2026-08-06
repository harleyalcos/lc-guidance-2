import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import html2pdf from "html2pdf.js";
import lcOfficialLogo from "../assets/lc-official-logo.jpg";
import guidanceLogo from "../assets/guidance-logo.png";
import AcademicMonthRangePicker from "../components/AcademicMonthRangePicker";
import { useSchoolYears } from "../hooks/useSchoolYears";

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

export default function SummaryReports() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [scope, setScope] = useState<"all" | "specific">("all");
  const [selectedGrade, setSelectedGrade] = useState("Grade 7");

  const [selectedStatus, setSelectedStatus] = useState<"all" | "Pending" | "Reprimand" | "Resolved" | "Closed">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [includes, setIncludes] = useState({
    summary: true,
    signature: true,
  });
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

  const { allYears, currentYear, isLoading: isYearsLoading } = useSchoolYears();
  const [selectedSchoolYear, setSelectedSchoolYear] = useState<string | null>(null);

  useEffect(() => {
    if (!isYearsLoading && selectedSchoolYear === null) {
      const latestYear = allYears[0] || currentYear;
      if (latestYear) {
        setSelectedSchoolYear(latestYear);
      }
    }
  }, [currentYear, allYears, isYearsLoading, selectedSchoolYear]);

  useEffect(() => {
    if (isYearsLoading || selectedSchoolYear === null) return;
    
    const loadCases = async () => {
      try {
        const loadedCases = await invoke<CaseRecord[]>("get_cases", { 
          schoolYear: selectedSchoolYear === 'all' ? null : selectedSchoolYear 
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
  }, [selectedSchoolYear, isYearsLoading]);



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
        const s = (c.sanction || "").toLowerCase();
        const isRep = p.includes("reprimand") || s.includes("reprimand");
        const statusLower = selectedStatus.toLowerCase();
        
        if (statusLower === "resolved") {
          if (p !== "resolved" || isRep) return false;
        } else if (statusLower === "closed") {
          if (p !== "closed" || isRep) return false;
        } else if (statusLower === "reprimand") {
          if (!isRep) return false;
        } else if (statusLower === "pending") {
          const isPending = p !== "resolved" && p !== "closed" && !isRep;
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
    const resolved = activeCases.filter(
      c => c.progress.toLowerCase() === "resolved" &&
      !c.sanction.toLowerCase().includes("reprimand") &&
      !c.progress.toLowerCase().includes("reprimand")
    ).length;
    
    const closed = activeCases.filter(
      c => c.progress.toLowerCase() === "closed" &&
      !c.sanction.toLowerCase().includes("reprimand") &&
      !c.progress.toLowerCase().includes("reprimand")
    ).length;
    
    const reprimand = activeCases.filter(
      c => c.progress.toLowerCase().includes("reprimand") ||
      c.sanction.toLowerCase().includes("reprimand")
    ).length;
    
    // Pending includes everything else (fallback for 'In Progress', 'Pending', etc.)
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
    setSelectedStatus("all");
    setStartDate("");
    setEndDate("");
    setIncludes({
      summary: true,
      signature: true,
    });
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
        <img src={lcOfficialLogo} alt="Laguna College Logo" className="w-[72px] h-[72px] object-contain justify-self-start" />
        <div className="text-center text-black" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
          <h2 className="m-0 text-[15px] leading-[18px] font-black uppercase tracking-[0.02em] text-black">LAGUNA COLLEGE</h2>
          <p className="m-0 mt-0.5 text-[11px] leading-[13px] font-bold text-black">San Pablo City</p>
          <p className="m-0 mt-0.5 text-[18px] leading-[21px] font-black text-black">Guidance Office</p>
        </div>
        <img src={guidanceLogo} alt="Guidance Office Logo" className="w-[72px] h-[72px] object-contain justify-self-end" />
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
            <div className="border border-gray-200 rounded-lg py-2 px-3 flex justify-between">
              <span className="text-[9px] leading-5 text-gray-500 font-bold uppercase tracking-wider">Total Cases</span>
              <span className="text-base leading-5 font-bold text-gray-900">{stats.total}</span>
            </div>
            <div className="border border-gray-200 rounded-lg py-2 px-3 flex justify-between">
              <span className="text-[9px] leading-5 text-gray-500 font-bold uppercase tracking-wider">Pending Cases</span>
              <span className="text-base leading-5 font-bold text-gray-900">{stats.pending}</span>
            </div>
            <div className="border border-gray-200 rounded-lg py-2 px-3 flex justify-between">
              <span className="text-[9px] leading-5 text-gray-500 font-bold uppercase tracking-wider">Resolved Cases</span>
              <span className="text-base leading-5 font-bold text-gray-900">{stats.resolved}</span>
            </div>
            <div className="border border-gray-200 rounded-lg py-2 px-3 flex justify-between">
              <span className="text-[9px] leading-5 text-gray-500 font-bold uppercase tracking-wider">Reprimand Cases</span>
              <span className="text-base leading-5 font-bold text-gray-900">{stats.reprimand}</span>
            </div>
            <div className="border border-gray-200 rounded-lg py-2 px-3 flex justify-between">
              <span className="text-[9px] leading-5 text-gray-500 font-bold uppercase tracking-wider">Closed Cases</span>
              <span className="text-base leading-5 font-bold text-gray-900">{stats.closed}</span>
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
        {visibleColumns.date && <th className="py-2 pr-2">Incident Date</th>}
        {visibleColumns.student && <th className="py-2 pr-2">Student</th>}
        {visibleColumns.class && <th className="py-2 pr-2">Class</th>}
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

  const renderClosingBlock = () => (
    <div className="mt-6 font-sans">
      <div className="border-t border-gray-300 pt-3 mb-4 text-center text-[10px] font-bold text-gray-500 uppercase tracking-widest">
        End of Report
      </div>
      
      {includes.signature && (
        <div className="flex justify-between w-3/4 mx-auto mt-10">
          <div className="flex flex-col items-center w-56 text-center">
            <div className="border-b border-gray-800 w-full mb-2"></div>
            <div className="font-bold text-sm">Guidance Counselor</div>
            <div className="text-xs text-gray-500 mt-1">Prepared by</div>
          </div>
          <div className="flex flex-col items-center w-56 text-center">
            <div className="border-b border-gray-800 w-full mb-2"></div>
            <div className="font-bold text-sm">School Principal</div>
            <div className="text-xs text-gray-500 mt-1">Noted by</div>
          </div>
        </div>
      )}
    </div>
  );

  const renderTableRow = (c: CaseRecord, index: number, isHiddenRef?: boolean) => {
    const students = parseStudents(c.students);
    let studentName = "";
    let studentGrade = "";
    let studentAdviser = c.adviser || "—";
    
    if (students.length > 0) {
      const s = students[0];
      studentName = `${s.lastName}, ${s.firstName}${s.middleInitial ? ` ${s.middleInitial}.` : ""}`;
      studentGrade = `${s.level.replace('Grade ', '')}-${s.section}`;
      studentAdviser = s.adviser || c.adviser || "—";
    } else {
      studentName = `${c.last_name}, ${c.first_name}${c.middle_initial ? ` ${c.middle_initial}.` : ""}`;
      studentGrade = `${c.level.replace('Grade ', '')}-${c.section}`;
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
        {visibleColumns.date && <td className="py-3 pr-2 text-gray-600 font-sans whitespace-nowrap">{formatDate(c.date)}</td>}
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
    
    const PAGE_HEIGHT_PX = frameEl.getBoundingClientRect().height;
    
    const firstHeaderH = document.querySelector('[data-measurement-root] [data-first-header]')?.getBoundingClientRect().height || 0;
    const contHeaderH = document.querySelector('[data-measurement-root] [data-cont-header]')?.getBoundingClientRect().height || 0;
    const tableHeaderH = document.querySelector('[data-measurement-root] thead')?.getBoundingClientRect().height || 0;
    const footerH = document.querySelector('[data-measurement-root] [data-footer]')?.getBoundingClientRect().height || 0;
    const closingH = document.querySelector('[data-measurement-root] [data-closing]')?.getBoundingClientRect().height || 0;

    const rowEls = document.querySelectorAll('[data-measurement-root] [data-row]');
    const rowHeights = Array.from(rowEls).map(el => el.getBoundingClientRect().height);
    
    const SAFETY_MARGIN = 12;
    const topPadding = 32;
    const bottomAbsoluteOffset = 32;
    const footerBudget = bottomAbsoluteOffset + footerH;
    
    const contentBudget = PAGE_HEIGHT_PX - topPadding - footerBudget - SAFETY_MARGIN;

    const heightByCaseId = new Map(activeCases.map((c, i) => [c.id, rowHeights[i]]));

    const newPages: { rows: CaseRecord[], isFirstPage: boolean, hasClosing: boolean }[] = [];
    
    if (activeCases.length === 0) {
      const hasClosing = (firstHeaderH + tableHeaderH + closingH) <= contentBudget;
      newPages.push({ rows: [], isFirstPage: true, hasClosing });
      if (!hasClosing) {
         newPages.push({ rows: [], isFirstPage: false, hasClosing: true });
      }
      setPaginatedPages(newPages);
      return;
    }

    let currentBudget = contentBudget - firstHeaderH - tableHeaderH;
    let currentRowBucket: CaseRecord[] = [];
    let isFirstPage = true;

    for (let i = 0; i < activeCases.length; i++) {
      const caseRecord = activeCases[i];
      const rowHeight = rowHeights[i];
      
      if (currentBudget >= rowHeight || currentRowBucket.length === 0) {
        currentRowBucket.push(caseRecord);
        currentBudget -= rowHeight;
      } else {
        newPages.push({ rows: currentRowBucket, isFirstPage, hasClosing: false });
        isFirstPage = false;
        currentRowBucket = [caseRecord];
        currentBudget = contentBudget - contHeaderH - tableHeaderH - rowHeight;
      }
    }

    if (currentRowBucket.length > 0) {
      if (currentBudget >= closingH) {
        newPages.push({ rows: currentRowBucket, isFirstPage, hasClosing: true });
      } else {
        let rebalanced = false;
        const maxTrim = Math.min(3, currentRowBucket.length);
        for (let trim = 1; trim <= maxTrim; trim++) {
          const movedRows = currentRowBucket.slice(-trim);
          const keptRows = currentRowBucket.slice(0, currentRowBucket.length - trim);
          if (keptRows.length === 0) break;
          const movedHeight = movedRows.reduce((sum, r) => sum + (heightByCaseId.get(r.id) || 0), 0);
          const freshPageBudget = contentBudget - contHeaderH - tableHeaderH;
          if (freshPageBudget - movedHeight >= closingH) {
            newPages.push({ rows: keptRows, isFirstPage, hasClosing: false });
            newPages.push({ rows: movedRows, isFirstPage: false, hasClosing: true });
            rebalanced = true;
            break;
          }
        }
        if (!rebalanced) {
          newPages.push({ rows: currentRowBucket, isFirstPage, hasClosing: false });
          newPages.push({ rows: [], isFirstPage: false, hasClosing: true });
        }
      }
    }
    
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
        <div className="w-full bg-white dark:bg-surface-container border border-gray-200 dark:border-outline-variant rounded-xl p-6 shadow-sm print:hidden">
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
                            : "border-gray-300 dark:border-outline-variant hover:border-primary/60 hover:bg-surface-container"
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
                      : "border-gray-300 dark:border-outline-variant hover:border-primary/60 hover:bg-surface-container"
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
                  <div className="absolute left-0 top-full z-30 mt-2 w-full max-w-[220px] overflow-hidden rounded-xl border border-gray-300 dark:border-outline-variant bg-white dark:bg-surface-container p-1.5 shadow-lg filter-dropdown-enter">
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
                  className="w-full max-w-[220px]"
                  placeholder="Pick range"
                  onRangeChange={(start, end) => {
                    setStartDate(start);
                    setEndDate(end);
                  }}
                />
              </div>
            </div>

            {/* Include */}
            <div>
              <label className="text-xs font-bold text-gray-400 dark:text-secondary uppercase tracking-wider mb-3 block">Include</label>
              <div className="space-y-3">
                {[
                  { id: 'summary', label: 'Summary statistics' },
                  { id: 'signature', label: 'Signature block' },
                ].map((item) => (
                  <label key={item.id} className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center">
                      <input 
                        type="checkbox" 
                        checked={includes[item.id as keyof typeof includes]}
                        onChange={(e) => setIncludes({...includes, [item.id]: e.target.checked})}
                        className="peer appearance-none w-4 h-4 border border-gray-300 dark:border-outline-variant rounded bg-white dark:bg-surface-container checked:bg-primary checked:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors cursor-pointer" 
                      />
                      <span className="material-symbols-outlined absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ fontSize: '12px', fontWeight: 'bold' }}>check</span>
                    </div>
                    <span className="text-sm text-gray-700 dark:text-on-surface group-hover:text-gray-900 dark:group-hover:text-white transition-colors">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Columns Checklist */}
            <div>
              <label className="text-xs font-bold text-gray-400 dark:text-secondary uppercase tracking-wider mb-3 block">Columns</label>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 max-h-[160px] overflow-y-auto pr-1">
                {[
                  { id: 'date', label: 'Incident Date' },
                  { id: 'student', label: 'Student' },
                  { id: 'class', label: 'Class' },
                  { id: 'adviser', label: 'Adviser' },
                  { id: 'type', label: 'Type' },
                  { id: 'description', label: 'Description' },
                  { id: 'sanction', label: 'Sanction' },
                  { id: 'status', label: 'Status' },
                ].map((col) => (
                  <label key={col.id} className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center">
                      <input 
                        type="checkbox" 
                        checked={visibleColumns[col.id as keyof typeof visibleColumns]}
                        onChange={(e) => setVisibleColumns({
                          ...visibleColumns,
                          [col.id]: e.target.checked
                        })}
                        className="peer appearance-none w-4 h-4 border border-gray-300 dark:border-outline-variant rounded bg-white dark:bg-surface-container checked:bg-primary checked:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors cursor-pointer" 
                      />
                      <span className="material-symbols-outlined absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ fontSize: '12px', fontWeight: 'bold' }}>check</span>
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
            Preview — this is what prints
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
