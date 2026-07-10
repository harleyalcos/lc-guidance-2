import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import html2pdf from "html2pdf.js";
import lcOfficialLogo from "../assets/lc-official-logo.jpg";
import guidanceLogo from "../assets/guidance-logo.png";

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
}

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

export default function SummaryReports() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [scope, setScope] = useState<"all" | "specific">("all");
  const [selectedGrade, setSelectedGrade] = useState("Grade 7");
  const [selectedRole, setSelectedRole] = useState<"all" | "Respondent" | "Complainant / Subject">("all");
  const [selectedStatus, setSelectedStatus] = useState<"all" | "Pending" | "Reprimand" | "Resolved" | "Closed">("all");
  const [periodType, setPeriodType] = useState<"monthly" | "yearly">("monthly");
  const [selectedMonth, setSelectedMonth] = useState("July 2025");
  const [selectedYear, setSelectedYear] = useState("A.Y. 2025-2026");
  const [includes, setIncludes] = useState({
    summary: true,
    signature: true,
  });
  const [isExporting, setIsExporting] = useState(false);
  const [paginatedPages, setPaginatedPages] = useState<{ rows: CaseRecord[], isFirstPage: boolean, hasClosing: boolean }[]>([]);
  
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadCases = async () => {
      try {
        const loadedCases = await invoke<CaseRecord[]>("get_cases");
        setCases(loadedCases);
      } catch (err) {
        console.error("Failed to load cases", err);
      }
    };
    loadCases();
    
    const handleCasesChanged = () => loadCases();
    window.addEventListener("cases:changed", handleCasesChanged);
    return () => window.removeEventListener("cases:changed", handleCasesChanged);
  }, []);

  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    cases.forEach(c => {
      const d = new Date(c.date_filed || c.date);
      if (!isNaN(d.getTime())) {
        const monthName = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        monthsSet.add(monthName);
      }
    });
    if (monthsSet.size === 0) {
      return ["June 2025", "July 2025", "August 2025", "September 2025", "October 2025", "November 2025", "December 2025", "January 2026", "February 2026", "March 2026"];
    }
    return Array.from(monthsSet).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  }, [cases]);

  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    cases.forEach(c => {
      const d = new Date(c.date_filed || c.date);
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = d.getMonth();
        let ay = "";
        if (month >= 5) {
          ay = `A.Y. ${year}-${year + 1}`;
        } else {
          ay = `A.Y. ${year - 1}-${year}`;
        }
        yearsSet.add(ay);
      }
    });
    if (yearsSet.size === 0) {
      return ["A.Y. 2025-2026", "A.Y. 2026-2027"];
    }
    return Array.from(yearsSet).sort();
  }, [cases]);

  useEffect(() => {
    if (availableMonths.length > 0 && !availableMonths.includes(selectedMonth)) {
      setSelectedMonth(availableMonths[availableMonths.length - 1]);
    }
  }, [availableMonths, selectedMonth]);

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[availableYears.length - 1]);
    }
  }, [availableYears, selectedYear]);

  const activeCases = useMemo(() => {
    return cases.filter(c => {
      // 1. Filter by scope
      if (scope === "specific") {
        const students = parseStudents(c.students);
        const grade = students.length > 0 ? students[0].level : c.level;
        if (grade !== selectedGrade) return false;
      }

      // 2. Filter by role
      if (selectedRole !== "all") {
        const students = parseStudents(c.students);
        const hasRole = students.length > 0
          ? students.some(s => normalizeRole(s.role).toLowerCase() === selectedRole.toLowerCase())
          : (selectedRole.toLowerCase() === "respondent");
        if (!hasRole) return false;
      }

      // 3. Filter by status
      if (selectedStatus !== "all") {
        if (c.progress.toLowerCase() !== selectedStatus.toLowerCase()) return false;
      }

      // 4. Filter by period
      const d = new Date(c.date_filed || c.date);
      if (isNaN(d.getTime())) return false;

      if (periodType === "monthly") {
        const monthName = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        return monthName === selectedMonth;
      } else {
        const year = d.getFullYear();
        const month = d.getMonth();
        let ay = "";
        if (month >= 5) {
          ay = `A.Y. ${year}-${year + 1}`;
        } else {
          ay = `A.Y. ${year - 1}-${year}`;
        }
        return ay === selectedYear;
      }
    });
  }, [cases, periodType, selectedMonth, selectedYear, scope, selectedGrade, selectedRole]);

  const stats = useMemo(() => {
    const total = activeCases.length;
    const pending = activeCases.filter(c => c.progress.toLowerCase() === "pending").length;
    const resolved = activeCases.filter(c => {
      const p = c.progress.toLowerCase();
      return p === "resolved" || p === "closed";
    }).length;
    const reprimand = activeCases.filter(c => c.progress.toLowerCase() === "reprimand").length;

    return { total, pending, resolved, reprimand };
  }, [activeCases]);

  const handleExportPDF = async () => {
    if (!reportRef.current || isExporting) return;
    setIsExporting(true);
    const element = reportRef.current;
    const filenameLabel = periodType === "monthly" ? selectedMonth : selectedYear;
    
    const filename = `Guidance_Report_${filenameLabel.replace(/[\s\.-]/g, '_')}.pdf`;
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
    setSelectedRole("all");
    setSelectedStatus("all");
    setPeriodType("yearly");
    if (availableYears.length > 0) {
      setSelectedYear(availableYears[availableYears.length - 1]);
    }
    setIncludes({
      summary: true,
      signature: true,
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
          {periodType === "monthly" ? "Monthly Report on Disciplinary Cases" : "Yearly Report on Disciplinary Cases"}
        </h1>
        <p className="text-xs text-gray-500 font-sans">Official Disciplinary Case Report</p>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 mb-6 text-xs w-3/4 mx-auto font-sans text-left">
        {periodType === "monthly" ? (
          <div className="flex">
            <span className="w-32 text-gray-500">Reporting period</span>
            <span className="font-medium">{selectedMonth}</span>
          </div>
        ) : (
          <div className="flex">
            <span className="w-32 text-gray-500">Academic year</span>
            <span className="font-medium">{selectedYear.replace('A.Y. ', '')}</span>
          </div>
        )}
        <div className="flex">
          <span className="w-32 text-gray-500">Scope</span>
          <span className="font-medium">{scope === 'all' ? 'All year levels' : selectedGrade}</span>
        </div>
        <div className="flex">
          <span className="w-32 text-gray-500">Role filter</span>
          <span className="font-medium">{selectedRole === 'all' ? 'All roles' : selectedRole}</span>
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

      {includes.summary && (
        <div className="mb-6 font-sans">
          <h3 className="text-[10px] font-bold text-primary uppercase tracking-wider mb-2 border-b pb-1">Summary</h3>
          <div className="grid grid-cols-4 gap-4">
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
          </div>
        </div>
      )}
      <h3 className="text-[12px] font-bold text-primary uppercase tracking-wider mb-2 border-b pb-1 font-sans">Case List</h3>
    </>
  );

  const renderSmallHeader = () => (
    <div className="flex justify-between items-end border-b pb-3 mb-6 font-sans">
      <div>
        <h2 className="m-0 text-[13px] font-black uppercase tracking-wider text-black">Laguna College Guidance Office</h2>
        <p className="m-0 mt-0.5 text-[10px] font-bold text-gray-600">
          {periodType === "monthly" ? "Monthly Disciplinary Case Report" : "Yearly Disciplinary Case Report"}
        </p>
      </div>
      <div className="text-right">
        <p className="m-0 text-[10px] text-gray-500">
          {periodType === "monthly" ? selectedMonth : selectedYear}
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
        <th className="py-2 pr-2">Incident Date</th>
        <th className="py-2 pr-2">Student</th>
        <th className="py-2 pr-2">Class</th>
        <th className="py-2 pr-2">Adviser</th>
        <th className="py-2 pr-2">Type</th>
        <th className="py-2 pr-2 max-w-[140px]">Description</th>
        <th className="py-2 pr-2 max-w-[120px]">Sanction</th>
        <th className="py-2 text-right pr-2">Status</th>
      </tr>
    </thead>
  );

  const renderPageFooter = (currentPage: number, totalPages: number) => (
    <div className="absolute bottom-8 left-12 right-12 flex justify-between items-end text-[10px] text-gray-400 font-sans border-t pt-4 bg-white">
      <div className="flex flex-col">
        <span className="font-bold">Generated by LCGO Guidance Information System</span>
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
        <td className="py-3 pr-2 text-gray-600 font-sans whitespace-nowrap">{formatDate(c.date)}</td>
        <td className="py-3 pr-2 font-medium text-gray-900 font-sans">{studentName}</td>
        <td className="py-3 pr-2 text-gray-600 font-sans whitespace-nowrap">{studentGrade}</td>
        <td className="py-3 pr-2 text-gray-600 font-sans">{studentAdviser}</td>
        <td className="py-3 pr-2 text-gray-600 font-sans">{c.case}</td>
        <td className="py-3 pr-2 text-gray-600 font-sans max-w-[140px] break-words">{c.description || "—"}</td>
        <td className="py-3 pr-2 text-gray-600 font-sans max-w-[120px] break-words">{c.sanction || "—"}</td>
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
              <span className="font-bold">Generated by LCGO Guidance Information System</span>
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
  }, [activeCases, includes, periodType, selectedMonth, selectedYear, scope, selectedGrade, selectedRole]);

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-10 h-full">
      {/* Header */}
      <div className="flex justify-between items-end print:hidden">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary m-0">Reports</h1>
          <p className="text-sm text-gray-500 mt-1">Generate a printable report for school leadership</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleExportPDF}
            disabled={isExporting}
            className={`px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isExporting ? "Exporting..." : "Export PDF"}
          </button>
          <button 
            onClick={handlePrint}
            className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:opacity-90 transition-all shadow-sm"
          >
            Print
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Report settings on top */}
        <div className="w-full bg-white border border-gray-200 rounded-xl p-6 shadow-sm print:hidden">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-bold text-primary">Report settings</h2>
            <button
              onClick={handleClearFilters}
              className="text-xs font-bold text-primary hover:text-primary/80 transition-colors flex items-center gap-1 bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg"
            >
              <span className="material-symbols-outlined text-[16px]">filter_alt_off</span>
              Clear Filters
            </button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 items-start">
            {/* Scope */}
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Scope</label>
              <div className="space-y-2">
                <label className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${scope === 'all' ? 'bg-primary/5' : 'hover:bg-gray-50'}`}>
                  <input 
                    type="radio" 
                    name="scope" 
                    value="all" 
                    checked={scope === "all"}
                    onChange={() => setScope("all")}
                    className="w-4 h-4 text-primary focus:ring-primary accent-primary" 
                  />
                  <span className={`text-sm ${scope === 'all' ? 'font-medium text-primary' : 'text-gray-600'}`}>All cases</span>
                </label>
                <label className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${scope === 'specific' ? 'bg-primary/5' : 'hover:bg-gray-50'}`}>
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
                  <div className="pl-9 pr-2 mt-1 pb-1 animate-in fade-in slide-in-from-top-1">
                    <div className="relative">
                      <select
                        value={selectedGrade}
                        onChange={e => setSelectedGrade(e.target.value)}
                        className="w-full appearance-none bg-white border border-gray-300 rounded-lg pl-3 pr-10 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                      >
                        {["Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"].map(grade => (
                          <option key={grade} value={grade}>{grade}</option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" style={{ fontSize: '18px' }}>expand_more</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Role Filter */}
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Role</label>
              <div className="relative">
                <select
                  value={selectedRole}
                  onChange={e => setSelectedRole(e.target.value as any)}
                  className="w-full appearance-none bg-white border border-gray-300 rounded-lg pl-3 pr-10 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                >
                  <option value="all">All roles</option>
                  <option value="Respondent">Respondent</option>
                  <option value="Complainant / Subject">Complainant / Subject</option>
                </select>
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" style={{ fontSize: '18px' }}>expand_more</span>
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Status</label>
              <div className="relative">
                <select
                  value={selectedStatus}
                  onChange={e => setSelectedStatus(e.target.value as any)}
                  className="w-full appearance-none bg-white border border-gray-300 rounded-lg pl-3 pr-10 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                >
                  <option value="all">All statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="Reprimand">Reprimand</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Closed">Closed</option>
                </select>
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" style={{ fontSize: '18px' }}>expand_more</span>
              </div>
            </div>

            {/* Period */}
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Period</label>
              <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
                <button 
                  onClick={() => setPeriodType("monthly")}
                  className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${periodType === 'monthly' ? 'bg-primary text-white font-medium shadow' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  Monthly
                </button>
                <button 
                  onClick={() => setPeriodType("yearly")}
                  className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${periodType === 'yearly' ? 'bg-primary text-white font-medium shadow' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  Yearly
                </button>
              </div>
              <div className="space-y-3">
                {periodType === "monthly" ? (
                  <div className="relative animate-in fade-in duration-200">
                    <select 
                      value={selectedMonth}
                      onChange={e => setSelectedMonth(e.target.value)}
                      className="w-full appearance-none bg-white border border-gray-300 rounded-lg pl-3 pr-10 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                    >
                      {availableMonths.map(month => (
                        <option key={month} value={month}>{month}</option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" style={{ fontSize: '18px' }}>expand_more</span>
                  </div>
                ) : (
                  <div className="relative animate-in fade-in duration-200">
                    <select 
                      value={selectedYear}
                      onChange={e => setSelectedYear(e.target.value)}
                      className="w-full appearance-none bg-white border border-gray-300 rounded-lg pl-3 pr-10 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                    >
                      {availableYears.map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" style={{ fontSize: '18px' }}>expand_more</span>
                  </div>
                )}
              </div>
            </div>

            {/* Include */}
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Include</label>
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
                        className="peer appearance-none w-4 h-4 border border-gray-300 rounded bg-white checked:bg-primary checked:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors cursor-pointer" 
                      />
                      <span className="material-symbols-outlined absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ fontSize: '12px', fontWeight: 'bold' }}>check</span>
                    </div>
                    <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Main Preview Area below */}
        <div className="w-full flex flex-col items-center">
          <div className="text-sm text-gray-400 mb-2 print:hidden self-start flex items-center gap-2">
            Preview — this is what prints
          </div>
          
          {/* Paper Background Container */}
          <div className="bg-gray-100 rounded-xl p-4 lg:p-8 flex justify-center w-full overflow-hidden print:bg-white print:p-0 print:rounded-none">
            
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
                                  <td colSpan={9} className="py-8 text-center text-gray-500 text-sm font-sans italic">
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
