import { useState, useRef, useEffect, useCallback } from "react";

interface DateUnit {
  year: number;
  month: number | null;
  day: number | null;
}

interface SelectionRange {
  granularity: "year" | "month" | "day";
  start: DateUnit;
  end: DateUnit;
}

interface MonthYearRangePickerProps {
  startDate: string;
  endDate: string;
  onRangeChange: (start: string, end: string) => void;
  placeholder?: string;
  className?: string;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const YEARS_PER_PAGE = 12;

function unitKey(u: DateUnit) {
  if (u.day != null) return `d${u.year}-${u.month}-${u.day}`;
  if (u.month != null) return `m${u.year}-${u.month}`;
  return `y${u.year}`;
}

function unitOrder(u: DateUnit) {
  if (u.day != null) return new Date(u.year, u.month!, u.day).getTime();
  if (u.month != null) return u.year * 12 + u.month;
  return u.year;
}

function formatUnit(u: DateUnit) {
  if (u.day != null) return `${MONTHS[u.month!]} ${u.day}, ${u.year}`;
  if (u.month != null) return `${MONTHS[u.month!]} ${u.year}`;
  return `${u.year}`;
}

function isFutureUnit(unit: DateUnit) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const currentDay = today.getDate();

  if (unit.year > currentYear) return true;
  if (unit.year < currentYear) return false;

  if (unit.month === null) {
    return false;
  }

  if (unit.month > currentMonth) return true;
  if (unit.month < currentMonth) return false;

  if (unit.day === null) {
    return false;
  }

  return unit.day > currentDay;
}

function getDayGrid(year: number, month: number) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;

  const cells = [];
  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({ year: prevYear, month: prevMonth, day: daysInPrevMonth - i, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ year, month, day: d, inMonth: true });
  }
  let trailDay = 1;
  while (cells.length < 42) {
    cells.push({ year: nextYear, month: nextMonth, day: trailDay, inMonth: false });
    trailDay++;
  }
  return cells;
}

function parseDatesToSelection(startStr: string, endStr: string): SelectionRange | null {
  if (!startStr || !endStr) return null;
  const startD = new Date(startStr);
  const endD = new Date(endStr);
  if (isNaN(startD.getTime()) || isNaN(endD.getTime())) return null;

  const startY = startD.getFullYear();
  const startM = startD.getMonth();
  const startDay = startD.getDate();

  const endY = endD.getFullYear();
  const endM = endD.getMonth();
  const endDay = endD.getDate();

  // Check if it's a full year range: starts Jan 1 and ends Dec 31
  const isStartJan1 = startM === 0 && startDay === 1;
  const isEndDec31 = endM === 11 && endDay === 31;
  if (isStartJan1 && isEndDec31) {
    return {
      granularity: "year",
      start: { year: startY, month: null, day: null },
      end: { year: endY, month: null, day: null }
    };
  }

  // Check if it's a full month range: starts 1st of start month and ends last of end month
  const isStartFirst = startDay === 1;
  const lastDayOfEndMonth = new Date(endY, endM + 1, 0).getDate();
  const isEndLast = endDay === lastDayOfEndMonth;
  if (isStartFirst && isEndLast) {
    return {
      granularity: "month",
      start: { year: startY, month: startM, day: null },
      end: { year: endY, month: endM, day: null }
    };
  }

  // Otherwise, it's a day range
  return {
    granularity: "day",
    start: { year: startY, month: startM, day: startDay },
    end: { year: endY, month: endM, day: endDay }
  };
}

