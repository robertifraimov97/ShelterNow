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
    padding: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 6,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 6,
  },
  cardName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1E3A8A",
  },
  cardMeta: {
    fontSize: 15,
    color: "#475569",
  },
  cardSource: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 2,
  },
  goButtonWrapper: {
    alignItems: "center",
    marginTop: 12,
  },
  emergencyButtonHalo: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: "rgba(52, 168, 83, 0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  emergencyButton: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: "#34A853",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 5,
  },
  emergencyButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 22,
  },
  mapSection: {
    gap: 10,
  },
  mapTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  mapContainer: {
    height: 150,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#C7D2E0",
  },
  map: {
    flex: 1,
  },
});
