import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  BarChart3,
  Menu,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DashboardScreen } from '../screens/DashboardScreen';
import { PosScreen } from '../screens/PosScreen';
import { ProductsScreen } from '../screens/ProductsScreen';
import { ReportsScreen } from '../screens/ReportsScreen';
import { MoreScreen } from '../screens/MoreScreen';
import type { MainTabParamList } from './types';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';

const Tab = createBottomTabNavigator<MainTabParamList>();

/** İkon + etiket alanı (safe area hariç) — kesilmeyi önlemek için yeterli yükseklik */
const TAB_CONTENT_HEIGHT = 56;
const ICON_SIZE = 22;

export function MainTabNavigator() {
  const { t } = useTranslation();
  const { colors, darkMode } = useThemeStore();
  const insets = useSafeAreaInsets();
  /** Home indicator / gesture bar; en az 8px nefes boşluğu */
  const tabBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 4);

  return (
    <Tab.Navigator
      /** Çift inset olmasın: yüksekliği/padding’i kendimiz uyguluyoruz */
      safeAreaInsets={{ bottom: 0 }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarHideOnKeyboard: true,
        tabBarAllowFontScaling: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: darkMode ? palette.gray700 : palette.gray200,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: TAB_CONTENT_HEIGHT + tabBottom,
          paddingBottom: tabBottom,
          paddingTop: 6,
          overflow: 'visible',
        },
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
          paddingTop: 2,
        },
        tabBarIconStyle: {
          marginBottom: 2,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          lineHeight: 14,
          marginBottom: Platform.OS === 'ios' ? 0 : 2,
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: t('dashboard'),
          tabBarIcon: ({ color }) => <LayoutDashboard size={ICON_SIZE} color={color} />,
        }}
      />
      <Tab.Screen
        name="POS"
        component={PosScreen}
        options={{
          title: t('pos'),
          tabBarIcon: ({ color }) => <ShoppingCart size={ICON_SIZE} color={color} />,
        }}
      />
      <Tab.Screen
        name="Products"
        component={ProductsScreen}
        options={{
          title: t('products'),
          tabBarIcon: ({ color }) => <Package size={ICON_SIZE} color={color} />,
        }}
      />
      <Tab.Screen
        name="Reports"
        component={ReportsScreen}
        options={{
          title: t('reports'),
          tabBarIcon: ({ color }) => <BarChart3 size={ICON_SIZE} color={color} />,
        }}
      />
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{
          title: t('more'),
          tabBarIcon: ({ color }) => <Menu size={ICON_SIZE} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}