export default function MonthYearRangePicker({
  startDate,
  endDate,
  onRangeChange,
  placeholder = "Pick a date or range",
  className = "w-[280px]",
}: MonthYearRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"year" | "month" | "day">("month");
  
  const [currentYear, setCurrentYear] = useState(() => {
    if (startDate) {
      const parsed = new Date(startDate);
      if (!isNaN(parsed.getTime())) return parsed.getFullYear();
    }
    return new Date().getFullYear();
  });

  const [currentMonth, setCurrentMonth] = useState(() => {
    if (startDate) {
      const parsed = new Date(startDate);
      if (!isNaN(parsed.getTime())) return parsed.getMonth();
    }
    return new Date().getMonth();
  });

  const [decadeStart, setDecadeStart] = useState(() => {
    const yr = startDate ? new Date(startDate).getFullYear() : new Date().getFullYear();
    return yr - (yr % YEARS_PER_PAGE);
  });

  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState<DateUnit | null>(null);
  const [dragEnd, setDragEnd] = useState<DateUnit | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Sync internal state when props change (especially on reset)
  useEffect(() => {
    const parsed = parseDatesToSelection(startDate, endDate);
    if (JSON.stringify(parsed) !== JSON.stringify(selection)) {
      setSelection(parsed);
      if (parsed) {
        setView(parsed.granularity);
        setCurrentYear(parsed.start.year);
        if (parsed.start.month !== null) {
          setCurrentMonth(parsed.start.month);
        }
        setDecadeStart(parsed.start.year - (parsed.start.year % YEARS_PER_PAGE));
      }
    }
  }, [startDate, endDate]);

  // Finalize drag on mouseup anywhere
  useEffect(() => {
    function onUp() {
      if (dragging && dragStart && dragEnd) {
        const a = unitOrder(dragStart);
        const b = unitOrder(dragEnd);
        const [lo, hi] = a <= b ? [dragStart, dragEnd] : [dragEnd, dragStart];
        
        const newSel: SelectionRange = { granularity: view, start: lo, end: hi };
        setSelection(newSel);

        // Notify parent
        let startStr = "";
        let endStr = "";
        const pad = (num: number) => num.toString().padStart(2, "0");

        if (view === "year") {
          startStr = `${lo.year}-01-01`;
          endStr = `${hi.year}-12-31`;
        } else if (view === "month") {
          startStr = `${lo.year}-${pad(lo.month! + 1)}-01`;
          const lastDay = new Date(hi.year, hi.month! + 1, 0).getDate();
          endStr = `${hi.year}-${pad(hi.month! + 1)}-${pad(lastDay)}`;
        } else if (view === "day") {
          startStr = `${lo.year}-${pad(lo.month! + 1)}-${pad(lo.day!)}`;
          endStr = `${hi.year}-${pad(hi.month! + 1)}-${pad(hi.day!)}`;
        }
        onRangeChange(startStr, endStr);
      }
      setDragging(false);
      setDragStart(null);
      setDragEnd(null);
    }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [dragging, dragStart, dragEnd, view, onRangeChange]);

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

  const handleCellDown = useCallback((unit: DateUnit) => {
    setDragging(true);
    setDragStart(unit);
    setDragEnd(unit);
  }, []);

  const handleCellEnter = useCallback(
    (unit: DateUnit) => {
      if (dragging) {
        if (isFutureUnit(unit)) return;
        setDragEnd(unit);
      }
    },
    [dragging]
  );

  const isNextPageDisabled = () => {
    const today = new Date();
    const currentYr = today.getFullYear();
    const currentMon = today.getMonth();

    if (view === "day") {
      return currentYear > currentYr || (currentYear === currentYr && currentMonth >= currentMon);
    } else if (view === "month") {
      return currentYear >= currentYr;
    } else {
      return decadeStart + YEARS_PER_PAGE > currentYr;
    }
  };

  function resetDrag() {
    setDragging(false);
    setDragStart(null);
    setDragEnd(null);
  }

  // Double-click drills one level deeper without disturbing the selection
  // that the preceding single click already made.
  function handleYearDoubleClick(year: number) {
    resetDrag();
    setCurrentYear(year);
    setView("month");
  }
  function handleMonthDoubleClick(year: number, month: number) {
    resetDrag();
    setCurrentYear(year);
    setCurrentMonth(month);
    setView("day");
  }

  function inSelectionRange(unit: DateUnit) {
    const active =
      dragging && dragStart && dragEnd
        ? { granularity: view, start: dragStart, end: dragEnd }
        : selection;
    if (!active || active.granularity !== view) return { selected: false, isEdge: false };
    const a = unitOrder(active.start);
    const b = unitOrder(active.end);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const o = unitOrder(unit);
    return { selected: o >= lo && o <= hi, isEdge: o === lo || o === hi };
  }

  function goHeaderBack() {
    if (view === "day") {
      setView("month");
    } else if (view === "month") {
      setDecadeStart(currentYear - (currentYear % YEARS_PER_PAGE));
      setView("year");
    }
  }

  function pageStep(dir: number) {
    if (view === "day") {
      let nm = currentMonth + dir;
      let ny = currentYear;
      if (nm > 11) { nm = 0; ny += 1; }
      else if (nm < 0) { nm = 11; ny -= 1; }
      setCurrentMonth(nm);
      setCurrentYear(ny);
    } else if (view === "month") {
      setCurrentYear((y) => y + dir);
    } else {
      setDecadeStart((d) => d + dir * YEARS_PER_PAGE);
    }
  }

  function selectionLabel() {
    if (!selection) return placeholder;
    const { start, end } = selection;
    if (unitOrder(start) === unitOrder(end)) return formatUnit(start);
    return `${formatUnit(start)} – ${formatUnit(end)}`;
  }

  const yearsThisPage = Array.from({ length: YEARS_PER_PAGE }, (_, i) => decadeStart + i);
  const dayGrid = view === "day" ? getDayGrid(currentYear, currentMonth) : null;

  let headerLabel;
  if (view === "day") headerLabel = `${MONTHS_FULL[currentMonth]} ${currentYear}`;
  else if (view === "month") headerLabel = `${currentYear}`;
  else headerLabel = `${yearsThisPage[0]} – ${yearsThisPage[yearsThisPage.length - 1]}`;

  let hint;
  if (view === "day") hint = `Click a day, or drag across several. Click "${headerLabel}" above to zoom out.`;
  else if (view === "month") hint = `Click or drag months. Double-click to see days. Click "${headerLabel}" to zoom out to years.`;
  else hint = `Click or drag years. Double-click to see months.`;

  return (
    <div ref={containerRef} className="relative shrink-0 select-none">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center h-[38px] rounded-lg border text-sm transition-all duration-500 ease-in-out text-left select-none relative overflow-hidden pl-3.5 pr-8 ${
          open 
            ? "bg-surface-container border-primary ring-2 ring-primary/20 shadow-sm" 
            : "bg-surface border-gray-300 dark:border-outline-variant hover:border-primary/60 hover:bg-surface-container"
        } ${className}`}
      >
        <div className="flex items-center gap-1.5 min-w-0 w-full transition-colors duration-500">
          <span className="material-symbols-outlined text-secondary shrink-0 transition-colors duration-500" style={{ fontSize: 18 }}>calendar_today</span>
          
          <div className="flex items-center gap-1 min-w-0 transition-opacity duration-500 opacity-100 w-auto">
            <span className="text-secondary text-[11px] font-bold uppercase tracking-wider shrink-0 transition-colors duration-500">Range:</span>
            <span className={`truncate text-sm ${selection ? "font-bold text-on-surface" : "text-secondary font-normal"} transition-colors duration-500`}>
              {selectionLabel()}
            </span>
          </div>
        </div>

        {open && (
          <span className="material-symbols-outlined text-secondary opacity-60 shrink-0 absolute right-2.5 transition-colors duration-500" style={{ fontSize: 16 }}>expand_more</span>
        )}
      </button>

      {selection && !open && (
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

      {/* Popover */}
      {open && (
        <div className="absolute z-30 mt-2 p-5 bg-surface border border-outline-variant rounded-xl shadow-lg w-[320px] top-full left-0 filter-dropdown-enter">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => pageStep(-1)}
              className="w-8 h-8 rounded-lg border border-outline-variant flex items-center justify-center hover:bg-surface-container text-secondary hover:text-on-surface transition-colors duration-500"
              aria-label="Previous"
            >
              <span className="material-symbols-outlined transition-colors duration-500" style={{ fontSize: 16 }}>chevron_left</span>
            </button>

            <button
              type="button"
              onClick={goHeaderBack}
              disabled={view === "year"}
              className={`rounded-lg px-2 py-1 text-sm font-bold text-on-surface ${
                view === "year" ? "cursor-default text-secondary" : "hover:bg-surface-container"
              }`}
              title={
                view === "day" ? "Back to months" : view === "month" ? "View all years" : undefined
              }
            >
              {headerLabel}
            </button>

            <button
              type="button"
              onClick={() => pageStep(1)}
              disabled={isNextPageDisabled()}
              className={`w-8 h-8 rounded-lg border border-outline-variant flex items-center justify-center text-secondary transition-colors duration-500 ${
                isNextPageDisabled() ? "opacity-20 cursor-not-allowed bg-transparent" : "hover:bg-surface-container hover:text-on-surface"
              }`}
              aria-label="Next"
            >
              <span className="material-symbols-outlined transition-colors duration-500" style={{ fontSize: 16 }}>chevron_right</span>
            </button>
          </div>

          {/* Weekday row, day view only */}
          {view === "day" && (
            <div className="mb-1 grid grid-cols-7 text-center">
              {WEEKDAYS.map((w) => (
                <div key={w} className="text-center text-[10px] font-bold text-secondary py-1">
                  {w}
                </div>
              ))}
            </div>
          )}

          {/* Grid */}
          <div className={`grid gap-2 ${view === "day" ? "grid-cols-7 gap-y-1" : "grid-cols-4"}`}>
            {view === "month" &&
              MONTHS.map((label, idx) => {
                const unit = { year: currentYear, month: idx, day: null };
                const { selected, isEdge } = inSelectionRange(unit);
                const disabled = isFutureUnit(unit);
                return (
                  <Cell
                    key={unitKey(unit)}
                    label={label}
                    selected={selected}
                    isEdge={isEdge}
                    disabled={disabled}
                    onMouseDown={() => !disabled && handleCellDown(unit)}
                    onMouseEnter={() => !disabled && handleCellEnter(unit)}
                    onDoubleClick={() => !disabled && handleMonthDoubleClick(currentYear, idx)}
                  />
                );
              })}

            {view === "year" &&
              yearsThisPage.map((y) => {
                const unit = { year: y, month: null, day: null };
                const { selected, isEdge } = inSelectionRange(unit);
                const disabled = isFutureUnit(unit);
                return (
                  <Cell
                    key={unitKey(unit)}
                    label={y.toString()}
                    selected={selected}
                    isEdge={isEdge}
                    disabled={disabled}
                    onMouseDown={() => !disabled && handleCellDown(unit)}
                    onMouseEnter={() => !disabled && handleCellEnter(unit)}
                    onDoubleClick={() => !disabled && handleYearDoubleClick(y)}
                  />
                );
              })}

            {view === "day" &&
              dayGrid!.map((c) => {
                const unit = { year: c.year, month: c.month, day: c.day };
                const { selected, isEdge } = inSelectionRange(unit);
                const disabled = isFutureUnit(unit);
                return (
                  <Cell
                    key={unitKey(unit)}
                    label={c.day.toString()}
                    selected={selected}
                    isEdge={isEdge}
                    faded={!c.inMonth}
                    small
                    disabled={disabled}
                    onMouseDown={() => !disabled && handleCellDown(unit)}
                    onMouseEnter={() => !disabled && handleCellEnter(unit)}
                  />
                );
              })}
          </div>

          {/* Footer hint */}
          <div className="mt-4 flex flex-col gap-2 border-t border-outline-variant/40 pt-3">
            <span className="text-[10px] text-secondary leading-tight">{hint}</span>
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

interface CellProps {
  label: string;
  selected: boolean;
  isEdge: boolean;
  faded?: boolean;
  small?: boolean;
  disabled?: boolean;
  onMouseDown: () => void;
  onMouseEnter: () => void;
  onDoubleClick?: () => void;
}

function Cell({ label, selected, isEdge, faded, small, disabled, onMouseDown, onMouseEnter, onDoubleClick }: CellProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault();
        if (!disabled) onMouseDown();
      }}
      onMouseEnter={() => {
        if (!disabled) onMouseEnter();
      }}
      onDoubleClick={() => {
        if (!disabled) onDoubleClick?.();
      }}
      onDragStart={(e) => e.preventDefault()}
      className={`rounded-lg font-medium transition-colors duration-100 w-full flex items-center justify-center
        ${small ? "h-8 text-xs" : "h-10 text-sm"}
        ${
          disabled
            ? "text-secondary opacity-20 cursor-not-allowed border border-transparent"
            : isEdge
            ? "border border-primary text-primary font-bold"
            : selected
            ? "text-primary border border-transparent font-semibold"
            : faded
            ? "text-secondary opacity-30 hover:bg-surface-container border border-transparent"
            : "text-on-surface hover:bg-surface-container border border-transparent"
        }`}
      style={{
        backgroundColor: (!disabled && (isEdge || selected))
          ? "color-mix(in srgb, var(--color-primary) 12%, transparent)"
          : undefined
      }}
    >
      {label}
    </button>
  );
}
