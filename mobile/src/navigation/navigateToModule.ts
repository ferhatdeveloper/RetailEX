import { resolveInvoicesRouteParams } from '../api/invoiceFilters';
import { resolveLiveRoute } from '../config/menuConfig';
import type { MainStackParamList } from './types';

/** Tab/Stack composite — RN tip birleşimi gevşek tutulur */
type AnyNav = {
  navigate: (...args: never[]) => void;
};

export type BeautyRouteParams = NonNullable<MainStackParamList['Beauty']>;
export type RestaurantRouteParams = NonNullable<MainStackParamList['Restaurant']>;
export type SystemRouteParams = NonNullable<MainStackParamList['System']>;
export type ReportStockRouteParams = NonNullable<MainStackParamList['ReportStock']>;
export type StockMovementsRouteParams = NonNullable<MainStackParamList['StockMovements']>;
export type FinanceRouteParams = NonNullable<MainStackParamList['Finance']>;
export type CashCollectionRouteParams = NonNullable<MainStackParamList['CashCollection']>;
export type CommunicationsRouteParams = NonNullable<MainStackParamList['Communications']>;
export type StoreManagementRouteParams = NonNullable<MainStackParamList['StoreManagement']>;

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
    case 'beauty-sales':
      return { initialTab: 'sales' };
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
    case 'restaurant-schedule':
      return { initialTab: 'schedule' };
    case 'restaurant-kitchen':
      return { initialTab: 'kitchen' };
    default:
      return undefined;
  }
}

export type DeliveryRouteParams = NonNullable<MainStackParamList['Delivery']>;

/** Menü screen id → Delivery stack params */
export function deliveryRouteParams(screen: string): DeliveryRouteParams | undefined {
  switch (screen) {
    case 'delivery-live':
      return { initialTab: 'live' };
    case 'couriers':
      return { initialTab: 'couriers' };
    case 'logistics':
    case 'delivery-management':
    case 'delivery':
      return { initialTab: 'deliveries' };
    default:
      return undefined;
  }
}

/** Menü screen id → System stack params */
export function systemRouteParams(screen: string): SystemRouteParams {
  if (screen === 'hybrid-sync') {
    return { screenId: screen, initialTab: 'sync' };
  }
  return { screenId: screen };
}

/** Menü screen id → malzeme rapor modu */
export function reportStockRouteParams(screen: string): ReportStockRouteParams {
  switch (screen) {
    case 'report-min-max':
    case 'inventory':
      return { mode: 'min-max' };
    case 'report-material-value':
    case 'cost':
      return { mode: 'material-value' };
    case 'report-warehouse-status':
      return { mode: 'warehouse-status' };
    case 'report-material-extract':
      return { mode: 'material-extract' };
    case 'report-critical-stock':
    default:
      return { mode: 'critical' };
  }
}

/** Menü screen id → stok hareket fişi filtresi */
export function stockMovementsRouteParams(screen: string): StockMovementsRouteParams {
  switch (screen) {
    case 'stockmovements-deficit':
      return { filter: 'deficit' };
    case 'stockmovements-surplus':
      return { filter: 'surplus' };
    default:
      return { filter: 'all' };
  }
}

export type FinanceDefinitionsRouteParams = NonNullable<MainStackParamList['FinanceDefinitions']>;
export type MaterialDefinitionsRouteParams = NonNullable<MainStackParamList['MaterialDefinitions']>;
export type ProductionOpsRouteParams = NonNullable<MainStackParamList['ProductionOps']>;
export type ExcelOpsRouteParams = NonNullable<MainStackParamList['ExcelOps']>;
export type SystemExtrasRouteParams = NonNullable<MainStackParamList['SystemExtras']>;

/** Menü screen id → FinanceDefinitions stack params */
export function financeDefinitionsRouteParams(screen: string): FinanceDefinitionsRouteParams {
  return { screenId: screen };
}

/** Menü screen id → MaterialDefinitions stack params */
export function materialDefinitionsRouteParams(screen: string): MaterialDefinitionsRouteParams {
  return { screenId: screen };
}

/** Menü screen id → ProductionOps stack params */
export function productionOpsRouteParams(screen: string): ProductionOpsRouteParams {
  return { screenId: screen };
}

/** Menü screen id → ExcelOps stack params */
export function excelOpsRouteParams(screen: string): ExcelOpsRouteParams {
  return { screenId: screen };
}

/** Menü screen id → SystemExtras stack params */
export function systemExtrasRouteParams(screen: string): SystemExtrasRouteParams {
  return { screenId: screen };
}

