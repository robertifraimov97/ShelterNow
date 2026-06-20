import { SafeAreaView, View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { API_BASE_URL } from '../constants/api';

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
  created_at: string;
  updated_at: string;
};

export default function FullMapScreen() {
  // Router instance used for navigating back to the previous screen.
  const router = useRouter();

  // Reference to the map instance so the app can re-center it programmatically.
  const mapRef = useRef<MapView | null>(null);

  // Stores the user's current GPS location.
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Controls whether the "Center on Me" button should be shown.
  const [showCenterButton, setShowCenterButton] = useState(false);

  // Stores all official shelters loaded from the backend.
  const [officialShelters, setOfficialShelters] = useState<OfficialShelter[]>([]);

  // Load the user's current location once when the screen first mounts.
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

  // Load all official shelters from the backend and keep only shelters with valid coordinates.
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
      console.log('Failed to load official shelters for full map:', error);
    }
  };

  // Reload official shelters whenever this screen gains focus.
  useFocusEffect(
    useCallback(() => {
      loadOfficialShelters();
    }, [])
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header section with back button and screen title */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>

        <Text style={styles.title}>Full Map</Text>
      </View>

      {/* Main map container */}
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

                // Detect whether the map has moved far enough away from the user's location
                // to justify showing the re-center button.
                const movedAway =
                  latitudeDifference > 0.002 || longitudeDifference > 0.002;

                setShowCenterButton(movedAway);
              }}
            >
              {/* Marker for the user's current location */}
              <Marker
                coordinate={{
                  latitude: userLocation.latitude,
                  longitude: userLocation.longitude,
                }}
                title="Your Location"
                description="Current user position"
              />

              {/* Markers for all official shelters */}
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

            {/* Button that re-centers the map on the user's current location */}
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
                }}
              >
                <Text style={styles.centerButtonText}>Center on Me</Text>
              </Pressable>
            )}
          </>
        ) : (
          // Fallback UI while the current location is still loading.
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading your location...</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7FB',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
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
  mapContainer: {
    flex: 1,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#C7D2E0',
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EAF1F8',
  },
  loadingText: {
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
});
