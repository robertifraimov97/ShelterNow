import { SafeAreaView, View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import { API_BASE_URL } from '../constants/api';
import {
  getShelterFeedbackSummary,
  type ShelterFeedbackSummary,
} from '../services/shelterFeedbackSummary';

// Represents a nearby shelter returned from the recommendation endpoints.
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

// Represents a nearby shelter extended with optional feedback summary data.
type NearbyShelterWithSummary = NearbyShelter & {
  feedbackSummary?: ShelterFeedbackSummary | null;
};

// Represents the alerts response used to determine whether emergency mode is active.
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

// Formats distance for user-friendly display in the shelters list.
function formatDistance(distanceMeters: number) {
  if (distanceMeters < 1000) {
    return `${distanceMeters} meters away`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km away`;
}

export default function SheltersListScreen() {
  // Router instance used for navigating back and opening navigation screen.
  const router = useRouter();

  // Stores the nearby shelters loaded from the backend.
  const [nearbyShelters, setNearbyShelters] = useState<NearbyShelterWithSummary[]>([]);

  // Controls the loading state while shelter data is being fetched.
  const [loadingShelters, setLoadingShelters] = useState(true);

  // Stores any location-related or loading error message shown to the user.
  const [locationError, setLocationError] = useState('');

  // Indicates whether the current location is in emergency mode.
  const [isEmergencyMode, setIsEmergencyMode] = useState(false);

  // Loads alert state for the current city and updates emergency mode accordingly.
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

      // Decide whether the app should use the emergency shelter flow
      // based on relevance and experience fields returned by the alerts API.
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

  // Loads the feedback summary for each shelter in parallel.
  const enrichSheltersWithFeedbackSummary = async (
    shelters: NearbyShelter[]
  ): Promise<NearbyShelterWithSummary[]> => {
    const sheltersWithSummaries = await Promise.all(
      shelters.map(async (shelter) => {
        try {
          const summary = await getShelterFeedbackSummary(
            shelter.source,
            shelter.id
          );

          return {
            ...shelter,
            feedbackSummary: summary,
          };
        } catch (error) {
          console.log(
            `Failed to load feedback summary for shelter ${shelter.id}:`,
            error
          );

          return {
            ...shelter,
            feedbackSummary: null,
          };
        }
      })
    );

    return sheltersWithSummaries;
  };

  // Loads nearby shelters based on the user's current location
  // and switches between normal and emergency recommendation endpoints if needed.
  const loadNearbyShelters = async () => {
    try {
      setLoadingShelters(true);
      setLocationError('');

      // Ask for foreground location permission before accessing user location.
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        setLocationError('Location permission was denied.');
        setNearbyShelters([]);
        return;
      }

      // Get the user's current GPS location.
      const location = await Location.getCurrentPositionAsync({});

      let cityName: string | null = null;

      try {
        // Reverse geocode the coordinates into a city/subregion/region name.
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

      // Load alert-based emergency state for the resolved city.
      await loadAlertsState(cityName);

      const alertsParams = new URLSearchParams();
      if (cityName) {
        alertsParams.append('current_city', cityName);
      }

      let useEmergencyMode = false;

      try {
        // Fetch alerts again to confirm whether emergency shelter flow should be used.
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

      // Choose the appropriate nearby shelters endpoint depending on emergency state.
      const endpoint = useEmergencyMode
        ? `${API_BASE_URL}/recommendations/nearby-emergency-shelters`
        : `${API_BASE_URL}/recommendations/nearby-shelters`;

      // Request ranked nearby shelters from the backend.
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

      const data: NearbyShelter[] = await response.json();
      const sheltersWithSummaries = await enrichSheltersWithFeedbackSummary(data);

      setNearbyShelters(sheltersWithSummaries);
    } catch (error) {
      console.log('Failed to load shelters list:', error);
      setNearbyShelters([]);
      setLocationError('Failed to load nearby shelters.');
    } finally {
      setLoadingShelters(false);
    }
  };

  // Reload the nearby shelters every time the screen becomes focused.
  useFocusEffect(
    useCallback(() => {
      loadNearbyShelters();
    }, [])
  );

  // Returns a short community feedback label for the shelter card.
  const renderCommunityFeedbackText = (summary?: ShelterFeedbackSummary | null) => {
    if (!summary || summary.total_feedback_count === 0) {
      return 'Community feedback: No feedback yet';
    }

    return `Community feedback: ${summary.summary_label}`;
  };

  // Returns score and reports text for the shelter card.
  const renderCommunityScoreText = (summary?: ShelterFeedbackSummary | null) => {
    if (!summary || summary.total_feedback_count === 0) {
      return null;
    }

    return `Score: ${summary.reliability_score} • ${summary.total_feedback_count} reports`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header section with back button and emergency mode indicator */}
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>

          <Text style={styles.title}>Nearby Shelters</Text>
          <Text style={styles.subtitle}>
            {isEmergencyMode ? 'EMERGENCY MODE ON' : 'EMERGENCY MODE OFF'}
          </Text>
        </View>

        {/* Main shelters list section with loading, error, empty, and content states */}
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
                      shelterId: String(shelter.id),
                    },
                  })
                }
              >
                {/* Shelter basic info */}
                <Text style={styles.shelterName}>{shelter.name}</Text>
                <Text style={styles.shelterInfo}>
                  {shelter.address || shelter.city}
                </Text>
                <Text style={styles.shelterInfo}>
                  {formatDistance(shelter.distance_meters)} • {shelter.estimated_walk_minutes} min walk
                </Text>
                <Text style={styles.shelterSource}>Source: {shelter.source}</Text>

                {/* Community feedback summary */}
                <Text style={styles.communityFeedbackText}>
                  {renderCommunityFeedbackText(shelter.feedbackSummary)}
                </Text>

                {renderCommunityScoreText(shelter.feedbackSummary) ? (
                  <Text style={styles.communityFeedbackMeta}>
                    {renderCommunityScoreText(shelter.feedbackSummary)}
                  </Text>
                ) : null}
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
  communityFeedbackText: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
    marginTop: 6,
  },
  communityFeedbackMeta: {
    fontSize: 13,
    color: '#475569',
  },
});
