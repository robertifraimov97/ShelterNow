import { View, Text, Pressable } from "react-native";

export default function HomeScreen() {
  return (
    <View style={{ flex: 1, padding: 24, justifyContent: "center", gap: 16 }}>
      <Text style={{ fontSize: 28, fontWeight: "700", textAlign: "center" }}>
        ShelterNow
      </Text>

      <Text style={{ fontSize: 16, textAlign: "center", opacity: 0.8 }}>
        Find a nearby protected area quickly.
      </Text>

      <Pressable
        onPress={() => console.log("Start pressed")}
        style={{
          paddingVertical: 14,
          borderRadius: 12,
          alignItems: "center",
          borderWidth: 1,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "600" }}>Start</Text>
      </Pressable>
    </View>
  );
}
