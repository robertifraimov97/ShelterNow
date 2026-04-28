import { SafeAreaView, View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import MapView from 'react-native-maps';

export default function MapScreen() {
  const router = useRouter();

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

          <Pressable onPress={() => router.push('/full-map')}>
            <View style={styles.mapContainer}>
              <MapView
                style={styles.map}
                initialRegion={{
                  latitude: 32.0853,
                  longitude: 34.7818,
                  latitudeDelta: 0.02,
                  longitudeDelta: 0.02,
                }}
              />
            </View>
          </Pressable>
        </View>

          <View style={styles.listSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Nearby Options</Text>
              <Pressable onPress={() => router.push('/shelters-list')}>
                <Text style={styles.seeAllText}>See all</Text>
              </Pressable>
            </View>

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
  mapContainer: {
    height: 280,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#C7D2E0',
  },
  map: {
    flex: 1,
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
  },sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    seeAllText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#2563EB',
    },
});
