import { useState, useMemo, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import lcOfficialLogo from "../assets/lc-official-logo.jpg";
import guidanceLogo from "../assets/guidance-logo.png";
import { PaperSize } from "../reports/types/reportTypes";
import { AiReportData } from "../reports/components/AiReportDocument";
import { useAiReportPdf } from "../reports/hooks/useAiReportPdf";

export interface AiReportMetadata {
  title?: string;
  reporting_period?: string;
  scope?: string;
  status_filter?: string;
  paper_size?: PaperSize;
  stats?: {
    total?: number | string;
    pending?: number | string;
    resolved?: number | string;
    reprimand?: number | string;
    closed?: number | string;
  };
}

export interface SignatureItem {
  show: boolean;
  label: string;
  title: string;
}

export interface SignatureConfig {
  sig1: SignatureItem;
  sig2: SignatureItem;
}

const DEFAULT_SIGNATURE_CONFIG: SignatureConfig = {
  sig1: {
    show: true,
    label: "Prepared by:",
    title: "Guidance Counselor",
  },
  sig2: {
    show: true,
    label: "Noted by:",
    title: "School Principal",
  },
};

interface AiReportPdfGeneratorProps {
  metadata: AiReportMetadata;
  bodyMarkdown: string;
  signatureConfig?: SignatureConfig;
}

export function formatNumericDateRange(periodStr: string): string {
  if (!periodStr || periodStr === "—" || periodStr === "All Records") return periodStr;

  const monthNames: { [key: string]: string } = {
    january: "01", jan: "01",
    february: "02", feb: "02",
    march: "03", mar: "03",
    april: "04", apr: "04",
    may: "05",
    june: "06", jun: "06",
    july: "07", jul: "07",
    august: "08", aug: "08",
    september: "09", sep: "09", sept: "09",
    october: "10", oct: "10",
    november: "11", nov: "11",
    december: "12", dec: "12",
  };

  let formatted = periodStr;

  // Pattern: MonthName DD, YYYY (e.g. January 1, 2026 -> 01/01/2026)
  formatted = formatted.replace(/\b([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{4})\b/g, (_, m, d, y) => {
    const mm = monthNames[m.toLowerCase()];
    if (mm) {
      const dd = d.padStart(2, "0");
      return `${mm}/${dd}/${y}`;
    }
    return `${m} ${d}, ${y}`;
  });

  // Pattern: MonthName YYYY (e.g. January 2026 -> 01/2026)
  formatted = formatted.replace(/\b([a-zA-Z]+)\s+(\d{4})\b/g, (_, m, y) => {
    const mm = monthNames[m.toLowerCase()];
    if (mm) {
      return `${mm}/${y}`;
    }
    return `${m} ${y}`;
  });

  return formatted;
}

export function formatDateToNumeric(date: Date = new Date()): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function parseMarkdownContent(markdown: string): {
  introMd: string;
  tableHeading: string;
  headers: string[];
  rows: string[][];
  outroMd: string;
} {
  const tableRegex = /(?:^|\n)(?:(###?\s+[^\n]+)\n+)?(\|[\s\S]+?\|(?:\r?\n|$)(?:\|[\s\S]+?\|(?:\r?\n|$))+)/;
  const match = markdown.match(tableRegex);

  if (!match || match.index === undefined) {
    return {
      introMd: markdown.trim(),
      tableHeading: "",
      headers: [],
      rows: [],
      outroMd: "",
    };
  }

  const fullMatch = match[0];
  const tableHeading = (match[1] || "").replace(/^#+\s*/, "").trim();
  const tableStr = match[2].trim();

  const lines = tableStr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return {
      introMd: markdown.trim(),
      tableHeading: "",
      headers: [],
      rows: [],
      outroMd: "",
    };
  }

  const splitRow = (rowStr: string) => {
    let s = rowStr;
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|")) s = s.slice(0, -1);
    return s.split("|").map((cell) => cell.trim());
  };

  const headers = splitRow(lines[0]);
  const dataStartIdx = lines[1].includes("---") || lines[1].includes("-|-") ? 2 : 1;
  const rows: string[][] = [];

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = splitRow(lines[i]);
    if (row.some((c) => c.length > 0)) {
      rows.push(row);
    }
  }

  const introMd = markdown.substring(0, match.index).trim();
  const outroMd = markdown.substring(match.index + fullMatch.length).trim();

  return {
    introMd,
    tableHeading,
    headers,
    rows,
    outroMd,
  };
}

export default function AiReportPdfGenerator({
  metadata,
  bodyMarkdown,
  signatureConfig = DEFAULT_SIGNATURE_CONFIG,
}: AiReportPdfGeneratorProps) {
  const [selectedPaperSize, setSelectedPaperSize] = useState<PaperSize>(metadata.paper_size || "A4");
  const [isPaperDropdownOpen, setIsPaperDropdownOpen] = useState(false);
  const [isExportingState, setIsExportingState] = useState(false);

  // Initial parse of the AI response
  const initialParsed = useMemo(() => parseMarkdownContent(bodyMarkdown), [bodyMarkdown]);

  const initialPeriod = useMemo(
    () => formatNumericDateRange(metadata.reporting_period || "—"),
    [metadata.reporting_period]
  );

  // ─── Live Editable State ───────────────────────────────────────────────────
  const [editedTitle, setEditedTitle] = useState(metadata.title || "GUIDANCE OFFICE CASES REPORT");
  const [editedPeriod, setEditedPeriod] = useState(initialPeriod);
  const [editedScope, setEditedScope] = useState(metadata.scope || "All year levels");
  const [editedStatusFilter, setEditedStatusFilter] = useState(metadata.status_filter || "All statuses");
  const [editedIntroMd, setEditedIntroMd] = useState(initialParsed.introMd);
  const [editedTableHeading, setEditedTableHeading] = useState(initialParsed.tableHeading || "CASE LIST");
  const [editedHeaders, setEditedHeaders] = useState<string[]>(initialParsed.headers);
  const [editedRows, setEditedRows] = useState<string[][]>(initialParsed.rows);
  const [editedOutroMd, setEditedOutroMd] = useState(initialParsed.outroMd);

  // Signatures Editable State
  const [editedSignatures, setEditedSignatures] = useState<SignatureConfig>(
    signatureConfig || DEFAULT_SIGNATURE_CONFIG
  );

  // Active edit section toggles
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [isEditingIntro, setIsEditingIntro] = useState(false);
  const [isEditingTable, setIsEditingTable] = useState(false);
  const [isEditingOutro, setIsEditingOutro] = useState(false);
  const [isEditingSignatures, setIsEditingSignatures] = useState(false);

  // Track last markdown we initialized from so typing in the prompt textbox (which causes parent re-renders) doesn't wipe out edits
  const lastInitializedMarkdownRef = useRef<string>(bodyMarkdown);

  // Sync ONLY when incoming bodyMarkdown text actually changes from a brand new AI response
  useEffect(() => {
    if (bodyMarkdown !== lastInitializedMarkdownRef.current) {
      lastInitializedMarkdownRef.current = bodyMarkdown;
      const parsed = parseMarkdownContent(bodyMarkdown);
      setEditedTitle(metadata.title || "GUIDANCE OFFICE CASES REPORT");
      setEditedPeriod(formatNumericDateRange(metadata.reporting_period || "—"));
      setEditedScope(metadata.scope || "All year levels");
      setEditedStatusFilter(metadata.status_filter || "All statuses");
      setEditedIntroMd(parsed.introMd);
      setEditedTableHeading(parsed.tableHeading || "CASE LIST");
      setEditedHeaders(parsed.headers);
      setEditedRows(parsed.rows);
      setEditedOutroMd(parsed.outroMd);
      setEditedSignatures(signatureConfig || DEFAULT_SIGNATURE_CONFIG);
      setIsEditingHeader(false);
      setIsEditingIntro(false);
      setIsEditingTable(false);
      setIsEditingOutro(false);
      setIsEditingSignatures(false);
    }
  }, [bodyMarkdown, metadata.title, metadata.reporting_period, metadata.scope, metadata.status_filter, signatureConfig]);

  const hasAnyEdits =
    editedTitle !== (metadata.title || "GUIDANCE OFFICE CASES REPORT") ||
    editedPeriod !== initialPeriod ||
    editedScope !== (metadata.scope || "All year levels") ||
    editedStatusFilter !== (metadata.status_filter || "All statuses") ||
    editedIntroMd !== initialParsed.introMd ||
    editedTableHeading !== (initialParsed.tableHeading || "CASE LIST") ||
    JSON.stringify(editedRows) !== JSON.stringify(initialParsed.rows) ||
    editedOutroMd !== initialParsed.outroMd ||
    JSON.stringify(editedSignatures) !== JSON.stringify(signatureConfig || DEFAULT_SIGNATURE_CONFIG);

  const handleResetToOriginal = () => {
    setEditedTitle(metadata.title || "GUIDANCE OFFICE CASES REPORT");
    setEditedPeriod(initialPeriod);
    setEditedScope(metadata.scope || "All year levels");
    setEditedStatusFilter(metadata.status_filter || "All statuses");
    setEditedIntroMd(initialParsed.introMd);
    setEditedTableHeading(initialParsed.tableHeading || "CASE LIST");
    setEditedHeaders(initialParsed.headers);
    setEditedRows(initialParsed.rows);
    setEditedOutroMd(initialParsed.outroMd);
    setEditedSignatures(signatureConfig || DEFAULT_SIGNATURE_CONFIG);
    setIsEditingHeader(false);
    setIsEditingIntro(false);
    setIsEditingTable(false);
    setIsEditingOutro(false);
    setIsEditingSignatures(false);
  };

  const formattedDateGen = useMemo(() => formatDateToNumeric(new Date()), []);

  // Compile exact document model for react-pdf
  const reportData: AiReportData = useMemo(() => {
    return {
      title: editedTitle,
      reportingPeriod: editedPeriod,
      scope: editedScope,
      statusFilter: editedStatusFilter,
      dateGenerated: formattedDateGen,
      introText: editedIntroMd,
      tableHeading: editedTableHeading,
      tableHeaders: editedHeaders.length > 0 ? editedHeaders : undefined,
      tableRows: editedRows.length > 0 ? editedRows : undefined,
      outroText: editedOutroMd,
      signatureConfig: editedSignatures,
      paperSize: selectedPaperSize,
    };
  }, [
    editedTitle,
    editedPeriod,
    editedScope,
    editedStatusFilter,
    formattedDateGen,
    editedIntroMd,
    editedTableHeading,
    editedHeaders,
    editedRows,
    editedOutroMd,
    editedSignatures,
    selectedPaperSize,
  ]);

  const { pdfBlobUrl, isGenerating, exportPdf, printPdf } = useAiReportPdf(reportData);

  const handleExport = async () => {
    try {
      setIsExportingState(true);
      await exportPdf();
    } catch (err) {
      alert("Failed to export PDF: " + err);
    } finally {
      setIsExportingState(false);
    }
  };

  const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
    setEditedRows((prev) => {
      const copy = prev.map((r) => [...r]);
      if (copy[rowIndex]) {
        copy[rowIndex][colIndex] = value;
      }
      return copy;
    });
  };

  const handleDeleteRow = (rowIndex: number) => {
    setEditedRows((prev) => prev.filter((_, i) => i !== rowIndex));
  };

  const handleAddRow = () => {
    setEditedRows((prev) => {
      const newRow = editedHeaders.map((_, i) => (i === 0 ? String(prev.length + 1) : ""));
      return [...prev, newRow];
    });
  };

  const isAnySectionEditing =
    isEditingHeader ||
    isEditingIntro ||
    isEditingTable ||
    isEditingOutro ||
    isEditingSignatures;

  const toggleMasterEdit = () => {
    if (isAnySectionEditing) {
      setIsEditingHeader(false);
      setIsEditingIntro(false);
      setIsEditingTable(false);
      setIsEditingOutro(false);
      setIsEditingSignatures(false);
    } else {
      setIsEditingHeader(true);
      setIsEditingIntro(true);
      setIsEditingTable(true);
      setIsEditingOutro(true);
      setIsEditingSignatures(true);
    }
  };

  const showSig1 = editedSignatures.sig1.show;
  const showSig2 = editedSignatures.sig2.show;
  const hasAnySignatures = showSig1 || showSig2;

  const toggleSignaturesGlobal = () => {
    const nextState = !hasAnySignatures;
    setEditedSignatures((prev) => ({
      sig1: { ...prev.sig1, show: nextState },
      sig2: { ...prev.sig2, show: nextState },
    }));
  };

  return (
    <div className="w-full flex flex-col items-center gap-3">
      {/* ─── Top Floating Action Toolbar ─── */}
      <div className="w-full max-w-[850px] flex items-center justify-between gap-2 px-1 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
            <span className="material-symbols-outlined text-[14px]">article</span>
            Print-Ready Document (Portrait)
          </span>

          {hasAnyEdits && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
              Edited Live
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Master Edit / Done Button */}
          <button
            type="button"
            onClick={toggleMasterEdit}
            className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border shadow-xs cursor-pointer ${
              isAnySectionEditing
                ? "bg-primary text-on-primary border-primary hover:opacity-90 font-bold"
                : "bg-surface-container-low hover:bg-surface-container border-outline-variant text-on-surface"
            }`}
            title={isAnySectionEditing ? "Finish Editing" : "Edit Document Inline"}
          >
            <span className="material-symbols-outlined text-[16px]">
              {isAnySectionEditing ? "check" : "edit"}
            </span>
            <span>{isAnySectionEditing ? "Done Editing" : "Edit Document"}</span>
          </button>

          {/* Top Signatures Block Toggle Button */}
          <button
            type="button"
            onClick={toggleSignaturesGlobal}
            className={`h-8 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border shadow-xs cursor-pointer ${
              hasAnySignatures
                ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20 font-bold"
                : "bg-surface-container-low hover:bg-surface-container border-outline-variant text-secondary hover:text-on-surface"
            }`}
            title={hasAnySignatures ? "Click to Remove Signatures" : "Click to Add Signatures"}
          >
            <span className="material-symbols-outlined text-[15px]">
              {hasAnySignatures ? "signature" : "draw"}
            </span>
            <span>Signatures: {hasAnySignatures ? "ON" : "OFF"}</span>
          </button>

          {hasAnyEdits && (
            <button
              type="button"
              onClick={handleResetToOriginal}
              className="h-8 px-2.5 bg-surface-container-low hover:bg-surface-container border border-outline-variant rounded-lg text-xs font-medium text-secondary hover:text-on-surface flex items-center gap-1 transition-colors cursor-pointer"
              title="Reset edits to original AI output"
            >
              <span className="material-symbols-outlined text-[14px]">restart_alt</span>
              <span>Reset</span>
            </button>
          )}

          {/* Paper Size Picker */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsPaperDropdownOpen((prev) => !prev)}
              className="h-8 px-2.5 bg-surface-container-low hover:bg-surface-container border border-outline-variant rounded-lg text-xs font-semibold text-on-surface flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Change Paper Size"
            >
              <span className="material-symbols-outlined text-[15px] text-secondary">aspect_ratio</span>
              <span>{selectedPaperSize}</span>
              <span className="material-symbols-outlined text-[14px] text-secondary">expand_more</span>
            </button>

            {isPaperDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 bg-surface dark:bg-surface-container border border-outline-variant rounded-xl p-1 shadow-xl min-w-[150px] filter-dropdown-enter">
                {[
                  { id: "A4", label: "A4 (210 × 297 mm)" },
                  { id: "LETTER", label: "Letter (8.5 × 11 in)" },
                  { id: "FOLIO", label: "Folio (8.5 × 13 in)" },
                  { id: "LEGAL", label: "Legal (8.5 × 14 in)" },
                ].map((size) => (
                  <button
                    key={size.id}
                    type="button"
                    onClick={() => {
                      setSelectedPaperSize(size.id as PaperSize);
                      setIsPaperDropdownOpen(false);
                    }}
                    className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-xs font-medium text-left transition-colors ${
                      selectedPaperSize === size.id
                        ? "bg-primary/10 text-primary font-bold"
                        : "text-on-surface hover:bg-surface-container-high"
                    }`}
                  >
                    <span>{size.label}</span>
                    {selectedPaperSize === size.id && (
                      <span className="material-symbols-outlined text-[14px]">check</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Export PDF Button */}
          <button
            type="button"
            onClick={handleExport}
            disabled={isExportingState || isGenerating}
            className="btn-primary h-8 !py-0 !px-3 text-xs flex items-center gap-1.5 cursor-pointer"
            title="Download Portrait PDF Document"
          >
            {isExportingState || isGenerating ? (
              <span className="material-symbols-outlined animate-spin text-[15px]">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-[15px]">picture_as_pdf</span>
            )}
            <span>{isExportingState ? "Exporting..." : "Export PDF"}</span>
          </button>

          {/* Print Button */}
          <button
            type="button"
            onClick={printPdf}
            disabled={isGenerating || !pdfBlobUrl}
            className="btn-secondary h-8 !py-0 !px-3 text-xs flex items-center gap-1.5 cursor-pointer"
            title="Print Document"
          >
            <span className="material-symbols-outlined text-[15px]">print</span>
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* ─── White Print-Ready Document Sheet (Isolated from dark mode) ─── */}
      <div className="ai-document-sheet w-full max-w-[850px] !bg-white !text-[#111827] rounded-xl shadow-lg border border-gray-200 p-8 sm:p-12 font-sans transition-all relative">
        {/* Letterhead Header */}
        <div className="grid grid-cols-[64px_1fr_64px] items-center gap-4 mb-3">
          <img
            src={lcOfficialLogo}
            alt="Laguna College Logo"
            className="w-14 h-14 object-contain justify-self-start rounded-full"
          />
          <div className="text-center text-black" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
            <h2 className="m-0 text-[15px] leading-[18px] font-black uppercase tracking-[0.03em] text-black">
              LAGUNA COLLEGE
            </h2>
            <p className="m-0 mt-0.5 text-[11px] leading-[13px] text-gray-800">San Pablo City</p>
            <p className="m-0 mt-0.5 text-[17px] leading-[20px] font-black text-black">Guidance Office</p>
          </div>
          <img
            src={guidanceLogo}
            alt="Guidance Office Logo"
            className="w-14 h-14 object-contain justify-self-end rounded-full"
          />
        </div>

        {/* Blue Divider Line */}
        <div className="h-[2px] w-full bg-[#002F87] mb-5" />

        {/* Document Title & Header Metadata */}
        <div className="relative group/head mb-6">
          {isEditingHeader ? (
            <div className="flex flex-col gap-3 p-4 bg-blue-50/50 border border-blue-200 rounded-xl mb-4 shadow-xs">
              {/* Header Title Bar with Noticeable Done Button */}
              <div className="flex justify-between items-center border-b border-blue-200 pb-2 mb-1">
                <span className="text-[11px] font-bold text-[#002F87] uppercase tracking-wider flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px]">edit_note</span>
                  Edit Document Title & Metadata
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingHeader(false)}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider text-white bg-[#002F87] hover:bg-[#002266] shadow-sm transition-all cursor-pointer"
                  title="Save Header"
                >
                  <span className="material-symbols-outlined text-[15px]">check</span>
                  <span>Done</span>
                </button>
              </div>

              <div className="text-center">
                <label className="block text-[10px] font-bold uppercase text-gray-600 mb-1">Document Title</label>
                <input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  style={{ colorScheme: "light", backgroundColor: "#ffffff", color: "#111827" }}
                  className="w-full text-center text-sm font-bold uppercase !text-gray-900 !bg-white border !border-gray-300 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-[#002F87] focus:!border-[#002F87] focus:outline-none shadow-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-gray-600 mb-0.5">Reporting Period (Numbers)</label>
                  <input
                    type="text"
                    value={editedPeriod}
                    onChange={(e) => setEditedPeriod(e.target.value)}
                    placeholder="e.g. 01/2026 – 12/2026"
                    style={{ colorScheme: "light", backgroundColor: "#ffffff", color: "#111827" }}
                    className="w-full text-xs font-medium !text-gray-900 !bg-white border !border-gray-300 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-[#002F87] focus:!border-[#002F87] focus:outline-none shadow-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-600 mb-0.5">Scope</label>
                  <input
                    type="text"
                    value={editedScope}
                    onChange={(e) => setEditedScope(e.target.value)}
                    style={{ colorScheme: "light", backgroundColor: "#ffffff", color: "#111827" }}
                    className="w-full text-xs font-medium !text-gray-900 !bg-white border !border-gray-300 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-[#002F87] focus:!border-[#002F87] focus:outline-none shadow-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-600 mb-0.5">Status Filter</label>
                  <input
                    type="text"
                    value={editedStatusFilter}
                    onChange={(e) => setEditedStatusFilter(e.target.value)}
                    style={{ colorScheme: "light", backgroundColor: "#ffffff", color: "#111827" }}
                    className="w-full text-xs font-medium !text-gray-900 !bg-white border !border-gray-300 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-[#002F87] focus:!border-[#002F87] focus:outline-none shadow-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-600 mb-0.5">Date Generated</label>
                  <input
                    type="text"
                    value={formattedDateGen}
                    disabled
                    style={{ colorScheme: "light", backgroundColor: "#f3f4f6", color: "#6b7280" }}
                    className="w-full text-xs font-medium !text-gray-600 !bg-gray-100 border !border-gray-200 rounded px-2.5 py-1.5 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Noticeable Edit Button in Top-Right */}
              <div className="absolute right-0 top-0">
                <button
                  type="button"
                  onClick={() => setIsEditingHeader(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider text-[#002F87] bg-blue-50/90 hover:bg-blue-100 border border-blue-200/80 shadow-xs transition-all cursor-pointer"
                  title="Edit Document Title & Metadata"
                >
                  <span className="material-symbols-outlined text-[14px]">edit</span>
                  <span>Edit</span>
                </button>
              </div>

              {/* Document Title */}
              <div className="text-center mb-5">
                <h1 className="text-sm font-bold uppercase tracking-wider mb-0.5 text-gray-900 font-sans">
                  {editedTitle}
                </h1>
                <p className="text-[11px] text-gray-500 font-sans">Official Case Report</p>
              </div>

              {/* Metadata 2x2 Grid */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs max-w-xl mx-auto font-sans text-left">
                <div className="flex items-baseline">
                  <span className="w-28 flex-shrink-0 text-gray-500">Reporting period</span>
                  <span className="font-bold text-gray-900">{editedPeriod}</span>
                </div>
                <div className="flex items-baseline">
                  <span className="w-28 flex-shrink-0 text-gray-500">Scope</span>
                  <span className="font-bold text-gray-900">{editedScope}</span>
                </div>
                <div className="flex items-baseline">
                  <span className="w-28 flex-shrink-0 text-gray-500">Status filter</span>
                  <span className="font-bold text-gray-900">{editedStatusFilter}</span>
                </div>
                <div className="flex items-baseline">
                  <span className="w-28 flex-shrink-0 text-gray-500">Date generated</span>
                  <span className="font-bold text-gray-900">{formattedDateGen}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Narrative Executive Summary */}
        {(editedIntroMd || isEditingIntro) && (
          <div className="mb-6 font-sans relative group/intro">
            <div className="flex justify-between items-center border-b-2 border-[#002F87] pb-1 mb-3">
              <h3 className="text-[11px] font-bold text-[#002F87] uppercase tracking-wider m-0">
                EXECUTIVE OVERVIEW
              </h3>
              {isEditingIntro ? (
                <button
                  type="button"
                  onClick={() => setIsEditingIntro(false)}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider text-white bg-[#002F87] hover:bg-[#002266] shadow-sm transition-all cursor-pointer"
                  title="Save Executive Overview"
                >
                  <span className="material-symbols-outlined text-[15px]">check</span>
                  <span>Done</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingIntro(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider text-[#002F87] bg-blue-50/90 hover:bg-blue-100 border border-blue-200/80 shadow-xs transition-all cursor-pointer"
                  title="Edit Executive Overview"
                >
                  <span className="material-symbols-outlined text-[14px]">edit</span>
                  <span>Edit</span>
                </button>
              )}
            </div>

            {isEditingIntro ? (
              <textarea
                value={editedIntroMd}
                onChange={(e) => setEditedIntroMd(e.target.value)}
                rows={6}
                style={{ colorScheme: "light", backgroundColor: "#ffffff", color: "#111827" }}
                className="w-full text-xs sm:text-sm !text-gray-900 border !border-blue-200 !bg-white rounded-lg p-3 leading-relaxed focus:ring-1 focus:ring-[#002F87] focus:!border-[#002F87] focus:outline-none shadow-xs resize-y"
                placeholder="Enter executive overview narrative or findings..."
              />
            ) : (
              <div className="text-xs sm:text-sm text-gray-700 leading-relaxed space-y-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{editedIntroMd}</ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* Structured Data Table */}
        {(editedRows.length > 0 || isEditingTable) && (
          <div className="mb-6 font-sans relative group/table">
            <div className="flex justify-between items-center border-b-2 border-[#002F87] pb-1 mb-3">
              {isEditingTable ? (
                <input
                  type="text"
                  value={editedTableHeading}
                  onChange={(e) => setEditedTableHeading(e.target.value)}
                  style={{ colorScheme: "light", backgroundColor: "#ffffff", color: "#002F87" }}
                  className="text-[11px] font-bold !text-[#002F87] uppercase tracking-wider !bg-white border !border-gray-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#002F87]"
                />
              ) : (
                <h3 className="text-[11px] font-bold text-[#002F87] uppercase tracking-wider m-0">
                  {editedTableHeading}
                </h3>
              )}

              {isEditingTable ? (
                <button
                  type="button"
                  onClick={() => setIsEditingTable(false)}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider text-white bg-[#002F87] hover:bg-[#002266] shadow-sm transition-all cursor-pointer"
                  title="Save Table"
                >
                  <span className="material-symbols-outlined text-[15px]">check</span>
                  <span>Done</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingTable(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider text-[#002F87] bg-blue-50/90 hover:bg-blue-100 border border-blue-200/80 shadow-xs transition-all cursor-pointer"
                  title="Edit Table Cells"
                >
                  <span className="material-symbols-outlined text-[14px]">edit</span>
                  <span>Edit</span>
                </button>
              )}
            </div>

            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse font-sans text-xs">
                <thead>
                  <tr className="border-b border-gray-300 text-gray-600 font-bold uppercase text-[10.5px] tracking-wider bg-gray-50">
                    {editedHeaders.map((h, i) => (
                      <th key={i} className="py-2 px-2.5 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                    {isEditingTable && <th className="py-2 px-2 w-8 text-center">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {editedRows.map((row, rIdx) => (
                    <tr key={rIdx} className="even:bg-gray-50/50 hover:bg-gray-100/60 transition-colors">
                      {row.map((cell, cIdx) => {
                        const header = (editedHeaders[cIdx] || "").toLowerCase();
                        const isStatus = header.includes("status") || header.includes("progress");
                        const isStudent = header.includes("student") || (cIdx === 1 && !header.includes("count"));
                        const isIndex =
                          header === "#" || header === "no." || (cIdx === 0 && /^\d+$/.test(cell));

                        if (isEditingTable) {
                          return (
                            <td key={cIdx} className="py-1.5 px-1.5">
                              <input
                                type="text"
                                value={cell}
                                onChange={(e) => handleCellChange(rIdx, cIdx, e.target.value)}
                                style={{ colorScheme: "light", backgroundColor: "#ffffff", color: "#111827" }}
                                className={`w-full px-2 py-1 text-xs !bg-white !text-gray-900 border !border-gray-300 rounded focus:ring-1 focus:ring-[#002F87] focus:!border-[#002F87] focus:outline-none shadow-xs ${
                                  isStudent ? "font-bold" : "font-normal"
                                }`}
                              />
                            </td>
                          );
                        }

                        if (isStatus) {
                          const s = (cell || "").toLowerCase();
                          let colorClass = "text-gray-700 font-bold";
                          if (s.includes("pending")) colorClass = "text-[#D97706] font-bold";
                          if (s.includes("resolved")) colorClass = "text-[#2563EB] font-bold";
                          if (s.includes("reprimand")) colorClass = "text-[#0D9488] font-bold";
                          if (s.includes("closed")) colorClass = "text-[#DC2626] font-bold";

                          return (
                            <td key={cIdx} className="py-2.5 px-2.5 whitespace-nowrap">
                              <span className={`text-[11px] uppercase tracking-wide ${colorClass}`}>
                                {cell}
                              </span>
                            </td>
                          );
                        }

                        return (
                          <td
                            key={cIdx}
                            className={`py-2.5 px-2.5 ${
                              isStudent ? "font-bold text-gray-900" : isIndex ? "text-gray-500 font-bold" : "text-gray-700"
                            }`}
                          >
                            {cell || "—"}
                          </td>
                        );
                      })}

                      {isEditingTable && (
                        <td key="action-cell" className="py-1 px-1 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(rIdx)}
                            className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 cursor-pointer"
                            title="Delete row"
                          >
                            <span className="material-symbols-outlined text-[15px]">delete</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              {isEditingTable && (
                <div className="mt-2.5">
                  <button
                    type="button"
                    onClick={handleAddRow}
                    className="px-3 py-1.5 text-xs font-semibold text-[#002F87] border border-[#002F87]/30 bg-blue-50/50 rounded-lg hover:bg-blue-100/60 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">add</span>
                    <span>Add Row</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Narrative Outro / Counselor Recommendations */}
        {(editedOutroMd || isEditingOutro) && (
          <div className="mb-6 font-sans relative group/outro">
            <div className="flex justify-between items-center border-b-2 border-[#002F87] pb-1 mb-3">
              <h3 className="text-[11px] font-bold text-[#002F87] uppercase tracking-wider m-0">
                OBSERVATIONS & RECOMMENDATIONS
              </h3>
              {isEditingOutro ? (
                <button
                  type="button"
                  onClick={() => setIsEditingOutro(false)}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider text-white bg-[#002F87] hover:bg-[#002266] shadow-sm transition-all cursor-pointer"
                  title="Save Observations"
                >
                  <span className="material-symbols-outlined text-[15px]">check</span>
                  <span>Done</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingOutro(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider text-[#002F87] bg-blue-50/90 hover:bg-blue-100 border border-blue-200/80 shadow-xs transition-all cursor-pointer"
                  title="Edit Observations & Recommendations"
                >
                  <span className="material-symbols-outlined text-[14px]">edit</span>
                  <span>Edit</span>
                </button>
              )}
            </div>

            {isEditingOutro ? (
              <textarea
                value={editedOutroMd}
                onChange={(e) => setEditedOutroMd(e.target.value)}
                rows={6}
                style={{ colorScheme: "light", backgroundColor: "#ffffff", color: "#111827" }}
                className="w-full text-xs sm:text-sm !text-gray-900 border !border-blue-200 !bg-white rounded-lg p-3 leading-relaxed focus:ring-1 focus:ring-[#002F87] focus:!border-[#002F87] focus:outline-none shadow-xs resize-y"
                placeholder="Enter counselor observations & recommendations..."
              />
            ) : (
              <div className="text-xs sm:text-sm text-gray-700 leading-relaxed space-y-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{editedOutroMd}</ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* ─── Signatures Block (Editable & Togglable) ─── */}
        <div className="mt-8 pt-4 border-t border-gray-200 font-sans">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              SIGNATURE BLOCK
            </span>
            {isEditingSignatures ? (
              <button
                type="button"
                onClick={() => setIsEditingSignatures(false)}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider text-white bg-[#002F87] hover:bg-[#002266] shadow-sm transition-all cursor-pointer"
                title="Save Signatures"
              >
                <span className="material-symbols-outlined text-[15px]">check</span>
                <span>Done</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingSignatures(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider text-[#002F87] bg-blue-50/90 hover:bg-blue-100 border border-blue-200/80 shadow-xs transition-all cursor-pointer"
                title="Edit Signature Titles & Signees"
              >
                <span className="material-symbols-outlined text-[14px]">edit</span>
                <span>Edit</span>
              </button>
            )}
          </div>

          {isEditingSignatures ? (
            <div className="p-4 bg-blue-50/40 border border-blue-200 rounded-xl space-y-3 shadow-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Signature 1 Configuration */}
                <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-xs space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editedSignatures.sig1.show}
                      onChange={(e) =>
                        setEditedSignatures((prev) => ({
                          ...prev,
                          sig1: { ...prev.sig1, show: e.target.checked },
                        }))
                      }
                      className="w-4 h-4 text-[#002F87] rounded border-gray-300 focus:ring-[#002F87]"
                    />
                    <span className="text-xs font-bold text-gray-800">Show Signature 1 (Left)</span>
                  </label>

                  {editedSignatures.sig1.show && (
                    <div className="space-y-2 pt-1 border-t border-gray-100">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Role / Label</label>
                        <input
                          type="text"
                          value={editedSignatures.sig1.label}
                          onChange={(e) =>
                            setEditedSignatures((prev) => ({
                              ...prev,
                              sig1: { ...prev.sig1, label: e.target.value },
                            }))
                          }
                          placeholder="e.g. Prepared by:"
                          style={{ colorScheme: "light", backgroundColor: "#ffffff", color: "#111827" }}
                          className="w-full px-2 py-1 text-xs !bg-white !text-gray-900 border !border-gray-300 rounded focus:ring-1 focus:ring-[#002F87] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Name / Title</label>
                        <input
                          type="text"
                          value={editedSignatures.sig1.title}
                          onChange={(e) =>
                            setEditedSignatures((prev) => ({
                              ...prev,
                              sig1: { ...prev.sig1, title: e.target.value },
                            }))
                          }
                          placeholder="e.g. Guidance Counselor"
                          style={{ colorScheme: "light", backgroundColor: "#ffffff", color: "#111827" }}
                          className="w-full px-2 py-1 text-xs !bg-white !text-gray-900 border !border-gray-300 rounded focus:ring-1 focus:ring-[#002F87] focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Signature 2 Configuration */}
                <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-xs space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editedSignatures.sig2.show}
                      onChange={(e) =>
                        setEditedSignatures((prev) => ({
                          ...prev,
                          sig2: { ...prev.sig2, show: e.target.checked },
                        }))
                      }
                      className="w-4 h-4 text-[#002F87] rounded border-gray-300 focus:ring-[#002F87]"
                    />
                    <span className="text-xs font-bold text-gray-800">Show Signature 2 (Right)</span>
                  </label>

                  {editedSignatures.sig2.show && (
                    <div className="space-y-2 pt-1 border-t border-gray-100">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Role / Label</label>
                        <input
                          type="text"
                          value={editedSignatures.sig2.label}
                          onChange={(e) =>
                            setEditedSignatures((prev) => ({
                              ...prev,
                              sig2: { ...prev.sig2, label: e.target.value },
                            }))
                          }
                          placeholder="e.g. Noted by:"
                          style={{ colorScheme: "light", backgroundColor: "#ffffff", color: "#111827" }}
                          className="w-full px-2 py-1 text-xs !bg-white !text-gray-900 border !border-gray-300 rounded focus:ring-1 focus:ring-[#002F87] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Name / Title</label>
                        <input
                          type="text"
                          value={editedSignatures.sig2.title}
                          onChange={(e) =>
                            setEditedSignatures((prev) => ({
                              ...prev,
                              sig2: { ...prev.sig2, title: e.target.value },
                            }))
                          }
                          placeholder="e.g. School Principal"
                          style={{ colorScheme: "light", backgroundColor: "#ffffff", color: "#111827" }}
                          className="w-full px-2 py-1 text-xs !bg-white !text-gray-900 border !border-gray-300 rounded focus:ring-1 focus:ring-[#002F87] focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : hasAnySignatures ? (
            <div className="flex justify-around items-start max-w-lg mx-auto text-center pt-2">
              {showSig1 && (
                <div className="w-48">
                  <div className="border-b border-gray-800 w-full mb-1.5" />
                  <p className="text-xs font-bold text-gray-900 m-0">{editedSignatures.sig1.title || "Guidance Counselor"}</p>
                  <p className="text-[10px] text-gray-500 m-0 mt-0.5">{editedSignatures.sig1.label || "Prepared by:"}</p>
                </div>
              )}
              {showSig2 && (
                <div className="w-48">
                  <div className="border-b border-gray-800 w-full mb-1.5" />
                  <p className="text-xs font-bold text-gray-900 m-0">{editedSignatures.sig2.title || "School Principal"}</p>
                  <p className="text-[10px] text-gray-500 m-0 mt-0.5">{editedSignatures.sig2.label || "Noted by:"}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="py-2 text-center text-xs text-gray-400 italic">
              Signatures hidden (Turn ON via toolbar above or click Edit Signatures)
            </div>
          )}
        </div>

        {/* Page Footer */}
        <div className="mt-8 pt-3 border-t border-gray-200 flex justify-between items-center text-[10px] text-gray-400 font-sans">
          <span className="font-bold uppercase tracking-wider">Laguna College Guidance Office</span>
          <span>Official Confidential Student Record</span>
        </div>
      </div>
    </div>
  );
}
