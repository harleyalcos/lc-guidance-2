import { useState, useEffect, useRef } from "react";

interface RoleDropdownProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  title?: string;
  className?: string;
}

export function RoleDropdown({ value, onChange, disabled = false, title, className = "" }: RoleDropdownProps) {
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

  const options = [
    {
      value: "Respondent",
      label: "Respondent",
      icon: "person",
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
    },
    {
      value: "Complainant / Subject",
      label: "Complainant / Subject",
      icon: "record_voice_over",
      color: "text-primary dark:text-primary-container",
      bg: "bg-primary/10",
      border: "border-primary/20",
    },
  ];

  const currentOption = options.find(
    (opt) => opt.value.toLowerCase() === (value || "").toLowerCase()
  ) || options[0];

  return (
    <div className={`relative w-full ${className}`} ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        title={title}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`w-full h-[42px] min-h-[42px] max-h-[42px] bg-surface-container-low border rounded-xl px-3 text-xs sm:text-[13px] text-left flex items-center justify-between gap-2 transition-all duration-200 cursor-pointer select-none ${
          isOpen
            ? "border-primary ring-2 ring-primary/20 shadow-sm"
            : "border-outline-variant hover:border-primary/40 focus:border-primary focus:ring-1 focus:ring-primary"
        } ${disabled ? "opacity-70 cursor-not-allowed" : ""}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`material-symbols-outlined text-[15px] leading-none shrink-0 ${currentOption.color}`}>
            {currentOption.icon}
          </span>
          <span className="font-semibold text-on-surface truncate text-xs sm:text-[13px] leading-none">
            {currentOption.label}
          </span>
        </div>
        <span
          className={`material-symbols-outlined text-secondary text-[16px] leading-none shrink-0 transition-transform duration-300 ${
            isOpen ? "rotate-180 text-primary" : ""
          }`}
        >
          expand_more
        </span>
      </button>

      {/* Animated Dropdown Menu */}
      <div
        className={`absolute top-[calc(100%+6px)] left-0 right-0 z-[60] bg-surface rounded-2xl border border-outline-variant shadow-2xl p-1.5 transition-all duration-200 origin-top backdrop-blur-md ${
          isOpen
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto shadow-black/10"
            : "opacity-0 scale-95 -translate-y-2 pointer-events-none"
        }`}
      >
        <div className="flex flex-col gap-1">
          {options.map((opt) => {
            const isSelected = currentOption.value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left transition-all duration-150 group cursor-pointer ${
                  isSelected
                    ? "bg-primary/10 text-primary font-bold shadow-xs"
                    : "hover:bg-surface-container text-on-surface hover:text-primary font-medium"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition-transform duration-200 group-hover:scale-105 ${opt.bg} ${opt.border} ${opt.color}`}
                  >
                    <span className="material-symbols-outlined text-[14px] leading-none">{opt.icon}</span>
                  </div>
                  <span className="text-xs font-semibold leading-tight truncate">{opt.label}</span>
                </div>
                {isSelected && (
                  <span className="material-symbols-outlined text-primary text-[16px] leading-none shrink-0 ml-2">
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
export default RoleDropdown;
