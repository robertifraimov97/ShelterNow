import { SafeAreaView, View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { API_BASE_URL } from '../constants/api';

type SubmittedShelter = {
  id: number;
  name: string;
  city: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
  accessibility_notes?: string | null;
  submitted_by_name?: string | null;
  submitted_by_email?: string | null;
  submission_status: string;
  review_notes?: string | null;
  created_at: string;
  updated_at: string;
};

export default function MySubmittedSheltersScreen() {
  // Router instance used for screen navigation.
  const router = useRouter();

  // Local state for submitted shelters loaded from the backend.
  const [submittedShelters, setSubmittedShelters] = useState<SubmittedShelter[]>([]);

  // Loading state while the list is being fetched.
  const [loading, setLoading] = useState(true);

  // Track which shelter is currently being deleted.
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadSubmittedShelters = async () => {
    try {
      setLoading(true);

      // Load all submitted shelters from the backend API.
      const response = await fetch(`${API_BASE_URL}/submitted-shelters/`);
      const data = await response.json();

      setSubmittedShelters(data);
    } catch (error) {
      console.log('Failed to load submitted shelters:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      // Reload the list every time the screen comes into focus.
      loadSubmittedShelters();
    }, [])
  );

  const getStatusLabel = (status: string) => {
    // Convert backend status values into user-friendly text.
    if (status === 'approved') return 'Approved';
    if (status === 'rejected') return 'Rejected';
    return 'Pending review';
  };

  const handleDeleteShelter = async (shelterId: number) => {
    try {
      setDeletingId(shelterId);

      // Send a DELETE request to remove the selected shelter.
      const response = await fetch(
        `${API_BASE_URL}/submitted-shelters/${shelterId}`,
        {
          method: 'DELETE',
        }
      );

      // If the backend returns an error, show feedback and stop.
      if (!response.ok) {
        const errorText = await response.text();
        console.log('Failed to delete submitted shelter:', errorText);
        Alert.alert('Error', 'Failed to delete shelter.');
        return;
      }

      // Remove the deleted shelter from the local UI state immediately.
      setSubmittedShelters((prevShelters) =>
        prevShelters.filter((shelter) => shelter.id !== shelterId)
      );

      Alert.alert('Success', 'Shelter deleted successfully.');
    } catch (error) {
      console.log('Network error while deleting shelter:', error);
      Alert.alert('Error', 'Something went wrong while deleting the shelter.');
    } finally {
      setDeletingId(null);
    }
  };

  const confirmDeleteShelter = (shelterId: number, shelterName: string) => {
    // Show a confirmation dialog before deleting the shelter.
    Alert.alert(
      'Delete shelter',
      `Are you sure you want to delete "${shelterName}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => handleDeleteShelter(shelterId),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>

          <Text style={styles.title}>My Submitted Shelters</Text>
          <Text style={styles.subtitle}>
            View shelters you added to the community database
          </Text>
        </View>

        <View style={styles.listSection}>
          {loading ? (
            <Text style={styles.helperText}>Loading submitted shelters...</Text>
          ) : submittedShelters.length === 0 ? (
            <Text style={styles.helperText}>No submitted shelters yet.</Text>
          ) : (
            submittedShelters.map((shelter) => (
              <View key={shelter.id} style={styles.shelterCard}>
                <Text style={styles.shelterName}>{shelter.name}</Text>
                <Text style={styles.shelterInfo}>
                  {shelter.address || shelter.city}
                </Text>
                <Text style={styles.shelterInfo}>Community submission</Text>

                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>
                    {getStatusLabel(shelter.submission_status)}
                  </Text>
                </View>

                {/* Show reviewer notes if they exist */}
                {shelter.review_notes ? (
                  <Text style={styles.reviewNotes}>
                    Review notes: {shelter.review_notes}
                  </Text>
                ) : null}

                <View style={styles.actionsRow}>
                  <Pressable
                    style={styles.editButton}
                    onPress={() =>
                      router.push({
                        pathname: '/edit-submitted-shelter',
                        params: {
                          id: String(shelter.id),
                          name: shelter.name,
                          city: shelter.city,
                          address: shelter.address || '',
                          notes: shelter.notes || '',
                          accessibility_notes: shelter.accessibility_notes || '',
                        },
                      })
                    }>
                    <Text style={styles.editButtonText}>Edit</Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.deleteButton,
                      deletingId === shelter.id && styles.deleteButtonDisabled,
                    ]}
                    onPress={() =>
                      confirmDeleteShelter(shelter.id, shelter.name)
                    }
                    disabled={deletingId === shelter.id}>
                    <Text style={styles.deleteButtonText}>
                      {deletingId === shelter.id ? 'Deleting...' : 'Delete'}
                    </Text>
                  </Pressable>
                </View>
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
    paddingBottom: 20,
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
  listSection: {
    gap: 14,
  },
  helperText: {
    fontSize: 15,
    color: '#64748B',
  },
  shelterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  shelterName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
  },
  shelterInfo: {
    fontSize: 14,
    color: '#64748B',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#DBEAFE',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563EB',
  },
  reviewNotes: {
    fontSize: 14,
    color: '#475569',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  editButton: {
    backgroundColor: '#DBEAFE',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2563EB',
  },
  deleteButton: {
    backgroundColor: '#FEE2E2',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
  deleteButtonDisabled: {
    opacity: 0.6,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#DC2626',
  },
});
