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
}

export interface ImportRow {
  id: string;
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
}

export interface ImportRowInput {
  id: string;
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
}

export interface ParseFileResult {
  rows: ImportRow[];
  valid_count: number;
  duplicate_count: number;
  error_count: number;
}
