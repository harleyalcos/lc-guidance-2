import React from "react";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import lcOfficialLogo from "../../assets/lc-official-logo.jpg";
import guidanceLogo from "../../assets/guidance-logo.png";
import { PaperSize } from "../types/reportTypes";

export interface AiReportData {
  title: string;
  reportingPeriod: string;
  scope: string;
  statusFilter: string;
  dateGenerated: string;
  stats?: {
    total?: number | string;
    pending?: number | string;
    resolved?: number | string;
    reprimand?: number | string;
    closed?: number | string;
  };
  introText?: string;
  tableHeading?: string;
  tableHeaders?: string[];
  tableRows?: string[][];
  outroText?: string;
  signatureConfig?: {
    sig1: { show: boolean; label: string; title: string };
    sig2: { show: boolean; label: string; title: string };
  };
  paperSize?: PaperSize;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 42,
    paddingHorizontal: 32,
    backgroundColor: "#ffffff",
    fontFamily: "Helvetica",
  },
  headerContainer: {
    marginBottom: 8,
  },
  institutionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    objectFit: "contain",
  },
  institutionTextContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  institutionName: {
    fontFamily: "Times-Bold",
    fontSize: 13,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#000000",
  },
  institutionLocation: {
    fontFamily: "Times-Roman",
    fontSize: 8.5,
    color: "#1f2937",
    marginTop: 1,
  },
  officeName: {
    fontFamily: "Times-Bold",
    fontSize: 14,
    fontWeight: "bold",
    color: "#000000",
    marginTop: 1,
  },
  divider: {
    height: 2,
    backgroundColor: "#002F87",
    width: "100%",
    marginBottom: 8,
  },
  titleContainer: {
    alignItems: "center",
    marginBottom: 6,
  },
  reportTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#111827",
  },
  reportSubtitle: {
    fontFamily: "Helvetica",
    fontSize: 7.5,
    color: "#6b7280",
    marginTop: 1,
  },
  metadataGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  metadataItem: {
    width: "48%",
    flexDirection: "row",
    marginBottom: 3,
  },
  metadataLabel: {
    fontFamily: "Helvetica",
    fontSize: 7.5,
    color: "#6b7280",
    width: 84,
  },
  metadataValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: "#111827",
    flex: 1,
  },

  // Summary Metrics Pills
  summaryContainer: {
    marginBottom: 8,
  },
  summaryTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#002F87",
    marginBottom: 4,
    borderBottomWidth: 0.8,
    borderBottomColor: "#002F87",
    paddingBottom: 2,
  },
  summaryCardsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryPill: {
    borderWidth: 0.8,
    borderColor: "#e5e7eb",
    borderRadius: 6,
    paddingVertical: 3.5,
    paddingHorizontal: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    width: "19%",
  },
  summaryPillLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    textTransform: "uppercase",
    color: "#6b7280",
  },
  summaryPillValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    color: "#111827",
  },

  // Narrative Text
  narrativeContainer: {
    marginBottom: 8,
    paddingVertical: 2,
  },
  narrativeParagraph: {
    fontFamily: "Helvetica",
    fontSize: 8,
    lineHeight: 1.45,
    color: "#374151",
    marginBottom: 3.5,
    textAlign: "justify",
  },
  narrativeHeading: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#002F87",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderBottomWidth: 0.8,
    borderBottomColor: "#002F87",
    paddingBottom: 2,
    marginBottom: 4,
    marginTop: 4,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 2.5,
    paddingLeft: 6,
  },
  bulletDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#002F87",
    marginRight: 5,
    marginTop: 4,
  },
  bulletText: {
    fontFamily: "Helvetica",
    fontSize: 8,
    lineHeight: 1.35,
    color: "#374151",
    flex: 1,
  },

  // Table Section
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    borderBottomWidth: 0.8,
    borderBottomColor: "#002F87",
    paddingBottom: 2,
    marginBottom: 4,
    marginTop: 2,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#002F87",
  },
  table: {
    width: "100%",
    marginBottom: 6,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    borderTopWidth: 0.5,
    borderTopColor: "#e5e7eb",
    paddingVertical: 3.5,
    paddingHorizontal: 2,
  },
  tableHeaderCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#4b5563",
    paddingHorizontal: 2,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#f3f4f6",
    paddingVertical: 3,
    paddingHorizontal: 2,
    minHeight: 14,
    alignItems: "center",
  },
  tableRowEven: {
    backgroundColor: "#ffffff",
  },
  tableRowOdd: {
    backgroundColor: "#fafafa",
  },
  tableCell: {
    fontFamily: "Helvetica",
    fontSize: 6.5,
    color: "#374151",
    paddingHorizontal: 2,
  },
  tableCellBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    color: "#111827",
    paddingHorizontal: 2,
  },

  // Status Styling
  statusPending: {
    color: "#D97706",
    fontFamily: "Helvetica-Bold",
  },
  statusResolved: {
    color: "#2563EB",
    fontFamily: "Helvetica-Bold",
  },
  statusReprimand: {
    color: "#0D9488",
    fontFamily: "Helvetica-Bold",
  },
  statusClosed: {
    color: "#DC2626",
    fontFamily: "Helvetica-Bold",
  },

  // Signatures
  signatureWrapper: {
    marginTop: 12,
    marginBottom: 4,
  },
  signatureContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-start",
    paddingHorizontal: 24,
    marginTop: 8,
  },
  signatureBox: {
    width: 160,
    alignItems: "center",
  },
  signatureLine: {
    borderBottomWidth: 0.8,
    borderBottomColor: "#374151",
    width: "100%",
    marginBottom: 3,
  },
  signatureTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: "#111827",
    textAlign: "center",
  },
  signatureLabel: {
    fontFamily: "Helvetica",
    fontSize: 6.5,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 1,
  },

  // Fixed Footer
  footerContainer: {
    position: "absolute",
    bottom: 12,
    left: 32,
    right: 32,
    borderTopWidth: 0.5,
    borderTopColor: "#e5e7eb",
    paddingTop: 3,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: {
    fontFamily: "Helvetica",
    fontSize: 6.5,
    color: "#9ca3af",
  },
  footerTextBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    color: "#6b7280",
  },
});

