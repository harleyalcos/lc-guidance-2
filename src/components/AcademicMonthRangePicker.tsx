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
  startDate: string;
  endDate: string;
  onRangeChange: (start: string, end: string) => void;
  schoolYear: string | null; // e.g. "2025-2026" or "all"
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
  startDate,
  endDate,
  onRangeChange,
  schoolYear,
  placeholder = "Pick a range",
  className = "w-[280px]",
}: AcademicMonthRangePickerProps) {
  const [open, setOpen] = useState(false);
  
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState<DateUnit | null>(null);
  const [dragEnd, setDragEnd] = useState<DateUnit | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const isDisabled = !schoolYear || schoolYear === "all";

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
      end: { year: endD.getFullYear(), month: endD.getMonth() }
    });
  }, [startDate, endDate]);

  const [activeMonths, setActiveMonths] = useState<DateUnit[]>([]);

  // Fetch active months from database
  useEffect(() => {
    if (isDisabled || !schoolYear) {
      setActiveMonths([]);
      return;
    }

    async function fetchMonths() {
      try {
        const months = await invoke<string[]>("get_active_months", { schoolYear });
        const parsed: DateUnit[] = months.map(m => {
          const [y, mm] = m.split("-");
          return {
            year: parseInt(y, 10),
            // month from string is 01-12, DateUnit month is 0-11
            month: parseInt(mm, 10) - 1
          };
        }).filter(u => !isNaN(u.year) && !isNaN(u.month));
        setActiveMonths(parsed);
      } catch (error) {
        console.error("Failed to fetch active months", error);
        setActiveMonths([]);
      }
    }

    fetchMonths();
  }, [schoolYear, isDisabled]);

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
  useEffect(() => {
    if (schoolYear && startDate && endDate) {
       // if we changed school year, we should just reset the range if it doesn't match the new year.
       // for simplicity, let's just clear the range whenever the school year changes.
       onRangeChange("", "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolYear]);

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
    if (isDisabled) return placeholder;
    if (!selection) return placeholder;
    const { start, end } = selection;
    if (unitOrder(start) === unitOrder(end)) return formatUnit(start);
    return `${formatUnit(start)} – ${formatUnit(end)}`;
  }

  return (
    <div ref={containerRef} className="relative shrink-0 select-none">
      <button
        type="button"
        disabled={isDisabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center h-[38px] rounded-lg border text-sm transition-all duration-500 ease-in-out text-left select-none relative overflow-hidden pl-3.5 pr-8 ${
          isDisabled 
            ? "opacity-50 cursor-not-allowed bg-surface border-outline-variant"
            : open 
              ? "bg-surface-container border-primary ring-2 ring-primary/20 shadow-sm" 
              : "bg-surface border-gray-300 dark:border-outline-variant hover:border-primary/60 hover:bg-surface-container"
        } ${className}`}
      >
        <div className="flex items-center gap-1.5 min-w-0 w-full transition-colors duration-500">
          <span className="material-symbols-outlined text-secondary shrink-0 transition-colors duration-500" style={{ fontSize: 18 }}>calendar_month</span>
          
          <div className="flex items-center gap-1 min-w-0 transition-opacity duration-500 opacity-100 w-auto">
            <span className="text-secondary text-[11px] font-bold uppercase tracking-wider shrink-0 transition-colors duration-500">Range:</span>
            <span className={`truncate text-sm ${selection && !isDisabled ? "font-bold text-on-surface" : "text-secondary font-normal"} transition-colors duration-500`}>
              {selectionLabel()}
            </span>
          </div>
        </div>

        {open && (
          <span className="material-symbols-outlined text-secondary opacity-60 shrink-0 absolute right-2.5 transition-colors duration-500" style={{ fontSize: 16 }}>expand_more</span>
        )}
      </button>

      {selection && !open && !isDisabled && (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setSelection(null);
            onRangeChange("", "");
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-secondary hover:text-on-surface hover:bg-surface-container-high rounded-full w-5 h-5 flex items-center justify-center transition-colors duration-500 z-10"
          title="Clear range"
        >
          <span className="material-symbols-outlined transition-colors duration-500" style={{ fontSize: '14px' }}>close</span>
        </button>
      )}

      {open && !isDisabled && (
        <div className="absolute z-30 mt-2 p-5 bg-surface border border-outline-variant rounded-xl shadow-lg w-[320px] top-full left-0 filter-dropdown-enter">
          <div className="mb-4 text-center font-bold text-on-surface text-sm">
            Academic Year {schoolYear}
          </div>

          {activeMonths.length === 0 ? (
            <div className="py-6 px-4 text-center border border-dashed border-outline-variant rounded-lg bg-surface-container-lowest mt-2">
              <span className="material-symbols-outlined text-secondary opacity-40 mb-2 text-3xl">event_busy</span>
              <p className="text-sm font-medium text-on-surface">No cases recorded yet</p>
              <p className="text-xs text-secondary mt-1">Months will appear here once cases are filed for this school year.</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
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
                    className={`h-10 text-sm rounded-lg font-medium transition-colors duration-100 w-full flex flex-col items-center justify-center border border-transparent
                      ${
                        isEdge
                          ? "border-primary text-primary font-bold"
                          : selected
                          ? "text-primary font-semibold"
                          : "text-on-surface hover:bg-surface-container"
                      }`}
                    style={{
                      backgroundColor: (isEdge || selected)
                        ? "color-mix(in srgb, var(--color-primary) 12%, transparent)"
                        : undefined
                    }}
                  >
                    <span>{label}</span>
                    <span className="text-[9px] opacity-60 leading-none mt-0.5">{unit.year}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2 border-t border-outline-variant/40 pt-3">
            <span className="text-[10px] text-secondary leading-tight">
              Click or drag to select a range of months within this academic year.
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
                Clear Range
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
