import { useState, useRef, useEffect, useCallback } from "react";
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
  isLoadingYears = false,
  startDate,
  endDate,
  onRangeChange,
  placeholder = "All Records",
  className = "w-[240px]",
}: AcademicMonthRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"year" | "month">("year");

  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState<DateUnit | null>(null);
  const [dragEnd, setDragEnd] = useState<DateUnit | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

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

  // Fetch active months from database when schoolYear changes
  useEffect(() => {
    if (!schoolYear || schoolYear === "all") {
      setActiveMonths([]);
      return;
    }

    async function fetchMonths() {
      try {
        const months = await invoke<string[]>("get_active_months", { schoolYear });
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
        console.error("Failed to fetch active months", error);
        setActiveMonths([]);
      }
    }

    fetchMonths();
  }, [schoolYear]);

  // Finalize drag on mouseup anywhere
  useEffect(() => {
    function onUp() {
      if (dragging && dragStart && dragEnd) {
        const a = unitOrder(dragStart);
        const b = unitOrder(dragEnd);
        const [lo, hi] = a <= b ? [dragStart, dragEnd] : [dragEnd, dragStart];

        const newSel: SelectionRange = { start: lo, end: hi };
        setSelection(newSel);

        const pad = (num: number) => num.toString().padStart(2, "0");
        const startStr = `${lo.year}-${pad(lo.month + 1)}-01`;
        const lastDay = new Date(hi.year, hi.month + 1, 0).getDate();
        const endStr = `${hi.year}-${pad(hi.month + 1)}-${pad(lastDay)}`;

        onRangeChange(startStr, endStr);
      }
      setDragging(false);
      setDragStart(null);
      setDragEnd(null);
    }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [dragging, dragStart, dragEnd, onRangeChange]);

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Clear date range when schoolYear changes
  const prevSchoolYearRef = useRef(schoolYear);
  useEffect(() => {
    if (prevSchoolYearRef.current !== schoolYear) {
      prevSchoolYearRef.current = schoolYear;
      onRangeChange("", "");
    }
  }, [schoolYear, onRangeChange]);

  const handleCellDown = useCallback((unit: DateUnit) => {
    setDragging(true);
    setDragStart(unit);
    setDragEnd(unit);
  }, []);

  const handleCellEnter = useCallback(
    (unit: DateUnit) => {
      if (dragging) {
        setDragEnd(unit);
      }
    },
    [dragging]
  );

  function inSelectionRange(unit: DateUnit) {
    const active =
      dragging && dragStart && dragEnd
        ? { start: dragStart, end: dragEnd }
        : selection;
    if (!active) return { selected: false, isEdge: false };
    const a = unitOrder(active.start);
    const b = unitOrder(active.end);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const o = unitOrder(unit);
    return { selected: o >= lo && o <= hi, isEdge: o === lo || o === hi };
  }

  function selectionLabel() {
    if (!schoolYear || schoolYear === "all") return placeholder;
    if (!selection) return `AY ${schoolYear}`;
    const { start, end } = selection;
    if (unitOrder(start) === unitOrder(end)) return `${formatUnit(start)} (${schoolYear})`;
    return `${formatUnit(start)} – ${formatUnit(end)}`;
  }

  const yearOptions = Array.from(new Set([...allYears, "all"]));

  return (
    <div ref={containerRef} className="relative shrink-0 select-none">
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => {
            const next = !prev;
            if (next) setStep("year");
            return next;
          });
        }}
        className={`flex items-center h-[38px] rounded-lg border text-sm transition-all duration-300 ease-in-out text-left select-none relative overflow-hidden pl-3.5 pr-8 ${
          open
            ? "bg-surface-container border-primary ring-2 ring-primary/20 shadow-sm"
            : "bg-surface border-gray-300 dark:border-outline-variant hover:border-primary/60 hover:bg-surface-container"
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
              Range:
            </span>
            <span
              className={`truncate text-sm ${
                schoolYear && schoolYear !== "all"
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

      {selection && !open && schoolYear !== "all" && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelection(null);
            onRangeChange("", "");
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-secondary hover:text-on-surface hover:bg-surface-container-high rounded-full w-5 h-5 flex items-center justify-center transition-colors z-10"
          title="Clear month range"
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "14px" }}
          >
            close
          </span>
        </button>
      )}

      {open && (
        <div className="absolute z-30 mt-2 p-4 bg-surface border border-outline-variant rounded-xl shadow-lg w-[300px] sm:w-[320px] top-full left-0 filter-dropdown-enter">
          {step === "year" ? (
            <div>
              <div className="text-xs font-bold text-secondary uppercase tracking-wider mb-3 px-1">
                Select Academic Year
              </div>

              {isLoadingYears ? (
                <div className="py-6 text-center text-sm text-secondary flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined animate-spin text-[18px]">
                    sync
                  </span>
                  <span>Loading years...</span>
                </div>
              ) : (
                <div className="flex flex-col gap-1 max-h-[220px] overflow-y-auto pr-1">
                  {yearOptions.map((yr) => {
                    const isSelected = yr === schoolYear;
                    const label = yr === "all" ? "All Years (All Records)" : `AY ${yr}`;
                    return (
                      <button
                        key={yr}
                        type="button"
                        onClick={() => {
                          onSelectSchoolYear?.(yr);
                          if (yr === "all") {
                            onRangeChange("", "");
                            setOpen(false);
                          } else {
                            setStep("month");
                          }
                        }}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
                          isSelected
                            ? "bg-primary/10 text-primary border border-primary/30 font-bold"
                            : "text-on-surface hover:bg-surface-container border border-transparent font-medium"
                        }`}
                      >
                        <span>{label}</span>
                        {isSelected && (
                          <span
                            className="material-symbols-outlined text-primary"
                            style={{ fontSize: 18 }}
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
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3 border-b border-outline-variant/40 pb-2.5">
                <button
                  type="button"
                  onClick={() => setStep("year")}
                  className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors"
                  title="Change Academic Year"
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 16 }}
                  >
                    arrow_back
                  </span>
                  <span>AY {schoolYear}</span>
                </button>
                <span className="text-[10px] text-secondary font-bold uppercase tracking-wider">
                  Select Months
                </span>
              </div>

              {activeMonths.length === 0 ? (
                <div className="py-6 px-4 text-center border border-dashed border-outline-variant rounded-lg bg-surface-container-lowest my-2">
                  <span className="material-symbols-outlined text-secondary opacity-40 mb-2 text-3xl">
                    event_busy
                  </span>
                  <p className="text-sm font-medium text-on-surface">
                    No cases recorded yet
                  </p>
                  <p className="text-xs text-secondary mt-1">
                    Months will appear here once cases are filed for AY {schoolYear}.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2 my-2">
                  {activeMonths.map((unit) => {
                    const { selected, isEdge } = inSelectionRange(unit);
                    const label = MONTHS_SHORT[unit.month];

                    return (
                      <button
                        key={`${unit.year}-${unit.month}`}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleCellDown(unit);
                        }}
                        onMouseEnter={() => handleCellEnter(unit)}
                        className={`h-10 text-sm rounded-lg font-medium transition-colors duration-100 w-full flex flex-col items-center justify-center border border-transparent ${
                          isEdge
                            ? "border-primary text-primary font-bold"
                            : selected
                            ? "text-primary font-semibold"
                            : "text-on-surface hover:bg-surface-container"
                        }`}
                        style={{
                          backgroundColor:
                            isEdge || selected
                              ? "color-mix(in srgb, var(--color-primary) 12%, transparent)"
                              : undefined,
                        }}
                      >
                        <span>{label}</span>
                        <span className="text-[9px] opacity-60 leading-none mt-0.5">
                          {unit.year}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-3 flex flex-col gap-2 border-t border-outline-variant/40 pt-2.5">
                <span className="text-[10px] text-secondary leading-tight">
                  Click or drag to select a range of months.
                </span>
                {selection && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelection(null);
                      onRangeChange("", "");
                    }}
                    className="self-end text-xs font-bold text-primary hover:text-primary/80 transition-colors"
                  >
                    Clear Month Range
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
