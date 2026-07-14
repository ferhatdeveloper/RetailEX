import React, { Suspense, useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import './src/i18n';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { useThemeStore } from './src/store/themeStore';
import { useLanguageStore } from './src/store/languageStore';
import { useAuthStore } from './src/store/authStore';
import { useConfigStore } from './src/store/configStore';
import { applyLayoutDirection, isAppLanguage } from './src/i18n/languages';
import { startConnectivityMonitoring } from './src/offline/bootstrap';
import i18n from './src/i18n';
import { darkColors, lightColors, palette } from './src/theme/colors';

const HYDRATE_TIMEOUT_MS = 2500;

function markHydrated() {
  useAuthStore.getState().setHydrated(true);
  useConfigStore.getState().setHydrated(true);
  const dm = useThemeStore.getState().darkMode;
  useThemeStore.setState({
    colors: dm ? darkColors : lightColors,
  });
  const lang = useLanguageStore.getState().language;
  const safe = isAppLanguage(lang) ? lang : 'tr';
  applyLayoutDirection(safe);
  if (i18n.language !== safe) {
    void i18n.changeLanguage(safe);
  }
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
    const stopNet = startConnectivityMonitoring();
    return () => stopNet();
  }, []);

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      markHydrated();
      if (__DEV__) {
        console.log('[boot] hydrated');
      }
    };

    const unsubAuth = useAuthStore.persist.onFinishHydration(() => {
      finish();
    });
    const unsubCfg = useConfigStore.persist.onFinishHydration(() => {
      useConfigStore.getState().setHydrated(true);
    });
    const unsubLang = useLanguageStore.persist.onFinishHydration(() => {
      const lang = useLanguageStore.getState().language;
      const safe = isAppLanguage(lang) ? lang : 'tr';
      applyLayoutDirection(safe);
      void i18n.changeLanguage(safe);
    });
    const unsubTheme = useThemeStore.persist.onFinishHydration(() => {
      const dm = useThemeStore.getState().darkMode;
      useThemeStore.setState({ colors: dm ? darkColors : lightColors });
    });

    const authReady = useAuthStore.persist.hasHydrated();
    const cfgReady = useConfigStore.persist.hasHydrated();
    const langReady = useLanguageStore.persist.hasHydrated();
    const themeReady = useThemeStore.persist.hasHydrated();

    if (authReady && cfgReady && langReady && themeReady) {
      finish();
    } else {
      // AsyncStorage gecikmesi / hata → sonsuz spinner olmasın
      void Promise.all([
        authReady ? Promise.resolve() : useAuthStore.persist.rehydrate(),
        cfgReady ? Promise.resolve() : useConfigStore.persist.rehydrate(),
        langReady ? Promise.resolve() : useLanguageStore.persist.rehydrate(),
        themeReady ? Promise.resolve() : useThemeStore.persist.rehydrate(),
      ])
        .catch((e) => {
          console.warn('[boot] rehydrate error', e);
        })
        .finally(() => {
          finish();
        });
    }

    const timer = setTimeout(finish, HYDRATE_TIMEOUT_MS);

    return () => {
      unsubAuth();
      unsubCfg();
      unsubLang();
      unsubTheme();
      clearTimeout(timer);
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style={darkMode ? 'light' : 'dark'} />
      <AppErrorBoundary>
        <Suspense fallback={<BootFallback />}>
          <RootNavigator />
        </Suspense>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}
