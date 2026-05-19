import { SafeAreaView, View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
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
  created_at: string;
  updated_at: string;
};

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
};

function formatDistance(distanceMeters: number) {
  if (distanceMeters < 1000) {
    return `${distanceMeters} meters away`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km away`;
}

export default function MapScreen() {
  const router = useRouter();

  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const [showCenterButton, setShowCenterButton] = useState(false);
  const [officialShelters, setOfficialShelters] = useState<OfficialShelter[]>([]);
  const [nearbyShelters, setNearbyShelters] = useState<NearbyShelter[]>([]);
  const [loadingShelters, setLoadingShelters] = useState(true);

  const mapRef = useRef<MapView | null>(null);

  useEffect(() => {
    const getUserLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        console.log('Location permission was denied');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});

      setUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    };

    getUserLocation();
  }, []);

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
      console.log('Failed to load official shelters for map:', error);
    }
  };

  const loadNearbyShelters = async (
    latitude: number,
    longitude: number
  ) => {
    try {
      setLoadingShelters(true);

      const response = await fetch(`${API_BASE_URL}/recommendations/nearby-shelters`, {
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
        console.log('Failed to load nearby shelters recommendation');
        setNearbyShelters([]);
        return;
      }

      const data = await response.json();
      setNearbyShelters(data);
    } catch (error) {
      console.log('Failed to load nearby shelters recommendation:', error);
      setNearbyShelters([]);
    } finally {
      setLoadingShelters(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadOfficialShelters();
    }, [])
  );

  useEffect(() => {
    if (!userLocation) return;

    loadNearbyShelters(userLocation.latitude, userLocation.longitude);
  }, [userLocation]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Nearby Protected Areas</Text>
          <Text style={styles.subtitle}>
            View protected areas around your current location
          </Text>
        </View>

        <View style={styles.mapSection}>
          <Text style={styles.mapLabel}>Map View</Text>

          <View style={styles.mapContainer}>
            {userLocation ? (
              <>
                <MapView
                  ref={mapRef}
                  style={styles.map}
                  initialRegion={{
                    latitude: userLocation.latitude,
                    longitude: userLocation.longitude,
                    latitudeDelta: 0.02,
                    longitudeDelta: 0.02,
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
                      latitudeDifference > 0.002 || longitudeDifference > 0.002;

                    setShowCenterButton(movedAway);
                  }}>
                  <Marker
                    coordinate={{
                      latitude: userLocation.latitude,
                      longitude: userLocation.longitude,
                    }}
                    title="Your Location"
                    description="Current user position"
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
                            latitudeDelta: 0.02,
                            longitudeDelta: 0.02,
                          },
                          800
                        );
                        setShowCenterButton(false);
                      }
                    }}>
                    <Text style={styles.centerButtonText}>Center on Me</Text>
                  </Pressable>
                )}

                <Pressable
                  style={styles.fullMapButton}
                  onPress={() => router.push('/full-map')}>
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

        <View style={styles.listSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Nearby Options</Text>
            <Pressable onPress={() => router.push('/shelters-list')}>
              <Text style={styles.seeAllText}>See all</Text>
            </Pressable>
          </View>

          {loadingShelters ? (
            <Text style={styles.helperText}>Loading nearby shelters...</Text>
          ) : nearbyShelters.length === 0 ? (
            <Text style={styles.helperText}>No nearby shelters available yet.</Text>
          ) : (
            nearbyShelters.map((shelter) => (
              <Pressable
                key={shelter.id}
                style={styles.areaCard}
                onPress={() => router.push('/shelter-details')}>
                <Text style={styles.areaName}>{shelter.name}</Text>
                <Text style={styles.areaInfo}>
                  {formatDistance(shelter.distance_meters)}
                </Text>
                <Text style={styles.areaInfo}>Source: {shelter.source}</Text>
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
  mapSection: {
    gap: 10,
  },
  mapLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  mapContainer: {
    height: 280,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#C7D2E0',
  },
  map: {
    flex: 1,
  },
  mapLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EAF1F8',
  },
  mapLoadingText: {
    fontSize: 15,
    color: '#475569',
    fontWeight: '500',
  },
  centerButton: {
    position: 'absolute',
    bottom: 14,
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
  },
  centerButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  fullMapButton: {
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
  },
  fullMapButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  listSection: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
  },
  helperText: {
    fontSize: 15,
    color: '#64748B',
  },
  areaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  areaName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E3A8A',
  },
  areaInfo: {
    fontSize: 14,
    color: '#475569',
  },
});
