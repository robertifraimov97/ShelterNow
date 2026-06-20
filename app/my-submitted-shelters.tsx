import { SafeAreaView, View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { API_BASE_URL } from '../constants/api';

// Represents a shelter submitted by a user and returned from the backend.
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
  // Router instance used for navigation between screens.
  const router = useRouter();

  // Stores the submitted shelters loaded from the backend.
  const [submittedShelters, setSubmittedShelters] = useState<SubmittedShelter[]>([]);

  // Controls the loading state while data is being fetched.
  const [loading, setLoading] = useState(true);

  // Loads all submitted shelters from the backend API.
  const loadSubmittedShelters = async () => {
    try {
      setLoading(true);

      const response = await fetch(`${API_BASE_URL}/submitted-shelters/`);
      const data = await response.json();

      setSubmittedShelters(data);
    } catch (error) {
      console.log('Failed to load submitted shelters:', error);
    } finally {
      setLoading(false);
    }
  };

  // Reload the submitted shelters list whenever the screen comes into focus.
  useFocusEffect(
    useCallback(() => {
      loadSubmittedShelters();
    }, [])
  );

  // Converts backend submission status values into user-friendly labels.
  const getStatusLabel = (status: string) => {
    if (status === 'approved') return 'Approved';
    if (status === 'rejected') return 'Rejected';
    return 'Pending review';
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header section with back button and screen title */}
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>

          <Text style={styles.title}>My Submitted Shelters</Text>
          <Text style={styles.subtitle}>
            View shelters you added to the community database
          </Text>
        </View>

        {/* Main list section that handles loading, empty, and populated states */}
        <View style={styles.listSection}>
          {loading ? (
            <Text style={styles.helperText}>Loading submitted shelters...</Text>
          ) : submittedShelters.length === 0 ? (
            <Text style={styles.helperText}>No submitted shelters yet.</Text>
          ) : (
            submittedShelters.map((shelter) => (
              <View key={shelter.id} style={styles.shelterCard}>
                {/* Basic shelter details */}
                <Text style={styles.shelterName}>{shelter.name}</Text>
                <Text style={styles.shelterInfo}>
                  {shelter.address || shelter.city}
                </Text>
                <Text style={styles.shelterInfo}>Community submission</Text>

                {/* Status badge showing the current review state */}
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>
                    {getStatusLabel(shelter.submission_status)}
                  </Text>
                </View>

                {/* Action buttons for editing or deleting the shelter */}
                <View style={styles.actionsRow}>
                  <Pressable
                    style={styles.editButton}
                    onPress={() => router.push('/edit-submitted-shelter')}>
                    <Text style={styles.editButtonText}>Edit</Text>
                  </Pressable>

                  <Pressable
                    style={styles.deleteButton}
                    onPress={() => console.log('Delete pressed', shelter.id)}>
                    <Text style={styles.deleteButtonText}>Delete</Text>
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
  listSection: {
    gap: 12,
  },
  helperText: {
    fontSize: 15,
    color: '#64748B',
  },
  shelterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  shelterName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  shelterInfo: {
    fontSize: 14,
    color: '#64748B',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
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
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  editButton: {
    backgroundColor: '#E8F1FB',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  editButtonText: {
    color: '#1D4ED8',
    fontSize: 14,
    fontWeight: '700',
  },
  deleteButton: {
    backgroundColor: '#FEE2E2',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  deleteButtonText: {
    color: '#B91C1C',
    fontSize: 14,
    fontWeight: '700',
  },
});
