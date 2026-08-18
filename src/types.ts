export interface CaseRecord {
  id: number;
  first_name: string;
  last_name: string;
  middle_initial: string;
  level: string;
  section: string;
  date: string;
  date_filed: string;
  adviser: string;
  case: string;
  description: string;
  sanction: string;
  progress: string;
  proofs: string;
  students: string;
  title: string;
  reporting_student?: string;
  group_id?: string | null;
  update_history: string;
  school_year?: string;
}

export interface StudentInfo {
  firstName: string;
  lastName: string;
  middleInitial: string;
  level: string;
  section: string;
  adviser: string;
  role?: string;
  sanction?: string;
}

export interface ImportRow {
  id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  middle_initial: string;
  level: string;
  section: string;
  date: string;
  date_filed: string;
  adviser: string;
  case: string;
  description: string;
  sanction: string;
  progress: string;
  proofs: string;
  students: string;
  title: string;
  is_duplicate: boolean;
  existing_case: CaseRecord | null;
  has_errors: boolean;
  errors: string[];
  group_id?: string | null;
}


export interface ParseFileResult {
  rows: ImportRow[];
  valid_count: number;
  duplicate_count: number;
  error_count: number;
}
