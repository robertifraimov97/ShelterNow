import { SafeAreaView, View, Text, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../constants/api';
import { styles } from '../styles/home.styles';
import { useAuth } from '../context/AuthContext';
import { createShelterVisitSession } from '../services/shelterFeedback';

// Represents a single coordinate point in the route path.
type RoutePoint = {
  latitude: number;
  longitude: number;
};

// Represents one step/instruction in the walking navigation route.
type RouteInstruction = {
  instruction: string;
  distance_meters: number;
  duration_seconds: number;
};

// Represents the full walking route response returned from the backend.
type WalkingRouteResponse = {
  distance_meters: number;
  duration_seconds: number;
  route_coordinates: RoutePoint[];
  instructions: RouteInstruction[];
};

// Controls how close the user must be to the shelter
// before the feedback button becomes visible.
const FEEDBACK_DISTANCE_THRESHOLD_METERS = 30;

// Formats distance for UI display.
function formatDistance(distanceMeters: number) {
  if (distanceMeters < 1000) {
    return `${distanceMeters.toFixed(0)}m`;
  }

  return `${(distanceMeters / 1000).toFixed(1)}km`;
}

// Formats duration in seconds into minutes for UI display.
function formatDuration(durationSeconds: number) {
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  return `${minutes} min`;
}

// Calculates straight-line distance between two coordinates using the Haversine formula.
// Used both for reroute checks and proximity checks.
function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;

  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(earthRadius * c);
}

