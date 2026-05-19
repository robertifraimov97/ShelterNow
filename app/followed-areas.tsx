import { SafeAreaView, View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { API_BASE_URL } from '../constants/api';

type FollowedArea = {
  id: number;
  user_identifier: string;
  area_name: string;
  city_code?: string | null;
  label?: string | null;
  created_at: string;
};

export default function FollowedAreasScreen() {
  const router = useRouter();
  const [areas, setAreas] = useState<FollowedArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadFollowedAreas = async () => {
    try {
      setLoading(true);

      const response = await fetch(`${API_BASE_URL}/followed-areas/`);
      const data = await response.json();

      setAreas(data);
    } catch (error) {
      console.log('Failed to load followed areas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveArea = async (id: number) => {
    try {
      setDeletingId(id);

      const response = await fetch(`${API_BASE_URL}/followed-areas/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.log('Failed to delete followed area:', errorData);
        return;
      }

      setAreas((prevAreas) => prevAreas.filter((area) => area.id !== id));
    } catch (error) {
      console.log('Network error while deleting followed area:', error);
    } finally {
      setDeletingId(null);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadFollowedAreas();
    }, [])
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>

          <Text style={styles.title}>Followed Areas</Text>
          <Text style={styles.subtitle}>
            Manage the areas you want to monitor for alerts
          </Text>
        </View>

        <Pressable
          style={styles.addButton}
          onPress={() => router.push('/add-followed-area')}>
          <Text style={styles.addButtonText}>Add Area</Text>
        </Pressable>

        <View style={styles.listSection}>
          {loading ? (
            <Text style={styles.helperText}>Loading followed areas...</Text>
          ) : areas.length === 0 ? (
            <Text style={styles.helperText}>No followed areas yet.</Text>
          ) : (
            areas.map((area) => (
              <View key={area.id} style={styles.areaCard}>
                <Text style={styles.areaName}>{area.area_name}</Text>

                {area.label ? (
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusBadgeText}>{area.label}</Text>
                  </View>
                ) : null}

                <Pressable
                  style={styles.removeButton}
                  onPress={() => handleRemoveArea(area.id)}
                  disabled={deletingId === area.id}>
                  <Text style={styles.removeButtonText}>
                    {deletingId === area.id ? 'Removing...' : 'Remove'}
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
  areaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  areaName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
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
    alignSelf: 'flex-start',
    backgroundColor: '#FEE2E2',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  removeButtonText: {
    color: '#B91C1C',
    fontSize: 14,
    fontWeight: '700',
  },
});
