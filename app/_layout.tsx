import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StillHereHost } from '@/components/StillHereHost';
import { AppProvider } from '@/context/AppContext';
import { PlacesProvider } from '@/context/PlacesContext';
import { colors } from '@/theme/colors';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/**
 * Card modals. `formSheet` breaks content layout on iOS (children get measured
 * against the full window, not the sheet), so we use the plain modal card and
 * draw our own grabber via `<ModalGrabber />` inside each screen.
 */
const modal = {
  presentation: 'modal',
  animation: 'slide_from_bottom',
  animationDuration: 340,
  contentStyle: { backgroundColor: colors.bg },
} as const;

export default function RootLayout() {
  const [loaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [loaded]);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <AppProvider>
          <PlacesProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
                animation: 'slide_from_right',
                animationDuration: 300,
                gestureEnabled: true,
                fullScreenGestureEnabled: true,
              }}
            >
              <Stack.Screen name="index" options={{ animation: 'fade' }} />
              <Stack.Screen name="auth/login" options={{ animation: 'fade' }} />
              <Stack.Screen name="auth/signup" options={{ animation: 'slide_from_bottom' }} />
              <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
              <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
              <Stack.Screen name="place/[id]" options={modal} />
              <Stack.Screen name="search" options={modal} />
              <Stack.Screen name="paywall" options={modal} />
              <Stack.Screen name="chat/[placeId]" options={{ animation: 'slide_from_bottom' }} />
              <Stack.Screen name="rate/[placeId]" options={modal} />
              <Stack.Screen name="add-place" options={modal} />
              <Stack.Screen name="profile-edit" options={modal} />
              <Stack.Screen name="privacy" />
              <Stack.Screen name="admin/index" />
            </Stack>
            <StillHereHost />
          </PlacesProvider>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
