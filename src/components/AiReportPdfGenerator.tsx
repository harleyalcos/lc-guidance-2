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
          margin: [10, 10, 10, 10], // Adjust margin as needed
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
          jsPDF: { unit: "mm", format: [A4_WIDTH_MM, A4_HEIGHT_MM] as [number, number], orientation: isLandscape ? "landscape" : "portrait" },
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
          <div className="prose prose-sm max-w-none text-gray-800 font-sans prose-p:leading-relaxed prose-headings:text-gray-900 prose-strong:text-gray-900">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{bodyMarkdown}</ReactMarkdown>
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
