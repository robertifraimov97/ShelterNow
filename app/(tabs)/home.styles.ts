import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F7FB",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 18,
  },
  header: {
    gap: 6,
  },
  appName: {
    fontSize: 30,
    fontWeight: "700",
    color: "#0F172A",
  },
  subtitle: {
    fontSize: 15,
    color: "#64748B",
  },
  statusCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  statusLabel: {
    fontSize: 14,
    color: "#64748B",
    marginBottom: 6,
  },
  statusValue: {
    fontSize: 22,
    fontWeight: "700",
    color: "#16A34A",
  },
  mainCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4,
  },
  cardName: {
    fontSize: 22,
    fontWeight: "600",
    color: "#1E3A8A",
  },
  cardMeta: {
    fontSize: 15,
    color: "#475569",
  },
  primaryButton: {
    marginTop: 14,
    backgroundColor: "#16A34A",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  mapSection: {
    gap: 10,
  },
  mapTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  mapPlaceholder: {
    height: 150,
    backgroundColor: "#DCE7F5",
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#C7D2E0",
  },
  mapPlaceholderText: {
    fontSize: 15,
    color: "#475569",
  },
});
