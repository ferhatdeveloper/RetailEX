import type { NavigatorScreenParams } from '@react-navigation/native';

export type PendingUser = {
  id: string;
  username: string;
  fullName: string;
  email?: string | null;
  roleName?: string | null;
  firmNr: string;
  periodNr: string;
  storeId?: string | null;
  storeName?: string | null;
};

export type AuthStackParamList = {
  Login: undefined;
  Config: undefined;
  Organization: {
    pendingUser: PendingUser;
    rememberMe?: boolean;
    offlineDemo?: boolean;
  };
};

export type MainTabParamList = {
  Dashboard: undefined;
  POS: undefined;
  Products: undefined;
  Reports: undefined;
  More: undefined;
};

export type MainStackParamList = {
  Tabs: NavigatorScreenParams<MainTabParamList> | undefined;
  Products: undefined;
  ProductDetail: { productId: string };
  ProductForm: { productId?: string } | undefined;
  Customers: undefined;
  CustomerDetail: { customerId: string };
  CustomerForm: { customerId?: string } | undefined;
  Invoices: undefined;
  InvoiceDetail: { invoiceId: string };
  InvoiceForm: { invoiceId?: string } | undefined;
  ReportSales: undefined;
  ReportStock: undefined;
  ReportMizan: undefined;
  ReportCariExtract: undefined;
  Beauty: { initialTab?: 'appointments' | 'services' | 'specialists'; openCreate?: boolean } | undefined;
  Wms: undefined;
  WmsCount: { autoCreate?: boolean } | undefined;
  WmsCountSlip: { slipId: string };
  Restaurant: { initialTab?: 'tables' | 'orders' } | undefined;
  /** Teslimat / kurye canlı konum */
  Delivery: undefined;
  /** Oturum içi firma / dönem / mağaza değişimi (login Organization ile aynı UI) */
  Organization: undefined;
  /** Sistem: kullanıcı / rol / log / kasa / şema */
  System:
    | { initialTab?: 'users' | 'roles' | 'logs' | 'devices' | 'backup'; screenId?: string }
    | undefined;
  Module: { screenId: string; title?: string };
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};
