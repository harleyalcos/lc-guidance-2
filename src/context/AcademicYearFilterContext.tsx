import React, { createContext, useContext, useState, useEffect } from "react";
import { useSchoolYears } from "../hooks/useSchoolYears";

interface AcademicYearFilterContextType {
  selectedSchoolYear: string | null;
  setSelectedSchoolYear: (year: string | null) => void;
  startDate: string;
  endDate: string;
  setDateRange: (start: string, end: string) => void;
  allYears: string[];
  currentYear: string | null;
  isYearsLoading: boolean;
}

const AcademicYearFilterContext = createContext<AcademicYearFilterContextType | undefined>(undefined);

export const AcademicYearFilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { allYears, currentYear, isLoading: isYearsLoading } = useSchoolYears();

  const [selectedSchoolYear, setSelectedSchoolYearState] = useState<string | null>(() => {
    return sessionStorage.getItem("selected_school_year") || null;
  });

  const [startDate, setStartDateState] = useState<string>(() => {
    return sessionStorage.getItem("filter_start_date") || "";
  });

  const [endDate, setEndDateState] = useState<string>(() => {
    return sessionStorage.getItem("filter_end_date") || "";
  });

  useEffect(() => {
    if (!isYearsLoading && selectedSchoolYear === null) {
      const latestYear = allYears[0] || currentYear;
      if (latestYear) {
        setSelectedSchoolYearState(latestYear);
        sessionStorage.setItem("selected_school_year", latestYear);
      }
    }
  }, [currentYear, allYears, isYearsLoading, selectedSchoolYear]);

  const setSelectedSchoolYear = (year: string | null) => {
    setSelectedSchoolYearState(year);
    if (year) {
      sessionStorage.setItem("selected_school_year", year);
    } else {
      sessionStorage.removeItem("selected_school_year");
    }
  };

  const setDateRange = (start: string, end: string) => {
    setStartDateState(start);
    setEndDateState(end);
    if (start) {
      sessionStorage.setItem("filter_start_date", start);
    } else {
      sessionStorage.removeItem("filter_start_date");
    }
    if (end) {
      sessionStorage.setItem("filter_end_date", end);
    } else {
      sessionStorage.removeItem("filter_end_date");
    }
  };

  return (
    <AcademicYearFilterContext.Provider
      value={{
        selectedSchoolYear,
        setSelectedSchoolYear,
        startDate,
        endDate,
        setDateRange,
        allYears,
        currentYear,
        isYearsLoading,
      }}
    >
      {children}
    </AcademicYearFilterContext.Provider>
  );
};

export function useAcademicYearFilter() {
  const context = useContext(AcademicYearFilterContext);
  if (!context) {
    throw new Error("useAcademicYearFilter must be used within an AcademicYearFilterProvider");
  }
  return context;
}
