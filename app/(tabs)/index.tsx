import { SafeAreaView, View, Text, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { styles } from '../../styles/home.styles';
import { API_BASE_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import { createShelterVisitSession } from '../../services/shelterFeedback';

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

// Represents the single best shelter recommendation returned from the backend.
type BestShelterRecommendation = {
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

export default function HomeScreen() {
  const router = useRouter();
  const { token } = useAuth();

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

  // Stores the best shelter recommendation for the current user location.
  const [bestShelter, setBestShelter] = useState<BestShelterRecommendation | null>(null);

  // Stores the polyline points for the walking route to the best shelter.
  const [walkingRoute, setWalkingRoute] = useState<RoutePoint[]>([]);

  // Tracks whether the best shelter data is currently loading.
  const [loadingBestShelter, setLoadingBestShelter] = useState(true);

  // Tracks whether route start is currently being prepared.
  const [startingRoute, setStartingRoute] = useState(false);

  // Reference to the map, used for animating back to the user's location.
  const mapRef = useRef<MapView | null>(null);

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

      // Emergency mode becomes active if the user's location is affected
      // or the backend experience/relevance layers say shelter guidance should be shown.
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

  // Loads the best shelter recommendation from the backend.
  // Uses a different endpoint depending on whether emergency mode is active.
  const loadBestShelterRecommendation = async (
    latitude: number,
    longitude: number,
    useEmergencyMode: boolean
  ) => {
    try {
      setLoadingBestShelter(true);

      const endpoint = useEmergencyMode
        ? `${API_BASE_URL}/recommendations/best-emergency-shelter`
        : `${API_BASE_URL}/recommendations/best-shelter`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_latitude: latitude,
          user_longitude: longitude,
        }),
      });

      if (!response.ok) {
        console.log('Failed to load best shelter recommendation');
        setBestShelter(null);
        return;
      }

      const data = await response.json();
      setBestShelter(data);
    } catch (error) {
      console.log('Failed to load best shelter recommendation:', error);
      setBestShelter(null);
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

  // Loads all main screen data:
  // location, current city, emergency mode, official shelters, and best shelter recommendation.
  const loadHomeScreenData = async () => {
    try {
      setLoadingBestShelter(true);

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

      await Promise.all([
        loadOfficialShelters(),
        loadBestShelterRecommendation(
          coords.latitude,
          coords.longitude,
          emergencyMode
        ),
      ]);
    } catch (error) {
      console.log('Failed to load home screen data:', error);
      setBestShelter(null);
      setLoadingBestShelter(false);
    }
  };

  // Creates a visit session for authenticated users and opens navigation.
  const handleStartRoute = async () => {
    if (!bestShelter || startingRoute) {
      return;
    }

    try {
      setStartingRoute(true);

      // Create a visit session only for logged-in users.
      // Navigation itself should still work even without authentication.
      if (token) {
        await createShelterVisitSession(
          token,
          bestShelter.id,
          bestShelter.source
        );
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

  // Whenever the user location or best shelter changes,
  // reload the walking route between them.
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
        {/* App header */}
        <View style={styles.header}>
          <Text style={styles.appName}>ShelterNow</Text>
          <Text style={styles.subtitle}>Emergency shelter guidance</Text>
        </View>

        {/* Status card showing whether the app is currently in emergency mode */}
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

        {/* Main card showing the best recommended shelter */}
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
            </>
          ) : (
            <>
              <Text style={styles.cardName}>No shelter found</Text>
              <Text style={styles.cardMeta}>No nearby shelters available yet</Text>
              <Text style={styles.cardSource}>No source available</Text>
            </>
          )}

          {/* Main action button that opens navigation to the selected shelter */}
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

        {/* Quick map preview section */}
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
                  {/* Marker for the user's current location */}
                  <Marker
                    coordinate={{
                      latitude: userLocation.latitude,
                      longitude: userLocation.longitude,
                    }}
                    title="Your Location"
                    description="Current user position"
                    pinColor="red"
                  />

                  {/* Markers for all official shelters */}
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

                  {/* Polyline showing the walking route to the best shelter */}
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

                {/* Button to re-center the map on the user's location */}
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

                {/* Button to open the dedicated full map screen */}
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
