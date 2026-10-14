import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { pdf } from "@react-pdf/renderer";
import { invoke } from "@tauri-apps/api/core";
import { CaseRecord } from "../../types";
import { ReportConfig, ReportData, ReportState } from "../types/reportTypes";
import { buildReportData } from "../utils/buildReportData";
import { ReportDocument } from "../components/ReportDocument";

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result ? result.split(",")[1] || "" : "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export interface UseReportGeneratorResult {
  state: ReportState;
  error: string | null;
  pdfBlob: Blob | null;
  pdfBlobUrl: string | null;
  reportData: ReportData;
  exportPdf: (customFilename?: string) => Promise<void>;
  regenerate: () => void;
}

export const useReportGenerator = (
  config: ReportConfig,
  cases: CaseRecord[]
): UseReportGeneratorResult => {
  const [state, setState] = useState<ReportState>("generating");
  const [error, setError] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [manualTrigger, setManualTrigger] = useState(0);

  const prevBlobUrlRef = useRef<string | null>(null);

  // Build the normalized report data model
  const reportData = useMemo(() => {
    return buildReportData(config, cases);
  }, [config, cases]);

  // Reactive and debounced PDF generation
  useEffect(() => {
    let isCancelled = false;
    setState("generating");
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const docElement = <ReportDocument data={reportData} />;
        const blob = await pdf(docElement).toBlob();

        if (isCancelled) return;

        // Revoke previous URL if any
        if (prevBlobUrlRef.current) {
          URL.revokeObjectURL(prevBlobUrlRef.current);
        }

        const url = URL.createObjectURL(blob);
        prevBlobUrlRef.current = url;

        setPdfBlob(blob);
        setPdfBlobUrl(url);
        setState("ready");
      } catch (err: unknown) {
        if (isCancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("PDF generation error:", err);
        setError(msg);
        setState("error");
      }
    }, 150);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [reportData, manualTrigger]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (prevBlobUrlRef.current) {
        URL.revokeObjectURL(prevBlobUrlRef.current);
      }
    };
  }, []);

  const regenerate = useCallback(() => {
    setManualTrigger((c) => c + 1);
  }, []);

  // Export the exact generated PDF blob using Tauri save_pdf
  const exportPdf = useCallback(
    async (customFilename?: string) => {
      if (!pdfBlob) {
        throw new Error("No generated PDF available to export.");
      }

      const defaultFilename = `Guidance_Report_${reportData.metadata.reportingPeriod.replace(/[\s\.,\/\-\\–]/g, "_").replace(/_+/g, "_")}.pdf`;
      const filename = customFilename || defaultFilename;

      const base64Data = await blobToBase64(pdfBlob);
      await invoke("save_pdf", { base64Data, filename });
    },
    [pdfBlob, reportData.metadata.reportingPeriod]
  );

  // Saving opens the exact PDF in the system viewer, where staff can use Ctrl+P.

  return {
    state,
    error,
    pdfBlob,
    pdfBlobUrl,
    reportData,
    exportPdf,
    regenerate,
  };
};
