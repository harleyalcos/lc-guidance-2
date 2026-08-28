import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import html2pdf from "html2pdf.js";
import AcademicMonthRangePicker from "../components/AcademicMonthRangePicker";
import lcOfficialLogo from "../assets/lc-official-logo.jpg";
import guidanceLogo from "../assets/guidance-logo.png";
import { useAcademicYearFilter } from "../context/AcademicYearFilterContext";

import { CaseRecord, StudentInfo } from "../types";
import StatCard from "../components/StatCard";

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

const GRADE_LEVEL_OPTIONS = ["Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];

const PRESET_CASE_TYPES: string[] = [
  "Poor academic performance",
  "Learning difficulties",
  "Study skills & habits",
  "Absenteeism / tardiness",
  "Course selection",
  "Dropout prevention",
  "Peer relationship issues",
  "Family problems",
  "Self-esteem & identity",
  "Adjustment difficulties",
  "Grief & loss",
  "Gender & sexuality",
  "Substance use",
  "Social media issues",
  "Defiance / non-compliance",
  "Classroom disruption",
  "Bullying",
  "Truancy / skipping",
  "Vandalism / property damage",
  "Theft & dishonesty",
  "Inappropriate language",
  "Gang-related behaviour",
  "Substance possession",
  "Physical fighting",
  "Assault on staff",
  "Weapons possession",
  "Threats & intimidation",
  "Self-harm & suicide risk",
  "Sexual harassment",
  "Anxiety & depression",
  "Trauma & abuse",
  "Crisis intervention",
  "Tardiness",
  "Vaping",
  "Cutting Classes",
  "Vandalism",
  "Gambling",
  "Insubordination",
  "Dress Code Violation",
  "Cheating",
  "Academic Dishonesty",
  "Unauthorized Phone Usage",
  "Loitering During Class Hours",
];

const TYPE_COLORS = [
  "#7C96E8", // Blue
  "#F0B94D", // Amber
  "#4FD1C5", // Teal/Emerald
  "#F17272", // Coral/Red
  "#94A3B8", // Slate/Others
];

const matchPresetCaseType = (rawCase: string): string => {
  const trimmed = (rawCase || "").trim();
  if (!trimmed) return "Others";

  const lower = trimmed.toLowerCase();

  for (const preset of PRESET_CASE_TYPES) {
    if (preset.toLowerCase() === lower) {
      return preset;
    }
  }

  for (const preset of PRESET_CASE_TYPES) {
    const parts = preset.toLowerCase().split("/").map((p) => p.trim());
    if (parts.includes(lower)) {
      return preset;
    }
  }

  return "Others";
};

const STATUS_CHART_SEGMENTS = [
  { label: "Resolved", color: "#7C96E8" },
  { label: "Pending", color: "#F0B94D" },
  { label: "Reprimand", color: "#4FD1C5" },
  { label: "Closed", color: "#F17272" },
];

const getCaseDate = (caseRecord: CaseRecord) => {
  const parsed = new Date(caseRecord.date_filed || caseRecord.date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};


const formatDashboardDateRange = (startStr: string, endStr: string, casesList: CaseRecord[]) => {
  let start = startStr;
  let end = endStr;

  if (!start && !end) {
    if (casesList && casesList.length > 0) {
      const dates = casesList
        .map((c) => getCaseDate(c))
        .filter((d): d is Date => d !== null)
        .sort((a, b) => a.getTime() - b.getTime());

      if (dates.length > 0) {
        start = dates[0].toISOString().split("T")[0];
        end = dates[dates.length - 1].toISOString().split("T")[0];
      }
    }
  }

  if (!start && !end) return "all recorded periods";

  const startObj = start ? new Date(start) : null;
  const endObj = end ? new Date(end) : null;

  if (startObj && endObj) {
    if (startObj.getTime() === endObj.getTime()) {
      return startObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
    if (
      startObj.getMonth() === 0 &&
      startObj.getDate() === 1 &&
      endObj.getMonth() === 11 &&
      endObj.getDate() === 31 &&
      startObj.getFullYear() === endObj.getFullYear()
    ) {
      return `Year ${startObj.getFullYear()}`;
    }
    if (
      startObj.getDate() === 1 &&
      startObj.getFullYear() === endObj.getFullYear() &&
      startObj.getMonth() === endObj.getMonth()
    ) {
      return startObj.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
  }

  const formatDate = (d: Date) => {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  if (startObj && endObj) return `${formatDate(startObj)} – ${formatDate(endObj)}`;
  if (startObj) return `From ${formatDate(startObj)}`;
  if (endObj) return `Until ${formatDate(endObj)}`;
  return "all recorded periods";
};

const getCaseGradeLevel = (caseRecord: CaseRecord) => {
  const students = parseStudents(caseRecord.students);
  return students[0]?.level || caseRecord.level || "Unspecified";
};

const isComplainantSubjectCaseRecord = (caseRecord: CaseRecord) => {
  const firstStudent = parseStudents(caseRecord.students)[0];
  return normalizeRole(firstStudent?.role) === "Complainant / Subject";
};



export default function Dashboard() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<HTMLDivElement>(null);
  
  const {
    allYears,
    selectedSchoolYear,
    setSelectedSchoolYear,
    startDate: dashStartDate,
    endDate: dashEndDate,
    setDateRange,
    isYearsLoading,
  } = useAcademicYearFilter();

  useEffect(() => {
    if (isYearsLoading || selectedSchoolYear === null) return;
    
    const loadCases = async () => {
      try {
        const queryYear = (selectedSchoolYear === 'all' || (dashStartDate && dashEndDate)) ? null : selectedSchoolYear;
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
  }, [selectedSchoolYear, isYearsLoading, dashStartDate, dashEndDate]);

  // Filter cases by the selected date range
  const filteredCases = useMemo(() => {
    // Filter out Complainant / Subject records to match the Case Catalog and avoid double counting
    const displayCases = cases.filter((c) => !isComplainantSubjectCaseRecord(c));

    if (!dashStartDate && !dashEndDate) return displayCases;
    return displayCases.filter((c) => {
      const d = getCaseDate(c);
      if (!d) return false;
      if (dashStartDate) {
        const start = new Date(dashStartDate);
        start.setHours(0, 0, 0, 0);
        if (d.getTime() < start.getTime()) return false;
      }
      if (dashEndDate) {
        const end = new Date(dashEndDate);
        end.setHours(23, 59, 59, 999);
        if (d.getTime() > end.getTime()) return false;
      }
      return true;
    });
  }, [cases, dashStartDate, dashEndDate]);


  const stats = useMemo(() => {
    const total = filteredCases.length;
    const resolved = filteredCases.filter(c => (c.progress || "").toLowerCase() === "resolved").length;
    const closed = filteredCases.filter(c => (c.progress || "").toLowerCase() === "closed").length;
    const reprimand = filteredCases.filter(c => (c.progress || "").toLowerCase().includes("reprimand")).length;
    const pending = total - resolved - closed - reprimand;

    return { total, pending, resolved, closed, reprimand };
  }, [filteredCases]);

  const caseVolumeChartConfig = useMemo(() => {
    // If empty, fallback to the current calendar year
    const start = dashStartDate ? new Date(dashStartDate) : new Date(new Date().getFullYear(), 0, 1);
    const end = dashEndDate ? new Date(dashEndDate) : new Date(new Date().getFullYear(), 11, 31);
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();

    const isDifferentYears = startYear !== endYear;

    if (isDifferentYears) {
      const yearMap = new Map<number, number>();
      for (let y = startYear; y <= endYear; y++) {
        yearMap.set(y, 0);
      }

      for (const c of filteredCases) {
        const d = getCaseDate(c);
        if (!d) continue;
        const y = d.getFullYear();
        if (yearMap.has(y)) {
          yearMap.set(y, yearMap.get(y)! + 1);
        }
      }

      const data = Array.from(yearMap.entries()).map(([year, count]) => ({
        label: `${year}`,
        value: count,
      }));

      return {
        mode: "annual" as const,
        title: "Annual Case Volume",
        data,
      };
    }

    const monthData = [
      { label: "Jan", value: 0 },
      { label: "Feb", value: 0 },
      { label: "Mar", value: 0 },
      { label: "Apr", value: 0 },
      { label: "May", value: 0 },
      { label: "Jun", value: 0 },
      { label: "Jul", value: 0 },
      { label: "Aug", value: 0 },
      { label: "Sep", value: 0 },
      { label: "Oct", value: 0 },
      { label: "Nov", value: 0 },
      { label: "Dec", value: 0 },
    ];

    for (const c of filteredCases) {
      const d = getCaseDate(c);
      if (!d) continue;
      if (d.getFullYear() === startYear) {
        const m = d.getMonth();
        monthData[m].value += 1;
      }
    }

    // Filter to only include months within the selected date range
    const startMonth = start.getMonth();
    const endMonth = end.getMonth();
    const data = monthData.slice(startMonth, endMonth + 1);

    return {
      mode: "monthly" as const,
      title: startYear === endYear
        ? `${startYear} Monthly Case Volume`
        : "Monthly Case Volume",
      data,
    };
  }, [dashStartDate, dashEndDate, filteredCases]);

  const statusDistribution = useMemo(() => {
    const resolved = filteredCases.filter(c => (c.progress || "").toLowerCase() === "resolved").length;
    const closed = filteredCases.filter(c => (c.progress || "").toLowerCase() === "closed").length;
    const reprimand = filteredCases.filter(c => (c.progress || "").toLowerCase().includes("reprimand")).length;
    const pending = filteredCases.length - resolved - closed - reprimand;

    return STATUS_CHART_SEGMENTS.map((segment) => {
      const label = segment.label.toLowerCase();
      let value = 0;
      if (label === "resolved") value = resolved;
      else if (label === "closed") value = closed;
      else if (label === "reprimand") value = reprimand;
      else if (label === "pending") value = pending;

      return {
        ...segment,
        value,
      };
    });
  }, [filteredCases]);

  const typeDistribution = useMemo(() => {
    if (filteredCases.length === 0) {
      return [
        { label: "Bullying", value: 0, color: TYPE_COLORS[0] },
        { label: "Tardiness", value: 0, color: TYPE_COLORS[1] },
        { label: "Vaping", value: 0, color: TYPE_COLORS[2] },
        { label: "Cheating", value: 0, color: TYPE_COLORS[3] },
        { label: "Others", value: 0, color: TYPE_COLORS[4] },
      ];
    }

    const countsMap = new Map<string, number>();
    let othersCount = 0;

    for (const c of filteredCases) {
      const matched = matchPresetCaseType(c.case || "");
      if (matched === "Others") {
        othersCount++;
      } else {
        countsMap.set(matched, (countsMap.get(matched) || 0) + 1);
      }
    }

    const sortedPresets = Array.from(countsMap.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    const top4 = sortedPresets.slice(0, 4);
    const remainingPresets = sortedPresets.slice(4);

    for (const [_, count] of remainingPresets) {
      othersCount += count;
    }

    const result: { label: string; value: number; color: string }[] = [];

    top4.forEach(([label, value], idx) => {
      result.push({
        label,
        value,
        color: TYPE_COLORS[idx % TYPE_COLORS.length],
      });
    });

    if (othersCount > 0 || result.length < 4) {
      result.push({
        label: "Others",
        value: othersCount,
        color: TYPE_COLORS[4],
      });
    }

    return result;
  }, [filteredCases]);

  const gradeCaseload = useMemo(() => {
    const activeTopLabels = typeDistribution.filter((t) => t.label !== "Others").map((t) => t.label);

    return GRADE_LEVEL_OPTIONS.map((grade) => {
      const gradeCases = filteredCases.filter((c) => getCaseGradeLevel(c) === grade);
      const segments = typeDistribution.map((t) => {
        let count = 0;
        for (const c of gradeCases) {
          const matched = matchPresetCaseType(c.case || "");
          if (t.label === "Others") {
            if (matched === "Others" || !activeTopLabels.includes(matched)) {
              count++;
            }
          } else {
            if (matched === t.label) {
              count++;
            }
          }
        }
        return {
          label: t.label,
          value: count,
          color: t.color,
        };
      });

      return {
        label: grade,
        total: gradeCases.length,
        segments,
      };
    });
  }, [filteredCases, typeDistribution]);


  // ─── PDF helpers (mirror SummaryReports / CaseDetails style) ──────────────

  const pdfFirstHeader = (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "84px 1fr 84px", alignItems: "center", gap: "16px", marginBottom: "16px", fontFamily: "sans-serif" }}>
        <img src={lcOfficialLogo} alt="Laguna College Logo" style={{ width: 72, height: 72, objectFit: "contain" }} />
        <div style={{ textAlign: "center", color: "#000", fontFamily: "Georgia, 'Times New Roman', serif" }}>
          <div style={{ margin: 0, fontSize: 15, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.02em", lineHeight: "18px" }}>LAGUNA COLLEGE</div>
          <div style={{ margin: 0, marginTop: 2, fontSize: 11, fontWeight: 700, lineHeight: "13px" }}>San Pablo City</div>
          <div style={{ margin: 0, marginTop: 2, fontSize: 18, fontWeight: 900, lineHeight: "21px" }}>Guidance Office</div>
        </div>
        <img src={guidanceLogo} alt="Guidance Office Logo" style={{ width: 72, height: 72, objectFit: "contain", justifySelf: "end" }} />
      </div>
      <div style={{ height: 2, width: "100%", background: "#002F87", marginBottom: 20 }} />
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "sans-serif", color: "#000" }}>Institutional Overview</div>
        <div style={{ fontSize: 10, color: "#6b7280", fontFamily: "sans-serif", marginTop: 2 }}>Statistical Summary of Guidance Office Activity</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 32px", marginBottom: 24, fontSize: 10, width: "70%", marginLeft: "auto", marginRight: "auto", fontFamily: "sans-serif", textTransform: "none", textAlign: "left" }}>
        <div style={{ display: "flex" }}>
          <span style={{ width: 110, color: "#6b7280" }}>Reporting period</span>
          <span style={{ fontWeight: 700, color: "#000" }}>{formatDashboardDateRange(dashStartDate, dashEndDate, cases)}</span>
        </div>
        <div style={{ display: "flex" }}>
          <span style={{ width: 110, color: "#6b7280" }}>Date generated</span>
          <span style={{ fontWeight: 700, color: "#000" }}>
            {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      </div>
    </>
  );

  const pdfSmallHeader = (label: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "1px solid #e5e7eb", paddingBottom: 12, marginBottom: 24, fontFamily: "sans-serif" }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em", color: "#000" }}>Laguna College Guidance Office</div>
        <div style={{ fontSize: 9, fontWeight: 700, color: "#4b5563", marginTop: 2 }}>Institutional Overview</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 9, color: "#6b7280" }}>{formatDashboardDateRange(dashStartDate, dashEndDate, cases)}</div>
        <div style={{ fontSize: 8, color: "#9ca3af", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.1em", marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );

  const pdfFooter = (page: number, total: number) => (
    <div style={{ position: "absolute", bottom: 32, left: 48, right: 48, display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 9, color: "#9ca3af", fontFamily: "sans-serif", borderTop: "1px solid #e5e7eb", paddingTop: 12, background: "#fff" }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontWeight: 700, color: "#000" }}>Generated by LCGO Information System</span>
        <span>Confidential Statistical Record</span>
      </div>
      <div style={{ fontWeight: 700, color: "#000" }}>Page {page} of {total}</div>
    </div>
  );

  // ─── Export handler ───────────────────────────────────────────────────────

  const handleExportPDF = () => {
    if (isExporting) return;
    setIsExporting(true);
  };

  useEffect(() => {
    if (!isExporting) return;

    let isMounted = true;
    const runExport = async () => {
      // Give React one tick to render the portal, then capture via ref
      await new Promise<void>((resolve) => setTimeout(resolve, 200));

      const element = pdfRef.current;
      if (!element) {
        if (isMounted) setIsExporting(false);
        return;
      }

      // Make the element actually paintable for html2canvas
      element.style.position = "relative";
      element.style.left = "0";
      element.style.top = "0";
      element.style.opacity = "1";
      element.style.visibility = "visible";
      element.style.overflow = "visible";
      // Force a layout pass so the browser paints it
      element.getBoundingClientRect();

      const filenameLabel = formatDashboardDateRange(dashStartDate, dashEndDate, cases).replace(/[\s\.-]/g, '_');
      const filename = `Guidance_Overview_${filenameLabel}.pdf`;
      const opt = {
        margin: 0,
        filename,
        image: { type: "jpeg" as const, quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#FFFFFF",
          scrollX: 0,
          scrollY: 0,
          windowWidth: element.scrollWidth,
          windowHeight: element.scrollHeight,
          onclone: (clonedDoc: Document) => {
            clonedDoc.documentElement.classList.remove("dark");
            const el = clonedDoc.querySelector(".cd-pdf-root") as HTMLElement | null;
            if (el) {
              el.style.position = "relative";
              el.style.left = "0";
              el.style.top = "0";
              el.style.width = "210mm";
              el.style.opacity = "1";
              el.style.visibility = "visible";
              el.style.overflow = "visible";
              el.style.pointerEvents = "auto";
            }
          },
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
      };

      try {
        const pdfBase64 = await html2pdf().from(element).set(opt).outputPdf("datauristring");
        if (isMounted) {
          const base64Data = pdfBase64.split(",")[1];
          await invoke("save_pdf", { base64Data, filename });
        }
      } catch (err) {
        alert("Failed to export PDF: " + err);
      } finally {
        if (isMounted) setIsExporting(false);
      }
    };

    runExport();

    return () => { isMounted = false; };
  }, [isExporting, dashStartDate, dashEndDate]);

  const renderDashboardPanel = (title: string, children: React.ReactNode, className = "") => (
    <section className={`bg-surface border border-outline-variant rounded-lg shadow-sm overflow-hidden min-w-0 flex flex-col ${className}`}>
      <div className="px-5 pt-5 pb-3 border-b border-outline-variant">
        <h3 className="section-header-h2 m-0 mb-0">{title}</h3>
      </div>
      <div className="p-5 flex-1 flex flex-col justify-center">
        {children}
      </div>
    </section>
  );

  const renderMonthlyVolumeChart = (isForPdf: boolean = false) => {
    const width = 640;
    const height = 280;
    const padding = { top: 18, right: 18, bottom: 42, left: 42 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const maxValue = Math.max(5, ...caseVolumeChartConfig.data.map((item) => item.value));
    const points = caseVolumeChartConfig.data.map((item, index) => {
      const x = padding.left + (chartWidth / Math.max(1, caseVolumeChartConfig.data.length - 1)) * index;
      const y = padding.top + chartHeight - (item.value / maxValue) * chartHeight;
      return { ...item, x, y };
    });
    const linePath = points.length
      ? `M ${points[0].x} ${points[0].y} ${points.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ")}`
      : "";
    const areaPath = points.length
      ? `M ${points[0].x} ${padding.top + chartHeight} L ${points.map((point) => `${point.x} ${point.y}`).join(" L ")} L ${points[points.length - 1].x} ${padding.top + chartHeight} Z`
      : "";
    const yTicks = Array.from({ length: 6 }, (_, index) => Math.round((maxValue / 5) * index));

    return (
      <svg className="w-full h-[260px] md:h-[300px]" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Monthly case volume chart">
        <defs>
          <linearGradient id="monthlyVolumeFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#002F87" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#002F87" stopOpacity="0.03" />
          </linearGradient>
        </defs>
        {yTicks.map((tick) => {
          const y = padding.top + chartHeight - (tick / maxValue) * chartHeight;
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={isForPdf ? "#e5e7eb" : "var(--color-border-subtle)"} strokeWidth="1" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="fill-secondary text-[11px]" style={isForPdf ? { fill: "#6b7280" } : undefined}>
                {tick}
              </text>
            </g>
          );
        })}
        {areaPath && (
          <path
            d={areaPath}
            fill="url(#monthlyVolumeFill)"
            style={{ transition: "d 0.5s ease-in-out" }}
          />
        )}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={isForPdf ? "#002F87" : "var(--color-primary)"}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transition: "d 0.5s ease-in-out" }}
          />
        )}
        {points.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <circle
              cx={point.x}
              cy={point.y}
              r="4.5"
              fill={isForPdf ? "#ffffff" : "var(--color-surface)"}
              stroke={isForPdf ? "#002F87" : "var(--color-primary)"}
              strokeWidth="2.5"
              style={{ transition: "cx 0.5s ease-in-out, cy 0.5s ease-in-out" }}
            />
            <text x={point.x} y={height - 14} textAnchor="middle" className="fill-secondary text-[11px]" style={isForPdf ? { fill: "#6b7280" } : undefined}>
              {point.label}
            </text>
          </g>
        ))}
        {filteredCases.length === 0 && (
          <text x={width / 2} y={height / 2} textAnchor="middle" className="fill-muted text-[14px] font-bold" style={isForPdf ? { fill: "#9ca3af" } : undefined}>
            No cases recorded for this period
          </text>
        )}
      </svg>
    );
  };

  const renderResolutionStatusChart = (isForPdf: boolean = false) => {
    const total = statusDistribution.reduce((sum, item) => sum + item.value, 0);
    const radius = 74;
    const circumference = 2 * Math.PI * radius;

    return (
      <div className="flex flex-col items-center">
        <svg className="w-full max-w-[280px] aspect-square" viewBox="0 0 220 220" role="img" aria-label="Resolution status chart">
          <circle cx="110" cy="110" r={radius} fill="none" stroke={isForPdf ? "#e5e7eb" : "var(--color-border-subtle)"} strokeWidth="34" />
          {total > 0 && (() => {
            let accumulated = 0;
            return statusDistribution.filter((segment) => segment.value > 0).map((segment) => {
              const dash = (segment.value / total) * circumference;
              const rendered = (
                <circle
                  key={segment.label}
                  cx="110"
                  cy="110"
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth="34"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-accumulated}
                  strokeLinecap="butt"
                  transform="rotate(-90 110 110)"
                  style={{
                    transition: "stroke-dasharray 0.5s ease-in-out, stroke-dashoffset 0.5s ease-in-out",
                  }}
                />
              );
              accumulated += dash;
              return rendered;
            });
          })()}
          <text x="110" y="106" textAnchor="middle" className="fill-on-surface text-[30px] font-bold" style={isForPdf ? { fill: "#0f172a" } : undefined}>
            {total}
          </text>
          <text x="110" y="128" textAnchor="middle" className="fill-secondary text-[11px] font-bold uppercase tracking-wider" style={isForPdf ? { fill: "#475569" } : undefined}>
            Cases
          </text>
        </svg>
        <div className={`grid grid-cols-2 gap-x-5 gap-y-2 mt-3 text-xs ${isForPdf ? "text-slate-600" : "text-secondary"}`}>
          {statusDistribution.map((segment) => (
            <div key={segment.label} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: segment.color }} />
              <span>{segment.label}</span>
              <span className={`font-bold ${isForPdf ? "text-slate-900" : "text-on-surface"}`}>{segment.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderTypeDistributionChart = (isForPdf: boolean = false) => {
    const maxValue = Math.max(1, ...typeDistribution.map((item) => item.value));

    return (
      <div className="space-y-3.5 py-2">
        {typeDistribution.map((item) => {
          const widthPercent = item.value === 0 ? 0 : Math.max(8, (item.value / maxValue) * 100);
          return (
            <div key={item.label} className="grid grid-cols-[130px_minmax(0,1fr)_32px] items-center gap-3">
              <span className={`text-xs font-bold truncate ${isForPdf ? "text-slate-600" : "text-secondary"}`} title={item.label}>
                {item.label}
              </span>
              <div
                className={`h-8 border rounded overflow-hidden ${isForPdf ? "bg-[#f1f5f9] border-[#e5e7eb]" : "bg-surface-container border-outline-variant"}`}
              >
                <div
                  className="h-full rounded-r transition-[width] duration-500"
                  style={{ width: `${widthPercent}%`, backgroundColor: item.color }}
                />
              </div>
              <span className={`text-right text-xs font-bold ${isForPdf ? "text-slate-900" : "text-on-surface"}`}>{item.value}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderGradeCaseloadChart = (isForPdf: boolean = false) => {
    const width = 640;
    const height = 280;
    const padding = { top: 18, right: 20, bottom: 42, left: 42 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const maxValue = Math.max(5, ...gradeCaseload.map((item) => item.total));
    const yTicks = Array.from({ length: 6 }, (_, index) => Math.round((maxValue / 5) * index));
    const slotWidth = chartWidth / gradeCaseload.length;
    const barWidth = Math.min(48, slotWidth * 0.56);

    return (
      <div>
        <svg className="w-full h-[260px] md:h-[300px]" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Caseload by grade level chart">
          {yTicks.map((tick) => {
            const y = padding.top + chartHeight - (tick / maxValue) * chartHeight;
            return (
              <g key={tick}>
                <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={isForPdf ? "#e5e7eb" : "var(--color-border-subtle)"} strokeWidth="1" />
                <text x={padding.left - 10} y={y + 4} textAnchor="end" className="fill-secondary text-[11px]" style={isForPdf ? { fill: "#6b7280" } : undefined}>
                  {tick}
                </text>
              </g>
            );
          })}
          {gradeCaseload.map((grade, index) => {
            const x = padding.left + slotWidth * index + (slotWidth - barWidth) / 2;
            let yCursor = padding.top + chartHeight;
            return (
              <g key={grade.label}>
                {grade.segments.map((segment) => {
                  const segmentHeight = (segment.value / maxValue) * chartHeight;
                  const y = yCursor - segmentHeight;
                  yCursor = y;
                  return (
                    <rect
                      key={segment.label}
                      x={x}
                      y={y}
                      width={barWidth}
                      height={segmentHeight}
                      fill={segment.color}
                      style={{ transition: "y 0.5s ease-in-out, height 0.5s ease-in-out" }}
                    />
                  );
                })}
                <text x={x + barWidth / 2} y={height - 14} textAnchor="middle" className="fill-secondary text-[11px]" style={isForPdf ? { fill: "#6b7280" } : undefined}>
                  {grade.label.replace("Grade ", "G")}
                </text>
              </g>
            );
          })}
          {filteredCases.length === 0 && (
            <text x={width / 2} y={height / 2} textAnchor="middle" className="fill-secondary dark:fill-muted text-[14px] font-bold" style={isForPdf ? { fill: "#9ca3af" } : undefined}>
              No grade-level caseload yet
            </text>
          )}
        </svg>
        <div className={`flex flex-wrap justify-center gap-x-5 gap-y-2 mt-4 text-xs ${isForPdf ? "text-slate-600" : "text-secondary"}`}>
          {typeDistribution.map((group) => (
            <div key={group.label} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
              <span>{group.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div ref={dashboardRef} className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-10 h-full p-4 md:p-6 animate-fade-in">
      {/* Header - exactly identical to the reports page's Institutional Overview header layout */}
      <div className="flex flex-col gap-4 xl:flex-row xl:justify-between xl:items-end print:hidden">
        <div className="min-w-0 flex-1">
          <h1 className="page-header-h1 m-0">Dashboard</h1>
          <p className="text-sm text-secondary mt-1 max-w-2xl">
            A statistical summary of guidance office activity for {formatDashboardDateRange(dashStartDate, dashEndDate, cases)}.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 flex-wrap sm:flex-nowrap">
          <AcademicMonthRangePicker
            allYears={allYears}
            schoolYear={selectedSchoolYear}
            onSelectSchoolYear={setSelectedSchoolYear}
            isLoadingYears={isYearsLoading}
            startDate={dashStartDate}
            endDate={dashEndDate}
            className="w-[260px] sm:w-[290px]"
            placeholder="All Records"
            onRangeChange={(start, end) => setDateRange(start, end)}
          />

          <button 
            onClick={handleExportPDF}
            disabled={isExporting}
            className="btn-primary shrink-0 whitespace-nowrap h-[38px] !py-0 !px-4"
          >
            <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
            <span>{isExporting ? "Exporting..." : "Export PDF"}</span>
          </button>
        </div>
      </div>

      {/* KPI/Summary Metric Cards / Chips */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Total Cases", value: stats.total, icon: "analytics", colorClass: "text-primary bg-surface-container" },
          { label: "Pending", value: stats.pending, icon: "pending_actions", colorClass: "text-[var(--badge-pending-text)] bg-[var(--badge-pending-bg)]" },
          { label: "Resolved", value: stats.resolved, icon: "task_alt", colorClass: "text-[var(--badge-resolved-text)] bg-[var(--badge-resolved-bg)]" },
          { label: "Reprimand", value: stats.reprimand, icon: "gavel", colorClass: "text-[var(--badge-reprimand-text)] bg-[var(--badge-reprimand-bg)]" },
          { label: "Closed", value: stats.closed, icon: "cancel", colorClass: "text-[var(--badge-closed-text)] bg-[var(--badge-closed-bg)]" },
        ].map((kpi) => (
          <StatCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            icon={kpi.icon}
            colorClass={kpi.colorClass}
          />
        ))}
      </div>

      {/* Charts Panels Section - Exact layout matching SummaryReports */}
      <div className="flex flex-col gap-6">
        <section className="print:hidden">
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-6">
            {renderDashboardPanel(caseVolumeChartConfig.title, renderMonthlyVolumeChart(), "min-h-[360px]")}
            {renderDashboardPanel("Resolution Status", renderResolutionStatusChart(), "min-h-[360px]")}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(280px,0.95fr)_minmax(0,2fr)] gap-6 mt-6">
            {renderDashboardPanel("Distribution by Type", renderTypeDistributionChart(), "min-h-[310px]")}
            {renderDashboardPanel("Caseload by Grade Level", renderGradeCaseloadChart(), "min-h-[310px]")}
          </div>
        </section>
      </div>

      {/* ── Hidden A4 portrait PDF layout – captured via pdfRef ── */}
      {isExporting && createPortal(
        <div
          ref={pdfRef}
          className="cd-pdf-root"
          style={{
            position: "fixed",
            top: 0,
            left: "-200vw",
            width: "210mm",
            background: "#ffffff",
            opacity: 1,
            visibility: "visible",
            overflow: "visible",
            pointerEvents: "none",
            zIndex: -9999,
          }}
        >
          {/* PAGE 1: Header + KPI Chips + Monthly Case Volume */}
          <div style={{ width: "210mm", minHeight: "297mm", boxSizing: "border-box", padding: "32px 48px 80px", background: "#fff", position: "relative" }}>
            {pdfFirstHeader}

            {/* KPI Cards / Chips rendered for PDF */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px", marginBottom: "24px", fontFamily: "sans-serif" }}>
              {[
                { label: "Total Cases", value: stats.total, color: "#002F87" },
                { label: "Pending", value: stats.pending, color: "#D9A23B" },
                { label: "Resolved", value: stats.resolved, color: "#15803D" },
                { label: "Reprimand", value: stats.reprimand, color: "#6B7280" },
                { label: "Closed", value: stats.closed, color: "#4b5563" },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  style={{
                    backgroundColor: "#fafafa",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    padding: "10px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ fontSize: "8px", fontWeight: 700, textTransform: "uppercase", color: kpi.color, letterSpacing: "0.05em" }}>{kpi.label}</span>
                  <span style={{ fontSize: "16px", fontWeight: 750, color: "#111827", marginTop: "4px" }}>{kpi.value}</span>
                </div>
              ))}
            </div>

            {/* Chart 1: Case Volume */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "16px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#002F87", marginBottom: "12px", fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>{caseVolumeChartConfig.title}</div>
              {renderMonthlyVolumeChart(true)}
            </div>

            {pdfFooter(1, 2)}
          </div>

          {/* PAGE 2: Resolution Status, Distribution by Type & Grade Level Breakdown */}
          <div style={{ width: "210mm", minHeight: "297mm", boxSizing: "border-box", padding: "32px 48px 80px", background: "#fff", position: "relative" }}>
            {pdfSmallHeader("Resolution, Distribution & Grade Level Breakdown")}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "16px" }}>
              {/* Chart 2: Resolution Status */}
              <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "14px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#002F87", marginBottom: "10px", fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>Resolution Status</div>
                {renderResolutionStatusChart(true)}
              </div>

              {/* Chart 3: Distribution by Type */}
              <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "14px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#002F87", marginBottom: "10px", fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>Distribution by Type</div>
                {renderTypeDistributionChart(true)}
              </div>
            </div>

            {/* Chart 4: Caseload by Grade Level */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "14px", marginTop: "16px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#002F87", marginBottom: "10px", fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>Caseload by Grade Level</div>
              {renderGradeCaseloadChart(true)}
            </div>

            {pdfFooter(2, 2)}
          </div>
        </div>,
        document.body
      )}

      {isExporting && createPortal(
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/45 backdrop-blur-sm">
          <div className="bg-surface border border-outline-variant p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 max-w-xs w-full text-center">
            <span className="material-symbols-outlined text-4xl animate-spin text-primary">sync</span>
            <div>
              <h3 className="text-sm font-bold text-on-surface">Generating PDF</h3>
              <p className="text-xs text-secondary mt-1">This may take a few seconds as we compile page layouts and charts...</p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
