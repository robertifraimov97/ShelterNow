import { SafeAreaView, View, Text, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import { API_BASE_URL } from '../../constants/api';
import { registerForPushNotificationsAsync } from '../../services/pushNotifications';
import { useAuth } from '../../context/AuthContext';

// Represents a followed area returned from the backend.
type FollowedArea = {
  id: number;
  area_name: string;
  city_code?: string | null;
  label?: string | null;
  created_at: string;
};

// Describes how relevant the current alert is to the user.
type AlertRelevance = {
  priority: 'emergency' | 'followed_area' | 'none';
  match_strategy: string;
  current_location_match: boolean;
  current_location_alert: string | null;
  matched_followed_areas: string[];
  show_nearest_shelter_button: boolean;
};

// Describes the classification of the current alert event.
type AlertClassification = {
  cat: string | null;
  event_type: string;
  severity: 'none' | 'info' | 'warning' | 'critical' | 'unknown';
  severity_rank: number;
  recommended_action: string;
  confidence: 'high' | 'low';
  matched_rule: string;
  source_signals?: Record<string, any>;
};

// Describes the product/UI behavior that should happen for the alert.
type AlertExperience = {
  focus_mode: 'normal' | 'current_location_warning' | 'current_location_emergency';
  show_nearest_shelter_button: boolean;
  should_offer_shelter_guidance: boolean;
  allow_temporary_community_shelter_access: boolean;
  close_emergency_mode: boolean;
  hide_community_shelter_access: boolean;
  show_followed_area_banner: boolean;
  should_send_push_notification: boolean;
  push_notification_type: string;
};

// Full alerts response returned from the backend.
type AlertsResponse = {
  alert: {
    source: string;
    raw: Record<string, any>;
    has_active_alert: boolean;
  };
  relevance: AlertRelevance;
  classification?: AlertClassification;
  experience?: AlertExperience;
};

export default function AlertsScreen() {
  const { token } = useAuth();

  // State for all followed areas chosen by the user.
  const [followedAreas, setFollowedAreas] = useState<FollowedArea[]>([]);

  // State for the screen loading status.
  const [loading, setLoading] = useState(true);

  // State for the user's currently detected city/area name.
  const [currentAreaName, setCurrentAreaName] = useState('Loading location...');

  // State for the alerts response returned from the backend.
  const [alertsResponse, setAlertsResponse] = useState<AlertsResponse | null>(null);

  // Get the current city/area name by requesting location permission,
  // fetching device coordinates, and reverse geocoding them.
  const getCurrentAreaName = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== 'granted') {
      return 'Location unavailable';
    }

    const location = await Location.getCurrentPositionAsync({});
    const reverseGeocoded = await Location.reverseGeocodeAsync({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });

    if (reverseGeocoded.length === 0) {
      return 'Unknown area';
    }

    const place = reverseGeocoded[0];

    return place.city || place.subregion || place.region || 'Unknown area';
  };

  // Load followed areas, current location, and alert information from the backend.
  const loadInitialData = async () => {
    try {
      setLoading(true);

      // Load followed areas — requires auth token.
      const followedResponse = await fetch(`${API_BASE_URL}/followed-areas/`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const followedRaw = await followedResponse.json();
      const followedData: FollowedArea[] = Array.isArray(followedRaw) ? followedRaw : [];

      // Detect the user's current city/area.
      const cityName = await getCurrentAreaName();

      setFollowedAreas(followedData);
      setCurrentAreaName(cityName);

      // Build query parameters for the alerts endpoint.
      const params = new URLSearchParams();

      if (
        cityName &&
        cityName !== 'Unknown area' &&
        cityName !== 'Location unavailable'
      ) {
        params.append('current_city', cityName);
      }

      followedData.forEach((area) => {
        params.append('followed_areas', area.area_name);
      });

      // Load alert data based on current city and followed areas.
      const alertsResponse = await fetch(`${API_BASE_URL}/alerts/?${params.toString()}`);
      const alertsData: AlertsResponse = await alertsResponse.json();

      setAlertsResponse(alertsData);
    } catch (error) {
      console.log('Failed to load alerts screen data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Reload alerts data every time the screen comes into focus,
  // and also try to register the device for push notifications.
  useFocusEffect(
    useCallback(() => {
      loadInitialData();

      registerForPushNotificationsAsync()
        .then((token) => {
          console.log('Push token:', token);
        })
        .catch((error) => {
          console.error('Push registration failed:', error);
        });

    }, [])
  );

  // Convenience values derived from the loaded alerts response.
  const priority = alertsResponse?.relevance.priority || 'none';
  const hasActiveAlert = alertsResponse?.alert.has_active_alert || false;
  const rawAlert = alertsResponse?.alert.raw || {};
  const alertTitle = rawAlert.title || 'No active alert';
  const alertDescription = rawAlert.desc || '';
  const affectedAreas: string[] = rawAlert.data || [];
  const matchedFollowedAreas =
    alertsResponse?.relevance.matched_followed_areas || [];

  const currentLocationAlert =
    alertsResponse?.relevance.current_location_alert;

  // Combine the current-location alert area and all matched followed areas.
  const relevantAreas = [
    ...(currentLocationAlert ? [currentLocationAlert] : []),
    ...matchedFollowedAreas,
  ];

  // Remove duplicates from the relevant areas list.
  const uniqueRelevantAreas = Array.from(new Set(relevantAreas));

  const classification = alertsResponse?.classification;
  const experience = alertsResponse?.experience;

  // UI mode decided by the backend alert experience layer.
  const focusMode = experience?.focus_mode || 'normal';

  // Whether the user's current location is in an emergency state.
  const isCurrentLocationEmergency =
    focusMode === 'current_location_emergency';

  // Whether the user's current location is in a warning state.
  const isCurrentLocationWarning =
    focusMode === 'current_location_warning';

  // Whether to show the shelter call-to-action button.
  const shouldShowShelterButton =
    experience?.show_nearest_shelter_button ||
    alertsResponse?.relevance.show_nearest_shelter_button ||
    false;

  // Whether to show a followed-area banner.
  const shouldShowFollowedAreaBanner =
    experience?.show_followed_area_banner ??
    priority === 'followed_area';

  // Final flags used for coloring and styling the status card.
  const isEmergency = isCurrentLocationEmergency;
  const isWarning = isCurrentLocationWarning || shouldShowFollowedAreaBanner;

  // Main status text shown in the status card.
  const statusText = loading
    ? 'Checking alerts...'
    : isCurrentLocationEmergency
      ? 'Emergency alert in your area'
      : isCurrentLocationWarning
        ? 'Prepare near shelter'
        : shouldShowFollowedAreaBanner
          ? 'Alert in followed area'
          : 'No active alert';

  // Short status label shown in the current alert feed card.
  const feedStatusText = isCurrentLocationEmergency
    ? 'Emergency'
    : isCurrentLocationWarning
      ? 'Warning'
      : classification?.event_type === 'event_ended'
        ? 'Ended'
        : hasActiveAlert
          ? 'Active'
          : 'Calm';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Screen header */}
        <View style={styles.header}>
          <Text style={styles.title}>Emergency Alerts</Text>
          <Text style={styles.subtitle}>
            Real-time alerts for your location and followed areas
          </Text>
        </View>

        {/* Main current-area status card */}
        <View
          style={[
            styles.statusCard,
            isEmergency && styles.statusCardEmergency,
            isWarning && !isEmergency && styles.statusCardWarning,
          ]}
        >
          <Text style={styles.cardLabel}>Current Area</Text>

          <Text
            style={[
              styles.statusValue,
              isEmergency && styles.statusValueEmergency,
              isWarning && !isEmergency && styles.statusValueWarning,
            ]}
          >
            {statusText}
          </Text>

          <Text style={styles.cardInfo}>{currentAreaName}</Text>

          {/* Extra alert details shown only when an active alert exists */}
          {hasActiveAlert && (
            <View style={styles.alertDetailsBox}>
              <Text style={styles.alertTitle}>{alertTitle}</Text>

              {alertDescription ? (
                <Text style={styles.alertDescription}>{alertDescription}</Text>
              ) : null}

              {uniqueRelevantAreas.length > 0 ? (
                <Text style={styles.affectedAreas}>
                  Relevant areas: {uniqueRelevantAreas.join(', ')}
                </Text>
              ) : null}

              {classification ? (
                <Text style={styles.classificationInfo}>
                  {classification.event_type} · {classification.severity}
                </Text>
              ) : null}
            </View>
          )}

          {/* Shelter CTA shown only when the backend says shelter guidance should be offered */}
          {shouldShowShelterButton && (
            <View style={styles.ctaButton}>
              <Text style={styles.ctaButtonText}>Find nearest shelter</Text>
            </View>
          )}
        </View>

        {/* Followed areas section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Followed Areas</Text>

          {loading ? (
            <Text style={styles.helperText}>Loading followed areas...</Text>
          ) : followedAreas.length === 0 ? (
            <Text style={styles.helperText}>No followed areas yet.</Text>
          ) : (
            followedAreas.map((area) => {
              // Check whether this followed area currently matches the alert.
              const hasMatchedAlert = matchedFollowedAreas.includes(area.area_name);
              const followedAreaSeverity = classification?.severity || 'none';
              const followedAreaEventType = classification?.event_type || 'none';

              // Text shown as the main followed-area status.
              const followedAreaStatusText =
                hasMatchedAlert && followedAreaSeverity === 'critical'
                  ? 'Active alert'
                  : hasMatchedAlert && followedAreaSeverity === 'warning'
                    ? 'Warning'
                    : hasMatchedAlert && followedAreaSeverity === 'info'
                      ? 'Update'
                      : hasMatchedAlert
                        ? 'Alert update'
                        : 'No active alert';

              // Secondary text shown under the main followed-area status.
              const followedAreaSubText =
                hasMatchedAlert && followedAreaEventType === 'prepare_near_shelter'
                  ? 'Prepare near shelter'
                  : hasMatchedAlert && followedAreaEventType === 'event_ended'
                    ? 'Event ended'
                    : hasMatchedAlert
                      ? 'Relevant alert detected'
                      : 'Currently calm';

              return (
                <View
                  key={area.id}
                  style={[
                    styles.alertCard,
                    hasMatchedAlert &&
                    followedAreaSeverity === 'critical' &&
                    styles.alertCardActive,
                  ]}
                >
                  <Text style={styles.areaName}>{area.area_name}</Text>

                  <Text
                    style={
                      hasMatchedAlert
                        ? styles.alertStatusActive
                        : styles.alertStatusCalm
                    }
                  >
                    {followedAreaStatusText}
                  </Text>

                  <Text style={styles.alertTime}>
                    {followedAreaSubText}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {/* Current alert feed section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Alert Feed</Text>

          {loading ? (
            <Text style={styles.helperText}>Checking alert feed...</Text>
          ) : hasActiveAlert ? (
            <View style={styles.recentCard}>
              <View style={styles.recentTextBlock}>
                <Text style={styles.recentArea}>{alertTitle}</Text>
                <Text style={styles.recentSubText}>
                  {affectedAreas.length > 0
                    ? affectedAreas.join(', ')
                    : 'No affected areas listed'}
                </Text>
              </View>
              <Text
                style={[
                  styles.recentTime,
                  isCurrentLocationWarning && styles.recentTimeWarning,
                  classification?.event_type === 'event_ended' && styles.recentTimeEnded,
                ]}
              >
                {feedStatusText}
              </Text>
            </View>
          ) : (
            <Text style={styles.helperText}>No active alerts right now.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Component styles for the alerts screen UI.
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
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  statusCardEmergency: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  statusCardWarning: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  cardLabel: {
    fontSize: 14,
    color: '#64748B',
  },
  statusValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#16A34A',
  },
  statusValueEmergency: {
    color: '#DC2626',
  },
  statusValueWarning: {
    color: '#D97706',
  },
  cardInfo: {
    fontSize: 15,
    color: '#475569',
  },
  alertDetailsBox: {
    marginTop: 8,
    gap: 6,
  },
  alertTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  alertDescription: {
    fontSize: 15,
    color: '#334155',
  },
  affectedAreas: {
    fontSize: 14,
    color: '#64748B',
  },
  classificationInfo: {
    fontSize: 13,
    color: '#64748B',
  },
  ctaButton: {
    marginTop: 10,
    backgroundColor: '#DC2626',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  helperText: {
    fontSize: 15,
    color: '#64748B',
  },
  alertCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  alertCardActive: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  areaName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E3A8A',
  },
  alertStatusActive: {
    fontSize: 15,
    fontWeight: '600',
    color: '#DC2626',
  },
  alertStatusCalm: {
    fontSize: 15,
    fontWeight: '600',
    color: '#16A34A',
  },
  alertTime: {
    fontSize: 14,
    color: '#64748B',
  },
  recentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  recentTextBlock: {
    flex: 1,
    gap: 4,
  },
  recentArea: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  recentSubText: {
    fontSize: 14,
    color: '#64748B',
  },
  recentTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
  },
  recentTimeWarning: {
    color: '#D97706',
  },
  recentTimeEnded: {
    color: '#16A34A',
  },
});
