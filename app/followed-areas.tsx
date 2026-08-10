import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { API_BASE_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';

// Represents a followed area record returned from the backend.
type FollowedArea = {
  id: number;
  user_identifier?: string;
  area_name: string;
  city_code?: string | null;
  label?: string | null;
  created_at: string;
};

export default function FollowedAreasScreen() {
  const router = useRouter();
  const { token, isAuthenticated } = useAuth();

  // Stores all followed areas loaded from the backend.
  const [areas, setAreas] = useState<FollowedArea[]>([]);

  // Controls the loading state while areas are being fetched.
  const [loading, setLoading] = useState(true);

  // Stores an error message if the request fails.
  const [errorMessage, setErrorMessage] = useState('');

  // Tracks which area is currently being deleted.
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Loads the followed areas list from the backend API.
  const loadFollowedAreas = async () => {
    try {
      setLoading(true);
      setErrorMessage('');

      if (!token || !isAuthenticated) {
        setAreas([]);
        setErrorMessage('You must be signed in to view followed areas.');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/followed-areas/`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();

        console.log(
          'Failed to load followed areas:',
          response.status,
          errorText
        );

        setAreas([]);
        setErrorMessage('Failed to load followed areas.');
        return;
      }

      const data: unknown = await response.json();

      // Prevent invalid API responses from reaching the list state.
      if (!Array.isArray(data)) {
        console.log('Unexpected followed areas response:', data);
        setAreas([]);
        setErrorMessage('The server returned an unexpected response.');
        return;
      }

      setAreas(data as FollowedArea[]);
    } catch (error) {
      console.log('Failed to load followed areas:', error);
      setAreas([]);
      setErrorMessage('Failed to connect to the server.');
    } finally {
      setLoading(false);
    }
  };

  // Deletes a followed area by ID.
  const handleRemoveArea = async (id: number) => {
    try {
      if (!token || !isAuthenticated) {
        setErrorMessage('You must be signed in to remove an area.');
        return;
      }

      setDeletingId(id);
      setErrorMessage('');

      const response = await fetch(`${API_BASE_URL}/followed-areas/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();

        console.log(
          'Failed to delete followed area:',
          response.status,
          errorText
        );

        setErrorMessage('Failed to remove the followed area.');
        return;
      }

      setAreas((previousAreas) =>
        previousAreas.filter((area) => area.id !== id)
      );
    } catch (error) {
      console.log('Network error while deleting followed area:', error);
      setErrorMessage('Failed to connect to the server.');
    } finally {
      setDeletingId(null);
    }
  };

  // Reloads followed areas whenever the screen gains focus.
  useFocusEffect(
    useCallback(() => {
      loadFollowedAreas();
    }, [token, isAuthenticated])
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>

          <Text style={styles.title}>Followed Areas</Text>

          <Text style={styles.subtitle}>
            Manage the areas you want to monitor for alerts
          </Text>
        </View>

        <Pressable
          style={styles.addButton}
          onPress={() => router.push('/add-followed-area')}
          disabled={!isAuthenticated}
        >
          <Text style={styles.addButtonText}>Add Area</Text>
        </Pressable>

        <View style={styles.listSection}>
          {loading ? (
            <Text style={styles.helperText}>
              Loading followed areas...
            </Text>
          ) : errorMessage ? (
            <Text style={styles.errorText}>{errorMessage}</Text>
          ) : areas.length === 0 ? (
            <Text style={styles.helperText}>
              No followed areas yet.
            </Text>
          ) : (
            areas.map((area) => (
              <View key={area.id} style={styles.areaCard}>
                <Text style={styles.areaName}>
                  {area.area_name}
                </Text>

                {area.label ? (
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusBadgeText}>
                      {area.label}
                    </Text>
                  </View>
                ) : null}

                <Pressable
                  style={[
                    styles.removeButton,
                    deletingId === area.id &&
                      styles.removeButtonDisabled,
                  ]}
                  onPress={() => handleRemoveArea(area.id)}
                  disabled={deletingId === area.id}
                >
                  <Text style={styles.removeButtonText}>
                    {deletingId === area.id
                      ? 'Removing...'
                      : 'Remove'}
                  </Text>
                </Pressable>
              </View>
            ))
          )}
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
  addButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  listSection: {
    gap: 12,
  },
  helperText: {
    fontSize: 15,
    color: '#64748B',
  },
  errorText: {
    fontSize: 15,
    color: '#B91C1C',
  },

    areaCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: 18,
      padding: 18,
      paddingLeft: 120,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      gap: 10,
      position: 'relative',
      minHeight: 78,
      justifyContent: 'center',
    },

    areaName: {
      fontSize: 18,
      fontWeight: '700',
      color: '#0F172A',
      textAlign: 'right',
      writingDirection: 'rtl',
    },

  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8F1FB',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1D4ED8',
  },

  removeButton: {
    position: 'absolute',
    left: 18,
    top: 18,
    backgroundColor: '#FEE2E2',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },

  removeButtonDisabled: {
    opacity: 0.6,
  },
  removeButtonText: {
    color: '#B91C1C',
    fontSize: 14,
    fontWeight: '700',
  },
});
