import { SafeAreaView, View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';

export default function ShelterDetailsScreen() {
  // Router instance used to navigate back to the previous screen.
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header section with back button and screen description */}
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>

          <Text style={styles.title}>Shelter Details</Text>
          <Text style={styles.subtitle}>
            Detailed information about the selected protected area
          </Text>
        </View>

        {/* Main summary card for the selected shelter */}
        <View style={styles.mainCard}>
          <Text style={styles.shelterName}>City Mall Shelter</Text>
          <Text style={styles.shelterMeta}>400m away • Official source</Text>
        </View>

        {/* Information cards with shelter details */}
        <View style={styles.infoSection}>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Accessibility</Text>
            <Text style={styles.infoValue}>Accessible entrance available</Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Status</Text>
            <Text style={styles.infoValue}>Available in current prototype data</Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Notes</Text>
            <Text style={styles.infoValue}>
              Public shelter located near the main shopping area. Suitable for quick access on foot.
            </Text>
          </View>
        </View>

        {/* Main action button for starting navigation to the shelter */}
        <View style={styles.goButtonWrapper}>
          <View style={styles.emergencyButtonHalo}>
            <Pressable
              style={styles.emergencyButton}
              onPress={() => console.log('Start route pressed')}>
              <Text style={styles.emergencyButtonText}>Start</Text>
              <Text style={styles.emergencyButtonText}>Route</Text>
            </Pressable>
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
    paddingBottom: 24,
    gap: 20,
  },
  header: {
    gap: 8,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
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
  mainCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  shelterName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1E3A8A',
  },
  shelterMeta: {
    fontSize: 15,
    color: '#475569',
  },
  infoSection: {
    gap: 12,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  infoLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  infoValue: {
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
  },
    goButtonWrapper: {
      alignItems: 'center',
      marginTop: 12,
    },
    emergencyButtonHalo: {
      width: 132,
      height: 132,
      borderRadius: 66,
      backgroundColor: 'rgba(52, 168, 83, 0.14)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    emergencyButton: {
      width: 104,
      height: 104,
      borderRadius: 52,
      backgroundColor: '#34A853',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 10,
      shadowOffset: {
        width: 0,
        height: 4,
      },
      elevation: 5,
    },
    emergencyButtonText: {
      color: '#FFFFFF',
      fontSize: 18,
      fontWeight: '800',
      lineHeight: 22,
    },
});