export default function NavigationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { token } = useAuth();

  // Extract shelter data passed through route params.
  const shelterName = String(params.name || '');
  const shelterLatitude = Number(params.latitude);
  const shelterLongitude = Number(params.longitude);
  const shelterSource = String(params.source || 'Official');
  const shelterId = Number(params.shelterId);

  // Determine visual behavior based on whether the destination is a community shelter.
  const isCommunityShelter = shelterSource === 'Community';
  const destinationPinColor = isCommunityShelter ? 'purple' : 'blue';
  const routeColor = isCommunityShelter ? '#7C3AED' : '#2563EB';
  const destinationTypeLabel = isCommunityShelter
    ? 'Community shelter'
    : 'Official shelter';

  // User's live location.
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Route geometry and metadata returned from the backend.
  const [walkingRoute, setWalkingRoute] = useState<RoutePoint[]>([]);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const [instructions, setInstructions] = useState<RouteInstruction[]>([]);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);

  // Tracks whether the feedback button is currently creating/opening a feedback session.
  const [isOpeningFeedback, setIsOpeningFeedback] = useState(false);

  // Ref to control the map programmatically.
  const mapRef = useRef<MapView | null>(null);

  // Stores the last location from which a reroute was calculated,
  // so route recalculation only happens after enough user movement.
  const lastRerouteLocationRef = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Requests a walking route from the backend routing endpoint.
  const loadWalkingRoute = async (
    startLatitude: number,
    startLongitude: number,
    endLatitude: number,
    endLongitude: number
  ) => {
    try {
      setIsLoadingRoute(true);

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

      // If the backend fails, clear existing route data.
      if (!response.ok) {
        console.log('Failed to load walking route');
        setWalkingRoute([]);
        setInstructions([]);
        return;
      }

      const data: WalkingRouteResponse = await response.json();

      // Save the new route and instruction data.
      setWalkingRoute(data.route_coordinates || []);
      setRouteDistance(data.distance_meters || 0);
      setRouteDuration(data.duration_seconds || 0);
      setInstructions(data.instructions || []);

      // Save the user location used for this route calculation.
      lastRerouteLocationRef.current = {
        latitude: startLatitude,
        longitude: startLongitude,
      };
    } catch (error) {
      console.log('Failed to load walking route:', error);
      setWalkingRoute([]);
      setInstructions([]);
    } finally {
      setIsLoadingRoute(false);
    }
  };

  // Opens the shelter feedback screen manually.
  // If the user is logged in, this also creates or reuses a visit session in the backend.
  const handleOpenShelterFeedback = async () => {
    if (isOpeningFeedback) {
      return;
    }

    if (!shelterId || Number.isNaN(shelterId)) {
      Alert.alert('Error', 'Shelter information is missing.');
      return;
    }

    try {
      setIsOpeningFeedback(true);

      // Feedback is linked to a visit session only for authenticated users.
      if (!token) {
        Alert.alert(
          'Login required',
          'Please log in to submit shelter feedback.'
        );
        return;
      }

      const visitSession = await createShelterVisitSession(
        token,
        shelterId,
        shelterSource
      );

      router.push({
        pathname: '/shelter-feedback',
        params: {
          visitSessionId: String(visitSession.id),
          shelterName: shelterName || 'Selected Shelter',
        },
      });
    } catch (error: any) {
      console.log('Failed to open shelter feedback:', error);
      Alert.alert(
        'Error',
        error?.message || 'Failed to open shelter feedback.'
      );
    } finally {
      setIsOpeningFeedback(false);
    }
  };

  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;

    const startWatchingLocation = async () => {
      // Ask for foreground location permission.
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        console.log('Location permission was denied');
        return;
      }

      // Get the current location once when the screen starts.
      const currentLocation = await Location.getCurrentPositionAsync({});

      const initialUserLocation = {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      };

      setUserLocation(initialUserLocation);

      // Load the initial route from the current location to the shelter.
      await loadWalkingRoute(
        initialUserLocation.latitude,
        initialUserLocation.longitude,
        shelterLatitude,
        shelterLongitude
      );

      // Start watching live location updates to reroute when needed.
      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 4000,
          distanceInterval: 8,
        },
        async (location) => {
          const updatedLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };

          setUserLocation(updatedLocation);

          const lastRerouteLocation = lastRerouteLocationRef.current;

          // Avoid rerouting if there is no previous route point
          // or if a route request is already in progress.
          if (!lastRerouteLocation || isLoadingRoute) {
            return;
          }

          // Check how far the user moved since the last reroute.
          const movedDistance = calculateDistanceMeters(
            lastRerouteLocation.latitude,
            lastRerouteLocation.longitude,
            updatedLocation.latitude,
            updatedLocation.longitude
          );

          // Recalculate route only after meaningful movement.
          if (movedDistance >= 20) {
            await loadWalkingRoute(
              updatedLocation.latitude,
              updatedLocation.longitude,
              shelterLatitude,
              shelterLongitude
            );
          }
        }
      );
    };

    startWatchingLocation();

    // Clean up the live location subscription when the screen unmounts.
    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, [shelterLatitude, shelterLongitude]);

  // Show only the first/current instruction in the instruction overlay.
  const currentInstruction = instructions.length > 0 ? instructions[0] : null;

  // Calculate the current straight-line distance from the user to the shelter.
  const distanceToShelter =
    userLocation
      ? calculateDistanceMeters(
          userLocation.latitude,
          userLocation.longitude,
          shelterLatitude,
          shelterLongitude
        )
      : null;

  // Show feedback only when the user is very close to the destination.
  const shouldShowFeedbackButton =
    distanceToShelter !== null &&
    distanceToShelter <= FEEDBACK_DISTANCE_THRESHOLD_METERS;

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.content, { flex: 1 }]}>
        <View style={styles.header}>
          <Pressable
            style={{
              alignSelf: 'flex-start',
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: 12,
              backgroundColor: '#E2E8F0',
            }}
            onPress={() => router.back()}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#0F172A' }}>
              Back
            </Text>
          </Pressable>

          <Text style={styles.appName}>Navigation</Text>
          <Text style={styles.subtitle}>Walk safely to your selected shelter</Text>
        </View>

        <View style={styles.mainCard}>
          <Text style={styles.cardTitle}>Destination</Text>
          <Text style={styles.cardName}>{shelterName || 'Shelter'}</Text>

          {routeDistance !== null && routeDuration !== null ? (
            <Text style={styles.cardMeta}>
              {formatDistance(routeDistance)} • {formatDuration(routeDuration)}
            </Text>
          ) : (
            <Text style={styles.cardMeta}>Loading route details...</Text>
          )}

          <Text style={styles.cardSource}>
            {isLoadingRoute
              ? 'Updating route...'
              : `${destinationTypeLabel} • Live navigation preview`}
          </Text>

          {/* Show the user's live straight-line distance to the shelter */}
          {distanceToShelter !== null && (
            <Text
              style={{
                marginTop: 10,
                fontSize: 14,
                fontWeight: '600',
                color: '#475569',
              }}
            >
              {`Distance to shelter: ${distanceToShelter}m`}
            </Text>
          )}

          {/* Manual feedback button appears only when the user is within 30 meters */}
          {shouldShowFeedbackButton && (
            <Pressable
              style={{
                marginTop: 14,
                backgroundColor: '#2563EB',
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
              }}
              onPress={handleOpenShelterFeedback}
              disabled={isOpeningFeedback}
            >
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: 15,
                  fontWeight: '700',
                }}
              >
                {isOpeningFeedback
                  ? 'Opening Feedback...'
                  : 'Report Shelter Experience'}
              </Text>
            </Pressable>
          )}
        </View>

        <View style={[styles.mapSection, { flex: 1 }]}>
          <Text style={styles.mapTitle}>Navigation Map</Text>

          <View style={[styles.mapContainer, { flex: 1, minHeight: 450 }]}>
            {userLocation ? (
              <>
                <MapView
                  ref={mapRef}
                  style={styles.map}
                  initialRegion={{
                    latitude: userLocation.latitude,
                    longitude: userLocation.longitude,
                    latitudeDelta: 0.008,
                    longitudeDelta: 0.008,
                  }}
                  showsUserLocation={false}
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

                  <Marker
                    coordinate={{
                      latitude: shelterLatitude,
                      longitude: shelterLongitude,
                    }}
                    title={shelterName}
                    description={destinationTypeLabel}
                    pinColor={destinationPinColor}
                  />

                  {walkingRoute.length > 0 && (
                    <Polyline
                      coordinates={walkingRoute}
                      strokeWidth={5}
                      strokeColor={routeColor}
                    />
                  )}
                </MapView>

                <Pressable
                  style={{
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
                  }}
                  onPress={() => {
                    if (userLocation && mapRef.current) {
                      mapRef.current.animateToRegion(
                        {
                          latitude: userLocation.latitude,
                          longitude: userLocation.longitude,
                          latitudeDelta: 0.008,
                          longitudeDelta: 0.008,
                        },
                        800
                      );
                    }
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>
                    Recenter
                  </Text>
                </Pressable>

                {currentInstruction && (
                  <View
                    style={{
                      position: 'absolute',
                      left: 14,
                      right: 14,
                      bottom: 14,
                      backgroundColor: 'rgba(255, 255, 255, 0.85)',
                      borderRadius: 18,
                      padding: 14,
                      borderWidth: 1,
                      borderColor: '#E2E8F0',
                      shadowColor: '#000',
                      shadowOpacity: 0.12,
                      shadowRadius: 6,
                      shadowOffset: {
                        width: 0,
                        height: 3,
                      },
                      elevation: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: '#64748B',
                        marginBottom: 4,
                      }}
                    >
                      Current instruction
                    </Text>

                    <Text
                      style={{
                        fontSize: 17,
                        fontWeight: '700',
                        color: '#0F172A',
                        lineHeight: 22,
                        textAlign: 'left',
                      }}
                    >
                      {currentInstruction.instruction}
                    </Text>

                    <Text
                      style={{
                        fontSize: 14,
                        color: '#475569',
                        marginTop: 6,
                      }}
                    >
                      {formatDistance(currentInstruction.distance_meters)} •{' '}
                      {formatDuration(currentInstruction.duration_seconds)}
                    </Text>

                    <Text
                      style={{
                        fontSize: 13,
                        color: isCommunityShelter ? '#7C3AED' : '#2563EB',
                        fontWeight: '700',
                        marginTop: 8,
                      }}
                    >
                      {destinationTypeLabel}
                    </Text>
                  </View>
                )}
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