const getPageSize = (size?: PaperSize): "A4" | "LETTER" | "LEGAL" | [number, number] => {
  if (size === "FOLIO") return [612, 936]; // 8.5 x 13 in (Portrait)
  if (size === "LETTER") return "LETTER";
  if (size === "LEGAL") return "LEGAL";
  return "A4";
};

// Formats narrative markdown blocks (paragraphs, headers, bullet points) for react-pdf
const renderNarrativeMarkdown = (text: string, defaultHeading?: string) => {
  if (!text || !text.trim()) return null;

  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let currentBullets: string[] = [];

  const flushBullets = () => {
    if (currentBullets.length > 0) {
      elements.push(
        <View key={`bullet-group-${elements.length}`} style={{ marginBottom: 4 }}>
          {currentBullets.map((bullet, bIdx) => (
            <View key={bIdx} style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.bulletText}>{bullet.replace(/[*_`]/g, "").trim()}</Text>
            </View>
          ))}
        </View>
      );
      currentBullets = [];
    }
  };

  if (defaultHeading) {
    elements.push(
      <Text key="default-heading" style={styles.narrativeHeading}>
        {defaultHeading}
      </Text>
    );
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) {
      flushBullets();
      continue;
    }

    // Header lines: ### or ## or #
    if (rawLine.startsWith("#")) {
      flushBullets();
      const headingText = rawLine.replace(/^#+\s*/, "").replace(/[*_`]/g, "").trim();
      elements.push(
        <Text key={`heading-${i}`} style={styles.narrativeHeading}>
          {headingText}
        </Text>
      );
      continue;
    }

    // Bullet points: -, *, or 1.
    if (rawLine.startsWith("- ") || rawLine.startsWith("* ") || /^\d+\.\s/.test(rawLine)) {
      const bulletContent = rawLine.replace(/^[-*]\s+|\d+\.\s+/, "");
      currentBullets.push(bulletContent);
      continue;
    }

    // Regular paragraph line
    flushBullets();
    elements.push(
      <Text key={`para-${i}`} style={styles.narrativeParagraph}>
        {rawLine.replace(/[*_`]/g, "").trim()}
      </Text>
    );
  }

  flushBullets();
  return elements;
};

export const AiReportDocument: React.FC<{ data: AiReportData }> = ({ data }) => {
  const resolvedPageSize = getPageSize(data.paperSize);
  const headers = data.tableHeaders || [];
  const rows = data.tableRows || [];

  // Intelligently calculate column widths for portrait table layout
  const getColWidth = (header: string, index: number): string => {
    const h = header.toLowerCase().trim();
    const count = headers.length;

    // Full 9-column student case roster in portrait
    if (count >= 8) {
      if (h === "#" || h === "no." || index === 0) return "4%";
      if (h.includes("date")) return "10%";
      if (h.includes("student") || h.includes("name")) return "16%";
      if (h.includes("grade") || h.includes("level") || h.includes("class")) return "9%";
      if (h.includes("adviser")) return "11%";
      if (h.includes("type") || h.includes("offense") || h.includes("case")) return "14%";
      if (h.includes("description")) return "18%";
      if (h.includes("sanction") || h.includes("penalty")) return "10%";
      if (h.includes("status") || h.includes("progress")) return "8%";
    }

    // Aggregation / Trends / Summary tables (e.g. 3 to 6 columns)
    if (h === "#" || h === "no." || (index === 0 && (h.length <= 3 || h.includes("rank")))) {
      return "6%";
    }
    if (h.includes("count") || h.includes("total") || h.includes("cases") || h.includes("qty") || h.includes("%") || h.includes("share") || h.includes("rate")) {
      return "13%";
    }
    if (h.includes("status") || h.includes("progress")) {
      return "12%";
    }
    if (h.includes("grade") || h.includes("year") || h.includes("period")) {
      return "16%";
    }
    if (h.includes("type") || h.includes("offense") || h.includes("category") || h.includes("behavior")) {
      return "24%";
    }
    if (h.includes("action") || h.includes("intervention") || h.includes("recommend") || h.includes("notes") || h.includes("insight") || h.includes("description")) {
      return "29%";
    }

    return `${Math.floor(100 / Math.max(1, count))}%`;
  };

  const getStatusStyle = (statusStr: string) => {
    const s = (statusStr || "").toLowerCase();
    if (s.includes("pending")) return styles.statusPending;
    if (s.includes("resolved")) return styles.statusResolved;
    if (s.includes("reprimand")) return styles.statusReprimand;
    if (s.includes("closed")) return styles.statusClosed;
    return {};
  };

  const showSig1 = data.signatureConfig?.sig1?.show ?? true;
  const showSig2 = data.signatureConfig?.sig2?.show ?? true;
  const hasSignatures = showSig1 || showSig2;

  return (
    <Document title={data.title || "Guidance Office AI Report"} author="Laguna College Guidance Office">
      {/* Portrait Page Size */}
      <Page size={resolvedPageSize} orientation="portrait" style={styles.page}>
        {/* Header Letterhead */}
        <View style={styles.headerContainer}>
          <View style={styles.institutionRow}>
            <Image src={lcOfficialLogo} style={styles.logo} />
            <View style={styles.institutionTextContainer}>
              <Text style={styles.institutionName}>LAGUNA COLLEGE</Text>
              <Text style={styles.institutionLocation}>San Pablo City</Text>
              <Text style={styles.officeName}>Guidance Office</Text>
            </View>
            <Image src={guidanceLogo} style={styles.logo} />
          </View>
          <View style={styles.divider} />

          <View style={styles.titleContainer}>
            <Text style={styles.reportTitle}>{data.title || "Guidance Office Cases Report"}</Text>
            <Text style={styles.reportSubtitle}>Official Case Report</Text>
          </View>

          {/* Metadata Grid */}
          <View style={styles.metadataGrid}>
            <View style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>Reporting period</Text>
              <Text style={styles.metadataValue}>{data.reportingPeriod || "All Records"}</Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>Scope</Text>
              <Text style={styles.metadataValue}>{data.scope || "All year levels"}</Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>Status filter</Text>
              <Text style={styles.metadataValue}>{data.statusFilter || "All statuses"}</Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>Date generated</Text>
              <Text style={styles.metadataValue}>{data.dateGenerated}</Text>
            </View>
          </View>
        </View>

        {/* Executive Overview / Narrative Intro */}
        {data.introText && data.introText.trim().length > 0 && (
          <View style={styles.narrativeContainer}>
            {renderNarrativeMarkdown(data.introText)}
          </View>
        )}

        {/* Summary / Data Table (if present) */}
        {rows.length > 0 && headers.length > 0 && (
          <View style={styles.table}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{data.tableHeading || "Case List"}</Text>
            </View>

            {/* Repeating Table Header */}
            <View style={styles.tableHeaderRow} fixed>
              {headers.map((h, i) => (
                <Text key={i} style={[styles.tableHeaderCell, { width: getColWidth(h, i) }]}>
                  {h}
                </Text>
              ))}
            </View>

            {/* Table Rows */}
            {rows.map((row, rIdx) => {
              const isOdd = rIdx % 2 === 1;
              return (
                <View
                  key={rIdx}
                  style={[styles.tableRow, isOdd ? styles.tableRowOdd : styles.tableRowEven]}
                  wrap={false}
                >
                  {row.map((cell, cIdx) => {
                    const header = headers[cIdx] || "";
                    const isStatus = header.toLowerCase().includes("status") || header.toLowerCase().includes("progress");
                    const isIndex = header === "#" || header.toLowerCase() === "no." || (cIdx === 0 && /^\d+$/.test(cell));
                    const isPrimary = cIdx === 1 || header.toLowerCase().includes("type") || header.toLowerCase().includes("student");

                    return (
                      <Text
                        key={cIdx}
                        style={[
                          styles.tableCell,
                          { width: getColWidth(header, cIdx) },
                          isPrimary ? styles.tableCellBold : {},
                          isIndex ? { color: "#6b7280" } : {},
                          isStatus ? getStatusStyle(cell) : {},
                        ]}
                      >
                        {cell || "—"}
                      </Text>
                    );
                  })}
                </View>
              );
            })}
          </View>
        )}

        {/* Counselor Observations & Recommendations Outro */}
        {data.outroText && data.outroText.trim().length > 0 && (
          <View style={styles.narrativeContainer} wrap={false}>
            {renderNarrativeMarkdown(data.outroText)}
          </View>
        )}

        {/* Signature Block */}
        {hasSignatures && (
          <View style={styles.signatureWrapper} wrap={false}>
            <View style={styles.signatureContainer}>
              {showSig1 && (
                <View style={styles.signatureBox}>
                  <View style={styles.signatureLine} />
                  <Text style={styles.signatureTitle}>
                    {data.signatureConfig?.sig1?.title || "Guidance Counselor"}
                  </Text>
                  <Text style={styles.signatureLabel}>
                    {data.signatureConfig?.sig1?.label || "Prepared by:"}
                  </Text>
                </View>
              )}
              {showSig2 && (
                <View style={styles.signatureBox}>
                  <View style={styles.signatureLine} />
                  <Text style={styles.signatureTitle}>
                    {data.signatureConfig?.sig2?.title || "School Principal"}
                  </Text>
                  <Text style={styles.signatureLabel}>
                    {data.signatureConfig?.sig2?.label || "Noted by:"}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Fixed Footer */}
        <View style={styles.footerContainer} fixed>
          <Text style={styles.footerTextBold}>LAGUNA COLLEGE GUIDANCE OFFICE</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
};
