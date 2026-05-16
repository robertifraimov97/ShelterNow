import { SafeAreaView, StyleSheet, View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

export default function FullMapScreen() {
  const router = useRouter();

  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  useEffect(() => {
    const getUserLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        console.log('Location permission was denied');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      console.log('Full map user location:', location);

      setUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    };

    getUserLocation();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>

        <Text style={styles.title}>Full Map View</Text>
      </View>

      <View style={styles.mapContainer}>
        {userLocation ? (
                         <MapView
                           style={styles.map}
                           initialRegion={{
                             latitude: userLocation.latitude,
                             longitude: userLocation.longitude,
                             latitudeDelta: 0.02,
                             longitudeDelta: 0.02,
                           }}>
                           <Marker
                             coordinate={{
                               latitude: userLocation.latitude,
                               longitude: userLocation.longitude,
                             }}
                             title="Your Location"
                             description="Current user position"
                           />
                         </MapView>
        ) : (
          <View style={styles.mapLoadingContainer}>
            <Text style={styles.mapLoadingText}>Loading your location...</Text>
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
    paddingBottom: 12,
    gap: 10,
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
    fontSize: 24,
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
});
