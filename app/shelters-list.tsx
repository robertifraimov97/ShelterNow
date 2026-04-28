import React, { useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';

type ShelterSource = 'official' | 'community';

type Shelter = {
  id: number;
  name: string;
  distance: string;
  source: ShelterSource;
};

const shelters: Shelter[] = [
  {
    id: 1,
    name: 'City Mall Shelter',
    distance: '400m away',
    source: 'official',
  },
  {
    id: 2,
    name: 'Community Safe Room',
    distance: '650m away',
    source: 'community',
  },
  {
    id: 3,
    name: 'Central Public Shelter',
    distance: '850m away',
    source: 'official',
  },
  {
    id: 4,
    name: 'School Basement Shelter',
    distance: '1.1 km away',
    source: 'official',
  },
];

export default function SheltersListScreen() {
  const router = useRouter();
  const [selectedSource, setSelectedSource] = useState<
    'all' | 'official' | 'community'
  >('all');

  const filteredShelters = shelters.filter((shelter) => {
    if (selectedSource === 'all') {
      return true;
    }

    return shelter.source === selectedSource;
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>

          <Text style={styles.title}>All Shelters</Text>
          <Text style={styles.subtitle}>Browse nearby protected areas</Text>
        </View>

        <View style={styles.filtersSection}>
          <Text style={styles.filtersTitle}>Filter by</Text>

          <View style={styles.filterRow}>
            <Pressable
              style={[
                styles.filterPill,
                selectedSource === 'all' && styles.filterPillActive,
              ]}
              onPress={() => setSelectedSource('all')}>
              <Text
                style={[
                  styles.filterPillText,
                  selectedSource === 'all' && styles.filterPillTextActive,
                ]}>
                All
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.filterPill,
                selectedSource === 'official' && styles.filterPillActive,
              ]}
              onPress={() => setSelectedSource('official')}>
              <Text
                style={[
                  styles.filterPillText,
                  selectedSource === 'official' && styles.filterPillTextActive,
                ]}>
                Official
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.filterPill,
                selectedSource === 'community' && styles.filterPillActive,
              ]}
              onPress={() => setSelectedSource('community')}>
              <Text
                style={[
                  styles.filterPillText,
                  selectedSource === 'community' && styles.filterPillTextActive,
                ]}>
                Community
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.listSection}>
          {filteredShelters.map((shelter) => (
            <View key={shelter.id} style={styles.shelterCard}>
              <Text style={styles.shelterName}>{shelter.name}</Text>
              <Text style={styles.shelterInfo}>{shelter.distance}</Text>
              <Text style={styles.shelterInfo}>
                {shelter.source === 'official'
                  ? 'Official source'
                  : 'Community source'}
              </Text>
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
  filtersSection: {
    gap: 10,
  },
  filtersTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  filterPill: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D9E6',
  },
  filterPillActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#2563EB',
  },
  filterPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  filterPillTextActive: {
    color: '#1D4ED8',
  },
  listSection: {
    gap: 12,
  },
  shelterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  shelterName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  shelterInfo: {
    fontSize: 14,
    color: '#475569',
  },
});
