import { useState, useEffect, useRef } from "react";

interface ProgressDropdownProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

const PROGRESS_OPTIONS = [
  { value: "Pending", label: "Pending", dot: "#f59e0b", bg: "#fef3c7", text: "#92400e" },
  { value: "Resolved", label: "Resolved", dot: "#22c55e", bg: "#dcfce7", text: "#166534" },
  { value: "Closed", label: "Closed", dot: "#9ca3af", bg: "#f3f4f6", text: "#374151" },
  { value: "Reprimand", label: "Reprimand", dot: "#ef4444", bg: "#fee2e2", text: "#991b1b" },
];

export function ProgressDropdown({ value, onChange, disabled = false, className = "" }: ProgressDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const currentOption =
    PROGRESS_OPTIONS.find((opt) => opt.value.toLowerCase() === (value || "").toLowerCase()) ||
    PROGRESS_OPTIONS[0];

  return (
    <div className={`relative w-full ${className}`} ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`group flex w-full h-[38px] items-center justify-between gap-2 rounded-lg border bg-white dark:bg-surface px-3 py-1.5 text-left text-xs font-semibold transition-all duration-200 cursor-pointer select-none ${
          isOpen
            ? "border-primary ring-2 ring-primary/20 shadow-sm"
            : "border-outline-variant hover:border-primary/40 focus:border-primary focus:outline-none"
        } ${disabled ? "opacity-70 cursor-not-allowed" : ""}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: currentOption.dot }}
          />
          <span className="min-w-0 truncate font-semibold text-on-surface">
            {currentOption.label}
          </span>
        </div>
        <span
          className={`material-symbols-outlined text-secondary text-base shrink-0 transition-transform duration-300 ${
            isOpen ? "rotate-180 text-primary" : ""
          }`}
        >
          expand_more
        </span>
      </button>

      {/* Animated Dropdown Menu */}
      <div
        className={`absolute left-0 top-[calc(100%+4px)] z-50 w-full overflow-hidden rounded-xl border border-outline-variant bg-surface p-1.5 shadow-xl transition-all duration-200 origin-top backdrop-blur-md ${
          isOpen
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
        }`}
      >
        <div className="flex flex-col gap-1">
          {PROGRESS_OPTIONS.map((opt) => {
            const isSelected = currentOption.value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`group/status flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? "bg-primary/10 text-primary font-bold"
                    : "text-on-surface hover:bg-surface-container font-medium"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: opt.dot }}
                />
                <span className="flex-1 font-semibold truncate">{opt.label}</span>
                {isSelected && (
                  <span className="material-symbols-outlined text-primary text-sm shrink-0">
                    check
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ProgressDropdown;
