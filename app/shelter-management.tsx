import { SafeAreaView, View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

export default function ShelterManagementScreen() {
  // Router instance used to navigate back or to other management screens.
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header section with back button and screen description */}
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>

          <Text style={styles.title}>Shelter Management</Text>
          <Text style={styles.subtitle}>
            Manage shelters you added and contribute new community shelters
          </Text>
        </View>

        {/* Menu section with navigation options for shelter-related actions */}
        <View style={styles.menuSection}>
          <Pressable
            style={styles.menuItem}
            onPress={() => router.push('/add-community-shelter')}>
            <View>
              <Text style={styles.menuTitle}>Add Community Shelter</Text>
              <Text style={styles.menuSubtitle}>
                Submit a new protected area to the shared database
              </Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </Pressable>

          <Pressable
            style={styles.menuItem}
            onPress={() => router.push('/my-submitted-shelters')}>
            <View>
              <Text style={styles.menuTitle}>My Submitted Shelters</Text>
              <Text style={styles.menuSubtitle}>
                View and manage shelters you added
              </Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7FB',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 20,
  },
  header: {
    gap: 6,
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
  menuSection: {
    gap: 12,
  },
  menuItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  menuSubtitle: {
    fontSize: 14,
    color: '#64748B',
    maxWidth: 250,
    lineHeight: 20,
  },
  menuArrow: {
    fontSize: 28,
    color: '#94A3B8',
    fontWeight: '400',
  },
});
