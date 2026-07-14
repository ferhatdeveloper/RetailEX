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
  Invoices:
    | {
        filter?: import('../api/invoiceFilters').InvoiceListFilter;
        title?: string;
        kind?: import('../api/invoicesApi').InvoiceKind;
      }
    | undefined;
  InvoiceDetail: { invoiceId: string };
  InvoiceForm:
    | {
        invoiceId?: string;
        /**
         * sales | purchase | iade (3/6) |
         * service-given/received | waybill-* | order-* | quote
         */
        kind?: import('../api/invoicesApi').InvoiceFormKind;
        /** İrsaliye 12/13 vb. menü trcode override */
        trcode?: number;
      }
    | undefined;
  Campaigns: undefined;
  CampaignDetail: { campaignId: string };
  /** Yeni / düzenle kampanya */
  CampaignForm: { campaignId?: string } | undefined;
  /** Ürün fiyat listeleri (price_list_1…6, perakende, alış) */
  Pricing: undefined;
  ReportSales: undefined;
  ReportStock:
    | { mode?: 'critical' | 'min-max' | 'material-value' | 'warehouse-status' | 'material-extract' }
    | undefined;
  ReportMizan: undefined;
  /** Cari yaşlandırma — açık vade fişleri */
  ReportAging: undefined;
  ReportCariExtract: { accountId?: string; cardType?: 'customer' | 'supplier' } | undefined;
  ReportProductSales: undefined;
  ReportCash: undefined;
  StockMovements: { filter?: 'all' | 'deficit' | 'surplus' } | undefined;
  Beauty:
    | { initialTab?: 'appointments' | 'services' | 'specialists' | 'sales'; openCreate?: boolean }
    | undefined;
  Wms: undefined;
  WmsCount: { autoCreate?: boolean } | undefined;
  WmsCountSlip: { slipId: string };
  WmsTransfer: undefined;
  WmsTransferSlip: { transferId: string };
  /** WMS dalga toplama — dalga listesi */
  WmsWavePicking: undefined;
  /** WMS dalga toplama — görev yürütme */
  WmsWavePickingExecute: { waveId: string };
  Restaurant: { initialTab?: 'tables' | 'orders' } | undefined;
  /** Teslimat / kurye canlı konum */
  Delivery: undefined;
  /** Finans tanımları: ödeme planı, masraf merkezi, arama planı, gider */
  FinanceDefinitions: { screenId?: string } | undefined;
  /** Malzeme tanımları: sınıf, kategori, marka, birim seti, varyant, özel/grup kod */
  MaterialDefinitions: { screenId?: string } | undefined;
  MaterialDefinitionForm:
    | { kind?: 'brand' | 'category' | 'class' | 'unitset' | 'variant' | 'special' | 'group' }
    | undefined;
  /** Üretim reçeteleri + kasap üretim */
  ProductionOps: { screenId?: string } | undefined;
  /** Çoklu para birimi + kurlar */
  MultiCurrency: undefined;
  /** Excel işlemleri + akıllı malzeme ekleme */
  ExcelOps: { screenId?: string } | undefined;
  /** Fatura etiket şablonu + sanal santral Caller ID */
  SystemExtras: { screenId?: string } | undefined;
  /** Kasa / banka hareketleri */
  Finance:
    | {
        initialTab?: 'cash' | 'bank';
        screenId?: string;
        openCreate?: boolean;
        formMode?: 'in' | 'out' | 'virman' | 'bank_deposit' | 'bank_withdraw';
      }
    | undefined;
  /** Cari tahsilat / ödeme */
  CashCollection: { openCreate?: boolean; customerId?: string } | undefined;
  /** Cari devir / açılış bakiyesi fişi */
  CariDevir: undefined;
  /** Oturum içi firma / dönem / mağaza değişimi (login Organization ile aynı UI) */
  Organization: undefined;
  /** Sistem: kullanıcı / rol / log / kasa / şema */
  System:
    | { initialTab?: 'users' | 'roles' | 'logs' | 'devices' | 'sync' | 'backup'; screenId?: string }
    | undefined;
  /** Bildirim merkezi — kritik stok + vadesi geçmiş hatırlatmalar */
  Notifications: undefined;
  /** İletişim: mesaj kuyruğu / WhatsApp özeti */
  Communications:
    | { screenId?: string; initialTab?: 'customers' | 'queue' | 'provider' }
    | undefined;
  /** Mağaza paneli — canlı stores listesi */
  StoreManagement: { screenId?: string; groupByRegion?: boolean } | undefined;
  /** E-Dönüşüm — GİB e-belge kuyruğu okuma */
  ETransform: undefined;
  /** Yazıcı / fiş ayarları (yerel persist + test stub) */
  PrinterSettings: undefined;
  /** Terazi yönetimi (Rongta TCP / simüle / BT arayüzü) */
  ScaleManagement: undefined;
  /** Tartılı satış — kg ürün + tartım → POS fişi */
  ScaleSale: undefined;
  Module: { screenId: string; title?: string };
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};
