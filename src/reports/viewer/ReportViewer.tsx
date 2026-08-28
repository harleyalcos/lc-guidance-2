import React from "react";
import { ReportState } from "../types/reportTypes";

interface ReportViewerProps {
  pdfBlobUrl: string | null;
  state: ReportState;
  error: string | null;
  onRetry?: () => void;
}

export const ReportViewer: React.FC<ReportViewerProps> = ({
  pdfBlobUrl,
  state,
  error,
  onRetry,
}) => {
  return (
    <div className="w-full flex flex-col items-center">
      <div className="text-sm text-gray-400 dark:text-secondary mb-2 self-start flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
          <span className="font-medium">Live Document Preview</span>
        </div>
        {state === "generating" && (
          <div className="flex items-center gap-1.5 text-xs text-primary animate-pulse">
            <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>
            <span>Updating PDF...</span>
          </div>
        )}
      </div>

      {/* Viewer Frame */}
      <div className="w-full bg-gray-100 dark:bg-surface-container-low border border-outline-variant rounded-2xl overflow-hidden shadow-inner flex flex-col items-center justify-center min-h-[640px] lg:min-h-[780px] relative">
        {state === "generating" && !pdfBlobUrl && (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
            <h3 className="text-base font-bold text-on-surface mb-1">Generating Report</h3>
            <p className="text-xs text-secondary max-w-sm">
              Constructing vector PDF document and compiling multi-page layout...
            </p>
          </div>
        )}

        {state === "error" && (
          <div className="flex flex-col items-center justify-center p-8 text-center max-w-md">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-2xl">error</span>
            </div>
            <h3 className="text-base font-bold text-on-surface mb-1">Failed to Render PDF</h3>
            <p className="text-xs text-secondary mb-4">{error || "An unexpected error occurred."}</p>
            {onRetry && (
              <button onClick={onRetry} className="btn-secondary text-xs py-1.5 px-4">
                <span className="material-symbols-outlined text-sm">refresh</span>
                <span>Retry Generation</span>
              </button>
            )}
          </div>
        )}

        {pdfBlobUrl && (
          <iframe
            src={`${pdfBlobUrl}#toolbar=0&navpanes=0`}
            title="PDF Document Preview"
            className="w-full min-h-[640px] lg:min-h-[780px] h-full border-0 rounded-xl bg-white"
          />
        )}
      </div>
    </div>
  );
};
