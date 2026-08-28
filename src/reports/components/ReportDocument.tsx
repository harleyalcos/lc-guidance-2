import React from "react";
import { Document, Page, StyleSheet } from "@react-pdf/renderer";
import { PaperSize, ReportData } from "../types/reportTypes";
import { ReportHeader } from "./ReportHeader";
import { ReportSummary } from "./ReportSummary";
import { ReportTable } from "./ReportTable";
import { ReportSignatureBlock } from "./ReportSignatureBlock";
import { ReportFooter } from "./ReportFooter";

const styles = StyleSheet.create({
  page: {
    orientation: "landscape",
    paddingTop: 26,
    paddingBottom: 46, // ensures content never overlaps the fixed footer
    paddingHorizontal: 36,
    backgroundColor: "#ffffff",
    fontFamily: "Helvetica",
  },
});

const getPageSize = (size?: PaperSize): "A4" | "LETTER" | "LEGAL" | [number, number] => {
  if (size === "FOLIO") return [612, 936]; // 8.5 x 13 in
  if (size === "LETTER") return "LETTER";
  if (size === "LEGAL") return "LEGAL";
  return "A4";
};

interface ReportDocumentProps {
  data: ReportData;
}

export const ReportDocument: React.FC<ReportDocumentProps> = ({ data }) => {
  const showSummary = data.includes.summary && data.statusFilter === "all";
  const resolvedPageSize = getPageSize(data.paperSize);

  return (
    <Document title="Guidance Office Cases Report" author="Laguna College Guidance Office">
      <Page size={resolvedPageSize} orientation="landscape" style={styles.page}>
        {/* Header */}
        <ReportHeader
          metadata={data.metadata}
          statusFilter={data.statusFilter}
          totalCases={data.summary.total}
        />

        {/* Summary Statistics */}
        {showSummary && <ReportSummary summary={data.summary} />}

        {/* Case Table */}
        <ReportTable rows={data.rows} columns={data.columns} />

        {/* Signature Section */}
        <ReportSignatureBlock
          signatureConfig={data.signatureConfig}
          showSignatures={data.includes.signature}
        />

        {/* Page Footer - Fixed across all pages */}
        <ReportFooter />
      </Page>
    </Document>
  );
};
