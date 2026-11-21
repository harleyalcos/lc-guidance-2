import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { showError } from '../components/AppDialogs';

export function useSchoolYears() {
  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [allYears, setAllYears] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchYears = useCallback(async () => {
    setIsLoading(true);
    try {
      const [current, all] = await Promise.all([
        invoke<string | null>('get_current_school_year'),
        invoke<string[]>('get_all_school_years'),
      ]);
      setCurrentYear(current);
      setAllYears(Array.isArray(all) ? all : []);
    } catch (error) {
      showError(error, {
        title: "Couldn't load school years",
        message: 'The list of school years could not be read from the database. Filters will show all years until this is fixed.',
        onRetry: () => { void fetchYears(); },
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchYears();
    // New or imported cases can introduce a new school year; restores/resets can remove one.
    const refresh = () => { void fetchYears(); };
    window.addEventListener('cases:changed', refresh);
    return () => window.removeEventListener('cases:changed', refresh);
  }, [fetchYears]);

  const setYear = async (startYear: string) => {
    const formatted = await invoke<string>('set_current_school_year', { startYear });
    setCurrentYear(formatted);
    setAllYears(prev => prev.includes(formatted) ? prev : [formatted, ...prev].sort((a, b) => b.localeCompare(a)));
    return formatted;
  };

  return { currentYear, allYears, isLoading, setYear, refreshYears: fetchYears };
}
