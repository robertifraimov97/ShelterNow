import { SafeAreaView, View, Text, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import { API_BASE_URL } from '../../constants/api';

type FollowedArea = {
  id: number;
  user_identifier: string;
  area_name: string;
  city_code?: string | null;
  label?: string | null;
  created_at: string;
};

type AlertRelevance = {
  priority: 'emergency' | 'followed_area' | 'none';
  match_strategy: string;
  current_location_match: boolean;
  current_location_alert: string | null;
  matched_followed_areas: string[];
  show_nearest_shelter_button: boolean;
};

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
  const [followedAreas, setFollowedAreas] = useState<FollowedArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentAreaName, setCurrentAreaName] = useState('Loading location...');
  const [alertsResponse, setAlertsResponse] = useState<AlertsResponse | null>(null);

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

  const loadInitialData = async () => {
    try {
      setLoading(true);

      const followedResponse = await fetch(`${API_BASE_URL}/followed-areas/`);
      const followedData: FollowedArea[] = await followedResponse.json();

      const cityName = await getCurrentAreaName();

      setFollowedAreas(followedData);
      setCurrentAreaName(cityName);

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

      const alertsResponse = await fetch(`${API_BASE_URL}/alerts/?${params.toString()}`);
      const alertsData: AlertsResponse = await alertsResponse.json();

      setAlertsResponse(alertsData);
    } catch (error) {
      console.log('Failed to load alerts screen data:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadInitialData();
    }, [])
  );

  const priority = alertsResponse?.relevance.priority || 'none';
  const hasActiveAlert = alertsResponse?.alert.has_active_alert || false;
  const rawAlert = alertsResponse?.alert.raw || {};
  const alertTitle = rawAlert.title || 'No active alert';
  const alertDescription = rawAlert.desc || '';
  const affectedAreas: string[] = rawAlert.data || [];
  const matchedFollowedAreas =
    alertsResponse?.relevance.matched_followed_areas || [];

  const classification = alertsResponse?.classification;
  const experience = alertsResponse?.experience;

  const focusMode = experience?.focus_mode || 'normal';

  const isCurrentLocationEmergency =
    focusMode === 'current_location_emergency';

  const isCurrentLocationWarning =
    focusMode === 'current_location_warning';

  const shouldShowShelterButton =
    experience?.show_nearest_shelter_button ||
    alertsResponse?.relevance.show_nearest_shelter_button ||
    false;

  const shouldShowFollowedAreaBanner =
    experience?.show_followed_area_banner ??
    priority === 'followed_area';

  const isEmergency = isCurrentLocationEmergency;
  const isWarning = isCurrentLocationWarning || shouldShowFollowedAreaBanner;

  const statusText = loading
    ? 'Checking alerts...'
    : isCurrentLocationEmergency
      ? 'Emergency alert in your area'
      : isCurrentLocationWarning
        ? 'Prepare near shelter'
        : shouldShowFollowedAreaBanner
          ? 'Alert in followed area'
          : 'No active alert';

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
        <View style={styles.header}>
          <Text style={styles.title}>Emergency Alerts</Text>
          <Text style={styles.subtitle}>
            Real-time alerts for your location and followed areas
          </Text>
        </View>

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

          {hasActiveAlert && (
            <View style={styles.alertDetailsBox}>
              <Text style={styles.alertTitle}>{alertTitle}</Text>

              {alertDescription ? (
                <Text style={styles.alertDescription}>{alertDescription}</Text>
              ) : null}

              {affectedAreas.length > 0 ? (
                <Text style={styles.affectedAreas}>
                  Affected areas: {affectedAreas.join(', ')}
                </Text>
              ) : null}

              {classification ? (
                <Text style={styles.classificationInfo}>
                  {classification.event_type} · {classification.severity}
                </Text>
              ) : null}
            </View>
          )}

          {shouldShowShelterButton && (
            <View style={styles.ctaButton}>
              <Text style={styles.ctaButtonText}>Find nearest shelter</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Followed Areas</Text>

          {loading ? (
            <Text style={styles.helperText}>Loading followed areas...</Text>
          ) : followedAreas.length === 0 ? (
            <Text style={styles.helperText}>No followed areas yet.</Text>
          ) : (
            followedAreas.map((area) => {
              const hasMatchedAlert = matchedFollowedAreas.includes(area.area_name);

              return (
                <View
                  key={area.id}
                  style={[
                    styles.alertCard,
                    hasMatchedAlert && styles.alertCardActive,
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
                    {hasMatchedAlert ? 'Active alert' : 'No active alert'}
                  </Text>

                  <Text style={styles.alertTime}>
                    {hasMatchedAlert
                      ? 'Relevant alert detected'
                      : 'Currently calm'}
                  </Text>
                </View>
              );
            })
          )}
        </View>

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
