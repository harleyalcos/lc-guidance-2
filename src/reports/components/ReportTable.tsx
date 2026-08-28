import React from "react";
import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { ColumnVisibilityConfig, ReportRow } from "../types/reportTypes";

const styles = StyleSheet.create({
  tableContainer: {
    width: "100%",
    marginTop: 2,
    marginBottom: 6,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    paddingVertical: 3,
    backgroundColor: "#ffffff",
  },
  tableHeaderCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
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
    paddingVertical: 3.5,
    minHeight: 16,
  },
  tableRowEven: {
    backgroundColor: "#fafafa",
  },
  tableCell: {
    fontFamily: "Helvetica",
    fontSize: 7.5,
    color: "#374151",
    paddingHorizontal: 2,
  },
  tableCellBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: "#111827",
    paddingHorizontal: 2,
  },
  statusBadgeText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    textAlign: "right",
  },
  emptyRow: {
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontFamily: "Helvetica-Oblique",
    fontSize: 9,
    color: "#6b7280",
    textAlign: "center",
  },
});

interface ReportTableProps {
  rows: ReportRow[];
  columns: ColumnVisibilityConfig;
}

export const ReportTable: React.FC<ReportTableProps> = ({ rows, columns }) => {
  // Define flex / width distributions
  const colStyles = {
    index: { width: 22, textAlign: "left" as const },
    date: { width: 62 },
    student: { flex: 1.8 },
    class: { width: 50 },
    adviser: { flex: 1.3 },
    type: { flex: 1.2 },
    description: { flex: 1.8 },
    sanction: { flex: 1.4 },
    status: { width: 60, textAlign: "right" as const },
  };

  return (
    <View style={styles.tableContainer}>
      {/* Table Header - fixed prop repeats header on new pages */}
      <View style={styles.tableHeader} fixed>
        <Text style={[styles.tableHeaderCell, colStyles.index]}>#</Text>
        {columns.date && <Text style={[styles.tableHeaderCell, colStyles.date]}>Date</Text>}
        {columns.student && <Text style={[styles.tableHeaderCell, colStyles.student]}>Student</Text>}
        {columns.class && <Text style={[styles.tableHeaderCell, colStyles.class]}>Grade</Text>}
        {columns.adviser && <Text style={[styles.tableHeaderCell, colStyles.adviser]}>Adviser</Text>}
        {columns.type && <Text style={[styles.tableHeaderCell, colStyles.type]}>Type</Text>}
        {columns.description && (
          <Text style={[styles.tableHeaderCell, colStyles.description]}>Description</Text>
        )}
        {columns.sanction && (
          <Text style={[styles.tableHeaderCell, colStyles.sanction]}>Sanction</Text>
        )}
        {columns.status && <Text style={[styles.tableHeaderCell, colStyles.status]}>Status</Text>}
      </View>

      {/* Table Rows */}
      {rows.length > 0 ? (
        rows.map((row, idx) => (
          <View
            key={row.index}
            style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowEven : {}]}
            wrap={false}
          >
            <Text style={[styles.tableCellBold, colStyles.index, { color: "#6b7280" }]}>
              {row.index}
            </Text>
            {columns.date && <Text style={[styles.tableCell, colStyles.date]}>{row.date}</Text>}
            {columns.student && (
              <Text style={[styles.tableCellBold, colStyles.student]}>{row.studentName}</Text>
            )}
            {columns.class && <Text style={[styles.tableCell, colStyles.class]}>{row.grade}</Text>}
            {columns.adviser && (
              <Text style={[styles.tableCell, colStyles.adviser]}>{row.adviser}</Text>
            )}
            {columns.type && <Text style={[styles.tableCell, colStyles.type]}>{row.type}</Text>}
            {columns.description && (
              <Text style={[styles.tableCell, colStyles.description]}>{row.description}</Text>
            )}
            {columns.sanction && (
              <Text style={[styles.tableCell, colStyles.sanction]}>{row.sanction}</Text>
            )}
            {columns.status && (
              <View style={colStyles.status}>
                <Text style={[styles.statusBadgeText, { color: row.statusColor }]}>
                  {row.status}
                </Text>
              </View>
            )}
          </View>
        ))
      ) : (
        <View style={styles.emptyRow}>
          <Text style={styles.emptyText}>No records found for the selected filters.</Text>
        </View>
      )}
    </View>
  );
};