/** Menü screen id → Finance stack params */
export function financeRouteParams(screen: string): FinanceRouteParams {
  switch (screen) {
    case 'banks':
    case 'bank-accounts':
    case 'bank-vouchers':
    case 'financereports-bank':
      return { initialTab: 'bank', screenId: screen };
    case 'virman':
      return { initialTab: 'cash', screenId: screen, openCreate: true, formMode: 'virman' };
    case 'bank-virman':
      return { initialTab: 'bank', screenId: screen, openCreate: true, formMode: 'virman' };
    case 'bank-havale':
    case 'havale':
      return { initialTab: 'bank', screenId: screen, openCreate: true, formMode: 'havale' };
    case 'cashbank':
    case 'kasalar':
    case 'cash-slips':
    case 'financereports-cash':
      return { initialTab: 'cash', screenId: screen };
    default:
      return { initialTab: 'cash', screenId: screen };
  }
}

/** Menü screen id → CashCollection stack params */
export function cashCollectionRouteParams(screen: string): CashCollectionRouteParams {
  return { openCreate: screen === 'collectionpayment' };
}

/** Menü screen id → Communications stack params */
export function communicationsRouteParams(screen: string): CommunicationsRouteParams {
  switch (screen) {
    case 'notifications':
    case 'smsmanage':
    case 'databroadcast':
      return { screenId: screen, initialTab: 'queue' };
    case 'whatsapp':
    case 'integrations':
      return { screenId: screen, initialTab: 'provider' };
    default:
      return { screenId: screen, initialTab: 'customers' };
  }
}

/** Menü screen id → StoreManagement stack params */
export function storeManagementRouteParams(screen: string): StoreManagementRouteParams {
  return {
    screenId: screen,
    groupByRegion: screen === 'regional',
  };
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
    case 'Invoices': {
      const inv = resolveInvoicesRouteParams(screen);
      nav.navigate('Invoices', {
        ...inv,
        kind:
          inv.filter?.preset === 'purchase'
            ? 'purchase'
            : inv.filter?.preset === 'sales'
              ? 'sales'
              : undefined,
      });
      return;
    }
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
      nav.navigate('ReportStock', reportStockRouteParams(screen));
      return;
    case 'ReportMizan':
      nav.navigate('ReportMizan');
      return;
    case 'ReportAging':
      nav.navigate('ReportAging');
      return;
    case 'ReportCariExtract':
      nav.navigate('ReportCariExtract');
      return;
    case 'ReportProductSales':
      nav.navigate('ReportProductSales');
      return;
    case 'ReportCash':
      nav.navigate('ReportCash');
      return;
    case 'StockMovements':
      nav.navigate('StockMovements', stockMovementsRouteParams(screen));
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
    case 'WmsTransfer':
      nav.navigate('WmsTransfer');
      return;
    case 'Restaurant':
      nav.navigate('Restaurant', restaurantRouteParams(screen));
      return;
    case 'Delivery':
      nav.navigate('Delivery', deliveryRouteParams(screen));
      return;
    case 'Finance':
      nav.navigate('Finance', financeRouteParams(screen));
      return;
    case 'FinanceDefinitions':
      nav.navigate('FinanceDefinitions', financeDefinitionsRouteParams(screen));
      return;
    case 'MaterialDefinitions':
      nav.navigate('MaterialDefinitions', materialDefinitionsRouteParams(screen));
      return;
    case 'ProductionOps':
      nav.navigate('ProductionOps', productionOpsRouteParams(screen));
      return;
    case 'MultiCurrency':
      nav.navigate('MultiCurrency');
      return;
    case 'ExcelOps':
      nav.navigate('ExcelOps', excelOpsRouteParams(screen));
      return;
    case 'MaterialLabelScan':
      nav.navigate('MaterialLabelScan');
      return;
    case 'SystemExtras':
      nav.navigate('SystemExtras', systemExtrasRouteParams(screen));
      return;
    case 'CashCollection':
      nav.navigate('CashCollection', cashCollectionRouteParams(screen));
      return;
    case 'CariDevir':
      nav.navigate('CariDevir');
      return;
    case 'Communications':
      nav.navigate('Communications', communicationsRouteParams(screen));
      return;
    case 'Notifications':
      nav.navigate('Notifications');
      return;
    case 'Pricing':
      nav.navigate('Pricing');
      return;
    case 'Campaigns':
      nav.navigate('Campaigns');
      return;
    case 'PrinterSettings':
      nav.navigate('PrinterSettings');
      return;
    case 'ScaleManagement':
      nav.navigate('ScaleManagement');
      return;
    case 'ScaleSale':
      nav.navigate('ScaleSale');
      return;
    case 'StoreManagement':
      nav.navigate('StoreManagement', storeManagementRouteParams(screen));
      return;
    case 'ETransform':
      nav.navigate('ETransform');
      return;
    case 'DocumentScan':
      nav.navigate('DocumentScan', { kind: 'purchase' });
      return;
    default:
      nav.navigate('Module', { screenId: screen, title });
  }
}
