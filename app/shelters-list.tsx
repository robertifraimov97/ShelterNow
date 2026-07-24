import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import * as Location from 'expo-location';

import { API_BASE_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import {
  getShelterFeedbackSummary,
  type ShelterFeedbackSummary,
} from '../services/shelterFeedbackSummary';
import {
  getUserPreferences,
  type UserPreferences,
} from '../services/userPreferences';
import { createShelterVisitSession } from '../services/shelterFeedback';

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
  accessibility_notes?: string | null;
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
    focus_mode:
      | 'normal'
      | 'current_location_warning'
      | 'current_location_emergency';
    show_nearest_shelter_button: boolean;
    should_offer_shelter_guidance: boolean;
  };
};

type AccessibilityStatus =
  | 'accessible'
  | 'unclear'
  | 'possibly_not_accessible';

type OpenStatus =
  | 'likely_open'
  | 'unclear'
  | 'mixed'
  | 'likely_closed';

type ConditionStatus =
  | 'good'
  | 'mixed'
  | 'poor'
  | 'unclear';

// Formats distance for user-friendly display in the shelters list.
function formatDistance(distanceMeters: number) {
  if (distanceMeters < 1000) {
    return `${distanceMeters} meters away`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km away`;
}

// Calculates the accessibility status using official notes and community reports.
function getAccessibilityStatus(
  shelter: NearbyShelterWithSummary
): AccessibilityStatus {
  const notes = shelter.accessibility_notes?.toLowerCase() || '';
  const summary = shelter.feedbackSummary;

  const hasNegativeNotes =
    notes.includes('not accessible') ||
    notes.includes('לא נגיש');

  const hasPositiveNotes =
    notes.includes('accessible') ||
    notes.includes('נגיש');

  // Negative wording must be checked before positive wording,
  // because "not accessible" also contains "accessible".
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

  return 'unclear';
}

// Calculates the current open status using only reports from the last 24 hours.
function getOpenStatus(
  summary?: ShelterFeedbackSummary | null
): OpenStatus {
  if (!summary) {
    return 'unclear';
  }

  const recentYes = summary.recent_open_yes_count;
  const recentPartial = summary.recent_open_partial_count;
  const recentNo = summary.recent_open_no_count;

  const recentReportsCount =
    recentYes + recentPartial + recentNo;

  // A single report is not enough for a confident conclusion.
  if (recentReportsCount < 2) {
    return 'unclear';
  }

  // A shelter is considered likely closed only when closed reports
  // are greater than all positive and partial reports together.
  if (recentNo > recentYes + recentPartial) {
    return 'likely_closed';
  }

  // A clear majority of open reports indicates that it is likely open.
  if (recentYes > recentNo && recentYes >= recentPartial) {
    return 'likely_open';
  }

  return 'mixed';
}

// Converts the calculated open status into user-friendly text.
function getOpenStatusLabel(
  summary?: ShelterFeedbackSummary | null
) {
  const status = getOpenStatus(summary);

  if (status === 'likely_open') {
    return 'Open status: Likely open';
  }

  if (status === 'likely_closed') {
    return 'Open status: Recently reported closed';
  }

  if (status === 'mixed') {
    return 'Open status: Mixed recent reports';
  }

  return 'Open status: Information unclear';
}

// Calculates the general physical condition based on community feedback.
function getConditionStatus(
  summary?: ShelterFeedbackSummary | null
): ConditionStatus {
  if (!summary || summary.total_feedback_count === 0) {
    return 'unclear';
  }

  const goodCount = summary.condition_good_count;
  const okayCount = summary.condition_okay_count;
  const poorCount = summary.condition_poor_count;

  if (goodCount > poorCount && goodCount >= okayCount) {
    return 'good';
  }

  if (poorCount > goodCount && poorCount >= okayCount) {
    return 'poor';
  }

  return 'mixed';
}

// Converts the calculated condition into user-friendly text.
function getConditionLabel(
  summary?: ShelterFeedbackSummary | null
) {
  const status = getConditionStatus(summary);

  if (status === 'good') {
    return 'Condition: Mostly reported as good';
  }

  if (status === 'poor') {
    return 'Condition: Possible issues reported';
  }

  if (status === 'mixed') {
    return 'Condition: Mixed feedback';
  }

  return 'Condition: Information unclear';
}

// Displays the total number of community reports.
function getCommunityReportsLabel(
  summary?: ShelterFeedbackSummary | null
) {
  if (!summary || summary.total_feedback_count === 0) {
    return 'Community reports: No feedback yet';
  }

  const reportWord =
    summary.total_feedback_count === 1 ? 'report' : 'reports';

  return `Community reports: ${summary.total_feedback_count} ${reportWord}`;
}

// Converts the calculated accessibility status into user-friendly text.
function getAccessibilityLabel(
  shelter: NearbyShelterWithSummary
) {
  const status = getAccessibilityStatus(shelter);

  if (status === 'accessible') {
    return 'Accessibility: Likely accessible';
  }

  if (status === 'possibly_not_accessible') {
    return 'Accessibility: Possible issues reported';
  }

  return 'Accessibility: Information unclear';
}

export default function SheltersListScreen() {
  const router = useRouter();
  const { token, isAuthenticated } = useAuth();

  // Stores the nearby shelters loaded from the backend.
  const [nearbyShelters, setNearbyShelters] = useState<
    NearbyShelterWithSummary[]
  >([]);

  // Controls the loading state while shelter data is being fetched.
  const [loadingShelters, setLoadingShelters] = useState(true);

  // Stores any location-related or loading error message shown to the user.
  const [locationError, setLocationError] = useState('');

  // Indicates whether the current location is in emergency mode.
  const [isEmergencyMode, setIsEmergencyMode] = useState(false);

  // Stores current user preferences when available.
  const [userPreferences, setUserPreferences] =
    useState<UserPreferences | null>(null);

  const loadUserPreferences = async () => {
    if (!token || !isAuthenticated) {
      setUserPreferences(null);
      return;
    }

    try {
      const preferences = await getUserPreferences(token);
      setUserPreferences(preferences);
    } catch (error) {
      console.log(
        'Failed to load user preferences for shelters list:',
        error
      );
      setUserPreferences(null);
    }
  };

  // Loads alert state for the current city and updates emergency mode accordingly.
  const loadAlertsState = async (
    cityName: string | null
  ): Promise<boolean> => {
    try {
      const params = new URLSearchParams();

      if (cityName) {
        params.append('current_city', cityName);
      }

      const response = await fetch(
        `${API_BASE_URL}/alerts/?${params.toString()}`
      );

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
        data.experience?.focus_mode ===
          'current_location_emergency' ||
        data.experience?.focus_mode ===
          'current_location_warning';

      const emergencyMode = Boolean(
        shouldUseEmergencyShelterFlow
      );

      setIsEmergencyMode(emergencyMode);

      return emergencyMode;
    } catch (error) {
      console.log(
        'Failed to load alerts state for shelters list:',
        error
      );
      setIsEmergencyMode(false);
      return false;
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

  const shouldWarnBeforeNavigation = () => {
    return Boolean(
      userPreferences &&
        (
          userPreferences.mobility_status === 'limited' ||
          userPreferences.prefer_accessible_route
        )
    );
  };

  const openNavigation = async (
    shelter: NearbyShelterWithSummary
  ) => {
    let visitSessionId: number | null = null;

    try {
      if (token) {
        const visitSession =
          await createShelterVisitSession(
            token,
            shelter.id,
            shelter.source
          );

        visitSessionId = visitSession.id;
      }
    } catch (error) {
      console.log(
        'Failed to create shelter visit session from shelters list:',
        error
      );
    }

    router.push({
      pathname: '/navigation',
      params: {
        name: shelter.name,
        latitude: String(shelter.latitude),
        longitude: String(shelter.longitude),
        source: shelter.source,
        shelterId: String(shelter.id),
        visitSessionId: visitSessionId
          ? String(visitSessionId)
          : '',
      },
    });
  };

  const handleShelterPress = async (
    shelter: NearbyShelterWithSummary
  ) => {
    const accessibilityStatus =
      getAccessibilityStatus(shelter);

    if (
      shouldWarnBeforeNavigation() &&
      accessibilityStatus !== 'accessible'
    ) {
      const message =
        accessibilityStatus ===
        'possibly_not_accessible'
          ? 'This shelter may not be fully accessible. Please take this into account before starting navigation.'
          : 'Accessibility information for this shelter is limited. Please take this into account before starting navigation.';

      Alert.alert(
        'Accessibility notice',
        message,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
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

  // Loads nearby shelters based on the user's current location.
  const loadNearbyShelters = async () => {
    try {
      setLoadingShelters(true);
      setLocationError('');

      await loadUserPreferences();

      const { status } =
        await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        setLocationError(
          'Location permission was denied.'
        );
        setNearbyShelters([]);
        return;
      }

      const location =
        await Location.getCurrentPositionAsync({});

      let cityName: string | null = null;

      try {
        const reverseGeocoded =
          await Location.reverseGeocodeAsync({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });

        if (reverseGeocoded.length > 0) {
          const place = reverseGeocoded[0];

          cityName =
            place.city ||
            place.subregion ||
            place.region ||
            null;
        }
      } catch (error) {
        console.log(
          'Failed to reverse geocode current city for shelters list:',
          error
        );
      }

      const useEmergencyMode =
        await loadAlertsState(cityName);

      const endpoint = useEmergencyMode
        ? `${API_BASE_URL}/recommendations/nearby-emergency-shelters`
        : `${API_BASE_URL}/recommendations/nearby-shelters`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_latitude:
            location.coords.latitude,
          user_longitude:
            location.coords.longitude,
          limit: 10,
        }),
      });

      if (!response.ok) {
        console.log(
          'Failed to load nearby shelters'
        );
        setNearbyShelters([]);
        return;
      }

      const data: NearbyShelter[] =
        await response.json();

      const sheltersWithSummaries =
        await enrichSheltersWithFeedbackSummary(
          data
        );

      setNearbyShelters(sheltersWithSummaries);
    } catch (error) {
      console.log(
        'Failed to load shelters list:',
        error
      );
      setNearbyShelters([]);
      setLocationError(
        'Failed to load nearby shelters.'
      );
    } finally {
      setLoadingShelters(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadNearbyShelters();
    }, [token, isAuthenticated])
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>
              Back
            </Text>
          </Pressable>

          <Text style={styles.title}>
            Nearby Shelters
          </Text>

          <Text style={styles.subtitle}>
            {isEmergencyMode
              ? 'EMERGENCY MODE ON'
              : 'EMERGENCY MODE OFF'}
          </Text>
        </View>

        <View style={styles.listSection}>
          {loadingShelters ? (
            <Text style={styles.helperText}>
              Loading shelters...
            </Text>
          ) : locationError ? (
            <Text style={styles.helperText}>
              {locationError}
            </Text>
          ) : nearbyShelters.length === 0 ? (
            <Text style={styles.helperText}>
              No nearby shelters found.
            </Text>
          ) : (
            nearbyShelters.map((shelter) => (
              <Pressable
                key={`${shelter.source}-${shelter.id}`}
                style={styles.shelterCard}
                onPress={() =>
                  handleShelterPress(shelter)
                }
              >
                <Text style={styles.shelterName}>
                  {shelter.name}
                </Text>

                <Text style={styles.shelterInfo}>
                  {shelter.address ||
                    shelter.city}
                </Text>

                <Text style={styles.shelterInfo}>
                  {formatDistance(
                    shelter.distance_meters
                  )}{' '}
                  •{' '}
                  {
                    shelter.estimated_walk_minutes
                  }{' '}
                  min walk
                </Text>

                <Text
                  style={styles.shelterSource}
                >
                  Source: {shelter.source}
                </Text>

                <Text
                  style={
                    styles.communityFeedbackText
                  }
                >
                  {getCommunityReportsLabel(
                    shelter.feedbackSummary
                  )}
                </Text>

                <Text
                  style={
                    styles.communityFeedbackMeta
                  }
                >
                  {getOpenStatusLabel(
                    shelter.feedbackSummary
                  )}
                </Text>

                <Text
                  style={
                    styles.communityFeedbackMeta
                  }
                >
                  {getAccessibilityLabel(
                    shelter
                  )}
                </Text>

                <Text
                  style={
                    styles.communityFeedbackMeta
                  }
                >
                  {getConditionLabel(
                    shelter.feedbackSummary
                  )}
                </Text>
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
