import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import html2pdf from "html2pdf.js";
import lcOfficialLogo from "../assets/lc-official-logo.jpg";
import guidanceLogo from "../assets/guidance-logo.png";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface AiReportMetadata {
  title: string;
  reporting_period: string;
  scope: string;
  status_filter: string;
  orientation?: "portrait" | "landscape";
}

interface AiReportPdfGeneratorProps {
  metadata: AiReportMetadata;
  bodyMarkdown: string;
  isPreview?: boolean;
}

export interface AiReportPdfGeneratorRef {
  generatePdf: () => Promise<void>;
}

const reportMarkdownComponents = {
  h1: ({ children }: any) => (
    <h1 className="text-base font-bold text-gray-900 mt-6 mb-3 pb-1 border-b-2 border-[#3C3489]/20 uppercase tracking-wider">
      {children}
    </h1>
  ),
  h2: ({ children }: any) => (
    <h2 className="text-sm font-bold text-gray-900 mt-5 mb-2.5 pb-1 border-b border-gray-200 uppercase tracking-wide">
      {children}
    </h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="text-xs font-bold text-gray-900 mt-4 mb-2 uppercase tracking-wider">
      {children}
    </h3>
  ),
  h4: ({ children }: any) => (
    <h4 className="text-xs font-bold text-gray-800 mt-3 mb-1.5">
      {children}
    </h4>
  ),
  p: ({ children }: any) => (
    <p className="text-xs leading-relaxed text-gray-700 mb-3.5 font-normal">
      {children}
    </p>
  ),
  ul: ({ children }: any) => (
    <ul className="list-disc list-outside ml-5 mb-4 space-y-1.5 text-xs text-gray-700">
      {children}
    </ul>
  ),
  ol: ({ children }: any) => (
    <ol className="list-decimal list-outside ml-5 mb-4 space-y-1.5 text-xs text-gray-700">
      {children}
    </ol>
  ),
  li: ({ children }: any) => (
    <li className="leading-relaxed pl-0.5 mb-1">
      {children}
    </li>
  ),
  strong: ({ children }: any) => (
    <strong className="font-bold text-gray-900">
      {children}
    </strong>
  ),
  em: ({ children }: any) => (
    <em className="italic text-gray-800">
      {children}
    </em>
  ),
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-3 border-[#3C3489] bg-gray-50/80 pl-3.5 py-2 my-3 text-xs italic text-gray-600 rounded-r">
      {children}
    </blockquote>
  ),
  hr: () => (
    <hr className="my-5 border-0 border-t border-gray-200" />
  ),
  table: ({ children }: any) => (
    <div className="my-4 overflow-hidden rounded-md border border-gray-200 w-full shadow-xs">
      <table className="w-full text-left border-collapse text-xs">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: any) => (
    <thead className="bg-gray-100/90 border-b border-gray-300">
      {children}
    </thead>
  ),
  tbody: ({ children }: any) => (
    <tbody className="divide-y divide-gray-200 bg-white">
      {children}
    </tbody>
  ),
  tr: ({ children }: any) => (
    <tr className="even:bg-[#F9FAFB]">
      {children}
    </tr>
  ),
  th: ({ children }: any) => (
    <th className="py-2.5 px-3 font-bold text-gray-900 uppercase tracking-wider text-[10px] bg-gray-100/80 border-b border-gray-300 [&:nth-child(2)]:border-r-2 [&:nth-child(2)]:border-r-gray-300">
      {children}
    </th>
  ),
  td: ({ children }: any) => (
    <td className="py-2.5 px-3 text-gray-700 text-xs align-top border-b border-gray-200 [&:nth-child(2)]:border-r-2 [&:nth-child(2)]:border-r-gray-300 [&:nth-child(2)]:font-semibold">
      {children}
    </td>
  ),
  code: ({ inline, children }: any) =>
    inline ? (
      <code className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded font-mono text-[11px] border border-gray-200">
        {children}
      </code>
    ) : (
      <pre className="bg-gray-900 text-gray-100 p-3 rounded font-mono text-xs overflow-x-auto my-3">
        <code>{children}</code>
      </pre>
    ),
};

function parseMarkdownTable(tableBlock: string): { headers: string[]; rows: string[][] } | null {
  const lines = tableBlock.trim().split("\n").map(l => l.trim()).filter(Boolean);
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

  return { headers, rows };
}

