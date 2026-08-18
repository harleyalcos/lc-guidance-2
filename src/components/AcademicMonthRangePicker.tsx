import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";

interface DateUnit {
  year: number;
  month: number;
}

interface SelectionRange {
  start: DateUnit;
  end: DateUnit;
}

interface AcademicMonthRangePickerProps {
  allYears?: string[];
  schoolYear: string | null;
  onSelectSchoolYear?: (year: string) => void;
  isLoadingYears?: boolean;
  startDate: string;
  endDate: string;
  onRangeChange: (start: string, end: string) => void;
  placeholder?: string;
  className?: string;
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function unitOrder(u: DateUnit) {
  return u.year * 12 + u.month;
}

function formatUnit(u: DateUnit) {
  return `${MONTHS_SHORT[u.month]} ${u.year}`;
}

export default function AcademicMonthRangePicker({
  allYears = [],
  schoolYear,
  onSelectSchoolYear,
  startDate,
  endDate,
  onRangeChange,
  placeholder = "All Records",
  className = "w-[290px]",
}: AcademicMonthRangePickerProps) {
  const [open, setOpen] = useState(false);

  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [rangeAnchor, setRangeAnchor] = useState<DateUnit | null>(null);
  const [hoveredUnit, setHoveredUnit] = useState<DateUnit | null>(null);

  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState<DateUnit | null>(null);
  const [dragEnd, setDragEnd] = useState<DateUnit | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const yearSectionRefs = useRef<{ [year: number]: HTMLDivElement | null }>({});

  const currentCalendarYear = new Date().getFullYear();

  // Scroll only the inner container of the modal to a specific year
  const scrollToYear = useCallback((yr: number) => {
    const el = yearSectionRefs.current[yr];
    const container = scrollContainerRef.current;
    if (el && container) {
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const scrollOffset = elRect.top - containerRect.top + container.scrollTop;
      container.scrollTo({ top: scrollOffset, behavior: "smooth" });
    }
  }, []);

  // Auto-scroll to selected year or current year when opening popover
  useEffect(() => {
    if (open) {
      const targetYear = selection
        ? selection.start.year
        : schoolYear && schoolYear !== "all"
        ? parseInt(schoolYear, 10) || currentCalendarYear
        : currentCalendarYear;

      const timer = window.setTimeout(() => {
        scrollToYear(targetYear);
      }, 50);
      return () => window.clearTimeout(timer);
    }
  }, [open, selection, schoolYear, currentCalendarYear, scrollToYear]);

  // Compute available years list (sorted ascending: earliest at top, latest at bottom)
  const availableYears = useMemo(() => {
    const rawYears = [...allYears];
    if (schoolYear && schoolYear !== "all") rawYears.push(schoolYear);
    rawYears.push((currentCalendarYear - 1).toString(), currentCalendarYear.toString());

    const numYears = rawYears
      .map((y) => parseInt(y, 10))
      .filter((y) => !isNaN(y) && y > 2000 && y < 2100);

    // Sort ascending: earliest year first, latest year last
    const uniqueSorted = Array.from(new Set(numYears)).sort((a, b) => a - b);
    return uniqueSorted.length > 0 ? uniqueSorted : [currentCalendarYear];
  }, [allYears, schoolYear, currentCalendarYear]);

  // Parse start/end date props to selection
  useEffect(() => {
    if (!startDate || !endDate) {
      setSelection(null);
      return;
    }
    const startD = new Date(startDate);
    const endD = new Date(endDate);
    if (isNaN(startD.getTime()) || isNaN(endD.getTime())) {
      setSelection(null);
      return;
    }
    setSelection({
      start: { year: startD.getFullYear(), month: startD.getMonth() },
      end: { year: endD.getFullYear(), month: endD.getMonth() },
    });
  }, [startDate, endDate]);

  const [activeMonths, setActiveMonths] = useState<DateUnit[]>([]);

  // Fetch all active months across all cases
  useEffect(() => {
    async function fetchMonths() {
      try {
        const months = await invoke<string[]>("get_active_months", { schoolYear: "all" });
        const parsed: DateUnit[] = months
          .map((m) => {
            const [y, mm] = m.split("-");
            return {
              year: parseInt(y, 10),
              month: parseInt(mm, 10) - 1,
            };
          })
          .filter((u) => !isNaN(u.year) && !isNaN(u.month));
        setActiveMonths(parsed);
      } catch (error) {
        setActiveMonths([]);
      }
    }

    fetchMonths();
  }, []);

  const emitRange = useCallback((lo: DateUnit, hi: DateUnit) => {
    const newSel: SelectionRange = { start: lo, end: hi };
    setSelection(newSel);

    const pad = (num: number) => num.toString().padStart(2, "0");
    const startStr = `${lo.year}-${pad(lo.month + 1)}-01`;
    const lastDay = new Date(hi.year, hi.month + 1, 0).getDate();
    const endStr = `${hi.year}-${pad(hi.month + 1)}-${pad(lastDay)}`;

    onRangeChange(startStr, endStr);
  }, [onRangeChange]);

  // Finalize drag on mouseup anywhere
  useEffect(() => {
    function onUp() {
      if (dragging && dragStart && dragEnd) {
        const a = unitOrder(dragStart);
        const b = unitOrder(dragEnd);
        const [lo, hi] = a <= b ? [dragStart, dragEnd] : [dragEnd, dragStart];
        emitRange(lo, hi);
        setRangeAnchor(null);
      }
      setDragging(false);
      setDragStart(null);
      setDragEnd(null);
    }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [dragging, dragStart, dragEnd, emitRange]);

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setRangeAnchor(null);
      }
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Handle clicking a month
  const handleCellClick = useCallback((unit: DateUnit) => {
    if (!rangeAnchor) {
      // First click: select single month and start range anchor
      emitRange(unit, unit);
      setRangeAnchor(unit);
    } else {
      // Second click: finalize range between anchor and clicked unit
      const a = unitOrder(rangeAnchor);
      const b = unitOrder(unit);
      const [lo, hi] = a <= b ? [rangeAnchor, unit] : [unit, rangeAnchor];
      emitRange(lo, hi);
      setRangeAnchor(null);
    }
  }, [rangeAnchor, emitRange]);

  const handleCellDown = useCallback((unit: DateUnit) => {
    setDragging(true);
    setDragStart(unit);
    setDragEnd(unit);
  }, []);

  const handleCellEnter = useCallback(
    (unit: DateUnit) => {
      setHoveredUnit(unit);
      if (dragging) {
        setDragEnd(unit);
      }
    },
    [dragging]
  );

  // Select full year
  const handleSelectFullYear = useCallback((yr: number) => {
    const start: DateUnit = { year: yr, month: 0 };
    const end: DateUnit = { year: yr, month: 11 };
    emitRange(start, end);
    setRangeAnchor(null);
  }, [emitRange]);

  function inSelectionRange(unit: DateUnit) {
    const o = unitOrder(unit);

    if (dragging && dragStart && dragEnd) {
      const a = unitOrder(dragStart);
      const b = unitOrder(dragEnd);
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      return { 
        selected: o >= lo && o <= hi, 
        isEdge: o === lo || o === hi,
        isStart: o === lo,
        isEnd: o === hi,
      };
    }

    if (rangeAnchor && hoveredUnit) {
      const a = unitOrder(rangeAnchor);
      const b = unitOrder(hoveredUnit);
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      return { 
        selected: o >= lo && o <= hi, 
        isEdge: o === a || o === b,
        isStart: o === lo,
        isEnd: o === hi,
      };
    }

    if (selection) {
      const a = unitOrder(selection.start);
      const b = unitOrder(selection.end);
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      return { 
        selected: o >= lo && o <= hi, 
        isEdge: o === lo || o === hi,
        isStart: o === lo,
        isEnd: o === hi,
      };
    }

    return { selected: false, isEdge: false, isStart: false, isEnd: false };
  }

  function selectionLabel() {
    if (selection) {
      const { start, end } = selection;
      if (unitOrder(start) === unitOrder(end)) return `${formatUnit(start)}`;
      if (start.year === end.year && start.month === 0 && end.month === 11) {
        return `${start.year}`;
      }
      return `${formatUnit(start)} – ${formatUnit(end)}`;
    }
    if (!schoolYear || schoolYear === "all") return placeholder;
    return `${schoolYear}`;
  }

  return (
    <div ref={containerRef} className="relative shrink-0 select-none">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);
          setRangeAnchor(null);
        }}
        className={`flex items-center h-[38px] rounded-lg border text-sm transition-all duration-300 ease-in-out text-left select-none relative overflow-hidden pl-3.5 pr-8 ${
          open
            ? "bg-surface-container border-primary ring-2 ring-primary/20 shadow-sm"
            : "bg-surface border-outline-variant hover:border-primary/60 hover:bg-surface-container"
        } ${className}`}
      >
        <div className="flex items-center gap-1.5 min-w-0 w-full">
          <span
            className="material-symbols-outlined text-secondary shrink-0"
            style={{ fontSize: 18 }}
          >
            calendar_month
          </span>

          <div className="flex items-center gap-1 min-w-0 w-auto">
            <span className="text-secondary text-[11px] font-bold uppercase tracking-wider shrink-0">
              Period:
            </span>
            <span
              className={`truncate text-sm ${
                selection || (schoolYear && schoolYear !== "all")
                  ? "font-bold text-on-surface"
                  : "text-secondary font-normal"
              }`}
            >
              {selectionLabel()}
            </span>
          </div>
        </div>

        <span
          className={`material-symbols-outlined text-secondary opacity-60 shrink-0 absolute right-2.5 transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
          style={{ fontSize: 16 }}
        >
          expand_more
        </span>
      </button>

      {/* Clear Button */}
      {selection && !open && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelection(null);
            setRangeAnchor(null);
            onRangeChange("", "");
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-secondary hover:text-on-surface hover:bg-surface-container-high rounded-full w-5 h-5 flex items-center justify-center transition-colors z-10"
          title="Clear period filter"
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "14px" }}
          >
            close
          </span>
        </button>
      )}

      {/* Scrollable Range Picker Popover */}
      {open && (
        <div className="absolute z-30 mt-2 p-3 bg-surface border border-outline-variant rounded-2xl shadow-xl w-[360px] sm:w-[380px] top-full right-0 filter-dropdown-enter">
          {/* Header */}
          <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-outline-variant px-1">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-primary text-[18px]">
                date_range
              </span>
              <span className="text-xs font-bold text-on-surface">
                Select Month Range
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                onSelectSchoolYear?.("all");
                setSelection(null);
                setRangeAnchor(null);
                onRangeChange("", "");
              }}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors font-medium ${
                !selection && (!schoolYear || schoolYear === "all")
                  ? "bg-primary text-white font-bold"
                  : "text-secondary hover:text-on-surface hover:bg-surface-container"
              }`}
            >
              All Records
            </button>
          </div>

          {/* Quick Year Jump Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 px-1 scrollbar-none">
            <span className="text-[10px] uppercase font-bold text-secondary tracking-wider shrink-0 mr-0.5">
              Jump:
            </span>
            {availableYears.map((yr) => {
              const isYrActive = selection && (selection.start.year === yr || selection.end.year === yr);
              return (
                <button
                  key={yr}
                  type="button"
                  onClick={() => scrollToYear(yr)}
                  className={`text-xs px-2.5 py-0.5 rounded-full border transition-all shrink-0 ${
                    isYrActive
                      ? "border-primary bg-primary/10 text-primary font-bold"
                      : "border-outline-variant text-secondary hover:text-on-surface hover:bg-surface-container font-medium"
                  }`}
                >
                  {yr}
                </button>
              );
            })}
          </div>

          {/* Continuous Scrollable Months List (Oldest to Newest) */}
          <div
            ref={scrollContainerRef}
            className="flex flex-col gap-3.5 max-h-[390px] overflow-y-auto pr-1 py-1 custom-scrollbar"
          >
            {availableYears.map((yr) => {
              const months: DateUnit[] = Array.from({ length: 12 }, (_, i) => ({
                year: yr,
                month: i,
              }));

              const isFullYearSelected =
                selection &&
                selection.start.year === yr &&
                selection.start.month === 0 &&
                selection.end.year === yr &&
                selection.end.month === 11;

              return (
                <div
                  key={yr}
                  ref={(el) => {
                    yearSectionRefs.current[yr] = el;
                  }}
                  className="rounded-xl border border-outline-variant/70 bg-surface-container-lowest/50 overflow-hidden shrink-0"
                >
                  {/* Sticky Section Header */}
                  <div className="sticky top-0 bg-surface/95 backdrop-blur-sm z-10 py-1.5 px-3 flex items-center justify-between border-b border-outline-variant/60">
                    <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[15px] text-primary">
                        calendar_today
                      </span>
                      <span>{yr}</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => handleSelectFullYear(yr)}
                      className={`text-[11px] px-2.5 py-0.5 rounded-md border transition-all duration-500 ease-out font-semibold shadow-2xs cursor-pointer ${
                        isFullYearSelected
                          ? "bg-primary text-white border-primary font-bold shadow-xs hover:bg-primary/90"
                          : "border-primary text-primary bg-primary/5 hover:bg-primary hover:text-white hover:border-primary hover:shadow-xs"
                      }`}
                    >
                      Whole {yr}
                    </button>
                  </div>

                  {/* 12-Month Grid (3 rows x 4 columns) */}
                  <div className="grid grid-cols-4 gap-1.5 p-2.5">
                    {months.map((unit) => {
                      const { selected, isEdge, isStart, isEnd } = inSelectionRange(unit);
                      const label = MONTHS_SHORT[unit.month];
                      const hasCases = activeMonths.some(
                        (m) => m.year === unit.year && m.month === unit.month
                      );

                      return (
                        <button
                          key={`${unit.year}-${unit.month}`}
                          type="button"
                          onClick={() => handleCellClick(unit)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleCellDown(unit);
                          }}
                          onMouseEnter={() => handleCellEnter(unit)}
                          className={`h-9 text-xs rounded-lg font-medium transition-all duration-100 w-full flex flex-col items-center justify-center border relative shrink-0 ${
                            isEdge
                              ? "bg-primary text-white border-primary font-bold shadow-sm"
                              : selected
                              ? "bg-primary/15 text-primary border-primary/20 font-semibold"
                              : "text-on-surface border-transparent hover:bg-surface-container hover:border-outline-variant/60"
                          } ${isStart ? "ring-1 ring-primary ring-offset-1" : ""} ${
                            isEnd ? "ring-1 ring-primary ring-offset-1" : ""
                          }`}
                        >
                          <span>{label}</span>
                          {hasCases && !isEdge && (
                            <span className="w-1 h-1 rounded-full bg-primary absolute bottom-1" />
                          )}
                          {hasCases && isEdge && (
                            <span className="w-1 h-1 rounded-full bg-white absolute bottom-1" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer with Selection Status & Actions */}
          <div className="mt-2.5 flex items-center justify-between border-t border-outline-variant pt-2.5 px-1">
            <div className="text-xs text-secondary truncate max-w-[200px]">
              {rangeAnchor ? (
                <span className="text-primary font-semibold">
                  From {formatUnit(rangeAnchor)} → Click end month
                </span>
              ) : selection ? (
                <span>
                  <strong className="text-on-surface font-semibold">
                    {selectionLabel()}
                  </strong>
                </span>
              ) : (
                <span>All records displayed</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {selection && (
                <button
                  type="button"
                  onClick={() => {
                    setSelection(null);
                    setRangeAnchor(null);
                    onRangeChange("", "");
                  }}
                  className="text-xs font-semibold text-secondary hover:text-on-surface transition-colors px-2 py-1 rounded"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-primary text-xs !py-1 !px-3"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
