import { SafeAreaView, View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import MapView from "react-native-maps";
import { styles } from "./home.styles";

export default function HomeScreen() {
  const router = useRouter();

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

          <Pressable onPress={() => router.push("/full-map")}>
            <View style={styles.mapContainer}>
              <MapView
                style={styles.map}
                initialRegion={{
                  latitude: 32.0853,
                  longitude: 34.7818,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
                pointerEvents="none"
              />
            </View>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
