import { SafeAreaView, View, Text, Pressable, StyleSheet } from "react-native";
import { styles } from "./home.styles";

export default function HomeScreen() {
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
          <Text style={styles.cardTitle}>Nearest Protected Area</Text>
          <Text style={styles.cardName}>City Mall Shelter</Text>
          <Text style={styles.cardMeta}>400 meters away</Text>
          <Text style={styles.cardMeta}>Estimated arrival: 2 min</Text>

          <Pressable
            style={styles.primaryButton}
            onPress={() => console.log("Navigate pressed")}
          >
            <Text style={styles.primaryButtonText}>Navigate to Shelter</Text>
          </Pressable>
        </View>

        <View style={styles.mapSection}>
          <Text style={styles.mapTitle}>Quick Map Preview</Text>
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapPlaceholderText}>Map preview will appear here</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
