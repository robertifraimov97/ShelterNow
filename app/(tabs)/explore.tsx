import { SafeAreaView, View, Text, StyleSheet, ScrollView } from 'react-native';

export default function MapScreen() {
  return (
    <SafeAreaView style={styles.container}>
    <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Nearby Protected Areas</Text>
          <Text style={styles.subtitle}>
            View protected areas around your current location
          </Text>
        </View>

        <View style={styles.mapSection}>
          <Text style={styles.mapLabel}>Map View</Text>
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapPlaceholderText}>Map will appear here</Text>
          </View>
        </View>

        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>Nearby Options</Text>

          <View style={styles.areaCard}>
            <Text style={styles.areaName}>City Mall Shelter</Text>
            <Text style={styles.areaInfo}>400 meters away</Text>
            <Text style={styles.areaInfo}>Source: Official</Text>
          </View>

          <View style={styles.areaCard}>
            <Text style={styles.areaName}>Community Safe Room</Text>
            <Text style={styles.areaInfo}>650 meters away</Text>
            <Text style={styles.areaInfo}>Source: Community</Text>
          </View>
        </View>
          </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7FB',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 20,
  },
  header: {
    gap: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 15,
    color: '#64748B',
  },
  mapSection: {
    gap: 10,
  },
  mapLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  mapPlaceholder: {
    height: 280,
    backgroundColor: '#DCE7F5',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C7D2E0',
  },
  mapPlaceholderText: {
    fontSize: 16,
    color: '#475569',
  },
  listSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  areaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  areaName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E3A8A',
  },
  areaInfo: {
    fontSize: 14,
    color: '#475569',
  },
});
