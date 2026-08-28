import React from "react";
import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { SignatureConfig } from "../types/reportTypes";

const styles = StyleSheet.create({
  closingContainer: {
    marginTop: 10,
    marginBottom: 6,
  },
  endOfReportDivider: {
    borderTopWidth: 0.8,
    borderTopColor: "#d1d5db",
    paddingTop: 3,
    marginBottom: 14,
    alignItems: "center",
  },
  endOfReportText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    fontWeight: "bold",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  signatureRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 40,
    marginTop: 8,
  },
  signatureRowSingle: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 8,
  },
  signatureBox: {
    width: 170,
    alignItems: "center",
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#111827",
    width: "100%",
    marginBottom: 4,
  },
  signatureTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    fontWeight: "bold",
    color: "#111827",
    textAlign: "center",
  },
  signatureLabel: {
    fontFamily: "Helvetica",
    fontSize: 7.5,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 1,
  },
});

interface ReportSignatureBlockProps {
  signatureConfig: SignatureConfig;
  showSignatures: boolean;
}

export const ReportSignatureBlock: React.FC<ReportSignatureBlockProps> = ({
  signatureConfig,
  showSignatures,
}) => {
  const showSig1 = showSignatures && signatureConfig.sig1.show;
  const showSig2 = showSignatures && signatureConfig.sig2.show;
  const activeCount = (showSig1 ? 1 : 0) + (showSig2 ? 1 : 0);

  return (
    <View style={styles.closingContainer} wrap={false}>
      {/* End of Report divider */}
      <View style={styles.endOfReportDivider}>
        <Text style={styles.endOfReportText}>End of Report</Text>
      </View>

      {/* Signature boxes */}
      {showSignatures && activeCount > 0 && (
        <View style={activeCount === 2 ? styles.signatureRow : styles.signatureRowSingle}>
          {showSig1 && (
            <View style={styles.signatureBox}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureTitle}>
                {signatureConfig.sig1.title || "Guidance Counselor"}
              </Text>
              <Text style={styles.signatureLabel}>
                {signatureConfig.sig1.label || "Prepared by:"}
              </Text>
            </View>
          )}
          {showSig2 && (
            <View style={styles.signatureBox}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureTitle}>
                {signatureConfig.sig2.title || "School Principal"}
              </Text>
              <Text style={styles.signatureLabel}>
                {signatureConfig.sig2.label || "Noted by:"}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};
