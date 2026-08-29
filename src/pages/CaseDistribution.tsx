import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import AcademicMonthRangePicker from "../components/AcademicMonthRangePicker";
import { useAcademicYearFilter } from "../context/AcademicYearFilterContext";
import { CaseRecord, StudentInfo } from "../types";
import {
  smartCategorizeCase,
  getCategoryDomain,
  CASE_DOMAINS,
} from "../utils/caseCategorization";

const GRADE_LEVELS = ["Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];

const parseStudents = (json?: string): StudentInfo[] => {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getCaseGradeLevel = (c: CaseRecord): string => {
  if (c.level) {
    const num = c.level.replace(/\D/g, "");
    if (num && GRADE_LEVELS.includes(`Grade ${num}`)) return `Grade ${num}`;
  }
  const students = parseStudents(c.students);
  if (students.length > 0 && students[0].level) {
    const num = students[0].level.replace(/\D/g, "");
    if (num && GRADE_LEVELS.includes(`Grade ${num}`)) return `Grade ${num}`;
  }
  return "Grade 7";
};

const getStudentDisplayName = (c: CaseRecord): string => {
  const students = parseStudents(c.students);
  if (students.length > 0) {
    const s = students[0];
    const mi = s.middleInitial ? ` ${s.middleInitial}.` : "";
    const base = `${s.lastName}, ${s.firstName}${mi}`;
    if (students.length > 1) {
      return `${base} (+${students.length - 1})`;
    }
    return base;
  }
  const mi = c.middle_initial ? ` ${c.middle_initial}.` : "";
  if (c.last_name || c.first_name) {
    return `${c.last_name || ""}, ${c.first_name || ""}${mi}`.trim();
  }
  return "—";
};

const getCaseSection = (c: CaseRecord): string => {
  if (c.section) return c.section;
  const students = parseStudents(c.students);
  if (students.length > 0 && students[0].section) return students[0].section;
  return "—";
};

export default function CaseDistribution() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    allYears,
    selectedSchoolYear,
    setSelectedSchoolYear,
    startDate,
    endDate,
    setDateRange,
    isYearsLoading,
  } = useAcademicYearFilter();

  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDomain, setSelectedDomain] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    return searchParams.get("category") || "all";
  });

  // Table pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    if (isYearsLoading || selectedSchoolYear === null) return;
    loadCases();
  }, [selectedSchoolYear, isYearsLoading, startDate, endDate]);

  const loadCases = async () => {
    setIsLoading(true);
    try {
      const queryYear = (selectedSchoolYear === "all" || (startDate && endDate)) ? null : selectedSchoolYear;
      const result = await invoke<CaseRecord[]>("get_cases", {
        schoolYear: queryYear,
      });
      setCases(result || []);
    } catch (err) {
      console.error("Failed to load cases:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Sync category in URL params
  const handleSelectCategory = (cat: string) => {
    setSelectedCategory(cat);
    setCurrentPage(1);
    if (cat === "all") {
      searchParams.delete("category");
      setSearchParams(searchParams);
    } else {
      setSearchParams({ category: cat });
    }
  };

  // Filter cases by date range
  const dateFilteredCases = useMemo(() => {
    return cases.filter((c) => {
      if (!c.date) return true;
      if (startDate && c.date < startDate) return false;
      if (endDate && c.date > endDate) return false;
      return true;
    });
  }, [cases, startDate, endDate]);

  // Categorize every case
  const categorizedCases = useMemo(() => {
    return dateFilteredCases.map((c) => {
      const category = smartCategorizeCase(c.case || "", c.description || "");
      const domain = getCategoryDomain(category);
      const grade = getCaseGradeLevel(c);
      return {
        ...c,
        mappedCategory: category,
        domain,
        grade,
      };
    });
  }, [dateFilteredCases]);

  // Aggregate category counts
  const categoryStats = useMemo(() => {
    const map = new Map<string, { category: string; count: number; domain: ReturnType<typeof getCategoryDomain>; gradeCounts: Record<string, number> }>();

    for (const c of categorizedCases) {
      const existing = map.get(c.mappedCategory);
      if (!existing) {
        const gradeCounts: Record<string, number> = {};
        GRADE_LEVELS.forEach((g) => (gradeCounts[g] = 0));
        gradeCounts[c.grade] = 1;
        map.set(c.mappedCategory, {
          category: c.mappedCategory,
          count: 1,
          domain: c.domain,
          gradeCounts,
        });
      } else {
        existing.count += 1;
        existing.gradeCounts[c.grade] = (existing.gradeCounts[c.grade] || 0) + 1;
      }
    }

    const sorted = Array.from(map.values()).sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
    return sorted;
  }, [categorizedCases]);

  // Domain counts
  const domainStats = useMemo(() => {
    const map: Record<string, number> = {};
    CASE_DOMAINS.forEach((d) => (map[d.id] = 0));

    for (const c of categorizedCases) {
      map[c.domain.id] = (map[c.domain.id] || 0) + 1;
    }

    return CASE_DOMAINS.map((d) => ({
      ...d,
      count: map[d.id] || 0,
      percentage: categorizedCases.length > 0 ? Math.round(((map[d.id] || 0) / categorizedCases.length) * 100) : 0,
    }));
  }, [categorizedCases]);

  // Filtered categories for display in the ranked list
  const displayCategories = useMemo(() => {
    return categoryStats.filter((cat) => {
      if (selectedDomain !== "all" && cat.domain.id !== selectedDomain) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return cat.category.toLowerCase().includes(query) || cat.domain.label.toLowerCase().includes(query);
      }
      return true;
    });
  }, [categoryStats, selectedDomain, searchQuery]);

  // Drill-down table cases
  const tableCases = useMemo(() => {
    return categorizedCases.filter((c) => {
      if (selectedCategory !== "all" && c.mappedCategory !== selectedCategory) return false;
      if (selectedDomain !== "all" && c.domain.id !== selectedDomain) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const studentName = getStudentDisplayName(c).toLowerCase();
        const caseName = (c.case || "").toLowerCase();
        const desc = (c.description || "").toLowerCase();
        const mapped = c.mappedCategory.toLowerCase();
        return studentName.includes(query) || caseName.includes(query) || desc.includes(query) || mapped.includes(query);
      }
      return true;
    });
  }, [categorizedCases, selectedCategory, selectedDomain, searchQuery]);

  const totalPages = Math.ceil(tableCases.length / pageSize) || 1;
  const paginatedCases = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return tableCases.slice(start, start + pageSize);
  }, [tableCases, currentPage]);

  const topCategory = categoryStats[0];

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-12 animate-fade-in">
      {/* ── Top Header Bar ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-outline-variant pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="btn-secondary h-10 w-10 !p-0 rounded-xl flex items-center justify-center"
            title="Back to Dashboard"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-wider uppercase text-secondary">Analytics & Insights</span>
              <span className="text-outline-variant">/</span>
              <span className="text-[10px] font-bold tracking-wider uppercase text-primary dark:text-[#8ba2ff]">Case Distribution</span>
            </div>
            <h1 className="text-2xl font-bold text-on-surface m-0 leading-tight">In-Depth Case Distribution</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <AcademicMonthRangePicker
            allYears={allYears}
            schoolYear={selectedSchoolYear}
            onSelectSchoolYear={setSelectedSchoolYear}
            isLoadingYears={isYearsLoading}
            startDate={startDate}
            endDate={endDate}
            onRangeChange={(s: string, e: string) => setDateRange(s, e)}
          />
        </div>
      </div>

      {/* ── KPI Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-outline-variant rounded-xl p-4 flex flex-col justify-between shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <span className="micro-label opacity-85">Total Analyzed Cases</span>
            <span className="material-symbols-outlined text-primary text-[20px]">folder_open</span>
          </div>
          <span className="text-2xl font-bold text-on-surface">{dateFilteredCases.length}</span>
        </div>

        <div className="bg-surface border border-outline-variant rounded-xl p-4 flex flex-col justify-between shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <span className="micro-label opacity-85">Active Categories</span>
            <span className="material-symbols-outlined text-[#F0B94D] text-[20px]">category</span>
          </div>
          <span className="text-2xl font-bold text-on-surface">{categoryStats.length}</span>
        </div>

        <div className="bg-surface border border-outline-variant rounded-xl p-4 flex flex-col justify-between shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <span className="micro-label opacity-85">#1 Most Prevalent Offense</span>
            <span className="material-symbols-outlined text-error text-[20px]">trending_up</span>
          </div>
          <div className="flex items-baseline gap-2 truncate">
            <span className="text-xl font-bold text-on-surface truncate" title={topCategory?.category || "None"}>
              {topCategory?.category || "None"}
            </span>
            {topCategory && <span className="text-xs font-semibold text-secondary">({topCategory.count})</span>}
          </div>
        </div>

        <div className="bg-surface border border-outline-variant rounded-xl p-4 flex flex-col justify-between shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <span className="micro-label opacity-85">Primary Offense Domain</span>
            <span className="material-symbols-outlined text-[#0F6E56] text-[20px]">domain</span>
          </div>
          <span className="text-xl font-bold text-on-surface truncate">
            {domainStats.sort((a, b) => b.count - a.count)[0]?.label || "None"}
          </span>
        </div>
      </div>

      {/* ── Major Domains Overview ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {domainStats.map((domain) => (
          <button
            key={domain.id}
            type="button"
            onClick={() => {
              setSelectedDomain(selectedDomain === domain.id ? "all" : domain.id);
              setSelectedCategory("all");
              setCurrentPage(1);
            }}
            className={`p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
              selectedDomain === domain.id
                ? "ring-2 ring-primary border-primary bg-primary/5 shadow-sm"
                : "border-outline-variant bg-surface hover:bg-surface-container"
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-md"
                style={{ backgroundColor: domain.bg, color: domain.color }}
              >
                {domain.label}
              </span>
              <span className="text-xs font-bold text-secondary">{domain.percentage}%</span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl font-extrabold text-on-surface">{domain.count}</span>
              <span className="text-xs text-secondary">case{domain.count === 1 ? "" : "s"}</span>
            </div>
          </button>
        ))}
      </div>

      {/* ── Full Ranked Distribution Breakdown ── */}
      <div className="bg-surface border border-outline-variant rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-5 border-b border-outline-variant flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-container-low dark:bg-surface-container-high/40">
          <div>
            <h2 className="section-header-h2 m-0 text-base font-bold text-on-surface">
              Complete Category Frequency & Breakdown
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              Click any category row to filter and inspect individual student incident records.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search filter */}
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-secondary text-[18px]">
                search
              </span>
              <input
                type="text"
                placeholder="Search categories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-surface border border-outline-variant rounded-lg text-on-surface placeholder:text-muted focus:border-primary focus:outline-none w-48 sm:w-60"
              />
            </div>

            {selectedCategory !== "all" && (
              <button
                type="button"
                onClick={() => handleSelectCategory("all")}
                className="btn-secondary text-xs !py-1.5 !px-2.5 flex items-center gap-1 font-bold text-error border-error/30 hover:bg-error/5"
              >
                <span className="material-symbols-outlined text-[16px]">filter_alt_off</span>
                <span>Clear Selection</span>
              </button>
            )}
          </div>
        </div>

        {/* Ranked bars list */}
        <div className="p-5 flex flex-col gap-3">
          {displayCategories.length === 0 ? (
            <div className="py-12 text-center text-secondary text-sm">
              No categories found matching the selected filters.
            </div>
          ) : (
            displayCategories.map((item, idx) => {
              const maxCount = categoryStats[0]?.count || 1;
              const barPercent = Math.max(8, Math.round((item.count / maxCount) * 100));
              const sharePercent = dateFilteredCases.length > 0 ? ((item.count / dateFilteredCases.length) * 100).toFixed(1) : "0.0";
              const isSelected = selectedCategory === item.category;

              return (
                <div
                  key={item.category}
                  onClick={() => handleSelectCategory(isSelected ? "all" : item.category)}
                  className={`p-3 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col gap-2 ${
                    isSelected
                      ? "border-primary bg-primary/5 ring-2 ring-primary/30 shadow-sm"
                      : "border-outline-variant bg-surface hover:bg-surface-container/60"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-surface-container-high text-secondary text-[11px] font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="font-bold text-sm text-on-surface truncate" title={item.category}>
                        {item.category}
                      </span>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded shrink-0"
                        style={{ backgroundColor: item.domain.bg, color: item.domain.color }}
                      >
                        {item.domain.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-bold text-on-surface">
                        {item.count} <span className="text-secondary font-normal">case{item.count === 1 ? "" : "s"}</span>
                      </span>
                      <span className="text-xs font-bold text-primary dark:text-[#8ba2ff] bg-primary/10 px-2 py-0.5 rounded-full">
                        {sharePercent}%
                      </span>
                    </div>
                  </div>

                  {/* Frequency bar */}
                  <div className="w-full bg-surface-container rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${barPercent}%`,
                        backgroundColor: item.domain.color,
                      }}
                    />
                  </div>

                  {/* Grade distribution mini chips */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                    <span className="text-secondary text-[10px] font-bold uppercase tracking-wider mr-1">Grade Levels:</span>
                    {GRADE_LEVELS.map((g) => {
                      const count = item.gradeCounts[g] || 0;
                      if (count === 0) return null;
                      return (
                        <span
                          key={g}
                          className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-container text-on-surface-variant border border-outline-variant"
                        >
                          {g.replace("Grade ", "G")}: <b className="text-on-surface">{count}</b>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Drill-Down Cases Table ── */}
      <div className="bg-surface border border-outline-variant rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-5 border-b border-outline-variant flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-container-low dark:bg-surface-container-high/40">
          <div>
            <h3 className="section-header-h2 m-0 text-base font-bold text-on-surface">
              {selectedCategory === "all" ? "Matching Incident Cases" : `Cases under "${selectedCategory}"`}
            </h3>
            <p className="text-xs text-secondary mt-0.5">
              Showing {tableCases.length} incident record{tableCases.length === 1 ? "" : "s"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/catalog")}
            className="btn-secondary text-xs flex items-center gap-1 font-bold"
          >
            <span className="material-symbols-outlined text-[16px]">folder_open</span>
            <span>Open in Catalog</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low text-secondary text-xs uppercase font-section-header tracking-wider">
                <th className="px-5 py-3 font-semibold">Case ID</th>
                <th className="px-5 py-3 font-semibold">Date</th>
                <th className="px-5 py-3 font-semibold">Student Name</th>
                <th className="px-5 py-3 font-semibold">Grade & Section</th>
                <th className="px-5 py-3 font-semibold">Category</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant text-sm text-on-surface">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-secondary">
                    <span className="material-symbols-outlined animate-spin text-2xl">sync</span>
                    <p className="mt-2 text-xs">Loading case records...</p>
                  </td>
                </tr>
              ) : paginatedCases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-secondary">
                    No cases match the selected category and filter criteria.
                  </td>
                </tr>
              ) : (
                paginatedCases.map((c) => {
                  const studentName = getStudentDisplayName(c);
                  const section = getCaseSection(c);
                  const progressColor =
                    c.progress === "Resolved"
                      ? "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800"
                      : c.progress === "Closed"
                      ? "text-slate-700 bg-slate-100 border-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:border-slate-700"
                      : "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800";

                  return (
                    <tr
                      key={c.id}
                      onClick={() => navigate(`/case/${c.id}`)}
                      className="hover:bg-surface-container-high/40 transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-3 font-data-mono text-xs font-bold text-primary dark:text-[#8ba2ff]">
                        GC-2026-{c.id.toString().padStart(4, "0")}
                      </td>
                      <td className="px-5 py-3 text-xs text-secondary whitespace-nowrap">
                        {c.date || "—"}
                      </td>
                      <td className="px-5 py-3 font-bold text-on-surface">{studentName}</td>
                      <td className="px-5 py-3 text-xs text-secondary whitespace-nowrap">
                        {c.grade} • {section}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded"
                          style={{ backgroundColor: c.domain.bg, color: c.domain.color }}
                        >
                          {c.mappedCategory}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${progressColor}`}>
                          {c.progress || "Pending"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/case/${c.id}`);
                          }}
                          className="text-xs font-bold text-primary dark:text-[#8ba2ff] hover:underline inline-flex items-center gap-1"
                        >
                          <span>View</span>
                          <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {tableCases.length > pageSize && (
          <div className="p-4 border-t border-outline-variant flex items-center justify-between bg-surface-container-low text-xs text-secondary">
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="btn-secondary !py-1 !px-2.5 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="btn-secondary !py-1 !px-2.5 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
