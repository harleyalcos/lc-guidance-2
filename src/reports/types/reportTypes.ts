export interface SignatureItem {
  show: boolean;
  label: string;
  title: string;
}

export interface SignatureConfig {
  sig1: SignatureItem;
  sig2: SignatureItem;
}

export interface ColumnVisibilityConfig {
  date: boolean;
  student: boolean;
  class: boolean;
  adviser: boolean;
  type: boolean;
  description: boolean;
  sanction: boolean;
  status: boolean;
}

export interface ReportIncludesConfig {
  summary: boolean;
  signature: boolean;
}

export type PaperSize = "A4" | "LETTER" | "LEGAL" | "FOLIO";

export interface ReportConfig {
  scope: "all" | "specific";
  selectedGrade: string;
  status: "all" | "Pending" | "Reprimand" | "Resolved" | "Closed";
  startDate: string;
  endDate: string;
  paperSize: PaperSize;
  includes: ReportIncludesConfig;
  columns: ColumnVisibilityConfig;
  signatureConfig: SignatureConfig;
}

export interface ReportSummaryData {
  total: number;
  pending: number;
  resolved: number;
  reprimand: number;
  closed: number;
}

export interface ReportRow {
  index: number;
  date: string;
  studentName: string;
  grade: string;
  adviser: string;
  type: string;
  description: string;
  sanction: string;
  status: string;
  statusColor: string;
}

export interface ReportMetadata {
  reportingPeriod: string;
  scopeLabel: string;
  statusLabel: string;
  dateGenerated: string;
}

export interface ReportData {
  metadata: ReportMetadata;
  summary: ReportSummaryData;
  rows: ReportRow[];
  columns: ColumnVisibilityConfig;
  includes: ReportIncludesConfig;
  signatureConfig: SignatureConfig;
  statusFilter: string;
  paperSize: PaperSize;
}

export type ReportState = "idle" | "generating" | "ready" | "error";

