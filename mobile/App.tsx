import React, { Suspense, useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import './src/i18n';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useThemeStore } from './src/store/themeStore';
import { useAuthStore } from './src/store/authStore';
import { useConfigStore } from './src/store/configStore';
import { darkColors, lightColors, palette } from './src/theme/colors';

const HYDRATE_TIMEOUT_MS = 2500;

function markHydrated() {
  useAuthStore.getState().setHydrated(true);
  useConfigStore.getState().setHydrated(true);
  const dm = useThemeStore.getState().darkMode;
  useThemeStore.setState({
    colors: dm ? darkColors : lightColors,
  });
}

function BootFallback() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.blue600,
      }}
    >
      <ActivityIndicator size="large" color={palette.white} />
    </View>
  );
}

export default function App() {
  const darkMode = useThemeStore((s) => s.darkMode);

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      markHydrated();
    };

    const unsubAuth = useAuthStore.persist.onFinishHydration(() => {
      finish();
    });
    const unsubCfg = useConfigStore.persist.onFinishHydration(() => {
      useConfigStore.getState().setHydrated(true);
    });

    const authReady = useAuthStore.persist.hasHydrated();
    const cfgReady = useConfigStore.persist.hasHydrated();

    if (authReady && cfgReady) {
      finish();
    } else {
      // AsyncStorage gecikmesi / hata → sonsuz spinner olmasın
      void Promise.all([
        authReady ? Promise.resolve() : useAuthStore.persist.rehydrate(),
        cfgReady ? Promise.resolve() : useConfigStore.persist.rehydrate(),
      ]).finally(() => {
        finish();
      });
    }

    const timer = setTimeout(finish, HYDRATE_TIMEOUT_MS);

    return () => {
      unsubAuth();
      unsubCfg();
      clearTimeout(timer);
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style={darkMode ? 'light' : 'dark'} />
      <Suspense fallback={<BootFallback />}>
        <RootNavigator />
      </Suspense>
    </SafeAreaProvider>
  );
}
