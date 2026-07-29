import { SafeAreaView, View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { API_BASE_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import {
  getShelterFeedbackSummary,
  type ShelterFeedbackSummary,
} from '../../services/shelterFeedbackSummary';
import { getUserPreferences, type UserPreferences } from '../../services/userPreferences';
import { createShelterVisitSession } from '../../services/shelterFeedback';

// Represents an official shelter record returned from the backend.
type OfficialShelter = {
  id: number;
  name: string;
  city: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  shelter_type: string;
  source_type: string;
  source_name?: string | null;
  source_url?: string | null;
  accessibility_notes?: string | null;
  status: string;
  last_verified_at?: string | null;
};

// Represents a ranked nearby shelter recommendation returned from the backend.
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
  accessibility_notes?: string | null;
};

type NearbyShelterWithSummary = NearbyShelter & {
  feedbackSummary?: ShelterFeedbackSummary | null;
};

type AccessibilityStatus = 'accessible' | 'unclear' | 'possibly_not_accessible';

// Represents the alerts response used to decide whether emergency mode is active.
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

// Formats shelter distance for display in the UI.
function formatDistance(distanceMeters: number) {
  if (distanceMeters < 1000) {
    return `${distanceMeters} meters away`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km away`;
}

export default function MapScreen() {
  const router = useRouter();
  const { token, isAuthenticated } = useAuth();

  // Stores the user's current GPS coordinates.
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Stores the user's current detected city.
  const [currentCity, setCurrentCity] = useState<string | null>(null);

  // Controls whether the screen should use emergency shelter logic.
  const [isEmergencyMode, setIsEmergencyMode] = useState(false);

  // Controls visibility of the "Center on Me" button after map movement.
  const [showCenterButton, setShowCenterButton] = useState(false);

  // Stores all official shelters displayed on the map.
  const [officialShelters, setOfficialShelters] = useState<OfficialShelter[]>([]);

  // Stores the nearby shelters list shown below the map.
  const [nearbyShelters, setNearbyShelters] = useState<NearbyShelterWithSummary[]>([]);

  // Tracks loading state while shelters and location data are being fetched.
  const [loadingShelters, setLoadingShelters] = useState(true);

  // Stores current user preferences when available.
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);

  // Reference to the MapView so the app can recenter it programmatically.
  const mapRef = useRef<MapView | null>(null);

  const loadUserPreferences = async () => {
    if (!token || !isAuthenticated) {
      setUserPreferences(null);
      return;
    }

    try {
      const preferences = await getUserPreferences(token);
      setUserPreferences(preferences);
    } catch (error) {
      console.log('Failed to load user preferences for map screen:', error);
      setUserPreferences(null);
    }
  };

  // Loads all official shelters from the backend and keeps only those with coordinates.
  const loadOfficialShelters = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/shelters/`);
      const data = await response.json();

      const sheltersWithCoordinates = data.filter(
        (shelter: OfficialShelter) =>
          shelter.latitude !== null && shelter.longitude !== null
      );

      setOfficialShelters(sheltersWithCoordinates);
    } catch (error) {
      console.log('Failed to load official shelters for map:', error);
    }
  };

  // Determines whether emergency mode should be enabled based on current city alerts.
  const resolveEmergencyMode = async (cityName: string | null) => {
    try {
      const params = new URLSearchParams();

      if (cityName) {
        params.append('current_city', cityName);
      }

      const response = await fetch(`${API_BASE_URL}/alerts/?${params.toString()}`);

      if (!response.ok) {
        setIsEmergencyMode(false);
        return false;
      }

      const data: AlertsResponse = await response.json();

      const shouldUseEmergencyShelterFlow =
        data.relevance.current_location_match ||
        data.relevance.show_nearest_shelter_button ||
        data.experience?.show_nearest_shelter_button ||
        data.experience?.should_offer_shelter_guidance ||
        data.experience?.focus_mode === 'current_location_emergency' ||
        data.experience?.focus_mode === 'current_location_warning';

      const emergency = Boolean(shouldUseEmergencyShelterFlow);
      setIsEmergencyMode(emergency);
      return emergency;
    } catch (error) {
      console.log('Failed to load alerts state for map screen:', error);
      setIsEmergencyMode(false);
      return false;
    }
  };

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
            `Failed to load feedback summary for map shelter ${shelter.id}:`,
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

  const getAccessibilityStatus = (
    shelter: NearbyShelterWithSummary
  ): AccessibilityStatus => {
    const notes = shelter.accessibility_notes?.toLowerCase() || '';
    const summary = shelter.feedbackSummary;

    const hasPositiveNotes =
      notes.includes('accessible') ||
      notes.includes('נגיש');

    const hasNegativeNotes =
      notes.includes('not accessible') ||
      notes.includes('לא נגיש');

    if (hasNegativeNotes) {
      return 'possibly_not_accessible';
    }

    if (hasPositiveNotes) {
      return 'accessible';
    }

    if (!summary || summary.total_feedback_count === 0) {
      return 'unclear';
    }

    if (summary.accessible_no_count > summary.accessible_yes_count) {
      return 'possibly_not_accessible';
    }

    if (
      summary.accessible_yes_count > 0 &&
      summary.accessible_yes_count >= summary.accessible_no_count
    ) {
      return 'accessible';
    }

    if (summary.accessible_partial_count > 0 || summary.accessible_unknown_count > 0) {
      return 'unclear';
    }

    return 'unclear';
  };

  const shouldWarnBeforeNavigation = () => {
    return Boolean(
      userPreferences &&
        (
          userPreferences.mobility_status === 'limited' ||
          userPreferences.prefer_accessible_route
        )
    );
  };

  const openNavigation = async (shelter: NearbyShelterWithSummary) => {
    let visitSessionId: number | null = null;

    try {
      if (token) {
        const visitSession = await createShelterVisitSession(
          token,
          shelter.id,
          shelter.source
        );

        visitSessionId = visitSession.id;
      }
    } catch (error) {
      console.log('Failed to create shelter visit session from map screen:', error);
    }

    router.push({
      pathname: '/navigation',
      params: {
        name: shelter.name,
        latitude: String(shelter.latitude),
        longitude: String(shelter.longitude),
        source: shelter.source,
        shelterId: String(shelter.id),
        visitSessionId: visitSessionId ? String(visitSessionId) : '',
      },
    });
  };

  const handleShelterPress = async (shelter: NearbyShelterWithSummary) => {
    const accessibilityStatus = getAccessibilityStatus(shelter);

    if (
      shouldWarnBeforeNavigation() &&
      accessibilityStatus !== 'accessible'
    ) {
      const message =
        accessibilityStatus === 'possibly_not_accessible'
          ? 'This shelter may not be fully accessible. Please take this into account before starting navigation.'
          : 'Accessibility information for this shelter is limited. Please take this into account before starting navigation.';

      Alert.alert(
        'Accessibility notice',
        message,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: () => {
              openNavigation(shelter);
            },
          },
        ]
      );

      return;
    }

    await openNavigation(shelter);
  };

  // Loads nearby shelter recommendations for the user,
  // using either normal mode or emergency mode endpoints.
  const loadNearbyShelters = async (
    latitude: number,
    longitude: number,
    useEmergencyMode: boolean
  ) => {
    try {
      setLoadingShelters(true);

      const endpoint = useEmergencyMode
        ? `${API_BASE_URL}/recommendations/nearby-emergency-shelters`
        : `${API_BASE_URL}/recommendations/nearby-shelters`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_latitude: latitude,
          user_longitude: longitude,
          limit: 5,
        }),
      });

      if (!response.ok) {
        console.log('Failed to load nearby shelters recommendation');
        setNearbyShelters([]);
        return;
      }

      const data: NearbyShelter[] = await response.json();
      const sheltersWithSummaries = await enrichSheltersWithFeedbackSummary(data);
      setNearbyShelters(sheltersWithSummaries);
    } catch (error) {
      console.log('Failed to load nearby shelters recommendation:', error);
      setNearbyShelters([]);
    } finally {
      setLoadingShelters(false);
    }
  };

  // Loads all data needed for the screen.
  const loadExploreScreenData = async () => {
    try {
      setLoadingShelters(true);

      await loadUserPreferences();

      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        console.log('Location permission was denied');
        setLoadingShelters(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({});

      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setUserLocation(coords);

      let cityName: string | null = null;

      try {
        const reverseGeocoded = await Location.reverseGeocodeAsync(coords);

        if (reverseGeocoded.length > 0) {
          const place = reverseGeocoded[0];
          cityName = place.city || place.subregion || place.region || null;
        }
      } catch (error) {
        console.log('Failed to reverse geocode current city for map screen:', error);
      }

      setCurrentCity(cityName);

      const emergencyMode = await resolveEmergencyMode(cityName);

      await Promise.all([
        loadOfficialShelters(),
        loadNearbyShelters(coords.latitude, coords.longitude, emergencyMode),
      ]);
    } catch (error) {
      console.log('Failed to load explore screen data:', error);
      setNearbyShelters([]);
      setLoadingShelters(false);
    }
  };

  useEffect(() => {
    loadExploreScreenData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadExploreScreenData();
    }, [])
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Nearby Protected Areas</Text>
          <Text style={styles.subtitle}>
            {isEmergencyMode
              ? 'Emergency mode active near your location'
              : 'View protected areas around your current location'}
          </Text>
        </View>

        <View style={styles.mapSection}>
          <Text style={styles.mapLabel}>Map View</Text>

          <View style={styles.mapContainer}>
            {userLocation ? (
              <>
                <MapView
                  ref={mapRef}
                  style={styles.map}
                  initialRegion={{
                    latitude: userLocation.latitude,
                    longitude: userLocation.longitude,
                    latitudeDelta: 0.02,
                    longitudeDelta: 0.02,
                  }}
                  onRegionChangeComplete={(region) => {
                    if (!userLocation) return;

                    const latitudeDifference = Math.abs(
                      region.latitude - userLocation.latitude
                    );
                    const longitudeDifference = Math.abs(
                      region.longitude - userLocation.longitude
                    );

                    const movedAway =
                      latitudeDifference > 0.002 || longitudeDifference > 0.002;

                    setShowCenterButton(movedAway);
                  }}
                >
                  <Marker
                    coordinate={{
                      latitude: userLocation.latitude,
                      longitude: userLocation.longitude,
                    }}
                    title="Your Location"
                    description="Current user position"
                    pinColor="red"
                  />

                  {officialShelters.map((shelter) => (
                    <Marker
                      key={shelter.id}
                      coordinate={{
                        latitude: shelter.latitude,
                        longitude: shelter.longitude,
                      }}
                      title={shelter.name}
                      description={`${shelter.address || shelter.city} • Official`}
                      pinColor="blue"
                    />
                  ))}
                </MapView>

                {showCenterButton && (
                  <Pressable
                    style={styles.centerButton}
                    onPress={() => {
                      if (userLocation && mapRef.current) {
                        mapRef.current.animateToRegion(
                          {
                            latitude: userLocation.latitude,
                            longitude: userLocation.longitude,
                            latitudeDelta: 0.02,
                            longitudeDelta: 0.02,
                          },
                          800
                        );
                        setShowCenterButton(false);
                      }
                    }}
                  >
                    <Text style={styles.centerButtonText}>Center on Me</Text>
                  </Pressable>
                )}

                <Pressable
                  style={styles.fullMapButton}
                  onPress={() => router.push('/full-map')}
                >
                  <Text style={styles.fullMapButtonText}>Open Full Map</Text>
                </Pressable>
              </>
            ) : (
              <View style={styles.mapLoadingContainer}>
                <Text style={styles.mapLoadingText}>Loading your location...</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.listSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Nearby Options</Text>
            <Pressable onPress={() => router.push('/shelters-list')}>
              <Text style={styles.seeAllText}>See all</Text>
            </Pressable>
          </View>

          {loadingShelters ? (
            <Text style={styles.helperText}>Loading nearby shelters...</Text>
          ) : nearbyShelters.length === 0 ? (
            <Text style={styles.helperText}>No nearby shelters available yet.</Text>
          ) : (
            nearbyShelters.map((shelter) => (
              <Pressable
                key={`${shelter.source}-${shelter.id}`}
                style={styles.areaCard}
                onPress={() => handleShelterPress(shelter)}
              >
                <Text style={styles.areaName}>{shelter.name}</Text>
                <Text style={styles.areaInfo}>
                  {shelter.address || shelter.city}
                </Text>
                <Text style={styles.areaInfo}>
                  {formatDistance(shelter.distance_meters)} • {shelter.estimated_walk_minutes} min walk
                </Text>
                <Text style={styles.areaInfo}>Source: {shelter.source}</Text>
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
    paddingBottom: 20,
    gap: 20,
  },
  header: {
    gap: 6,
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
  mapSection: {
    gap: 10,
  },
  mapLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  mapContainer: {
    height: 280,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#C7D2E0',
  },
  map: {
    flex: 1,
  },
  mapLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EAF1F8',
  },
  mapLoadingText: {
    fontSize: 15,
    color: '#475569',
    fontWeight: '500',
  },
  centerButton: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D9E6',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 4,
  },
  centerButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  fullMapButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D9E6',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 4,
  },
  fullMapButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  listSection: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
  },
  helperText: {
    fontSize: 15,
    color: '#64748B',
  },
  areaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  areaName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E3A8A',
  },
  areaInfo: {
    fontSize: 14,
    color: '#475569',
  },
});
