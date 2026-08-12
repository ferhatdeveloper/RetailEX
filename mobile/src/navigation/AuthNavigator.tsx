import React, { useMemo } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '../screens/LoginScreen';
import { ConfigScreen } from '../screens/ConfigScreen';
import { OrganizationScreen } from '../screens/OrganizationScreen';
import type { AuthStackParamList } from './types';
import { useThemeStore } from '../store/themeStore';
import { isConfigReady, useConfigStore } from '../store/configStore';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  const { colors } = useThemeStore();
  const config = useConfigStore((s) => s.config);
  const hydrated = useConfigStore((s) => s.isHydrated);

  const initialRoute = useMemo((): keyof AuthStackParamList => {
    if (!hydrated) return 'Login';
    return isConfigReady(config) ? 'Login' : 'Config';
  }, [hydrated, config]);

  return (
    <Stack.Navigator
      key={initialRoute}
      initialRouteName={initialRoute}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Config" component={ConfigScreen} />
      <Stack.Screen name="Organization" component={OrganizationScreen} />
    </Stack.Navigator>
  );
}
