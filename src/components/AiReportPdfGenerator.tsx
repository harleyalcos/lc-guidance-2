import { forwardRef, useImperativeHandle, useRef, useState, useEffect, useLayoutEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import html2pdf from "html2pdf.js";
import lcOfficialLogo from "../assets/lc-official-logo.jpg";
import guidanceLogo from "../assets/guidance-logo.png";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface AiReportMetadata {
  title?: string;
  reporting_period?: string;
  scope?: string;
  status_filter?: string;
  orientation?: "portrait" | "landscape";
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
  isPreview?: boolean;
  signatureConfig?: SignatureConfig;
}

export interface AiReportPdfGeneratorRef {
  generatePdf: () => Promise<void>;
}

const getBadgeInlineStyle = (progress: string): React.CSSProperties => {
  const normalizedProgress = (progress || "").toLowerCase();
  if (normalizedProgress === "closed") {
    return { color: "#4b5563" }; // Grayish
  }
  if (normalizedProgress === "resolved") {
    return { color: "#15803d" }; // Green
  }
  if (normalizedProgress === "pending") {
    return { color: "#a16207" }; // Yellow/Gold
  }
  return { color: "#b45309" }; // Amber/Orange
};

function parseMarkdownContent(markdown: string): {
  introMd: string;
  tableHeading: string;
  headers: string[];
  rows: string[][];
  outroMd: string;
} | null {
  const tableRegex = /(?:^|\n)(?:(###?\s+[^\n]+)\n+)?(\|[\s\S]+?\|(?:\r?\n|$)(?:\|[\s\S]+?\|(?:\r?\n|$))+)/;
  const match = markdown.match(tableRegex);
  if (!match || match.index === undefined) return null;

  const fullMatch = match[0];
  const tableHeading = (match[1] || "").replace(/^#+\s*/, "").trim();
  const tableStr = match[2].trim();

  const lines = tableStr.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const splitRow = (rowStr: string) => {
    let s = rowStr;
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|")) s = s.slice(0, -1);
    return s.split("|").map(cell => cell.trim());
  };

  const headers = splitRow(lines[0]);
  const dataStartIdx = lines[1].includes("---") || lines[1].includes("-|-") ? 2 : 1;
  const rows: string[][] = [];

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = splitRow(lines[i]);
    if (row.some(c => c.length > 0)) {
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

const AiReportPdfGenerator = forwardRef<AiReportPdfGeneratorRef, AiReportPdfGeneratorProps>(
  ({ metadata, bodyMarkdown, isPreview = false, signatureConfig = DEFAULT_SIGNATURE_CONFIG }, ref) => {
    const reportRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [scale, setScale] = useState(1);
    const [paginatedPages, setPaginatedPages] = useState<{ rows: string[][]; isFirstPage: boolean; hasClosing: boolean }[]>([]);

    const parsedData = useMemo(() => {
      return parseMarkdownContent(bodyMarkdown);
    }, [bodyMarkdown]);

    // Standard A4 landscape dimensions (297mm x 210mm)
    const A4_WIDTH_PX = 1122.5;

    const renderFirstHeader = (customHeading?: string) => (
      <>
        {/* Header letterhead matching SummaryReports.tsx */}
        <div className="grid grid-cols-[84px_1fr_84px] items-center gap-4 mb-4 font-sans">
          <img src={lcOfficialLogo} alt="Laguna College Logo" className="w-[72px] h-[72px] object-contain justify-self-start rounded-full" />
          <div className="text-center text-black" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
            <h2 className="m-0 text-[15px] leading-[18px] font-black uppercase tracking-[0.02em] text-black">LAGUNA COLLEGE</h2>
            <p className="m-0 mt-0.5 text-[11px] leading-[13px] font-bold text-black">San Pablo City</p>
            <p className="m-0 mt-0.5 text-[18px] leading-[21px] font-black text-black">Guidance Office</p>
          </div>
          <img src={guidanceLogo} alt="Guidance Office Logo" className="w-[72px] h-[72px] object-contain justify-self-end rounded-full" />
        </div>

        <div className="h-0.5 w-full bg-primary mb-5"></div>

        <div className="text-center mb-6">
          <h1 className="text-base font-bold uppercase tracking-wider mb-0.5 font-sans text-gray-900">
            {metadata.title || "Guidance Office Cases Report"}
          </h1>
          <p className="text-xs text-gray-500 font-sans">Official Case Report</p>
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 mb-6 text-xs w-3/4 mx-auto font-sans text-left">
          <div className="flex">
            <span className="w-32 text-gray-500">Reporting period</span>
            <span className="font-medium text-gray-900">{metadata.reporting_period || "—"}</span>
          </div>
          <div className="flex">
            <span className="w-32 text-gray-500">Scope</span>
            <span className="font-medium text-gray-900">{metadata.scope || "All year levels"}</span>
          </div>
          <div className="flex">
            <span className="w-32 text-gray-500">Status filter</span>
            <span className="font-medium text-gray-900">{metadata.status_filter || "All statuses"}</span>
          </div>
          <div className="flex">
            <span className="w-32 text-gray-500">Date generated</span>
            <span className="font-medium text-gray-900">
              {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </span>
          </div>
        </div>

        {/* Summary Metric Cards - Exactly identical to SummaryReports.tsx */}
        {metadata.stats && (
          <div className="mb-6 font-sans">
            <h3 className="text-[10px] font-bold text-primary uppercase tracking-wider mb-2 border-b pb-1">Summary</h3>
            <div className="grid grid-cols-5 gap-4">
              <div className="border border-border-subtle rounded-lg py-2 px-3 flex justify-between bg-white">
                <span className="text-[9px] leading-5 text-secondary font-bold uppercase tracking-wider">Total Cases</span>
                <span className="text-base leading-5 font-bold text-on-surface">{metadata.stats.total ?? 0}</span>
              </div>
              <div className="border border-border-subtle rounded-lg py-2 px-3 flex justify-between bg-white">
                <span className="text-[9px] leading-5 text-secondary font-bold uppercase tracking-wider">Pending Cases</span>
                <span className="text-base leading-5 font-bold text-on-surface">{metadata.stats.pending ?? 0}</span>
              </div>
              <div className="border border-border-subtle rounded-lg py-2 px-3 flex justify-between bg-white">
                <span className="text-[9px] leading-5 text-secondary font-bold uppercase tracking-wider">Resolved Cases</span>
                <span className="text-base leading-5 font-bold text-on-surface">{metadata.stats.resolved ?? 0}</span>
              </div>
              <div className="border border-border-subtle rounded-lg py-2 px-3 flex justify-between bg-white">
                <span className="text-[9px] leading-5 text-secondary font-bold uppercase tracking-wider">Reprimand Cases</span>
                <span className="text-base leading-5 font-bold text-on-surface">{metadata.stats.reprimand ?? 0}</span>
              </div>
              <div className="border border-border-subtle rounded-lg py-2 px-3 flex justify-between bg-white">
                <span className="text-[9px] leading-5 text-secondary font-bold uppercase tracking-wider">Closed Cases</span>
                <span className="text-base leading-5 font-bold text-on-surface">{metadata.stats.closed ?? 0}</span>
              </div>
            </div>
          </div>
        )}

        {/* Section Heading */}
        <div className="flex justify-between items-baseline mb-2 border-b pb-1 font-sans">
          <h3 className="text-[12px] font-bold text-primary uppercase tracking-wider">{customHeading || "Case List"}</h3>
          {metadata.status_filter && metadata.status_filter !== "All statuses" && metadata.status_filter !== "all" && (
            <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">
              Total: {metadata.stats?.total ?? ""} {metadata.status_filter} {metadata.stats?.total === 1 ? "Case" : "Cases"}
            </span>
          )}
        </div>
      </>
    );

    const renderSmallHeader = () => (
      <div className="flex justify-between items-end border-b pb-3 mb-6 font-sans">
        <div>
          <h2 className="m-0 text-[13px] font-black uppercase tracking-wider text-black">Laguna College Guidance Office</h2>
          <p className="m-0 mt-0.5 text-[10px] font-bold text-gray-600">
            Disciplinary Case Report
          </p>
        </div>
        <div className="text-right">
          <p className="m-0 text-[10px] text-gray-500">
            {metadata.reporting_period || "—"}
          </p>
          <p className="m-0 mt-0.5 text-[9px] text-gray-400 uppercase font-bold tracking-widest">
            Case List (Continued)
          </p>
        </div>
      </div>
    );

    const renderTableHeader = (headers: string[]) => (
      <thead>
        <tr className="border-b border-gray-200 text-gray-600 font-bold uppercase text-[11px] tracking-wider font-sans">
          {headers.map((h, i) => {
            const isStatus = h.toLowerCase().includes("status");
            const isNum = h === "#" || h.toLowerCase() === "no.";
            return (
              <th
                key={i}
                className={`py-2 pr-2 ${isStatus ? "text-right" : "text-left"} ${isNum ? "w-8 pl-2" : ""}`}
              >
                {h}
              </th>
            );
          })}
        </tr>
      </thead>
    );

    const renderTableRow = (row: string[], index: number, headers: string[], isHiddenRef?: boolean) => (
      <tr
        key={isHiddenRef ? `meas-${index}` : index}
        {...(isHiddenRef ? { "data-row": true, "data-index": index } : {})}
        className="border-b border-gray-100 last:border-0 text-[12px] even:bg-[#FAFAFA]"
        style={{ pageBreakInside: "avoid" }}
      >
        {row.map((cell, cellIdx) => {
          const headerText = (headers[cellIdx] || "").toLowerCase().trim();
          const isStatusCol = headerText.includes("status");
          const isIndexCol = headerText === "#" || headerText === "no." || (cellIdx === 0 && /^\d+$/.test(cell));
          const isStudentCol = headerText.includes("student") || headerText.includes("name");

          if (isStatusCol) {
            return (
              <td
                key={cellIdx}
                style={{
                  padding: "12px 8px 12px 0",
                  textAlign: "right",
                  verticalAlign: "middle",
                  fontFamily: "sans-serif",
                }}
              >
                <span
                  style={{
                    ...getBadgeInlineStyle(cell),
                    display: "inline-block",
                    fontSize: "11px",
                    fontWeight: 700,
                    textTransform: "uppercase" as const,
                    letterSpacing: "0.05em",
                    whiteSpace: "nowrap",
                    lineHeight: "1",
                    verticalAlign: "middle",
                  }}
                >
                  {cell}
                </span>
              </td>
            );
          }

          if (isIndexCol) {
            return (
              <td key={cellIdx} className="py-3 pr-2 pl-2 text-gray-500 font-sans font-bold">
                {cell}
              </td>
            );
          }

          if (isStudentCol) {
            return (
              <td key={cellIdx} className="py-3 pr-2 font-medium text-gray-900 font-sans">
                {cell}
              </td>
            );
          }

          return (
            <td key={cellIdx} className="py-3 pr-2 text-gray-600 font-sans">
              {cell || "—"}
            </td>
          );
        })}
      </tr>
    );

    const renderPageFooter = (currentPage: number, totalPages: number) => (
      <div className="absolute bottom-8 left-12 right-12 flex justify-between items-end text-[10px] text-gray-400 font-sans border-t pt-4 bg-white">
        <div className="flex flex-col">
          <span className="font-bold">Generated by LCGO Information System</span>
          <span>Confidential Student Record</span>
        </div>
        <div className="font-bold">Page {currentPage} of {totalPages}</div>
      </div>
    );

    const renderClosingBlock = () => {
      const showSig1 = signatureConfig.sig1.show;
      const showSig2 = signatureConfig.sig2.show;
      const activeCount = (showSig1 ? 1 : 0) + (showSig2 ? 1 : 0);

      return (
        <div className="mt-6 font-sans" style={{ pageBreakInside: "avoid" }}>
          <div className="border-t border-gray-300 pt-3 mb-4 text-center text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            End of Report
          </div>

          {activeCount > 0 && (
            <div className={`flex ${activeCount === 2 ? "justify-between w-3/4" : "justify-center w-full"} mx-auto mt-10`}>
              {showSig1 && (
                <div className="flex flex-col items-center w-56 text-center">
                  <div className="border-b border-gray-800 w-full mb-2"></div>
                  <div className="font-bold text-sm text-gray-900">{signatureConfig.sig1.title || "Guidance Counselor"}</div>
                  <div className="text-xs text-gray-500 mt-1">{signatureConfig.sig1.label || "Prepared by:"}</div>
                </div>
              )}
              {showSig2 && (
                <div className="flex flex-col items-center w-56 text-center">
                  <div className="border-b border-gray-800 w-full mb-2"></div>
                  <div className="font-bold text-sm text-gray-900">{signatureConfig.sig2.title || "School Principal"}</div>
                  <div className="text-xs text-gray-500 mt-1">{signatureConfig.sig2.label || "Noted by:"}</div>
                </div>
              )}
            </div>
          )}
        </div>
      );
    };

    const renderHiddenMeasurementPass = () => (
      <div data-ai-measurement-root="true" style={{ position: "absolute", visibility: "hidden", top: "-9999px", left: "0", pointerEvents: "none" }} aria-hidden="true">
        <div data-page-frame className="bg-white shadow-md print:shadow-none w-[297mm] h-[210mm] px-12 py-8 text-gray-800 font-serif relative overflow-hidden box-border"></div>

        <div className="w-[297mm] px-12 py-8 box-border font-serif">
          <div data-first-header className="flex flex-col">
            {renderFirstHeader(parsedData?.tableHeading)}
          </div>

          <div data-cont-header className="flex flex-col">
            {renderSmallHeader()}
          </div>

          <div data-footer className="relative">
            <div className="flex justify-between items-end text-[10px] text-gray-400 font-sans border-t pt-4 bg-white">
              <div className="flex flex-col">
                <span className="font-bold">Generated by LCGO Information System</span>
                <span>Confidential Student Record</span>
              </div>
              <div className="font-bold">Page X of Y</div>
            </div>
          </div>

          <div data-closing className="flex flex-col">
            {renderClosingBlock()}
          </div>

          {parsedData && (
            <table className="w-full text-left border-collapse min-w-full font-sans">
              {renderTableHeader(parsedData.headers)}
              <tbody>
                {parsedData.rows.map((row, i) => renderTableRow(row, i, parsedData.headers, true))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );

    useLayoutEffect(() => {
      const frameEl = document.querySelector('[data-ai-measurement-root] [data-page-frame]');
      if (!frameEl) return;

      const PAGE_HEIGHT_PX = frameEl.getBoundingClientRect().height || 793.7;

      const firstHeaderH = document.querySelector('[data-ai-measurement-root] [data-first-header]')?.getBoundingClientRect().height || 0;
      const contHeaderH = document.querySelector('[data-ai-measurement-root] [data-cont-header]')?.getBoundingClientRect().height || 0;
      const tableHeaderH = document.querySelector('[data-ai-measurement-root] thead')?.getBoundingClientRect().height || 0;
      const footerH = document.querySelector('[data-ai-measurement-root] [data-footer]')?.getBoundingClientRect().height || 0;
      const closingH = document.querySelector('[data-ai-measurement-root] [data-closing]')?.getBoundingClientRect().height || 0;

      const rowEls = document.querySelectorAll('[data-ai-measurement-root] [data-row]');
      const rowHeights = Array.from(rowEls).map((el) => el.getBoundingClientRect().height);

      const SAFETY_MARGIN = 20;
      const topPadding = 32;
      const bottomAbsoluteOffset = 32;
      const footerBudget = bottomAbsoluteOffset + footerH;

      const contentBudget = PAGE_HEIGHT_PX - topPadding - footerBudget - SAFETY_MARGIN;

      if (!parsedData || parsedData.rows.length === 0) {
        const hasClosing = (firstHeaderH + tableHeaderH + closingH) <= contentBudget;
        const newPages = [{ rows: [] as string[][], isFirstPage: true, hasClosing }];
        if (!hasClosing) {
          newPages.push({ rows: [] as string[][], isFirstPage: false, hasClosing: true });
        }
        setPaginatedPages(newPages);
        return;
      }

      const allRows = parsedData.rows;
      const page1BudgetNoClosing = contentBudget - firstHeaderH - tableHeaderH;
      const page1BudgetWithClosing = page1BudgetNoClosing - closingH;
      const contBudgetNoClosing = contentBudget - contHeaderH - tableHeaderH;
      const contBudgetWithClosing = contBudgetNoClosing - closingH;

      const getRowHeight = (index: number) => rowHeights[index] || 40;

      // Check if everything fits on a single page WITH closing block
      let totalAllHeight = 0;
      for (let i = 0; i < allRows.length; i++) {
        totalAllHeight += getRowHeight(i);
      }

      if (totalAllHeight <= page1BudgetWithClosing) {
        setPaginatedPages([{ rows: allRows, isFirstPage: true, hasClosing: true }]);
        return;
      }

      // Step 1: Pack Page 1
      const page1Rows: string[][] = [];
      let page1Height = 0;

      for (let i = 0; i < allRows.length; i++) {
        const h = getRowHeight(i);
        if (page1Height + h <= page1BudgetNoClosing) {
          page1Rows.push(allRows[i]);
          page1Height += h;
        } else {
          break;
        }
      }

      if (page1Rows.length === 0 && allRows.length > 0) {
        page1Rows.push(allRows[0]);
      }

      const remainingRows = allRows.slice(page1Rows.length);

      // If all rows fit on Page 1 without closing block, but closing block doesn't fit:
      if (remainingRows.length === 0) {
        let shiftedCount = 0;
        let shiftedHeight = 0;
        for (let i = page1Rows.length - 1; i > 0; i--) {
          const h = getRowHeight(i);
          if (shiftedHeight + h <= contBudgetWithClosing && (page1Rows.length - (shiftedCount + 1)) >= 1) {
            shiftedHeight += h;
            shiftedCount++;
            if (shiftedCount >= Math.min(Math.floor(page1Rows.length / 2), 5)) break;
          } else {
            break;
          }
        }

        if (shiftedCount > 0) {
          const p1 = page1Rows.slice(0, page1Rows.length - shiftedCount);
          const p2 = page1Rows.slice(page1Rows.length - shiftedCount);
          setPaginatedPages([
            { rows: p1, isFirstPage: true, hasClosing: false },
            { rows: p2, isFirstPage: false, hasClosing: true },
          ]);
        } else {
          setPaginatedPages([
            { rows: page1Rows, isFirstPage: true, hasClosing: false },
            { rows: [], isFirstPage: false, hasClosing: true },
          ]);
        }
        return;
      }

      // Step 2: Pack Continuation Pages dynamically
      const pages: { rows: string[][]; isFirstPage: boolean; hasClosing: boolean }[] = [
        { rows: page1Rows, isFirstPage: true, hasClosing: false },
      ];

      let currentRemainingIdx = 0;
      while (currentRemainingIdx < remainingRows.length) {
        const remainingItems = remainingRows.slice(currentRemainingIdx);
        const remainingHeight = remainingItems.reduce((acc, _, idx) => acc + getRowHeight(page1Rows.length + currentRemainingIdx + idx), 0);

        // If all remaining items fit on this page WITH closing block:
        if (remainingHeight <= contBudgetWithClosing) {
          pages.push({
            rows: remainingItems,
            isFirstPage: false,
            hasClosing: true,
          });
          break;
        }

        // Otherwise pack as many rows as fit in contBudgetNoClosing
        const contRows: string[][] = [];
        let contHeight = 0;

        while (currentRemainingIdx < remainingRows.length) {
          const nextRow = remainingRows[currentRemainingIdx];
          const nextH = getRowHeight(page1Rows.length + currentRemainingIdx);

          if (contHeight + nextH <= contBudgetNoClosing) {
            contRows.push(nextRow);
            contHeight += nextH;
            currentRemainingIdx++;
          } else {
            if (contRows.length === 0) {
              contRows.push(nextRow);
              currentRemainingIdx++;
            }
            break;
          }
        }

        // Check if this was the last batch of rows:
        if (currentRemainingIdx === remainingRows.length) {
          if (contHeight <= contBudgetWithClosing) {
            pages.push({
              rows: contRows,
              isFirstPage: false,
              hasClosing: true,
            });
          } else {
            let shiftedCount = 0;
            let shiftedHeight = 0;
            for (let i = contRows.length - 1; i > 0; i--) {
              const rowGlobalIdx = page1Rows.length + (currentRemainingIdx - contRows.length + i);
              const h = getRowHeight(rowGlobalIdx);
              if (shiftedHeight + h <= contBudgetWithClosing && (contRows.length - (shiftedCount + 1)) >= 1) {
                shiftedHeight += h;
                shiftedCount++;
                if (shiftedCount >= Math.min(Math.floor(contRows.length / 2), 5)) break;
              } else {
                break;
              }
            }

            if (shiftedCount > 0) {
              const thisPageRows = contRows.slice(0, contRows.length - shiftedCount);
              const finalPageRows = contRows.slice(contRows.length - shiftedCount);
              pages.push({
                rows: thisPageRows,
                isFirstPage: false,
                hasClosing: false,
              });
              pages.push({
                rows: finalPageRows,
                isFirstPage: false,
                hasClosing: true,
              });
            } else {
              pages.push({
                rows: contRows,
                isFirstPage: false,
                hasClosing: false,
              });
              pages.push({
                rows: [],
                isFirstPage: false,
                hasClosing: true,
              });
            }
          }
        } else {
          pages.push({
            rows: contRows,
            isFirstPage: false,
            hasClosing: false,
          });
        }
      }

      setPaginatedPages(pages);
    }, [parsedData, metadata, signatureConfig, bodyMarkdown]);

    useImperativeHandle(ref, () => ({
      generatePdf: async () => {
        if (!reportRef.current || isExporting) return;
        setIsExporting(true);
        const element = reportRef.current;
        const filenameLabel = metadata.reporting_period || "Report";
        const filename = `Guidance_Report_${filenameLabel.replace(/[\s\.,-]/g, "_")}.pdf`;

        // Temporarily reset preview transform for pristine PDF export
        const originalTransform = element.style.transform;
        const originalPosition = element.style.position;
        const originalLeft = element.style.left;
        const originalMarginLeft = element.style.marginLeft;

        if (isPreview) {
          element.style.transform = "none";
          element.style.position = "relative";
          element.style.left = "0";
          element.style.marginLeft = "0";
        }

        const opt = {
          margin: 0,
          filename,
          image: { type: "jpeg" as const, quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: "#FFFFFF",
            windowWidth: 1123,
            onclone: (clonedDocument: Document) => {
              clonedDocument.documentElement.classList.remove("dark");
              const paper = clonedDocument.querySelector('.report-preview-paper') as HTMLElement | null;
              if (paper) {
                paper.style.zoom = '1';
                paper.style.transform = 'none';
              }
              const sheets = clonedDocument.querySelectorAll('.report-page-sheet');
              sheets.forEach((sheet) => {
                const el = sheet as HTMLElement;
                el.style.boxShadow = 'none';
                el.style.width = '297mm';
                el.style.height = '210mm';
                el.style.minHeight = '210mm';
                el.style.maxHeight = '210mm';
                el.style.boxSizing = 'border-box';
                el.style.margin = '0';
              });
            },
          },
          jsPDF: { unit: "mm", format: [297, 210] as [number, number], orientation: "landscape" as const },
          pagebreak: { mode: ["css", "legacy"] },
        };

        try {
          await new Promise<void>((resolve) => setTimeout(resolve, 100));
          const pdfBase64 = await html2pdf().from(element).set(opt).outputPdf("datauristring");
          const base64Data = pdfBase64.split(",")[1];
          await invoke("save_pdf", { base64Data, filename });
        } catch (err) {
          alert("Failed to export PDF: " + err);
        } finally {
          if (isPreview) {
            element.style.transform = originalTransform;
            element.style.position = originalPosition;
            element.style.left = originalLeft;
            element.style.marginLeft = originalMarginLeft;
          }
          setIsExporting(false);
        }
      },
    }));

    useEffect(() => {
      if (!isPreview || !containerRef.current) return;

      const observer = new ResizeObserver((entries) => {
        const { width } = entries[0].contentRect;
        const padding = 32;
        const availableWidth = Math.max(100, width - padding);
        const newScale = Math.min(1, availableWidth / A4_WIDTH_PX);
        setScale(newScale);
      });

      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }, [isPreview]);

    // Total height calculation for the scaled preview container
    const totalPagesCount = paginatedPages.length || 1;
    const singlePageHeightPx = 793.7; // 210mm at 96dpi approx
    const pageGapPx = 32;
    const computedTotalHeight = (totalPagesCount * singlePageHeightPx + (totalPagesCount - 1) * pageGapPx) * scale;

    return (
      <div
        ref={containerRef}
        className={isPreview ? "w-full flex justify-center bg-gray-100 dark:bg-surface-container-low rounded-xl p-4 lg:p-6 overflow-hidden my-3 print:bg-white print:p-0 print:rounded-none" : ""}
        style={isPreview ? { height: `${computedTotalHeight}px`, position: "relative" } : { position: "absolute", visibility: "hidden", top: "-9999px", left: "0", pointerEvents: "none" }}
        aria-hidden={!isPreview}
      >
        {renderHiddenMeasurementPass()}

        <div
          ref={reportRef}
          className={`report-preview-paper flex flex-col ${isExporting ? "gap-0" : "gap-8"} bg-transparent print:bg-white origin-top`}
          style={isPreview ? {
            width: "297mm",
            transform: `scale(${scale})`,
            transformOrigin: "top center",
            position: "absolute",
            top: 0,
            left: "50%",
            marginLeft: "-561.25px",
          } : {
            width: "297mm",
            position: "relative",
          }}
        >
          {paginatedPages.length > 0 ? (
            paginatedPages.map((page, index) => {
              let globalStartIndex = 0;
              for (let p = 0; p < index; p++) {
                globalStartIndex += paginatedPages[p].rows.length;
              }

              return (
                <div
                  key={index}
                  className={`report-page-sheet bg-white ${isExporting ? "shadow-none" : "shadow-md"} print:shadow-none w-[297mm] h-[210mm] min-h-[210mm] max-h-[210mm] box-border px-12 py-8 text-gray-800 font-serif relative overflow-hidden`}
                >
                  {page.rows.length === 0 && !page.isFirstPage ? (
                    // Orphaned closing-only page: continuation header + closing block
                    <div className="w-full flex flex-col">
                      {renderSmallHeader()}
                      <div className="mt-8">
                        {renderClosingBlock()}
                      </div>
                    </div>
                  ) : (
                    <>
                      {page.isFirstPage ? renderFirstHeader(parsedData?.tableHeading) : renderSmallHeader()}
                      <div className="w-full">
                        <table className="w-full text-left border-collapse min-w-full font-sans">
                          {renderTableHeader(parsedData?.headers || [])}
                          <tbody>
                            {page.rows.length > 0 ? (
                              page.rows.map((row, i) => renderTableRow(row, globalStartIndex + i, parsedData?.headers || []))
                            ) : (
                              <tr>
                                <td colSpan={parsedData?.headers?.length || 1} className="py-8 text-center text-gray-500 text-sm font-sans italic">
                                  No cases found for this period.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      {page.hasClosing && !(page.rows.length === 0 && !page.isFirstPage) && renderClosingBlock()}
                    </>
                  )}
                  {renderPageFooter(index + 1, paginatedPages.length)}
                </div>
              );
            })
          ) : (
            // Fallback for direct markdown content without tables
            <div className={`bg-white ${isExporting ? "shadow-none" : "shadow-md"} print:shadow-none w-[297mm] h-[210mm] box-border px-12 py-8 text-gray-800 font-serif relative overflow-hidden`}>
              {renderFirstHeader()}
              <div className="ai-report-body font-sans text-gray-800 text-xs">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {bodyMarkdown}
                </ReactMarkdown>
              </div>
              {renderClosingBlock()}
              {renderPageFooter(1, 1)}
            </div>
          )}
        </div>
      </div>
    );
  }
);

export default AiReportPdfGenerator;


