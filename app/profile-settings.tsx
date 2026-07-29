import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import {
  getUserPreferences,
  updateUserPreferences,
} from '../services/userPreferences';

export default function ProfileSettingsScreen() {
  const router = useRouter();
  const { token } = useAuth();

  // State for the user's selected mobility preference.
  const [mobility, setMobility] = useState<'regular' | 'limited'>('regular');

  // State for whether accessible routes should be preferred.
  const [accessibleRoute, setAccessibleRoute] = useState(false);

  // UI state.
  const [loadingPreferences, setLoadingPreferences] = useState(true);
  const [savingPreferences, setSavingPreferences] = useState(false);

  useEffect(() => {
    const loadPreferences = async () => {
      if (!token) {
        setLoadingPreferences(false);
        return;
      }

      try {
        setLoadingPreferences(true);

        const preferences = await getUserPreferences(token);

        setMobility(
          preferences.mobility_status === 'limited' ? 'limited' : 'regular'
        );
        setAccessibleRoute(preferences.prefer_accessible_route);
      } catch (error: any) {
        Alert.alert(
          'Error',
          error.message || 'Failed to load profile preferences.'
        );
      } finally {
        setLoadingPreferences(false);
      }
    };

    loadPreferences();
  }, [token]);

  const handleSavePreferences = async () => {
    if (!token) {
      Alert.alert('Error', 'You must be signed in to save preferences.');
      return;
    }

    try {
      setSavingPreferences(true);

      await updateUserPreferences(token, {
        mobility_status: mobility,
        prefer_accessible_route: accessibleRoute,
      });

      Alert.alert('Saved', 'Your preferences were updated successfully.');
      router.back();
    } catch (error: any) {
      Alert.alert(
        'Error',
        error.message || 'Failed to save profile preferences.'
      );
    } finally {
      setSavingPreferences(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header section with back button and screen description */}
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>

          <Text style={styles.title}>Profile Settings</Text>
          <Text style={styles.subtitle}>
            Manage preferences that affect shelter guidance
          </Text>
        </View>

        {/* Section for selecting the user's physical condition / mobility level */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Physical Condition</Text>

          <View style={styles.card}>
            <Pressable
              style={[
                styles.optionButton,
                mobility === 'regular' && styles.optionButtonActive,
              ]}
              onPress={() => setMobility('regular')}
              disabled={loadingPreferences || savingPreferences}
            >
              <Text
                style={[
                  styles.optionText,
                  mobility === 'regular' && styles.optionTextActive,
                ]}
              >
                Regular mobility
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.optionButton,
                mobility === 'limited' && styles.optionButtonActive,
              ]}
              onPress={() => setMobility('limited')}
              disabled={loadingPreferences || savingPreferences}
            >
              <Text
                style={[
                  styles.optionText,
                  mobility === 'limited' && styles.optionTextActive,
                ]}
              >
                Limited mobility
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Section for accessibility-related preference settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Accessibility</Text>

          <View style={styles.switchCard}>
            <View style={styles.switchTextContainer}>
              <Text style={styles.switchTitle}>Prefer accessible route</Text>
              <Text style={styles.switchSubtitle}>
                Prioritize routes and protected areas with better accessibility
              </Text>
            </View>

            <Switch
              value={accessibleRoute}
              onValueChange={setAccessibleRoute}
              disabled={loadingPreferences || savingPreferences}
            />
          </View>
        </View>

        <Pressable
          style={[
            styles.saveButton,
            (loadingPreferences || savingPreferences) && styles.saveButtonDisabled,
          ]}
          onPress={handleSavePreferences}
          disabled={loadingPreferences || savingPreferences}
        >
          <Text style={styles.saveButtonText}>
            {loadingPreferences
              ? 'Loading...'
              : savingPreferences
              ? 'Saving...'
              : 'Save Preferences'}
          </Text>
        </Pressable>
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
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  optionButton: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  optionButtonActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#2563EB',
  },
  optionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#334155',
  },
  optionTextActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  switchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  switchTextContainer: {
    flex: 1,
    gap: 4,
  },
  switchTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  switchSubtitle: {
    fontSize: 14,
    color: '#64748B',
  },
  saveButton: {
    backgroundColor: '#2563EB',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  saveButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
