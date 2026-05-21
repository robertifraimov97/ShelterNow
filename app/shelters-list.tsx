import { SafeAreaView, View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import { API_BASE_URL } from '../constants/api';

type NearbyShelter = {
  id: number;
  name: string;
  city: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  distance_meters: number;
  estimated_walk_minutes: number;
  source: string;
};

function formatDistance(distanceMeters: number) {
  if (distanceMeters < 1000) {
    return `${distanceMeters} meters away`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km away`;
}

export default function SheltersListScreen() {
  const router = useRouter();

  const [nearbyShelters, setNearbyShelters] = useState<NearbyShelter[]>([]);
  const [loadingShelters, setLoadingShelters] = useState(true);
  const [locationError, setLocationError] = useState('');

  const loadNearbyShelters = async () => {
    try {
      setLoadingShelters(true);
      setLocationError('');

      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        setLocationError('Location permission was denied.');
        setNearbyShelters([]);
        return;
      }

      const location = await Location.getCurrentPositionAsync({});

      const response = await fetch(`${API_BASE_URL}/recommendations/nearby-shelters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_latitude: location.coords.latitude,
          user_longitude: location.coords.longitude,
          limit: 10,
        }),
      });

      if (!response.ok) {
        setNearbyShelters([]);
        return;
      }

      const data = await response.json();
      setNearbyShelters(data);
    } catch (error) {
      console.log('Failed to load shelters list:', error);
      setNearbyShelters([]);
      setLocationError('Failed to load nearby shelters.');
    } finally {
      setLoadingShelters(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadNearbyShelters();
    }, [])
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>

          <Text style={styles.title}>Nearby Shelters</Text>
          <Text style={styles.subtitle}>
            10 closest official shelters based on your current location
          </Text>
        </View>

        <View style={styles.listSection}>
          {loadingShelters ? (
            <Text style={styles.helperText}>Loading shelters...</Text>
          ) : locationError ? (
            <Text style={styles.helperText}>{locationError}</Text>
          ) : nearbyShelters.length === 0 ? (
            <Text style={styles.helperText}>No nearby shelters found.</Text>
          ) : (
            nearbyShelters.map((shelter) => (
              <Pressable
                key={shelter.id}
                style={styles.shelterCard}
                onPress={() =>
                  router.push({
                    pathname: '/navigation',
                    params: {
                      name: shelter.name,
                      latitude: String(shelter.latitude),
                      longitude: String(shelter.longitude),
                    },
                  })
                }
              >
                <Text style={styles.shelterName}>{shelter.name}</Text>
                <Text style={styles.shelterInfo}>
                  {shelter.address || shelter.city}
                </Text>
                <Text style={styles.shelterInfo}>
                  {formatDistance(shelter.distance_meters)} • {shelter.estimated_walk_minutes} min walk
                </Text>
                <Text style={styles.shelterSource}>Source: {shelter.source}</Text>
              </Pressable>
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
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  shelterName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  shelterInfo: {
    fontSize: 14,
    color: '#475569',
  },
  shelterSource: {
    fontSize: 14,
    color: '#1D4ED8',
    fontWeight: '600',
  },
});
