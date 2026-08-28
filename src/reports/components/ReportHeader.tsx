import React from "react";
import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import lcOfficialLogo from "../../assets/lc-official-logo.jpg";
import guidanceLogo from "../../assets/guidance-logo.png";
import { ReportMetadata } from "../types/reportTypes";

const styles = StyleSheet.create({
  headerContainer: {
    marginBottom: 10,
  },
  institutionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
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
    fontSize: 12,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
    fontSize: 13,
    fontWeight: "bold",
    color: "#000000",
    marginTop: 1,
  },
  divider: {
    height: 1.5,
    backgroundColor: "#002F87",
    width: "100%",
    marginBottom: 8,
  },
  titleContainer: {
    alignItems: "center",
    marginBottom: 8,
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
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  metadataItem: {
    width: "45%",
    flexDirection: "row",
    marginBottom: 3,
  },
  metadataLabel: {
    fontFamily: "Helvetica",
    fontSize: 7.5,
    color: "#6b7280",
    width: 80,
  },
  metadataValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: "#111827",
    flex: 1,
  },
  sectionTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    borderBottomWidth: 0.8,
    borderBottomColor: "#e5e7eb",
    paddingBottom: 2,
    marginBottom: 4,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#002F87",
  },
  sectionTotalCount: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: "#374151",
    textTransform: "uppercase",
  },
});

interface ReportHeaderProps {
  metadata: ReportMetadata;
  statusFilter: string;
  totalCases: number;
}

export const ReportHeader: React.FC<ReportHeaderProps> = ({
  metadata,
  statusFilter,
  totalCases,
}) => {
  return (
    <View style={styles.headerContainer}>
      {/* Logos and School Header */}
      <View style={styles.institutionRow}>
        <Image src={lcOfficialLogo} style={styles.logo} />
        <View style={styles.institutionTextContainer}>
          <Text style={styles.institutionName}>LAGUNA COLLEGE</Text>
          <Text style={styles.institutionLocation}>San Pablo City</Text>
          <Text style={styles.officeName}>Guidance Office</Text>
        </View>
        <Image src={guidanceLogo} style={styles.logo} />
      </View>

      {/* Blue Divider */}
      <View style={styles.divider} />

      {/* Title */}
      <View style={styles.titleContainer}>
        <Text style={styles.reportTitle}>Guidance Office Cases Report</Text>
        <Text style={styles.reportSubtitle}>Official Case Report</Text>
      </View>

      {/* Metadata Grid */}
      <View style={styles.metadataGrid}>
        <View style={styles.metadataItem}>
          <Text style={styles.metadataLabel}>Reporting period</Text>
          <Text style={styles.metadataValue}>{metadata.reportingPeriod}</Text>
        </View>
        <View style={styles.metadataItem}>
          <Text style={styles.metadataLabel}>Scope</Text>
          <Text style={styles.metadataValue}>{metadata.scopeLabel}</Text>
        </View>
        <View style={styles.metadataItem}>
          <Text style={styles.metadataLabel}>Status filter</Text>
          <Text style={styles.metadataValue}>{metadata.statusLabel}</Text>
        </View>
        <View style={styles.metadataItem}>
          <Text style={styles.metadataLabel}>Date generated</Text>
          <Text style={styles.metadataValue}>{metadata.dateGenerated}</Text>
        </View>
      </View>

      {/* Section Header */}
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>Case List</Text>
        {statusFilter !== "all" && (
          <Text style={styles.sectionTotalCount}>
            Total: {totalCases} {statusFilter} {totalCases === 1 ? "Case" : "Cases"}
          </Text>
        )}
      </View>
    </View>
  );
};
