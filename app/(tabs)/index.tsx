import { SafeAreaView, View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { styles } from "../../styles/home.styles";

export default function HomeScreen() {
  const router = useRouter();

  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const [showCenterButton, setShowCenterButton] = useState(false);

  const mapRef = useRef<MapView | null>(null);

  useEffect(() => {
    const getUserLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        console.log("Location permission was denied");
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      console.log("Home map user location:", location);

      setUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    };

    getUserLocation();
  }, []);

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
          <Text style={styles.cardName}>City Mall Shelter</Text>
          <Text style={styles.cardMeta}>400m • 2 min walk</Text>
          <Text style={styles.cardSource}>Official source</Text>

          <View style={styles.goButtonWrapper}>
            <View style={styles.emergencyButtonHalo}>
              <Pressable
                style={styles.emergencyButton}
                onPress={() => console.log("Start route pressed")}
              >
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
                  onPress={() => router.push("/full-map")}
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
