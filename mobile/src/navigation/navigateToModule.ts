import { resolveLiveRoute } from '../config/menuConfig';

/** Tab/Stack composite — RN tip birleşimi gevşek tutulur */
type AnyNav = {
  navigate: (...args: never[]) => void;
};

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

  const live = resolveLiveRoute(screen);
  switch (live) {
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
    case 'Beauty':
      nav.navigate('Beauty');
      return;
    case 'Wms':
      nav.navigate('Wms');
      return;
    case 'Restaurant':
      nav.navigate('Restaurant');
      return;
    default:
      nav.navigate('Module', { screenId: screen, title });
  }
}
