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
  created_at: string;
  updated_at: string;
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

  const [showCenterButton, setShowCenterButton] = useState(false);
  const [officialShelters, setOfficialShelters] = useState<OfficialShelter[]>([]);
  const [bestShelter, setBestShelter] = useState<BestShelterRecommendation | null>(null);
  const [loadingBestShelter, setLoadingBestShelter] = useState(true);

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
      console.log('Failed to load official shelters for home screen:', error);
    }
  };

  const loadBestShelterRecommendation = async (
    latitude: number,
    longitude: number
  ) => {
    try {
      setLoadingBestShelter(true);

      const response = await fetch(`${API_BASE_URL}/recommendations/best-shelter`, {
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

  useFocusEffect(
    useCallback(() => {
      loadOfficialShelters();
    }, [])
  );

  useEffect(() => {
    if (!userLocation) return;

    loadBestShelterRecommendation(
      userLocation.latitude,
      userLocation.longitude
    );
  }, [userLocation]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.appName}>ShelterNow</Text>
          <Text style={styles.subtitle}>Emergency shelter guidance</Text>
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Status</Text>
          <Text style={styles.statusValue}>All Clear</Text>
        </View>

        <View style={styles.mainCard}>
          <Text style={styles.cardTitle}>Nearest Shelter</Text>

          {loadingBestShelter ? (
            <>
              <Text style={styles.cardName}>Loading...</Text>
              <Text style={styles.cardMeta}>Checking nearby shelters</Text>
              <Text style={styles.cardSource}>Official source</Text>
            </>
          ) : bestShelter ? (
            <>
              <Text style={styles.cardName}>{bestShelter.name}</Text>
              <Text style={styles.cardMeta}>
                {formatDistance(bestShelter.distance_meters)} • {bestShelter.estimated_walk_minutes} min walk
              </Text>
              <Text style={styles.cardSource}>{bestShelter.source} source</Text>
            </>
          ) : (
            <>
              <Text style={styles.cardName}>No shelter found</Text>
              <Text style={styles.cardMeta}>No official shelters available yet</Text>
              <Text style={styles.cardSource}>Official source</Text>
            </>
          )}

          <View style={styles.goButtonWrapper}>
            <View style={styles.emergencyButtonHalo}>
              <Pressable
                style={styles.emergencyButton}
                onPress={() => console.log('Start route pressed')}>
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

                  {userLocation && bestShelter ? (
                    <Polyline
                      coordinates={[
                        {
                          latitude: userLocation.latitude,
                          longitude: userLocation.longitude,
                        },
                        {
                          latitude: bestShelter.latitude,
                          longitude: bestShelter.longitude,
                        },
                      ]}
                      strokeWidth={4}
                      strokeColor="#2563EB"
                    />
                  ) : null}
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
