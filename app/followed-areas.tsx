import { SafeAreaView, View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { followedAreasData, removeFollowedArea, type FollowedArea } from '../data/followed-areas-data';

export default function FollowedAreasScreen() {
  const router = useRouter();
  const [areas, setAreas] = useState<FollowedArea[]>(followedAreasData);

  useFocusEffect(
    useCallback(() => {
      setAreas([...followedAreasData]);
    }, [])
  );

  const handleRemove = (id: number) => {
    removeFollowedArea(id);
    setAreas([...followedAreasData]);
  };

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
          {areas.map((area) => (
            <View key={area.id} style={styles.areaCard}>
              <Text style={styles.areaName}>{area.name}</Text>

              <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>{area.status}</Text>
              </View>

              <Pressable
                style={styles.removeButton}
                onPress={() => handleRemove(area.id)}>
                <Text style={styles.removeButtonText}>Remove</Text>
              </Pressable>
            </View>
          ))}
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