function combineAdjacentTables(markdown: string): string {
  // Regex to match section headers and markdown tables
  const tableBlockRegex = /(?:(###?\s+[^\n]+)\n+)?((?:\|[^\n]+\|\n?)+)/g;
  
  const matches: { fullMatch: string; heading: string; tableStr: string; index: number; length: number }[] = [];
  let match;
  
  while ((match = tableBlockRegex.exec(markdown)) !== null) {
    matches.push({
      fullMatch: match[0],
      heading: (match[1] || "").replace(/^#+\s*/, "").trim(),
      tableStr: match[2] || "",
      index: match.index,
      length: match[0].length,
    });
  }

  if (matches.length < 2) return markdown;

  let result = markdown;
  // Iterate backwards to combine adjacent small tables
  for (let i = matches.length - 2; i >= 0; i--) {
    const t1 = matches[i];
    const t2 = matches[i + 1];

    const betweenText = markdown.substring(t1.index + t1.length, t2.index).trim();
    if (betweenText.length > 0) continue;

    const parsed1 = parseMarkdownTable(t1.tableStr);
    const parsed2 = parseMarkdownTable(t2.tableStr);

    if (!parsed1 || !parsed2) continue;
    if (parsed1.headers.length > 3 || parsed2.headers.length > 3) continue;

    const h1_col1 = t1.heading ? `${t1.heading}` : (parsed1.headers[0] || 'Metric');
    const h1_col2 = parsed1.headers[1] || 'Count';
    
    const h2_col1 = t2.heading ? `${t2.heading}` : (parsed2.headers[0] || 'Category');
    const h2_col2 = parsed2.headers[1] || 'Count';

    const combinedHeaders = [h1_col1, h1_col2, h2_col1, h2_col2];

    const maxRows = Math.max(parsed1.rows.length, parsed2.rows.length);
    const combinedRows: string[][] = [];

    for (let r = 0; r < maxRows; r++) {
      const r1 = parsed1.rows[r] || ["", ""];
      const r2 = parsed2.rows[r] || ["", ""];
      combinedRows.push([
        r1[0] || "",
        r1[1] || "",
        r2[0] || "",
        r2[1] || "",
      ]);
    }

    let combinedMd = `\n\n| ${combinedHeaders.join(" | ")} |\n`;
    combinedMd += `| :--- | :---: | :--- | :---: |\n`;
    for (const row of combinedRows) {
      combinedMd += `| ${row.join(" | ")} |\n`;
    }
    combinedMd += `\n`;

    const replaceStart = t1.index;
    const replaceEnd = t2.index + t2.length;
    result = result.substring(0, replaceStart) + combinedMd + result.substring(replaceEnd);
  }

  return result;
}

const AiReportPdfGenerator = forwardRef<AiReportPdfGeneratorRef, AiReportPdfGeneratorProps>(
  ({ metadata, bodyMarkdown, isPreview = false }, ref) => {
    const reportRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [scale, setScale] = useState(1);
    const [scaledHeight, setScaledHeight] = useState("auto");

    const isLandscape = metadata.orientation === "landscape";
    const A4_WIDTH_MM = isLandscape ? 297 : 210;
    const A4_HEIGHT_MM = isLandscape ? 210 : 297;
    // Assuming 96dpi
    const A4_WIDTH_PX = isLandscape ? 1122 : 794; 

    useImperativeHandle(ref, () => ({
      generatePdf: async () => {
        if (!reportRef.current || isExporting) return;
        setIsExporting(true);
        const element = reportRef.current;
        const filenameLabel = metadata.reporting_period || "Report";
        const filename = `Guidance_AI_Report_${filenameLabel.replace(/[\s\.,-]/g, "_")}.pdf`;

        // Temporarily remove scaling for clean PDF export if we are in preview mode
        const originalTransform = element.style.transform;
        if (isPreview) {
          element.style.transform = "none";
        }

        const opt = {
          margin: [10, 10, 10, 10] as [number, number, number, number], // Adjust margin as needed
          filename,
          image: { type: "jpeg" as const, quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: "#FFFFFF",
            onclone: (clonedDocument: Document) => {
              clonedDocument.documentElement.classList.remove("dark");
            },
          },
          jsPDF: { unit: "mm", format: [A4_WIDTH_MM, A4_HEIGHT_MM] as [number, number], orientation: (isLandscape ? "landscape" : "portrait") as "landscape" | "portrait" },
        };

        try {
          // Delay slightly to let React render any hidden elements if needed
          await new Promise<void>((resolve) => setTimeout(resolve, 100));
          const pdfBase64 = await html2pdf().from(element).set(opt).outputPdf("datauristring");
          const base64Data = pdfBase64.split(",")[1];
          await invoke("save_pdf", { base64Data, filename });
        } catch (err) {
          alert("Failed to export PDF: " + err);
        } finally {
          if (isPreview) {
            element.style.transform = originalTransform;
          }
          setIsExporting(false);
        }
      },
    }));

    useEffect(() => {
      if (!isPreview || !containerRef.current) return;
      
      const observer = new ResizeObserver((entries) => {
        const { width } = entries[0].contentRect;
        // If container is smaller than A4, scale it down. Otherwise keep it at 1.
        const newScale = Math.min(1, width / A4_WIDTH_PX);
        setScale(newScale);
      });
      
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }, [isPreview]);

    useEffect(() => {
      if (!isPreview || !reportRef.current) return;
      // Calculate the wrapper height based on the scaled inner content height
      // Add a slight delay to allow markdown to render fully before calculating height
      const timeout = setTimeout(() => {
        if (reportRef.current) {
          setScaledHeight(`${reportRef.current.offsetHeight * scale}px`);
        }
      }, 150);
      return () => clearTimeout(timeout);
    }, [scale, isPreview, bodyMarkdown]);

    return (
      <div 
        ref={containerRef}
        className={isPreview ? "w-full flex justify-center bg-gray-50 border border-gray-200 rounded-xl overflow-hidden shadow-inner my-4" : ""}
        style={isPreview ? { height: scaledHeight, position: "relative" } : { position: "absolute", visibility: "hidden", top: "-9999px", left: "0", pointerEvents: "none" }}
        aria-hidden={!isPreview}
      >
        <div 
          ref={reportRef} 
          className="bg-white text-gray-800 font-sans box-border px-12 py-8"
          style={isPreview ? { 
            width: `${A4_WIDTH_PX}px`, 
            transform: `scale(${scale})`, 
            transformOrigin: "top center",
            position: "absolute",
            top: 0,
            left: "50%",
            marginLeft: `-${A4_WIDTH_PX / 2}px`
          } : {
            width: isLandscape ? "297mm" : "210mm",
            position: "relative"
          }}
        >
          {/* Header */}
          <div className="flex flex-col">
            <div className="grid grid-cols-[84px_1fr_84px] items-center gap-4 mb-4 font-sans">
              <img src={lcOfficialLogo} alt="Laguna College Logo" className="w-[72px] h-[72px] object-contain justify-self-start" />
              <div className="text-center text-black" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
                <h2 className="m-0 text-[15px] leading-[18px] font-black uppercase tracking-[0.02em] text-black">LAGUNA COLLEGE</h2>
                <p className="m-0 mt-0.5 text-[11px] leading-[13px] font-bold text-black">San Pablo City</p>
                <p className="m-0 mt-0.5 text-[18px] leading-[21px] font-black text-black">Guidance Office</p>
              </div>
              <img src={guidanceLogo} alt="Guidance Office Logo" className="w-[72px] h-[72px] object-contain justify-self-end" />
            </div>

            <div className="h-0.5 w-full bg-[#3C3489] mb-5"></div>

            <div className="text-center mb-6">
              <h1 className="text-base font-bold uppercase tracking-wider mb-0.5 font-sans text-gray-900">
                {metadata.title || "Guidance Office AI Report"}
              </h1>
              <p className="text-xs text-gray-500 font-sans">Generated by AI Assistant</p>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 mb-6 text-xs w-3/4 mx-auto font-sans text-left">
              <div className="flex">
                <span className="w-32 text-gray-500">Reporting period</span>
                <span className="font-medium text-gray-900">{metadata.reporting_period || "—"}</span>
              </div>
              <div className="flex">
                <span className="w-32 text-gray-500">Scope</span>
                <span className="font-medium text-gray-900">{metadata.scope || "—"}</span>
              </div>
              <div className="flex">
                <span className="w-32 text-gray-500">Status filter</span>
                <span className="font-medium text-gray-900">{metadata.status_filter || "—"}</span>
              </div>
              <div className="flex">
                <span className="w-32 text-gray-500">Date generated</span>
                <span className="font-medium text-gray-900">
                  {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-300 pt-6 mb-4"></div>



          {/* Body */}
          <div className="ai-report-body font-sans text-gray-800 text-xs">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={reportMarkdownComponents}>
              {combineAdjacentTables(bodyMarkdown)}
            </ReactMarkdown>
          </div>

          {/* Closing */}
          <div className="mt-12 font-sans" style={{ pageBreakInside: "avoid" }}>
            <div className="border-t border-gray-300 pt-3 mb-8 text-center text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              End of Report
            </div>

            <div className="flex justify-between w-3/4 mx-auto">
              <div className="flex flex-col items-center w-56 text-center">
                <div className="border-b border-gray-800 w-full mb-2"></div>
                <div className="font-bold text-sm text-gray-900">Guidance Counselor</div>
                <div className="text-xs text-gray-500 mt-1">Prepared by</div>
              </div>
              <div className="flex flex-col items-center w-56 text-center">
                <div className="border-b border-gray-800 w-full mb-2"></div>
                <div className="font-bold text-sm text-gray-900">School Principal</div>
                <div className="text-xs text-gray-500 mt-1">Noted by</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

export default AiReportPdfGenerator;
