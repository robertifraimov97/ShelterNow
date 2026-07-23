import { SafeAreaView, View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useCallback, useState } from 'react';
import { getUserPreferences } from '../../services/userPreferences';

export default function ProfileScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading, logout, token } = useAuth();

  const [loadingPreferences, setLoadingPreferences] = useState(false);
  const [mobilityStatus, setMobilityStatus] = useState<'regular' | 'limited'>('regular');
  const [preferAccessibleRoute, setPreferAccessibleRoute] = useState(false);

  const handleLogout = async () => {
    await logout();
  };

  useFocusEffect(
    useCallback(() => {
      const loadPreferences = async () => {
        if (!token || !isAuthenticated) {
          return;
        }

        try {
          setLoadingPreferences(true);

          const preferences = await getUserPreferences(token);

          setMobilityStatus(
            preferences.mobility_status === 'limited' ? 'limited' : 'regular'
          );
          setPreferAccessibleRoute(preferences.prefer_accessible_route);
        } catch (error) {
          console.log('Failed to load profile preferences:', error);
        } finally {
          setLoadingPreferences(false);
        }
      };

      loadPreferences();
    }, [token, isAuthenticated])
  );

  // ─── Unauthenticated state ──────────────────────────────────────────────────
  if (!isLoading && !isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Profile</Text>
            <Text style={styles.subtitle}>
              Sign in to manage your followed areas and shelter activity
            </Text>
          </View>

          <View style={styles.authCard}>
            <Text style={styles.authCardTitle}>Get personalised alerts</Text>
            <Text style={styles.authCardBody}>
              Create an account or sign in to follow areas, receive targeted alerts, and manage your shelter submissions.
            </Text>

            <Pressable style={styles.primaryButton} onPress={() => router.push('/register')}>
              <Text style={styles.primaryButtonText}>Create Account</Text>
            </Pressable>

            <Pressable style={styles.secondaryButton} onPress={() => router.push('/login')}>
              <Text style={styles.secondaryButtonText}>Sign In</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const mobilityLabel =
    mobilityStatus === 'limited' ? 'Mobility: Limited' : 'Mobility: Regular';

  const accessibleRouteLabel = preferAccessibleRoute
    ? 'Accessible Route: On'
    : 'Accessible Route: Off';

  // ─── Authenticated state ────────────────────────────────────────────────────
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

          {loadingPreferences ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#2563EB" />
              <Text style={styles.loadingText}>Loading preferences...</Text>
            </View>
          ) : (
            <View style={styles.summaryBadgesRow}>
              <View style={styles.summaryBadge}>
                <Text style={styles.summaryBadgeText}>{mobilityLabel}</Text>
              </View>
              <View style={styles.summaryBadge}>
                <Text style={styles.summaryBadgeText}>{accessibleRouteLabel}</Text>
              </View>
            </View>
          )}

          <Text style={styles.summaryHint}>
            These preferences affect shelter guidance and route suggestions.
          </Text>
        </View>

        <View style={styles.menuSection}>
          <Pressable style={styles.menuItem} onPress={() => router.push('/profile-settings')}>
            <View>
              <Text style={styles.menuTitle}>Settings</Text>
              <Text style={styles.menuSubtitle}>Adjust mobility and accessibility preferences</Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </Pressable>

          <Pressable style={styles.menuItem} onPress={() => router.push('/shelter-management')}>
            <View>
              <Text style={styles.menuTitle}>Shelter Management</Text>
              <Text style={styles.menuSubtitle}>Add shelters and manage your shelter submissions</Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </Pressable>

          <Pressable style={styles.menuItem} onPress={() => router.push('/followed-areas')}>
            <View>
              <Text style={styles.menuTitle}>Followed Areas</Text>
              <Text style={styles.menuSubtitle}>Manage the areas you want to monitor</Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </Pressable>

          <Pressable style={[styles.menuItem, styles.menuItemDanger]} onPress={handleLogout}>
            <View>
              <Text style={styles.menuTitleDanger}>Sign Out</Text>
              <Text style={styles.menuSubtitle}>Sign out of your account</Text>
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
  header: { gap: 6 },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 15,
    color: '#64748B',
  },

  authCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 14,
  },
  authCardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  authCardBody: {
    fontSize: 15,
    color: '#64748B',
    lineHeight: 22,
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '600',
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
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
  },
  menuSection: { gap: 12 },
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
  menuItemDanger: {
    borderColor: '#FECACA',
    backgroundColor: '#FFF8F8',
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  menuTitleDanger: {
    fontSize: 18,
    fontWeight: '700',
    color: '#DC2626',
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
