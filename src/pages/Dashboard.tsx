import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import html2pdf from "html2pdf.js";
import MonthYearRangePicker from "../components/MonthYearRangePicker";
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

const GRADE_LEVEL_OPTIONS = ["Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];

const CASE_TYPE_GROUPS = [
  { label: "Academic", color: "#002F87" },
  { label: "Behavioral", color: "#5A6270" },
  { label: "Attendance", color: "#D9A23B" },
  { label: "Personal", color: "#B9C1D4" },
];

const STATUS_CHART_SEGMENTS = [
  { label: "Resolved", color: "#002F87" },
  { label: "Pending", color: "#D9A23B" },
  { label: "Reprimand", color: "#6B7280" },
  { label: "Closed", color: "#B9C1D4" },
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
      let oldest: Date | null = null;
      let latest: Date | null = null;
      for (const c of casesList) {
        const d = getCaseDate(c);
        if (d) {
          if (!oldest || d.getTime() < oldest.getTime()) oldest = d;
          if (!latest || d.getTime() > latest.getTime()) latest = d;
        }
      }
      if (oldest) start = oldest.toISOString().split("T")[0];
      if (latest) end = latest.toISOString().split("T")[0];
    }
  }

  if (!start && !end) return "No Cases";

  const startObj = new Date(start);
  const endObj = new Date(end);
  
  // Format nicely
  if (startObj.getFullYear() === endObj.getFullYear() && startObj.getMonth() === 0 && endObj.getMonth() === 11) {
    return `${startObj.getFullYear()}`;
  }
  if (startObj.getFullYear() === endObj.getFullYear() && startObj.getMonth() === endObj.getMonth()) {
    // Check if it's a full calendar month
    const lastDay = new Date(endObj.getFullYear(), endObj.getMonth() + 1, 0).getDate();
    if (startObj.getDate() === 1 && endObj.getDate() === lastDay) {
      return startObj.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
  }

  const formatDate = (d: Date) => {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return `${formatDate(startObj)} – ${formatDate(endObj)}`;
};

const currentYear = new Date().getFullYear();
const defaultStartDate = `${currentYear}-01-01`;
const defaultEndDate = `${currentYear}-12-31`;

const isSameMonth = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

const categorizeCaseType = (caseType: string) => {
  const normalized = caseType.toLowerCase();
  if (/absentee|tardin|truancy|skipping|attendance/.test(normalized)) {
    return "Attendance";
  }
  if (/academic|learning|study|course|dropout|performance|grade/.test(normalized)) {
    return "Academic";
  }
  if (/peer|family|self|identity|adjustment|grief|gender|sexual|anxiety|depression|trauma|abuse|crisis|harassment/.test(normalized)) {
    return "Personal";
  }
  return "Behavioral";
};

const getCaseGradeLevel = (caseRecord: CaseRecord) => {
  const students = parseStudents(caseRecord.students);
  return students[0]?.level || caseRecord.level || "Unspecified";
};



export default function Dashboard() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [dashStartDate, setDashStartDate] = useState(defaultStartDate);
  const [dashEndDate, setDashEndDate] = useState(defaultEndDate);
  const [isExporting, setIsExporting] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<HTMLDivElement>(null);

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

  // Filter cases by the selected date range
  const filteredCases = useMemo(() => {
    if (!dashStartDate && !dashEndDate) return cases;
    return cases.filter((c) => {
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
    const pending = filteredCases.filter(c => c.progress.toLowerCase() === "pending").length;
    const resolved = filteredCases.filter(c => c.progress.toLowerCase() === "resolved").length;
    const closed = filteredCases.filter(c => c.progress.toLowerCase() === "closed").length;
    const reprimand = filteredCases.filter(c => c.progress.toLowerCase() === "reprimand").length;
    return { total, pending, resolved, closed, reprimand };
  }, [filteredCases]);

  const caseVolumeChartConfig = useMemo(() => {
    // If empty, fallback to the current calendar year
    const start = dashStartDate ? new Date(dashStartDate) : new Date(new Date().getFullYear(), 0, 1);
    const end = dashEndDate ? new Date(dashEndDate) : new Date(new Date().getFullYear(), 11, 31);
    const startYear = start.getFullYear();
    const startMonth = start.getMonth();
    const endYear = end.getFullYear();
    const endMonth = end.getMonth();

    // 1. Single month selection (weekly view)
    if (startYear === endYear && startMonth === endMonth) {
      const monthName = start.toLocaleDateString("en-US", { month: "long" });
      const lastDay = new Date(startYear, startMonth + 1, 0).getDate();
      
      const weeks = [
        { label: "Week 1", startDay: 1, endDay: 7 },
        { label: "Week 2", startDay: 8, endDay: 14 },
        { label: "Week 3", startDay: 15, endDay: 21 },
        { label: "Week 4", startDay: 22, endDay: 28 },
      ];
      if (lastDay > 28) {
        weeks.push({ label: "Week 5", startDay: 29, endDay: lastDay });
      }

      const data = weeks.map(w => {
        const count = filteredCases.filter(c => {
          const d = getCaseDate(c);
          if (!d) return false;
          return d.getFullYear() === startYear && d.getMonth() === startMonth && d.getDate() >= w.startDay && d.getDate() <= w.endDay;
        }).length;
        return { label: w.label, value: count };
      });

      return {
        mode: "weekly" as const,
        title: `${monthName} ${startYear} Weekly Case Volume`,
        data,
      };
    }

    // 2. Full calendar year selection
    if (startYear === endYear && startMonth === 0 && endMonth === 11) {
      const data = Array.from({ length: 12 }, (_, index) => {
        const monthDate = new Date(startYear, index, 1);
        return {
          label: monthDate.toLocaleDateString("en-US", { month: "short" }),
          value: filteredCases.filter((c) => {
            const d = getCaseDate(c);
            return d ? isSameMonth(d, monthDate) : false;
          }).length,
        };
      });

      return {
        mode: "monthly" as const,
        title: `${startYear} Monthly Case Volume`,
        data,
      };
    }

    // 3. General multi-month range: list all months in range
    const months: Date[] = [];
    let current = new Date(startYear, startMonth, 1);
    const targetEnd = new Date(endYear, endMonth, 1);
    while (current.getTime() <= targetEnd.getTime()) {
      months.push(new Date(current));
      current.setMonth(current.getMonth() + 1);
    }

    const data = months.map((monthDate) => ({
      label: monthDate.toLocaleDateString("en-US", { month: "short" }),
      value: filteredCases.filter((c) => {
        const d = getCaseDate(c);
        return d ? isSameMonth(d, monthDate) : false;
      }).length,
    }));

    return {
      mode: "monthly" as const,
      title: startYear === endYear
        ? `${startYear} Monthly Case Volume`
        : "Monthly Case Volume",
      data,
    };
  }, [dashStartDate, dashEndDate, filteredCases]);

  const statusDistribution = useMemo(() => {
    return STATUS_CHART_SEGMENTS.map((segment) => ({
      ...segment,
      value: filteredCases.filter((c) => {
        const progress = (c.progress || "").toLowerCase();
        return progress === segment.label.toLowerCase();
      }).length,
    }));
  }, [filteredCases]);

  const typeDistribution = useMemo(() => {
    return CASE_TYPE_GROUPS.map((group) => ({
      ...group,
      value: filteredCases.filter((c) => categorizeCaseType(c.case || "") === group.label).length,
    }));
  }, [filteredCases]);

  const gradeCaseload = useMemo(() => {
    return GRADE_LEVEL_OPTIONS.map((grade) => {
      const gradeCases = filteredCases.filter((c) => getCaseGradeLevel(c) === grade);
      const segments = CASE_TYPE_GROUPS.map((group) => ({
        ...group,
        value: gradeCases.filter((c) => categorizeCaseType(c.case || "") === group.label).length,
      }));
      return {
        label: grade,
        total: gradeCases.length,
        segments,
      };
    });
  }, [filteredCases]);


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
      <div className="px-5 pt-5 pb-3 border-b border-outline-variant/60">
        <h3 className="font-bold text-primary text-[18px] leading-6 m-0">{title}</h3>
      </div>
      <div className="p-5 flex-1 flex flex-col justify-center">
        {children}
      </div>
    </section>
  );

  const renderMonthlyVolumeChart = () => {
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
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#E5E7EB" strokeWidth="1" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="fill-secondary text-[11px]">
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
            stroke="#002F87"
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
              fill="#ffffff"
              stroke="#002F87"
              strokeWidth="2.5"
              style={{ transition: "cx 0.5s ease-in-out, cy 0.5s ease-in-out" }}
            />
            <text x={point.x} y={height - 14} textAnchor="middle" className="fill-secondary text-[11px]">
              {point.label}
            </text>
          </g>
        ))}
        {filteredCases.length === 0 && (
          <text x={width / 2} y={height / 2} textAnchor="middle" className="fill-secondary text-[14px] font-bold">
            No cases for this academic year
          </text>
        )}
      </svg>
    );
  };

  const renderResolutionStatusChart = () => {
    const total = statusDistribution.reduce((sum, item) => sum + item.value, 0);
    const radius = 74;
    const circumference = 2 * Math.PI * radius;

    return (
      <div className="flex flex-col items-center">
        <svg className="w-full max-w-[280px] aspect-square" viewBox="0 0 220 220" role="img" aria-label="Resolution status chart">
          <circle cx="110" cy="110" r={radius} fill="none" stroke="#E5E7EB" strokeWidth="34" />
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
          <text x="110" y="106" textAnchor="middle" className="fill-on-surface text-[30px] font-bold">
            {total}
          </text>
          <text x="110" y="128" textAnchor="middle" className="fill-secondary text-[11px] font-bold uppercase tracking-wider">
            Cases
          </text>
        </svg>
        <div className="grid grid-cols-2 gap-x-5 gap-y-2 mt-3 text-xs text-secondary">
          {statusDistribution.map((segment) => (
            <div key={segment.label} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: segment.color }} />
              <span>{segment.label}</span>
              <span className="font-bold text-on-surface">{segment.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderTypeDistributionChart = () => {
    const maxValue = Math.max(1, ...typeDistribution.map((item) => item.value));

    return (
      <div className="space-y-4 py-2">
        {typeDistribution.map((item) => {
          const widthPercent = item.value === 0 ? 0 : Math.max(8, (item.value / maxValue) * 100);
          return (
            <div key={item.label} className="grid grid-cols-[92px_minmax(0,1fr)_32px] items-center gap-3">
              <span className="text-xs font-bold text-secondary">{item.label}</span>
              <div className="h-9 bg-surface-container-low border border-outline-variant/50 rounded overflow-hidden">
                <div
                  className="h-full rounded-r transition-[width] duration-500"
                  style={{ width: `${widthPercent}%`, backgroundColor: item.color }}
                />
              </div>
              <span className="text-right text-xs font-bold text-on-surface">{item.value}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderGradeCaseloadChart = () => {
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
                <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#E5E7EB" strokeWidth="1" />
                <text x={padding.left - 10} y={y + 4} textAnchor="end" className="fill-secondary text-[11px]">
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
                <text x={x + barWidth / 2} y={height - 14} textAnchor="middle" className="fill-secondary text-[11px]">
                  {grade.label.replace("Grade ", "G")}
                </text>
              </g>
            );
          })}
          {filteredCases.length === 0 && (
            <text x={width / 2} y={height / 2} textAnchor="middle" className="fill-secondary text-[14px] font-bold">
              No grade-level caseload yet
            </text>
          )}
        </svg>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 mt-4 text-xs text-secondary">
          {CASE_TYPE_GROUPS.map((group) => (
            <div key={group.label} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: group.color }} />
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
      <div className="flex flex-col gap-4 lg:flex-row lg:justify-between lg:items-end print:hidden">
        <div>
          <h1 className="text-3xl font-display font-bold text-on-surface m-0">Institutional Overview</h1>
          <p className="text-sm text-secondary mt-1">
            A statistical summary of guidance office activity for {formatDashboardDateRange(dashStartDate, dashEndDate, cases)}.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <MonthYearRangePicker
            startDate={dashStartDate}
            endDate={dashEndDate}
            className="max-w-[200px]"
            placeholder="All Records"
            onRangeChange={(start, end) => {
              setDashStartDate(start);
              setDashEndDate(end);
            }}
          />

          <button 
            onClick={handleExportPDF}
            disabled={isExporting}
            className="btn-primary"
          >
            <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
            <span>{isExporting ? "Exporting..." : "Export PDF"}</span>
          </button>
        </div>
      </div>

      {/* KPI/Summary Metric Cards / Chips */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Total Cases", value: stats.total, icon: "analytics", color: "text-primary bg-primary/5 border-primary/10" },
          { label: "Pending", value: stats.pending, icon: "pending_actions", color: "text-[#D9A23B] bg-[#D9A23B]/5 border-[#D9A23B]/10" },
          { label: "Resolved", value: stats.resolved, icon: "task_alt", color: "text-[#15803D] bg-[#15803D]/5 border-[#15803D]/10" },
          { label: "Reprimand", value: stats.reprimand, icon: "gavel", color: "text-[#6B7280] bg-[#6B7280]/5 border-[#6B7280]/10" },
          { label: "Closed", value: stats.closed, icon: "cancel", color: "text-[#4b5563] bg-[#4b5563]/5 border-[#4b5563]/10" },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className={`bg-surface border rounded-xl p-4 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow duration-300 ${kpi.color}`}
          >
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold uppercase tracking-wider opacity-85">{kpi.label}</span>
              <span className="material-symbols-outlined text-[20px]">{kpi.icon}</span>
            </div>
            <span className="text-2xl font-bold text-on-surface">{kpi.value}</span>
          </div>
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
              {renderMonthlyVolumeChart()}
            </div>

            {pdfFooter(1, 3)}
          </div>

          {/* PAGE 2: Resolution Status & Distribution by Type */}
          <div style={{ width: "210mm", minHeight: "297mm", boxSizing: "border-box", padding: "32px 48px 80px", background: "#fff", position: "relative" }}>
            {pdfSmallHeader("Resolution & Distribution Summary")}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "16px" }}>
              {/* Chart 2: Resolution Status */}
              <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "16px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#002F87", marginBottom: "12px", fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>Resolution Status</div>
                {renderResolutionStatusChart()}
              </div>

              {/* Chart 3: Distribution by Type */}
              <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "16px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#002F87", marginBottom: "12px", fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>Distribution by Type</div>
                {renderTypeDistributionChart()}
              </div>
            </div>

            {pdfFooter(2, 3)}
          </div>

          {/* PAGE 3: Caseload by Grade Level */}
          <div style={{ width: "210mm", minHeight: "297mm", boxSizing: "border-box", padding: "32px 48px 80px", background: "#fff", position: "relative" }}>
            {pdfSmallHeader("Grade Level Breakdown")}

            {/* Chart 4: Caseload by Grade Level */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "16px", marginTop: "16px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#002F87", marginBottom: "12px", fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>Caseload by Grade Level</div>
              {renderGradeCaseloadChart()}
            </div>

            {pdfFooter(3, 3)}
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
