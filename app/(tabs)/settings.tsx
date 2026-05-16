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
            Manage your preferences and personal shelter activity
          </Text>
        </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Current Preferences</Text>

            <View style={styles.summaryBadgesRow}>
              <View style={styles.summaryBadge}>
                <Text style={styles.summaryBadgeText}>Mobility: Regular</Text>
              </View>

              <View style={styles.summaryBadge}>
                <Text style={styles.summaryBadgeText}>Accessible Route: Off</Text>
              </View>
            </View>

            <Text style={styles.summaryHint}>
              These preferences affect shelter guidance and route suggestions.
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
            onPress={() => router.push('/shelter-management')}>
            <View>
              <Text style={styles.menuTitle}>Shelter Management</Text>
              <Text style={styles.menuSubtitle}>
                Add shelters and manage your shelter submissions
              </Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </Pressable>

          <Pressable
            style={styles.menuItem}
            onPress={() => router.push('/followed-areas')}>
            <View>
              <Text style={styles.menuTitle}>Followed Areas</Text>
              <Text style={styles.menuSubtitle}>
                Manage the areas you want to monitor
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
    summaryCard: {
      backgroundColor: '#F8FBFF',
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: '#D9E6F2',
      gap: 10,
    },
    summaryTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: '#0F172A',
    },
    summaryBadgesRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    summaryBadge: {
      backgroundColor: '#E8F1FB',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
    },
    summaryBadgeText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#1D4ED8',
    },
    summaryHint: {
      fontSize: 13,
      color: '#64748B',
      lineHeight: 18,
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
