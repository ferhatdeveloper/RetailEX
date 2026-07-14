import { resolveLiveRoute } from '../config/menuConfig';
import type { MainStackParamList } from './types';

/** Tab/Stack composite — RN tip birleşimi gevşek tutulur */
type AnyNav = {
  navigate: (...args: never[]) => void;
};

export type BeautyRouteParams = NonNullable<MainStackParamList['Beauty']>;
export type RestaurantRouteParams = NonNullable<MainStackParamList['Restaurant']>;
export type SystemRouteParams = NonNullable<MainStackParamList['System']>;

/** Menü screen id → Beauty stack params */
export function beautyRouteParams(screen: string): BeautyRouteParams | undefined {
  switch (screen) {
    case 'appointment':
    case 'beauty':
      return { initialTab: 'appointments' };
    case 'beauty-services':
      return { initialTab: 'services' };
    case 'beauty-specialists':
      return { initialTab: 'specialists' };
    default:
      return undefined;
  }
}

/** Menü screen id → Restaurant stack params */
export function restaurantRouteParams(screen: string): RestaurantRouteParams | undefined {
  switch (screen) {
    case 'restaurant-tables':
      return { initialTab: 'tables' };
    case 'restaurant-orders':
      return { initialTab: 'orders' };
    default:
      return undefined;
  }
}

/** Menü screen id → System stack params */
export function systemRouteParams(screen: string): SystemRouteParams {
  return { screenId: screen };
}

/** @deprecated tercihen beautyRouteParams / restaurantRouteParams */
export function liveRouteParams(screen: string): BeautyRouteParams | RestaurantRouteParams | undefined {
  return beautyRouteParams(screen) ?? restaurantRouteParams(screen);
}

export function navigateToModule(
  navigation: AnyNav,
  screen: string,
  title?: string,
) {
  const nav = navigation as {
    navigate: (name: string, params?: Record<string, unknown>) => void;
  };

  if (screen === 'dashboard') {
    nav.navigate('Tabs', { screen: 'Dashboard' });
    return;
  }

  if (
    screen === 'firm-period-definitions' ||
    screen === 'organization' ||
    screen === 'change-organization'
  ) {
    nav.navigate('Organization');
    return;
  }

  const live = resolveLiveRoute(screen);
  switch (live) {
    case 'Organization':
      nav.navigate('Organization');
      return;
    case 'System':
      nav.navigate('System', systemRouteParams(screen));
      return;
    case 'Products':
      nav.navigate('Products');
      return;
    case 'Customers':
      nav.navigate('Customers');
      return;
    case 'Invoices':
      nav.navigate('Invoices');
      return;
    case 'POS':
      nav.navigate('Tabs', { screen: 'POS' });
      return;
    case 'Reports':
      nav.navigate('Tabs', { screen: 'Reports' });
      return;
    case 'ReportSales':
      nav.navigate('ReportSales');
      return;
    case 'ReportStock':
      nav.navigate('ReportStock');
      return;
    case 'ReportMizan':
      nav.navigate('ReportMizan');
      return;
    case 'ReportCariExtract':
      nav.navigate('ReportCariExtract');
      return;
    case 'Beauty':
      nav.navigate('Beauty', beautyRouteParams(screen));
      return;
    case 'Wms':
      nav.navigate('Wms');
      return;
    case 'WmsCount':
      nav.navigate(
        'WmsCount',
        screen === 'mobile-inventory-count' ? { autoCreate: true } : undefined,
      );
      return;
    case 'Restaurant':
      nav.navigate('Restaurant', restaurantRouteParams(screen));
      return;
    case 'Delivery':
      nav.navigate('Delivery');
      return;
    default:
      nav.navigate('Module', { screenId: screen, title });
  }
}
