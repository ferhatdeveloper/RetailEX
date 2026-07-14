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
  Customers: undefined;
  CustomerDetail: { customerId: string };
  Invoices: undefined;
  InvoiceDetail: { invoiceId: string };
  ReportSales: undefined;
  ReportStock: undefined;
  Beauty: undefined;
  Wms: undefined;
  Restaurant: undefined;
  Module: { screenId: string; title?: string };
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};
