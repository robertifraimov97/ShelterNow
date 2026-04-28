import { SafeAreaView, View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

export default function ProfileScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
          <Text style={styles.subtitle}>
            Manage your account preferences and community actions
          </Text>
        </View>

        <View style={styles.menuSection}>
          <Pressable
            style={styles.menuItem}
            onPress={() => router.push('/profile-settings')}>
            <View>
              <Text style={styles.menuTitle}>Settings</Text>
              <Text style={styles.menuSubtitle}>
                Adjust mobility and accessibility preferences
              </Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </Pressable>

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
