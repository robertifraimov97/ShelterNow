import { SafeAreaView, View, Text, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { styles } from '../../styles/home.styles';
import { API_BASE_URL } from '../../constants/api';

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

type RoutePoint = {
  latitude: number;
  longitude: number;
};

type WalkingRouteResponse = {
  distance_meters: number;
  duration_seconds: number;
  route_coordinates: RoutePoint[];
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
    return `${distanceMeters}m`;
  }

  return `${(distanceMeters / 1000).toFixed(1)}km`;
}

export default function HomeScreen() {
  const router = useRouter();

  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const [currentCity, setCurrentCity] = useState<string | null>(null);
  const [isEmergencyMode, setIsEmergencyMode] = useState(false);

  const [showCenterButton, setShowCenterButton] = useState(false);
  const [officialShelters, setOfficialShelters] = useState<OfficialShelter[]>([]);
  const [bestShelter, setBestShelter] = useState<BestShelterRecommendation | null>(null);
  const [walkingRoute, setWalkingRoute] = useState<RoutePoint[]>([]);
  const [loadingBestShelter, setLoadingBestShelter] = useState(true);

  const mapRef = useRef<MapView | null>(null);

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

  useEffect(() => {
    loadHomeScreenData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHomeScreenData();
    }, [])
  );

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
          <Text style={styles.statusValue}>
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
                onPress={() => {
                  if (!bestShelter) {
                    return;
                  }

                  router.push({
                    pathname: '/navigation',
                    params: {
                      name: bestShelter.name,
                      latitude: String(bestShelter.latitude),
                      longitude: String(bestShelter.longitude),
                      source: bestShelter.source,
                    },
                  });
                }}
              >
                <Text style={styles.emergencyButtonText}>Start</Text>
                <Text style={styles.emergencyButtonText}>Route</Text>
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
