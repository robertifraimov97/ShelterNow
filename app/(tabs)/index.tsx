import { SafeAreaView, View, Text, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { styles } from '../../styles/home.styles';
import { API_BASE_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import { getActiveJourney } from '../../services/alternativeShelter';
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
  recommendation_reason?: string | null;
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

  // When bestShelter reflects an active Journey (the source of truth) rather
  // than a freshly computed recommendation, these identify it so
  // handleStartRoute can resume the existing Journey instead of starting a
  // new one. Null when bestShelter is a fresh recommendation.
  const [activeJourneyId, setActiveJourneyId] = useState<number | null>(null);
  const [activeVisitSessionId, setActiveVisitSessionId] = useState<number | null>(null);

  // The authoritative capability from the Journey's own GET
  // /shelter-journeys/active check — forwarded into /navigation so it never
  // has to infer whether Alternative is currently authorized from journeyId
  // alone (a Journey can be valid while current coordinates don't verify an
  // active Emergency Context).
  const [activeJourneyCanRequestAlternative, setActiveJourneyCanRequestAlternative] =
    useState(false);

  // Calm, user-facing message shown when starting a route fails. Starting a
  // route must never silently navigate to /navigation with blank ids on
  // failure — that hides both the arrival and alternative actions with no
  // explanation.
  const [startRouteError, setStartRouteError] = useState<string | null>(null);

  // Stores the polyline points for the walking route to the best shelter.
  const [walkingRoute, setWalkingRoute] = useState<RoutePoint[]>([]);

  // Tracks whether the best shelter data is currently loading.
  const [loadingBestShelter, setLoadingBestShelter] = useState(true);

  // Tracks whether route start is currently being prepared.
  const [startingRoute, setStartingRoute] = useState(false);

  // True when GET /shelter-journeys/active reported outcome ==
  // "location_unavailable" for the currently-displayed Journey shelter —
  // drives a calm, secondary notice. The Journey/destination stay exactly
  // as before; only this advisory flag changes.
  const [isJourneyLocationUnavailable, setIsJourneyLocationUnavailable] = useState(false);

  // True when the currently-displayed shelter's distance/walk-time could
  // not be computed at all (no usable coordinates) — drives a neutral
  // "distance will update" fallback instead of a misleading 0m/0min value.
  const [isBestShelterDistanceUnavailable, setIsBestShelterDistanceUnavailable] = useState(false);

  // Reference to the map, used for animating back to the user's location.
  const mapRef = useRef<MapView | null>(null);

  // Incremented at the start of every loadHomeScreenData() call. Any async
  // result (active-Journey check, normal recommendation fetch) only applies
  // its setState calls if its own captured generation still matches this
  // ref's current value by the time it resolves — otherwise a newer load
  // has already started and this result is stale. This is what prevents an
  // older, slow normal-recommendation response from overwriting a newer
  // load's active-Journey shelter (or vice versa) on rapid focus/reload.
  const loadGenerationRef = useRef(0);

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

  // Loads nearby shelters and then chooses the recommended one based on
  // preferences. `generation` guards against this response landing after a
  // newer load has already started (e.g. one that found an active Journey)
  // — see loadGenerationRef.
    const loadRecommendedShelter = async (
      latitude: number,
      longitude: number,
      useEmergencyMode: boolean,
      preferences: UserPreferences | null,
      cityName: string | null,
      generation: number
    ) => {
      try {
        setLoadingBestShelter(true);

        // Authenticated users use the backend decision engine
        // in both normal and emergency mode.
        if (token && isAuthenticated) {
          try {
            const decisionEndpoint = useEmergencyMode
              ? `${API_BASE_URL}/recommendations/best-emergency-shelter`
              : `${API_BASE_URL}/recommendations/best-shelter`;

            const decisionResponse = await fetch(decisionEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                user_latitude: latitude,
                user_longitude: longitude,
                current_city: cityName,
              }),
            });

            if (generation !== loadGenerationRef.current) {
              return;
            }

            if (decisionResponse.ok) {
              const recommendedShelter: NearbyShelter =
                await decisionResponse.json();

              if (generation !== loadGenerationRef.current) {
                return;
              }

                setBestShelter(recommendedShelter);
                setRecommendationReason(
                  recommendedShelter.recommendation_reason ?? null
                );
                return;
            }

            console.log(
              'Decision engine recommendation failed, falling back:',
              decisionResponse.status
            );
          } catch (error) {
            console.log(
              'Failed to load decision engine recommendation, falling back:',
              error
            );
          }
        }

        // Fallback keeps the previous recommendation flow available.
        const fallbackEndpoint = useEmergencyMode
          ? `${API_BASE_URL}/recommendations/nearby-emergency-shelters`
          : `${API_BASE_URL}/recommendations/nearby-shelters`;

        const response = await fetch(fallbackEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_latitude: latitude,
            user_longitude: longitude,
            limit: 10,
            current_city: cityName,
          }),
        });

        if (generation !== loadGenerationRef.current) {
          return;
        }

        if (!response.ok) {
          console.log('Failed to load nearby shelters for recommendation');
          setBestShelter(null);
          setRecommendationReason(null);
          return;
        }

        const data: NearbyShelter[] = await response.json();

        const sheltersWithSummaries =
          await enrichSheltersWithFeedbackSummary(data);

        if (generation !== loadGenerationRef.current) {
          return;
        }

        const recommendation = chooseRecommendedShelter(
          sheltersWithSummaries,
          preferences
        );

        setBestShelter(recommendation.shelter);
        setRecommendationReason(
          recommendation.recommendationReason
        );
      } catch (error) {
        console.log('Failed to load recommended shelter:', error);

        if (generation === loadGenerationRef.current) {
          setBestShelter(null);
          setRecommendationReason(null);
        }
      } finally {
        if (generation === loadGenerationRef.current) {
          setLoadingBestShelter(false);
        }
      }
    };

  // The Journey is the source of truth for the user's active destination.
  // Checked on every load regardless of whether GPS succeeded this time —
  // a missing/failed location must never skip this check, only limit what
  // it can currently authorize (see the "location_unavailable" branch).
  //
  // - outcome "applicable" or "location_unavailable": the Journey's current
  //   shelter is the source of truth. Displayed as-is, journeyId/
  //   visitSessionId preserved, and the function returns without ever
  //   running the normal recommendation flow — a fresh recommendation must
  //   never overwrite an existing Journey's destination.
  // - outcome "no_active_journey": any stale Journey state is cleared and
  //   the normal recommendation flow runs (official-only in this mode).
  //
  // latitude/longitude may be null (GPS unavailable) — passed straight
  // through to getActiveJourney rather than skipping the call.
  const loadBestShelterForHome = async (
    latitude: number | null,
    longitude: number | null,
    useEmergencyMode: boolean,
    preferences: UserPreferences | null,
    cityName: string | null,
    generation: number
  ) => {
    if (token && isAuthenticated) {
      try {
        const activeJourney = await getActiveJourney(token, latitude, longitude);

        if (generation !== loadGenerationRef.current) {
          return;
        }

        if (activeJourney.outcome === 'applicable' || activeJourney.outcome === 'location_unavailable') {
          const distanceKnown =
            activeJourney.shelter.estimatedDistanceMeters !== null &&
            activeJourney.shelter.estimatedWalkMinutes !== null;

          setActiveJourneyId(activeJourney.journeyId);
          setActiveVisitSessionId(activeJourney.visitSessionId);
          setActiveJourneyCanRequestAlternative(activeJourney.capabilities.canRequestAlternative);
          setIsJourneyLocationUnavailable(activeJourney.outcome === 'location_unavailable');
          setIsBestShelterDistanceUnavailable(!distanceKnown);
          setBestShelter({
            id: activeJourney.shelter.id,
            name: activeJourney.shelter.name,
            city: activeJourney.shelter.city,
            address: activeJourney.shelter.address,
            latitude: activeJourney.shelter.latitude,
            longitude: activeJourney.shelter.longitude,
            // Placeholder when unknown — never rendered directly; the
            // render checks isBestShelterDistanceUnavailable first and
            // shows a neutral fallback instead of this number.
            distance_meters: activeJourney.shelter.estimatedDistanceMeters ?? 0,
            estimated_walk_minutes: activeJourney.shelter.estimatedWalkMinutes ?? 0,
            source: activeJourney.shelter.source,
          });
          setRecommendationReason(null);
          setLoadingBestShelter(false);
          return;
        }

        // outcome === 'no_active_journey': fall through below to clear any
        // stale Journey state and run the normal recommendation flow.
      } catch (error) {
        console.log(
          'Failed to check for an active journey on home screen:',
          error
        );
        // Fall through to the normal recommendation flow below.
      }
    }

    if (generation !== loadGenerationRef.current) {
      return;
    }

    setActiveJourneyId(null);
    setActiveVisitSessionId(null);
    setActiveJourneyCanRequestAlternative(false);
    setIsJourneyLocationUnavailable(false);
    setIsBestShelterDistanceUnavailable(false);

    if (latitude === null || longitude === null) {
      // No Journey to display and no usable location to recommend from.
      setBestShelter(null);
      setRecommendationReason(null);
      setLoadingBestShelter(false);
      return;
    }

    await loadRecommendedShelter(
      latitude,
      longitude,
      useEmergencyMode,
      preferences,
      cityName,
      generation
    );
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

  // Loads all main screen data. A GPS failure never skips the active-Journey
  // check (see loadBestShelterForHome) — it only means coords/cityName stay
  // null, which the rest of this function already handles gracefully.
  const loadHomeScreenData = async () => {
    const generation = ++loadGenerationRef.current;

    try {
      setLoadingBestShelter(true);

      await loadUserPreferences();

      let coords: { latitude: number; longitude: number } | null = null;

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({});
          coords = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
        } else {
          console.log('Location permission was denied');
        }
      } catch (error) {
        console.log('Failed to obtain current location for home screen:', error);
      }

      if (generation !== loadGenerationRef.current) {
        return;
      }

      console.log('User location:', coords);
      setUserLocation(coords);

      let cityName: string | null = null;

      if (coords) {
        try {
          const reverseGeocoded = await Location.reverseGeocodeAsync(coords);

          if (reverseGeocoded.length > 0) {
            const place = reverseGeocoded[0];
            cityName = place.city || place.subregion || place.region || null;
          }
        } catch (error) {
          console.log('Failed to reverse geocode current city for home screen:', error);
        }
      }

      if (generation !== loadGenerationRef.current) {
        return;
      }

      setCurrentCity(cityName);

      const emergencyMode = await resolveEmergencyMode(cityName);

      if (generation !== loadGenerationRef.current) {
        return;
      }

      const preferences = token && isAuthenticated
        ? await getUserPreferences(token).catch(() => null)
        : null;

      if (generation !== loadGenerationRef.current) {
        return;
      }

      setUserPreferences(preferences);

      await Promise.all([
        loadOfficialShelters(),
        // Always run, regardless of whether coords are available — see the
        // function's own comment for why a missing location must never
        // skip this check.
        loadBestShelterForHome(
          coords?.latitude ?? null,
          coords?.longitude ?? null,
          emergencyMode,
          preferences,
          cityName,
          generation
        ),
      ]);
    } catch (error) {
      console.log('Failed to load home screen data:', error);

      if (generation === loadGenerationRef.current) {
        setBestShelter(null);
        setRecommendationReason(null);
        setLoadingBestShelter(false);
      }
    }
  };

  // Opens navigation. If bestShelter reflects an already-active Journey,
  // resumes it directly instead of starting a new Journey/Visit Session —
  // the Journey is the source of truth and must not be duplicated just
  // because the user returned to Home.
  const handleStartRoute = async () => {
    // TEMP DIAGNOSTIC LOGGING -- to be removed after root cause is found.
    console.log('[TEMP][handleStartRoute] press', {
      bestShelter,
      startingRoute,
      activeJourneyId,
      activeVisitSessionId,
      tokenPresent: Boolean(token),
      userLocation,
    });

    if (!bestShelter || startingRoute) {
      console.log('[TEMP][handleStartRoute] early return: !bestShelter || startingRoute', {
        bestShelterIsNull: !bestShelter,
        startingRoute,
      });
      return;
    }

    setStartRouteError(null);

    if (activeJourneyId && activeVisitSessionId) {
      console.log('[TEMP][handleStartRoute] taking RESUME branch (activeJourneyId && activeVisitSessionId)', {
        activeJourneyId,
        activeVisitSessionId,
      });
      router.push({
        pathname: '/navigation',
        params: {
          name: bestShelter.name,
          latitude: String(bestShelter.latitude),
          longitude: String(bestShelter.longitude),
          source: bestShelter.source,
          shelterId: String(bestShelter.id),
          visitSessionId: String(activeVisitSessionId),
          journeyId: String(activeJourneyId),
          canRequestAlternative: String(activeJourneyCanRequestAlternative),
        },
      });
      return;
    }

    console.log('[TEMP][handleStartRoute] taking CREATE branch', {
      tokenPresent: Boolean(token),
      bestShelterId: bestShelter.id,
      bestShelterSource: bestShelter.source,
      userLatitude: userLocation?.latitude ?? null,
      userLongitude: userLocation?.longitude ?? null,
      currentCity,
    });

    try {
      setStartingRoute(true);

      // No pre-flight re-check here: POST /shelter-feedback/visit-sessions
      // already resolves "does an active Journey exist for this user"
      // atomically on the backend (see get_or_create_initial_visit_session /
      // _resolve_or_create_active_journey) and its response already
      // reflects that reality regardless of Home's local state. Adding a
      // separate GET /shelter-journeys/active call here first only added a
      // second required network round-trip to every normal-mode press for
      // no benefit the create call didn't already provide, which made this
      // action strictly less reliable. Home's own useFocusEffect already
      // keeps activeJourneyId/activeVisitSessionId current for normal,
      // single-device usage (the branch above), which is the case this
      // extra call was trying to protect.
      let visitSessionId: number | null = null;
      let journeyId: number | null = null;
      // Real value for a newly-created/attached Journey, looked up below.
      // Defaults to false (Alternative hidden) whenever journey_id is null,
      // or the lookup fails/is skipped -- never inferred, never assumed true.
      let canRequestAlternativeForNewSession = false;

      if (token) {
        console.log('[TEMP][handleStartRoute] calling createShelterVisitSession with', {
          shelterId: bestShelter.id,
          shelterSource: bestShelter.source,
          latitude: userLocation?.latitude ?? null,
          longitude: userLocation?.longitude ?? null,
          currentCity,
        });

        const visitSession = await createShelterVisitSession(
          token,
          bestShelter.id,
          bestShelter.source,
          userLocation?.latitude ?? null,
          userLocation?.longitude ?? null,
          currentCity
        );

        console.log('[TEMP][handleStartRoute] createShelterVisitSession resolved with', visitSession);

        visitSessionId = visitSession.id;
        journeyId = visitSession.journey_id ?? null;

        console.log('[TEMP][handleStartRoute] parsed ids', { visitSessionId, journeyId });

        // journey_id null -> normal mode, canRequestAlternativeForNewSession
        // stays false, no lookup needed. journey_id numeric -> the create
        // call just created or attached to a real Journey; look up its
        // authoritative capability. This is a post-flight call (after the
        // session already exists), never a pre-flight gate on navigation --
        // if it fails, we still navigate below with the valid
        // visitSessionId, only defaulting Alternative to hidden.
        if (journeyId) {
          try {
            const freshActiveJourney = await getActiveJourney(
              token,
              userLocation?.latitude ?? null,
              userLocation?.longitude ?? null
            );

            canRequestAlternativeForNewSession =
              (freshActiveJourney.outcome === 'applicable' ||
                freshActiveJourney.outcome === 'location_unavailable') &&
              freshActiveJourney.capabilities.canRequestAlternative;
          } catch (error) {
            console.log(
              'Failed to look up Alternative capability for the new visit session (non-blocking):',
              error
            );
            // canRequestAlternativeForNewSession stays false -- navigation
            // still proceeds below with the real visitSessionId/journeyId.
          }
        }
      } else {
        console.log('[TEMP][handleStartRoute] token is falsy -- skipping createShelterVisitSession entirely');
      }

      console.log('[TEMP][handleStartRoute] about to router.push with', {
        visitSessionId,
        journeyId,
        visitSessionIdTruthy: Boolean(visitSessionId),
        journeyIdTruthy: Boolean(journeyId),
        finalVisitSessionIdParam: visitSessionId ? String(visitSessionId) : '',
        finalJourneyIdParam: journeyId ? String(journeyId) : '',
      });

      // Only ever reached on success -- never navigate to /navigation with
      // blank ids on failure (see the catch block below). A blank
      // visitSessionId hides both the arrival and alternative actions on
      // the destination screen with no explanation.
      router.push({
        pathname: '/navigation',
        params: {
          name: bestShelter.name,
          latitude: String(bestShelter.latitude),
          longitude: String(bestShelter.longitude),
          source: bestShelter.source,
          shelterId: String(bestShelter.id),
          visitSessionId: visitSessionId ? String(visitSessionId) : '',
          journeyId: journeyId ? String(journeyId) : '',
          canRequestAlternative: String(canRequestAlternativeForNewSession),
        },
      });
    } catch (error) {
      console.log('Failed to create shelter visit session:', error);
      console.log('[TEMP][handleStartRoute] CAUGHT ERROR - full detail', {
        error,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        // If services/shelterFeedback.ts's createShelterVisitSession threw
        // because response.ok was false, error.message IS the raw response
        // body text (see that function) -- there is no separate HTTP status
        // captured today, only visible here as part of the message if the
        // backend included it.
      });
      setStartRouteError('לא הצלחנו להתחיל ניווט כרגע. נסה שוב.');
    } finally {
      setStartingRoute(false);
    }
  };

  // Initial screen data load when the component mounts.
  useEffect(() => {
    loadHomeScreenData();
  }, []);

  // Reloads the screen data whenever the screen becomes focused again.
  //
  // Depends on [token, isAuthenticated]: with an empty dependency array this
  // callback is memoized exactly once, on the first render -- permanently
  // closing over that render's token/isAuthenticated (both still null/false,
  // since AuthContext loads the token from storage asynchronously after
  // mount). Every subsequent focus (e.g. returning from /navigation after
  // accepting an alternative shelter) would then re-run loadHomeScreenData
  // with a stale, forever-null token, so loadBestShelterForHome's
  // `if (token && isAuthenticated)` check would never see the real Journey
  // and would always fall back to a freshly recomputed nearest-shelter
  // recommendation -- silently ignoring an already-accepted alternative.
  useFocusEffect(
    useCallback(() => {
      loadHomeScreenData();
    }, [token, isAuthenticated])
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
          <Text style={styles.statusLabel}>Alert Status</Text>
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

              {isBestShelterDistanceUnavailable ? (
                <Text style={styles.cardMeta}>המרחק יתעדכן כשהמיקום יחזור</Text>
              ) : (
                <Text style={styles.cardMeta}>
                  {formatDistance(bestShelter.distance_meters)} • {bestShelter.estimated_walk_minutes} min walk
                </Text>
              )}

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

              {isJourneyLocationUnavailable ? (
                <Text
                  style={{
                    marginTop: 8,
                    fontSize: 13,
                    color: '#94A3B8',
                    lineHeight: 18,
                    textAlign: 'center',
                  }}
                >
                  לא הצלחנו לעדכן את המיקום כרגע. היעד הנוכחי נשמר.
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

          {startRouteError ? (
            <Text
              style={{
                marginTop: 8,
                fontSize: 13,
                fontWeight: '600',
                color: '#B91C1C',
                textAlign: 'center',
              }}
            >
              {startRouteError}
            </Text>
          ) : null}
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
