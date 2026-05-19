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

export default function AlertsScreen() {
  const [followedAreas, setFollowedAreas] = useState<FollowedArea[]>([]);
  const [loadingFollowedAreas, setLoadingFollowedAreas] = useState(true);
  const [currentAreaName, setCurrentAreaName] = useState('Loading location...');

  const loadFollowedAreas = async () => {
    try {
      setLoadingFollowedAreas(true);

      const response = await fetch(`${API_BASE_URL}/followed-areas/`);
      const data = await response.json();

      setFollowedAreas(data);
    } catch (error) {
      console.log('Failed to load followed areas for alerts:', error);
    } finally {
      setLoadingFollowedAreas(false);
    }
  };

  const loadCurrentArea = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        setCurrentAreaName('Location unavailable');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const reverseGeocoded = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (reverseGeocoded.length > 0) {
        const place = reverseGeocoded[0];
        const cityName =
          place.city || place.subregion || place.region || 'Unknown area';

        setCurrentAreaName(cityName);
      } else {
        setCurrentAreaName('Unknown area');
      }
    } catch (error) {
      console.log('Failed to load current area:', error);
      setCurrentAreaName('Location unavailable');
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadFollowedAreas();
      loadCurrentArea();
    }, [])
  );

  const recentAlerts = followedAreas.slice(0, 3).map((area, index) => {
    const mockTimes = ['18:42', '17:55', '17:20'];

    return {
      id: area.id,
      area_name: area.area_name,
      time: mockTimes[index] || '16:40',
    };
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Emergency Alerts</Text>
          <Text style={styles.subtitle}>
            Track alerts in your area and in areas you follow
          </Text>
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.cardLabel}>Current Area</Text>
          <Text style={styles.statusValue}>No active alert</Text>
          <Text style={styles.cardInfo}>{currentAreaName}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Followed Areas</Text>

          {loadingFollowedAreas ? (
            <Text style={styles.helperText}>Loading followed areas...</Text>
          ) : followedAreas.length === 0 ? (
            <Text style={styles.helperText}>No followed areas yet.</Text>
          ) : (
            followedAreas.map((area, index) => {
              const isActiveAlert = index === 0;

              return (
                <View key={area.id} style={styles.alertCard}>
                  <Text style={styles.areaName}>{area.area_name}</Text>

                  <Text
                    style={
                      isActiveAlert
                        ? styles.alertStatusActive
                        : styles.alertStatusCalm
                    }
                  >
                    {isActiveAlert ? 'Active alert' : 'No active alert'}
                  </Text>

                  <Text style={styles.alertTime}>
                    {isActiveAlert ? 'Updated 2 min ago' : 'Updated 5 min ago'}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Alerts</Text>

          {loadingFollowedAreas ? (
            <Text style={styles.helperText}>Loading recent alerts...</Text>
          ) : recentAlerts.length === 0 ? (
            <Text style={styles.helperText}>No recent alerts yet.</Text>
          ) : (
            recentAlerts.map((alert) => (
              <View key={alert.id} style={styles.recentCard}>
                <Text style={styles.recentArea}>{alert.area_name}</Text>
                <Text style={styles.recentTime}>{alert.time}</Text>
              </View>
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
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
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
  cardInfo: {
    fontSize: 15,
    color: '#475569',
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
  },
  recentArea: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  recentTime: {
    fontSize: 14,
    color: '#64748B',
  },
});
