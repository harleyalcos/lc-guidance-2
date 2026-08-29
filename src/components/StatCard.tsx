import { ReactNode } from "react";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: string;
  colorClass?: string;
  className?: string;
}

export default function StatCard({ label, value, icon, colorClass = "text-primary bg-primary/5", className = "" }: StatCardProps) {
  return (
    <div className={`bg-surface border border-outline-variant rounded-xl p-3.5 sm:p-4 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow duration-300 min-w-0 ${colorClass} ${className}`}>
      <div className="flex justify-between items-center gap-2 mb-2 min-w-0">
        <span className="micro-label opacity-85 truncate" title={label}>{label}</span>
        {icon && <span className="material-symbols-outlined text-[18px] sm:text-[20px] shrink-0">{icon}</span>}
      </div>
      <span className="text-xl sm:text-2xl font-bold text-on-surface truncate">{value}</span>
    </div>
  );
}
