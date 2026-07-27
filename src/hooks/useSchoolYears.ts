import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useSchoolYears() {
  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [allYears, setAllYears] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchYears = async () => {
    setIsLoading(true);
    try {
      const current = await invoke<string | null>('get_current_school_year');
      setCurrentYear(current);
      const all = await invoke<string[]>('get_all_school_years');
      setAllYears(all);
    } catch (error) {
      console.error('Failed to fetch school years:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchYears();
  }, []);

  const setYear = async (startYear: string) => {
    try {
      const formatted = await invoke<string>('set_current_school_year', { startYear });
      setCurrentYear(formatted);
      if (!allYears.includes(formatted)) {
        setAllYears(prev => [formatted, ...prev].sort((a, b) => b.localeCompare(a)));
      }
      return formatted;
    } catch (error) {
      console.error('Failed to set school year:', error);
      throw error;
    }
  };

  return { currentYear, allYears, isLoading, setYear, refreshYears: fetchYears };
}
