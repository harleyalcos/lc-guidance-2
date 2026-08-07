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
    <div className={`bg-surface border border-outline-variant rounded-xl p-4 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow duration-300 ${colorClass} ${className}`}>
      <div className="flex justify-between items-center mb-2">
        <span className="micro-label opacity-85">{label}</span>
        {icon && <span className="material-symbols-outlined text-[20px]">{icon}</span>}
      </div>
      <span className="text-2xl font-bold text-on-surface">{value}</span>
    </div>
  );
}
