import { localDay } from "../../utils/caseValues";
import { useState, useEffect, useRef, useCallback } from "react";
import { pdf } from "@react-pdf/renderer";
import { invoke } from "@tauri-apps/api/core";
import { AiReportData, AiReportDocument } from "../components/AiReportDocument";

export function useAiReportPdf(reportData: AiReportData | null) {
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);

  const generateBlob = useCallback(async (data: AiReportData) => {
    try {
      setIsGenerating(true);
      setError(null);

      const docElement = <AiReportDocument data={data} />;
      const blob = await pdf(docElement).toBlob();

      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
      }

      const url = URL.createObjectURL(blob);
      currentBlobUrlRef.current = url;
      setPdfBlobUrl(url);
    } catch (err) {
      console.error("[useAiReportPdf] Failed to compile PDF:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
    }
  }, []);

  useEffect(() => {
    if (!reportData) {
      setPdfBlobUrl(null);
      return;
    }

    const timer = setTimeout(() => {
      generateBlob(reportData);
    }, 150);

    return () => clearTimeout(timer);
  }, [reportData, generateBlob]);

  useEffect(() => {
    return () => {
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
      }
    };
  }, []);

  const exportPdf = useCallback(
    async (customFilename?: string) => {
      if (!reportData) throw new Error("No report data available to export");

      const docElement = <AiReportDocument data={reportData} />;
      const blob = await pdf(docElement).toBlob();

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(blob);
      const base64Data = await base64Promise;

      const safeTitle = (reportData.title || "Guidance_Report")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .replace(/_+/g, "_");
      const filename = customFilename || `${safeTitle}_${localDay()}.pdf`;

      const savedPath = await invoke<string>("save_pdf", {
        base64Data,
        filename,
      });

      return savedPath;
    },
    [reportData]
  );


  return {
    pdfBlobUrl,
    isGenerating,
    error,
    exportPdf,
  };
}
