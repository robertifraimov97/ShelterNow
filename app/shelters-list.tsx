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

type AlertsResponse = {
  alert: {
    source: string;
    raw: Record<string, any>;
    has_active_alert: boolean;
  };
  relevance: {
    priority: 'emergency' | 'followed_area' | 'none';
    current_location_match: boolean;
    show_nearest_shelter_button: boolean;
  };
  experience?: {
    focus_mode: 'normal' | 'current_location_warning' | 'current_location_emergency';
    show_nearest_shelter_button: boolean;
    should_offer_shelter_guidance: boolean;
  };
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
  const [isEmergencyMode, setIsEmergencyMode] = useState(false);

  const loadAlertsState = async (cityName: string | null) => {
    try {
      const params = new URLSearchParams();

      if (cityName) {
        params.append('current_city', cityName);
      }

      const response = await fetch(`${API_BASE_URL}/alerts/?${params.toString()}`);

      if (!response.ok) {
        setIsEmergencyMode(false);
        return;
      }

      const data: AlertsResponse = await response.json();

      const shouldUseEmergencyShelterFlow =
        data.relevance.current_location_match ||
        data.relevance.show_nearest_shelter_button ||
        data.experience?.show_nearest_shelter_button ||
        data.experience?.should_offer_shelter_guidance ||
        data.experience?.focus_mode === 'current_location_emergency' ||
        data.experience?.focus_mode === 'current_location_warning';

      setIsEmergencyMode(Boolean(shouldUseEmergencyShelterFlow));
    } catch (error) {
      console.log('Failed to load alerts state for shelters list:', error);
      setIsEmergencyMode(false);
    }
  };

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

      let cityName: string | null = null;

      try {
        const reverseGeocoded = await Location.reverseGeocodeAsync({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });

        if (reverseGeocoded.length > 0) {
          const place = reverseGeocoded[0];
          cityName = place.city || place.subregion || place.region || null;
        }
      } catch (error) {
        console.log('Failed to reverse geocode current city for shelters list:', error);
      }

      await loadAlertsState(cityName);

      const alertsParams = new URLSearchParams();
      if (cityName) {
        alertsParams.append('current_city', cityName);
      }

      let useEmergencyMode = false;

      try {
        const alertsResponse = await fetch(`${API_BASE_URL}/alerts/?${alertsParams.toString()}`);

        if (alertsResponse.ok) {
          const alertsData: AlertsResponse = await alertsResponse.json();

          useEmergencyMode =
            alertsData.relevance.current_location_match ||
            alertsData.relevance.show_nearest_shelter_button ||
            alertsData.experience?.show_nearest_shelter_button ||
            alertsData.experience?.should_offer_shelter_guidance ||
            alertsData.experience?.focus_mode === 'current_location_emergency' ||
            alertsData.experience?.focus_mode === 'current_location_warning';

          setIsEmergencyMode(Boolean(useEmergencyMode));
        } else {
          setIsEmergencyMode(false);
        }
      } catch (error) {
        console.log('Failed to confirm alerts state for shelters list:', error);
        setIsEmergencyMode(false);
      }

      const endpoint = useEmergencyMode
        ? `${API_BASE_URL}/recommendations/nearby-emergency-shelters`
        : `${API_BASE_URL}/recommendations/nearby-shelters`;

      const response = await fetch(endpoint, {
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
            {isEmergencyMode
                ? 'EMERGENCY MODE ON'
                : 'EMERGENCY MODE OFF'}
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
                key={`${shelter.source}-${shelter.id}`}
                style={styles.shelterCard}
                onPress={() =>
                  router.push({
                    pathname: '/navigation',
                    params: {
                      name: shelter.name,
                      latitude: String(shelter.latitude),
                      longitude: String(shelter.longitude),
                      source: shelter.source,
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
