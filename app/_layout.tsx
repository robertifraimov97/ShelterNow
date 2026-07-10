import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

// Expo Router setting that defines the initial anchor route group.
export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  // Detect whether the device is currently using light mode or dark mode.
  const colorScheme = useColorScheme();

  return (
<<<<<<< Updated upstream
    // Provide the correct navigation theme based on the current color scheme.
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {/* Main app navigation stack */}
      <Stack>
        {/* Main tab-based layout */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

        {/* Additional full-screen routes */}
        <Stack.Screen name="full-map" options={{ headerShown: false }} />
        <Stack.Screen name="shelters-list" options={{ headerShown: false }} />
        <Stack.Screen name="profile-settings" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen name="add-community-shelter" options={{ headerShown: false }} />
        <Stack.Screen name="shelter-details" options={{ headerShown: false }} />
        <Stack.Screen name="shelter-management" options={{ headerShown: false }} />
        <Stack.Screen name="my-submitted-shelters" options={{ headerShown: false }} />
        <Stack.Screen name="edit-submitted-shelter" options={{ headerShown: false }} />
        <Stack.Screen name="followed-areas" options={{ headerShown: false }} />
        <Stack.Screen name="add-followed-area" options={{ headerShown: false }} />
      </Stack>

      {/* Controls the device status bar appearance */}
      <StatusBar style="auto" />
    </ThemeProvider>
=======
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="full-map" options={{ headerShown: false }} />
          <Stack.Screen name="shelters-list" options={{ headerShown: false }} />
          <Stack.Screen name="profile-settings" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          <Stack.Screen name="add-community-shelter" options={{ headerShown: false }} />
          <Stack.Screen name="shelter-details" options={{ headerShown: false }} />
          <Stack.Screen name="shelter-management" options={{ headerShown: false }} />
          <Stack.Screen name="my-submitted-shelters" options={{ headerShown: false }} />
          <Stack.Screen name="edit-submitted-shelter" options={{ headerShown: false }} />
          <Stack.Screen name="followed-areas" options={{ headerShown: false }} />
          <Stack.Screen name="add-followed-area" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ headerShown: false }} />
          <Stack.Screen name="shelter-feedback" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
>>>>>>> Stashed changes
  );
}
