import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import AlternativeShelterPreviewModal, {
  type AlternativeShelterPreviewData,
} from '../components/AlternativeShelterPreviewModal';
import { API_BASE_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import {
  AlternativeShelterServiceError,
  getAlternativePreview,
} from '../services/alternativeShelter';
import { styles } from '../styles/home.styles';

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
  const { height: screenHeight } = useWindowDimensions();
  const isCompactScreen = screenHeight <= 750;
  const mapHeight = isCompactScreen ? 300 : 350;

  // Extract shelter data passed through route params.
  const shelterName = String(params.name || '');
  const shelterLatitude = Number(params.latitude);
  const shelterLongitude = Number(params.longitude);
  const shelterSource = String(params.source || 'Official');
  const shelterId = Number(params.shelterId);
  const visitSessionId = Number(params.visitSessionId);
  const journeyId = Number(params.journeyId);

  // The authoritative capability from GET /shelter-journeys/active,
  // forwarded in as a route param by whichever screen navigated here (Home,
  // or Accept Alternative). Never inferred from journeyId alone: a Journey
  // can exist while the CURRENT coordinates no longer verify an active
  // Emergency Context, in which case Alternative must stay unavailable even
  // though journeyId is valid.
  const canRequestAlternative = params.canRequestAlternative === 'true';

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
  const [isNearShelter, setIsNearShelter] = useState(false);

  // Tracks the in-progress alternative-shelter search triggered from this screen.
  const [isFindingAlternative, setIsFindingAlternative] = useState(false);
  const [alternativeShelterError, setAlternativeShelterError] = useState('');

  // The alternative-shelter preview is local UI state (a Modal), never a
  // routed screen — opening/closing it must never touch the navigation stack.
  const [alternativePreview, setAlternativePreview] =
    useState<AlternativeShelterPreviewData | null>(null);
  const [isAlternativePreviewVisible, setIsAlternativePreviewVisible] = useState(false);

  // Ref to control the map programmatically.
  const mapRef = useRef<MapView | null>(null);

  // Stores the last location from which a reroute was calculated.
  const lastRerouteLocationRef = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const hasValidVisitSessionId =
    Number.isFinite(visitSessionId) && visitSessionId > 0;
  const hasValidJourneyId = Number.isFinite(journeyId) && journeyId > 0;

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

  const handleArrivalPress = () => {
    if (!hasValidVisitSessionId) {
      return;
    }

    router.push({
      pathname: '/shelter-arrival',
      params: {
        visitSessionId: String(visitSessionId),
        shelterName,
        shelterId: String(shelterId),
        shelterSource,
        journeyId: hasValidJourneyId ? String(journeyId) : '',
        canRequestAlternative: String(canRequestAlternative),
      },
    });
  };

  const handleFindAlternativeShelter = async () => {
    if (isFindingAlternative) {
      return;
    }

    if (!hasValidJourneyId || !canRequestAlternative) {
      // A missing journeyId or a Journey whose current coordinates don't
      // verify an active Emergency Context are both normal, expected states
      // — not necessarily a bug. This button is already hidden in both
      // cases (see the render condition below); still guarded here
      // defensively in case it's ever reached some other way, and logged
      // for diagnosis.
      console.log(
        '[navigation] Alternative not currently available.',
        { rawJourneyId: params.journeyId, canRequestAlternative }
      );
      setAlternativeShelterError('האפשרות הזו זמינה רק במצב חירום.');
      return;
    }

    if (!token) {
      return;
    }

    try {
      setIsFindingAlternative(true);
      setAlternativeShelterError('');

      const { status: locationStatus } =
        await Location.requestForegroundPermissionsAsync();

      if (locationStatus !== 'granted') {
        setAlternativeShelterError('לא הצלחנו לבדוק חלופה כרגע. נסה שוב.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});

      const preview = await getAlternativePreview(
        token,
        journeyId,
        location.coords.latitude,
        location.coords.longitude
      );

      if (preview.status === 'unavailable') {
        setAlternativeShelterError('לא נמצאה כרגע חלופה נוספת באזור');
        return;
      }

      // Show the comparison in a local Modal and let the user decide — never
      // navigate automatically, and never push a route for this: opening the
      // preview must not affect the navigation stack.
      setAlternativePreview({
        currentShelterName: preview.currentShelter.name,
        currentDistanceMeters: preview.currentShelter.estimatedDistanceMeters,
        currentWalkMinutes: preview.currentShelter.estimatedWalkMinutes,
        altShelterId: preview.recommendedAlternative.id,
        altShelterSource: preview.recommendedAlternative.source,
        altShelterName: preview.recommendedAlternative.name,
        altLatitude: preview.recommendedAlternative.latitude,
        altLongitude: preview.recommendedAlternative.longitude,
        altDistanceMeters: preview.recommendedAlternative.estimatedDistanceMeters,
        altWalkMinutes: preview.recommendedAlternative.estimatedWalkMinutes,
        additionalDistanceMeters: preview.comparison.additionalEstimatedDistanceMeters,
        additionalWalkMinutes: preview.comparison.additionalEstimatedWalkMinutes,
      });
      setIsAlternativePreviewVisible(true);
    } catch (error) {
      const technicalMessage =
        error instanceof AlternativeShelterServiceError
          ? error.message
          : String(error);
      console.log('Failed to load alternative shelter preview:', technicalMessage, error);
      setAlternativeShelterError('לא הצלחנו לבדוק חלופה כרגע. נסה שוב.');
    } finally {
      setIsFindingAlternative(false);
    }
  };

  const updateProximityState = (latitude: number, longitude: number) => {
    const distanceToShelter = calculateDistanceMeters(
      latitude,
      longitude,
      shelterLatitude,
      shelterLongitude
    );

    setIsNearShelter(distanceToShelter <= 40);
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
      updateProximityState(
        initialUserLocation.latitude,
        initialUserLocation.longitude
      );

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
          updateProximityState(
            updatedLocation.latitude,
            updatedLocation.longitude
          );

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

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: isCompactScreen ? 6 : 10,
          paddingBottom: 32,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="never"
      >
        <View
          style={{
            marginBottom: isCompactScreen ? 12 : 16,
          }}
        >
          <Pressable
            style={{
              alignSelf: 'flex-start',
              paddingVertical: 7,
              paddingHorizontal: 13,
              borderRadius: 12,
              backgroundColor: '#E2E8F0',
              marginBottom: isCompactScreen ? 12 : 16,
            }}
            onPress={() => router.back()}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>
              Back
            </Text>
          </Pressable>

          <Text
            style={{
              color: '#0F172A',
              fontSize: isCompactScreen ? 36 : 42,
              lineHeight: isCompactScreen ? 40 : 46,
              fontWeight: '800',
              letterSpacing: -1.2,
            }}
          >
            Navigation
          </Text>
          <Text
            style={{
              color: '#64748B',
              fontSize: isCompactScreen ? 16 : 18,
              lineHeight: isCompactScreen ? 21 : 24,
              marginTop: 5,
            }}
          >
            Walk safely to your selected shelter
          </Text>
        </View>

        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 20,
            borderWidth: 1,
            borderColor: '#DDE3EC',
            paddingHorizontal: isCompactScreen ? 18 : 22,
            paddingVertical: isCompactScreen ? 16 : 20,
            marginBottom: isCompactScreen ? 14 : 18,
            shadowColor: '#0F172A',
            shadowOpacity: 0.04,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 2,
          }}
        >
          <Text
            style={{
              color: '#0F172A',
              fontSize: isCompactScreen ? 18 : 20,
              lineHeight: isCompactScreen ? 22 : 24,
              fontWeight: '800',
              marginBottom: isCompactScreen ? 8 : 10,
            }}
          >
            Destination
          </Text>

          <Text
            numberOfLines={2}
            style={{
              color: '#1E3A8A',
              fontSize: isCompactScreen ? 24 : 28,
              lineHeight: isCompactScreen ? 30 : 34,
              fontWeight: '800',
              textAlign: 'right',
            }}
          >
            {shelterName || 'Shelter'}
          </Text>

          {routeDistance !== null && routeDuration !== null ? (
            <Text
              style={{
                color: '#475569',
                fontSize: isCompactScreen ? 16 : 17,
                marginTop: 7,
              }}
            >
              {formatDistance(routeDistance)} • {formatDuration(routeDuration)}
            </Text>
          ) : (
            <Text style={{ color: '#475569', fontSize: 16, marginTop: 7 }}>
              Loading route details...
            </Text>
          )}

          <Text
            numberOfLines={1}
            style={{
              color: '#64748B',
              fontSize: isCompactScreen ? 14 : 15,
              marginTop: 6,
            }}
          >
            {isLoadingRoute
              ? 'Updating route...'
              : `${destinationTypeLabel} • Live navigation preview`}
          </Text>

          {hasValidVisitSessionId && (
            <View style={{ marginTop: isCompactScreen ? 12 : 15, gap: 9 }}>
              {isNearShelter && (
                <Pressable
                  onPress={handleArrivalPress}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 9,
                    backgroundColor: '#ECFDF3',
                    borderWidth: 1.5,
                    borderColor: '#86EFAC',
                    borderRadius: 13,
                    paddingVertical: 10,
                    paddingHorizontal: 13,
                  }}
                >
                  <Ionicons name="location" size={22} color="#15803D" />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: '#14532D',
                        fontSize: 14,
                        fontWeight: '800',
                        textAlign: 'right',
                      }}
                    >
                      נראה שהגעת למקלט
                    </Text>
                    <Text
                      style={{
                        color: '#166534',
                        fontSize: 12,
                        fontWeight: '500',
                        marginTop: 1,
                        textAlign: 'right',
                      }}
                    >
                      לחץ כאן כדי לבדוק אם הצלחת להיכנס
                    </Text>
                  </View>
                  <Ionicons name="chevron-back" size={18} color="#15803D" />
                </Pressable>
              )}

              <Pressable
                style={{
                  minHeight: 50,
                  flexDirection: 'row',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: '#2563EB',
                  borderRadius: 13,
                  paddingVertical: 12,
                }}
                onPress={handleArrivalPress}
              >
                <Ionicons name="checkmark-circle-outline" size={21} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>
                  הגעתי למקלט
                </Text>
              </Pressable>

              {hasValidJourneyId && canRequestAlternative && (
                <>
                  <Pressable
                    style={{
                      minHeight: 48,
                      flexDirection: 'row',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 8,
                      backgroundColor: '#FFFFFF',
                      borderWidth: 1.5,
                      borderColor: '#94A3B8',
                      borderRadius: 13,
                      paddingVertical: 11,
                      opacity: isFindingAlternative ? 0.7 : 1,
                    }}
                    onPress={handleFindAlternativeShelter}
                    disabled={isFindingAlternative}
                  >
                    <Ionicons name="swap-horizontal" size={21} color="#334155" />
                    <Text style={{ color: '#334155', fontSize: 15, fontWeight: '800' }}>
                      {isFindingAlternative
                        ? 'בודקים חלופה מתאימה...'
                        : 'מצא לי מקלט חלופי'}
                    </Text>
                  </Pressable>

                  {alternativeShelterError ? (
                    <Text
                      style={{
                        color: '#B91C1C',
                        fontSize: 12,
                        fontWeight: '600',
                        textAlign: 'center',
                      }}
                    >
                      {alternativeShelterError}
                    </Text>
                  ) : null}
                </>
              )}
            </View>
          )}
        </View>

        <View style={{ flexShrink: 1 }}>
          <Text
            style={{
              color: '#0F172A',
              fontSize: isCompactScreen ? 24 : 28,
              lineHeight: isCompactScreen ? 29 : 33,
              fontWeight: '800',
              marginBottom: isCompactScreen ? 10 : 12,
              letterSpacing: -0.5,
            }}
          >
            Navigation Map
          </Text>

          <View
            style={{
              height: mapHeight,
              borderRadius: 22,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: '#DDE3EC',
              backgroundColor: '#E2E8F0',
            }}
          >
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
                    top: 12,
                    right: 12,
                    backgroundColor: '#FFFFFF',
                    paddingVertical: 9,
                    paddingHorizontal: 13,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: '#D1D9E6',
                    shadowColor: '#000',
                    shadowOpacity: 0.1,
                    shadowRadius: 5,
                    shadowOffset: { width: 0, height: 2 },
                    elevation: 3,
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
                      left: 12,
                      right: 12,
                      bottom: 12,
                      backgroundColor: 'rgba(255, 255, 255, 0.92)',
                      borderRadius: 16,
                      paddingHorizontal: 14,
                      paddingVertical: 11,
                      borderWidth: 1,
                      borderColor: '#E2E8F0',
                      shadowColor: '#000',
                      shadowOpacity: 0.1,
                      shadowRadius: 5,
                      shadowOffset: { width: 0, height: 2 },
                      elevation: 3,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: '#64748B',
                        marginBottom: 3,
                        fontWeight: '600',
                      }}
                    >
                      Current instruction
                    </Text>

                    <Text
                      numberOfLines={2}
                      style={{
                        fontSize: isCompactScreen ? 16 : 17,
                        fontWeight: '800',
                        color: '#0F172A',
                        lineHeight: isCompactScreen ? 20 : 22,
                        textAlign: 'left',
                      }}
                    >
                      {currentInstruction.instruction}
                    </Text>

                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: 5,
                      }}
                    >
                      <Text style={{ fontSize: 13, color: '#475569' }}>
                        {formatDistance(currentInstruction.distance_meters)} •{' '}
                        {formatDuration(currentInstruction.duration_seconds)}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          color: isCommunityShelter ? '#7C3AED' : '#2563EB',
                          fontWeight: '700',
                        }}
                      >
                        {destinationTypeLabel}
                      </Text>
                    </View>
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
      </ScrollView>

      <AlternativeShelterPreviewModal
        visible={isAlternativePreviewVisible}
        journeyId={journeyId}
        preview={alternativePreview}
        onClose={() => setIsAlternativePreviewVisible(false)}
        onLocationUnavailable={() =>
          setAlternativeShelterError('לא הצלחנו לאמת את המיקום הנוכחי. היעד הנוכחי נשמר.')
        }
        canRequestAlternative={canRequestAlternative}
      />
    </SafeAreaView>
  );
}