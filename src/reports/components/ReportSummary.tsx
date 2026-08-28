import React from "react";
import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { ReportSummaryData } from "../types/reportTypes";

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#002F87",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
    paddingBottom: 2,
    marginBottom: 4,
  },
  grid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
  },
  statBox: {
    flex: 1,
    borderWidth: 0.8,
    borderColor: "#e5e7eb",
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 5,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  statLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    color: "#6b7280",
    textTransform: "uppercase",
  },
  statValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    color: "#111827",
  },
});

interface ReportSummaryProps {
  summary: ReportSummaryData;
}

export const ReportSummary: React.FC<ReportSummaryProps> = ({ summary }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Summary</Text>
      <View style={styles.grid}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Total</Text>
          <Text style={styles.statValue}>{summary.total}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Pending</Text>
          <Text style={styles.statValue}>{summary.pending}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Resolved</Text>
          <Text style={styles.statValue}>{summary.resolved}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Reprimand</Text>
          <Text style={styles.statValue}>{summary.reprimand}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Closed</Text>
          <Text style={styles.statValue}>{summary.closed}</Text>
        </View>
      </View>
    </View>
  );
};
