import { SafeAreaView, View, Text, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { styles } from '../../styles/home.styles';
import { API_BASE_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import { createShelterVisitSession } from '../../services/shelterFeedback';
import {
  getShelterFeedbackSummary,
  type ShelterFeedbackSummary,
} from '../../services/shelterFeedbackSummary';
import {
  getUserPreferences,
  type UserPreferences,
} from '../../services/userPreferences';

// Represents an official shelter object returned from the backend.
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
  created_at?: string;
  updated_at?: string;
};

// Represents a ranked nearby shelter returned from recommendation endpoints.
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

// Represents one coordinate point in a walking route polyline.
type RoutePoint = {
  latitude: number;
  longitude: number;
};

// Represents the walking route response returned from the backend.
type WalkingRouteResponse = {
  distance_meters: number;
  duration_seconds: number;
  route_coordinates: RoutePoint[];
};

// Represents the alerts response used to determine if emergency mode should be active.
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

// Formats a distance value for compact UI display.
function formatDistance(distanceMeters: number) {
  if (distanceMeters < 1000) {
    return `${distanceMeters}m`;
  }

  return `${(distanceMeters / 1000).toFixed(1)}km`;
}

function getAccessibilityStatus(
  shelter: NearbyShelterWithSummary
): AccessibilityStatus {
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
}

function shouldPreferAccessibility(preferences: UserPreferences | null) {
  return Boolean(
    preferences &&
      (
        preferences.mobility_status === 'limited' ||
        preferences.prefer_accessible_route
      )
  );
}

function chooseRecommendedShelter(
  shelters: NearbyShelterWithSummary[],
  preferences: UserPreferences | null
): {
  shelter: NearbyShelterWithSummary | null;
  recommendationReason: string | null;
} {
  if (shelters.length === 0) {
    return {
      shelter: null,
      recommendationReason: null,
    };
  }

  const defaultShelter = shelters[0];
  const defaultShelterAccessibility = getAccessibilityStatus(defaultShelter);

    if (!shouldPreferAccessibility(preferences)) {
      return {
        shelter: defaultShelter,
        recommendationReason: null,
      };
    }

    if (defaultShelterAccessibility === 'accessible') {
      return {
        shelter: defaultShelter,
        recommendationReason: null,
      };
    }

  if (!shouldPreferAccessibility(preferences)) {
    return {
      shelter: defaultShelter,
      recommendationReason: null,
    };
  }

  const accessibleShelter = shelters.find(
    (shelter) => getAccessibilityStatus(shelter) === 'accessible'
  );

  if (!accessibleShelter) {
    return {
      shelter: defaultShelter,
      recommendationReason: 'No clearly accessible shelter was found nearby, so the shortest route was kept.',
    };
  }

  const extraMinutes =
    accessibleShelter.estimated_walk_minutes - defaultShelter.estimated_walk_minutes;

  const extraDistance =
    accessibleShelter.distance_meters - defaultShelter.distance_meters;

  const isAccessibleOverrideReasonable =
    extraMinutes <= 2 || extraDistance <= 150;

  if (isAccessibleOverrideReasonable) {
    return {
      shelter: accessibleShelter,
      recommendationReason: 'An accessible nearby option was preferred because the extra distance was small.',
    };
  }

  return {
    shelter: defaultShelter,
    recommendationReason: 'A shorter route was kept because the nearest accessible option was significantly farther away.',
  };
}

export default function HomeScreen() {
  const router = useRouter();
  const { token, isAuthenticated } = useAuth();

  // Stores the user's current GPS location.
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Stores the detected current city name.
  const [currentCity, setCurrentCity] = useState<string | null>(null);

  // Controls whether the screen should behave in emergency mode.
  const [isEmergencyMode, setIsEmergencyMode] = useState(false);

  // Controls the visibility of the "Center on Me" button.
  const [showCenterButton, setShowCenterButton] = useState(false);

  // Stores all official shelters for displaying markers on the map.
  const [officialShelters, setOfficialShelters] = useState<OfficialShelter[]>([]);

  // Stores current user preferences when available.
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);

  // Stores the best shelter recommendation for the current user location.
  const [bestShelter, setBestShelter] = useState<NearbyShelterWithSummary | null>(null);

  // Explains why the current shelter was selected.
  const [recommendationReason, setRecommendationReason] = useState<string | null>(null);

  // Stores the polyline points for the walking route to the best shelter.
  const [walkingRoute, setWalkingRoute] = useState<RoutePoint[]>([]);

  // Tracks whether the best shelter data is currently loading.
  const [loadingBestShelter, setLoadingBestShelter] = useState(true);

  // Tracks whether route start is currently being prepared.
  const [startingRoute, setStartingRoute] = useState(false);

  // Reference to the map, used for animating back to the user's location.
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
      console.log('Failed to load user preferences for home screen:', error);
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
      console.log('Failed to load official shelters for home screen:', error);
    }
  };

  // Checks the current alerts state to decide whether emergency mode should be enabled.
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
      console.log('Failed to load alerts state for home screen:', error);
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
            `Failed to load feedback summary for home shelter ${shelter.id}:`,
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

  // Loads nearby shelters and then chooses the recommended one based on preferences.
  const loadRecommendedShelter = async (
    latitude: number,
    longitude: number,
    useEmergencyMode: boolean,
    preferences: UserPreferences | null
  ) => {
    try {
      setLoadingBestShelter(true);

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
          limit: 10,
        }),
      });

      if (!response.ok) {
        console.log('Failed to load nearby shelters for recommendation');
        setBestShelter(null);
        setRecommendationReason(null);
        return;
      }

      const data: NearbyShelter[] = await response.json();
      const sheltersWithSummaries = await enrichSheltersWithFeedbackSummary(data);

      const recommendation = chooseRecommendedShelter(
        sheltersWithSummaries,
        preferences
      );

      setBestShelter(recommendation.shelter);
      setRecommendationReason(recommendation.recommendationReason);
    } catch (error) {
      console.log('Failed to load recommended shelter:', error);
      setBestShelter(null);
      setRecommendationReason(null);
    } finally {
      setLoadingBestShelter(false);
    }
  };

  // Loads the walking route from the user's location to the selected shelter.
  const loadWalkingRoute = async (
    startLatitude: number,
    startLongitude: number,
    endLatitude: number,
    endLongitude: number
  ) => {
    try {
      const response = await fetch(`${API_BASE_URL}/routing/walking-route`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          start_latitude: startLatitude,
          start_longitude: startLongitude,
          end_latitude: endLatitude,
          end_longitude: endLongitude,
        }),
      });

      if (!response.ok) {
        console.log('Failed to load walking route');
        setWalkingRoute([]);
        return;
      }

      const data: WalkingRouteResponse = await response.json();
      setWalkingRoute(data.route_coordinates || []);
    } catch (error) {
      console.log('Failed to load walking route:', error);
      setWalkingRoute([]);
    }
  };

  // Loads all main screen data.
  const loadHomeScreenData = async () => {
    try {
      setLoadingBestShelter(true);

      await loadUserPreferences();

      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        console.log('Location permission was denied');
        setLoadingBestShelter(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({});

      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      console.log('User location:', coords);

      setUserLocation(coords);

      let cityName: string | null = null;

      try {
        const reverseGeocoded = await Location.reverseGeocodeAsync(coords);

        if (reverseGeocoded.length > 0) {
          const place = reverseGeocoded[0];
          cityName = place.city || place.subregion || place.region || null;
        }
      } catch (error) {
        console.log('Failed to reverse geocode current city for home screen:', error);
      }

      setCurrentCity(cityName);

      const emergencyMode = await resolveEmergencyMode(cityName);

      const preferences = token && isAuthenticated
        ? await getUserPreferences(token).catch(() => null)
        : null;

      setUserPreferences(preferences);

      await Promise.all([
        loadOfficialShelters(),
        loadRecommendedShelter(
          coords.latitude,
          coords.longitude,
          emergencyMode,
          preferences
        ),
      ]);
    } catch (error) {
      console.log('Failed to load home screen data:', error);
      setBestShelter(null);
      setRecommendationReason(null);
      setLoadingBestShelter(false);
    }
  };

  // Creates a visit session for authenticated users and opens navigation.
  const handleStartRoute = async () => {
    if (!bestShelter || startingRoute) {
      return;
    }

    let visitSessionId: number | null = null;

    try {
      setStartingRoute(true);

      if (token) {
        const visitSession = await createShelterVisitSession(
          token,
          bestShelter.id,
          bestShelter.source
        );

        visitSessionId = visitSession.id;
      }
    } catch (error) {
      console.log('Failed to create shelter visit session:', error);
    } finally {
      setStartingRoute(false);
    }

    router.push({
      pathname: '/navigation',
      params: {
        name: bestShelter.name,
        latitude: String(bestShelter.latitude),
        longitude: String(bestShelter.longitude),
        source: bestShelter.source,
        shelterId: String(bestShelter.id),
        visitSessionId: visitSessionId ? String(visitSessionId) : '',
      },
    });
  };

  // Initial screen data load when the component mounts.
  useEffect(() => {
    loadHomeScreenData();
  }, []);

  // Reloads the screen data whenever the screen becomes focused again.
  useFocusEffect(
    useCallback(() => {
      loadHomeScreenData();
    }, [])
  );

  // Whenever the user location or best shelter changes, reload the walking route between them.
  useEffect(() => {
    if (!userLocation || !bestShelter) {
      setWalkingRoute([]);
      return;
    }

    loadWalkingRoute(
      userLocation.latitude,
      userLocation.longitude,
      bestShelter.latitude,
      bestShelter.longitude
    );
  }, [userLocation, bestShelter]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.appName}>ShelterNow</Text>
          <Text style={styles.subtitle}>Emergency shelter guidance</Text>
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Status</Text>
          <Text
            style={[
              styles.statusValue,
              { color: isEmergencyMode ? '#DC2626' : '#16A34A' },
            ]}
          >
            {isEmergencyMode ? 'Emergency Mode' : 'All Clear'}
          </Text>
        </View>

        <View style={styles.mainCard}>
          <Text style={styles.cardTitle}>Nearest Shelter</Text>

          {loadingBestShelter ? (
            <>
              <Text style={styles.cardName}>Loading...</Text>
              <Text style={styles.cardMeta}>Checking nearby shelters</Text>
              <Text style={styles.cardSource}>Loading source</Text>
            </>
          ) : bestShelter ? (
            <>
              <Text style={styles.cardName}>{bestShelter.name}</Text>
              <Text style={styles.cardMeta}>
                {formatDistance(bestShelter.distance_meters)} • {bestShelter.estimated_walk_minutes} min walk
              </Text>
              <Text style={styles.cardSource}>
                {bestShelter.source} source
              </Text>

              {recommendationReason ? (
                <Text
                  style={{
                    marginTop: 8,
                    fontSize: 13,
                    color: '#475569',
                    lineHeight: 18,
                  }}
                >
                  {recommendationReason}
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.cardName}>No shelter found</Text>
              <Text style={styles.cardMeta}>No nearby shelters available yet</Text>
              <Text style={styles.cardSource}>No source available</Text>
            </>
          )}

          <View style={styles.goButtonWrapper}>
            <View style={styles.emergencyButtonHalo}>
              <Pressable
                style={styles.emergencyButton}
                onPress={handleStartRoute}
                disabled={!bestShelter || startingRoute}
              >
                <Text style={styles.emergencyButtonText}>
                  {startingRoute ? 'Starting' : 'Start'}
                </Text>
                <Text style={styles.emergencyButtonText}>
                  {startingRoute ? 'Route...' : 'Route'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.mapSection}>
          <Text style={styles.mapTitle}>Quick Map Preview</Text>

          <View style={styles.mapContainer}>
            {userLocation ? (
              <>
                <MapView
                  ref={mapRef}
                  style={styles.map}
                  initialRegion={{
                    latitude: userLocation.latitude,
                    longitude: userLocation.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
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
                      latitudeDifference > 0.001 || longitudeDifference > 0.001;

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

                  {walkingRoute.length > 0 && (
                    <Polyline
                      coordinates={walkingRoute}
                      strokeWidth={4}
                      strokeColor={
                        bestShelter?.source === 'Community' ? '#7C3AED' : '#2563EB'
                      }
                    />
                  )}
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
                            latitudeDelta: 0.01,
                            longitudeDelta: 0.01,
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
      </View>
    </SafeAreaView>
  );
}
