import React from 'react';

interface SchoolYearSelectorProps {
  allYears: string[];
  selectedYear: string | null;
  onSelectYear: (year: string) => void;
  isLoading?: boolean;
}

const SchoolYearSelector: React.FC<SchoolYearSelectorProps> = ({ 
  allYears, 
  selectedYear, 
  onSelectYear,
  isLoading = false
}) => {
  if (isLoading || allYears.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-secondary">
        <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-secondary hidden sm:inline-block">Academic Year:</span>
      <div className="relative">
        <select
          value={selectedYear || ''}
          onChange={(e) => onSelectYear(e.target.value)}
          className="appearance-none bg-surface border border-outline-variant rounded-lg pl-3 pr-10 py-1.5 text-sm font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50 hover:bg-surface-container-low transition-colors cursor-pointer"
        >
          {allYears.map(year => (
            <option key={year} value={year}>{year}</option>
          ))}
          <option value="all">All Years</option>
        </select>
        <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-secondary pointer-events-none text-[18px]">
          expand_more
        </span>
      </div>
    </div>
  );
};

export default SchoolYearSelector;
