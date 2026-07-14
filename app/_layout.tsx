import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider } from '../context/AuthContext';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
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
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
  );
}
