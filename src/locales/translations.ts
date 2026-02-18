export type Language = 'tr' | 'en' | 'ar' | 'ku';

export interface Translations {
  // Header
  systemTitle: string;
  customer: string;
  selectCustomer: string;
  retailCustomer: string;
  cashier: string;
  changeCashier: string;
  changeLanguage: string;
  logout: string;

  // Product Grid
  searchProducts: string;
  searchPlaceholder: string;
  categories: string;
  allCategories: string;

  // Cart
  cart: string;
  emptyCart: string;
  product: string;
  quantity: string;
  price: string;
  total: string;
  rowOrder: string;
  productName: string;
  action: string;
  subtotal: string;
  discount: string;
  grandTotal: string;

  // Actions
  add: string;
  addToCart: string;
  remove: string;
  clear: string;
  save: string;
  cancel: string;
  complete: string;
  payment: string;
  search: string;
  close: string;

  // Numpad
  amount: string;
  piece: string;
  delete: string;
  enter: string;

  // Quick Actions
  campaign: string;
  category: string;
  productQuery: string;
  stockQuery: string;
  parkedReceipts: string;
  salesHistory: string;
  returnTransaction: string;
  return: string;
  scale: string;
  subtotalAction: string;
  receiptNote: string;
  barcode: string;
  quickProductAdd: string;
  shiftClick: string;
  receivePayment: string;
  sales: string;
  parkedReceiptsButton: string;
  parkReceipt: string;
  cancelReceipt: string;
  management: string;
  closeRegister: string;
  openRegister: string;
  customerInfo: string;
  cardNumber: string;

  // Footer
  receipt: string;
  store: string;
  cashRegister: string;
  shift: string;
  screenSettings: string;
  language: string;

  // WebSocket Status
  wsConnected: string;
  wsDisconnected: string;
  wsConnecting: string;

  // Store Info
  centralStore: string;
  dayShift: string;

  // Notifications
  productAdded: string;
  productRemoved: string;
  cartCleared: string;
  receiptParked: string;
  saleCompleted: string;
  error: string;

  // Payment Modal
  paymentTitle: string;
  discountOptional: string;
  percentage: string;
  enterDiscountPercentage: string;
  enterDiscountAmount: string;
  paymentSummary: string;
  subtotalLabel: string;
  amountToPay: string;
  paymentMethod: string;
  cashPayment: string;
  cashPaymentDescription: string;
  cardPayment: string;
  cardPaymentDescription: string;
  receivedAmount: string;
  enterReceivedCashAmount: string;
  fullAmount: string;
  completePayment: string;
  campaignDiscountLabel: string;
  campaignAppliedDescription: string;

  // Language Modal
  selectLanguage: string;
  turkish: string;
  english: string;
  arabic: string;
  kurdish: string;

  // Additional Labels
  campaignApplied: string;
  campaignRemoved: string;
  minimumAmountNotMet: string;
  campaignAutoApplied: string;
  scanToSearchPlaceholder: string;
  changeVariant: string;
  confirmItemDelete: string;
  yesDelete: string;
  barcodeSearchPlaceholder: string;

  // Customer Modal
  selectCustomerTitle: string;
  customerSearchPlaceholder: string;
  noCustomerSale: string;
  noCustomerSaleDescription: string;
  customerNotFound: string;
  newCustomer: string;
  individual: string;
  corporate: string;
  totalPurchases: string;
  lastPurchase: string;

  // Staff Modal
  selectStaffTitle: string;
  cashier1: string;
  cashier2: string;
  cashier3: string;
  manager: string;
  discountAuthority: string;
  errorFetchingUsers: string;
  welcome: string;
  invalidPassword: string;
  loginError: string;
  login: string;

  // MarketPOS
  phoneAddress: string;
  totalItems: string;
  applyDiscount: string;
  deleteBtn: string;
  cancelBtn: string;
  pieces: string;
  priceLabel: string;
  clearBtn: string;
  enterBtn: string;
  productCount: string;
  totalPieces: string;
  pcs: string;
  searchBtn: string;

  // Login Screen (Consolidated)
  storeSelection: string;
  username: string;
  usernamePlaceholder: string;
  password: string;
  connectionSettings: string;
  loginButton: string;

  // Campaign Modal
  selectCampaign: string;
  totalCampaigns: string;
  closeEsc: string;

  // Bottom Bar
  subtotalText: string;
  totalText: string;
  cashierLabel: string;

  // Parked Receipts Modal
  parkedReceiptsTitle: string;
  noParkedReceipts: string;
  noParkedReceiptsDescription: string;
  parkedAt: string;
  parkedBy: string;
  customerLabel: string;
  itemsCount: string;
  continueReceipt: string;
  deleteReceipt: string;
  confirmDelete: string;

  // Stock Query Modal
  productCatalog: string;
  productsCount: string;
  searchProductPlaceholder: string;
  gridView: string;
  listView: string;
  noProductsFound: string;
  changeSearchCriteria: string;
  productDetails: string;
  barcodeLabel: string;
  stockStatus: string;
  currentStock: string;
  unitLabel: string;
  outOfStock: string;
  criticalLevel: string;
  lowStock: string;
  sufficientStock: string;
  priceInfo: string;
  salePrice: string;
  costPrice: string;
  profitMargin: string;
  stockValue: string;
  costValue: string;
  saleValue: string;
  branchVariants: string;
  branchStocks: string;
  totalAllBranches: string;
  productLabel: string;
  categoryLabel: string;
  actionLabel: string;
  detailButton: string;
  addToCartButton: string;

  // Stock Query Specific
  grid: string;
  list: string;
  operation: string;
  unit: string;
  pricingInfo: string;
  cost: string;
  branchVariantStocks: string;

  // Return Modal
  returnCancelTitle: string;
  searchReceiptPlaceholder: string;
  noSalesFound: string;
  selectReceiptForReturn: string;
  returnProducts: string;
  salesQuantity: string;
  returnQuantity: string;
  allButton: string;
  returnReason: string;
  returnReasonPlaceholder: string;
  returnAmount: string;
  confirmReturn: string;
  productDefective: string;
  customerNotSatisfied: string;
  wrongProduct: string;
  sizeColorChange: string;
  otherReason: string;
  generalSale: string;
  receiptBased: string;
  productBased: string;
  searchProductByName: string;
  productsToReturn: string;
  selectedProducts: string;
  saleQuantity: string;
  unitPrice: string;
  all: string;
  explainReturnReason: string;
  selectProductForReturn: string;
  totalSale: string;
  differentReceipts: string;
  pleaseSelectReceipt: string;
  pleaseSelectReturnProducts: string;
  pleaseSelectReturnReason: string;
  pleaseExplainReturnReason: string;

  // Sales History Modal
  salesHistoryTitle: string;
  allSalesButton: string;
  todayButton: string;
  sevenDaysButton: string;
  thirtyDaysButton: string;
  noSalesHistory: string;
  salesWillAppearHere: string;
  cashierInfo: string;
  productsLabel: string;
  dateLabel: string;
  salesCount: string;
  totalSales: string;
  receiptNumberOrCustomerSearch: string;
  dateRange: string;
  startDate: string;
  endDate: string;
  noSalesRecordFound: string;
  cash: string;
  card: string;
  other: string;
  viewDetails: string;
  printReceipt: string;
  download: string;
  backToList: string;
  receiptDetails: string;
  lastReceipt: string;
  totalSalesCount: string;
  closeButton: string;

  // Language Selection Modal
  languageSelectionTitle: string;
  languageChangeInfo: string;
  textDirection: string;
  textDirectionOptional: string;

  // Keyboard Shortcuts
  keyboardShortcuts: string;
  pos: string;
  quick: string;
  navigation: string;
  productSearch: string;
  quickPayment: string;
  focusBarcodeInput: string;
  confirmBarcode: string;
  clearCart: string;
  openCashRegister: string;
  closeCashRegister: string;

  // Advanced Search
  voiceSearch: string;
  results: string;
  searching: string;

  // Accounting & Finance
  selectFirma: string;
  selectDonem: string;
  periodOpen: string;
  periodClosed: string;
  closedMonths: string;
  firma: string;
  donem: string;
  journalEntry: string;
  journalEntries: string;
  debit: string;
  credit: string;
  balance: string;
  trialBalance: string;
  accountCode: string;
  accountName: string;
  fiscalPeriod: string;
  fiscalYear: string;
  periodManagement: string;
  closeMonth: string;
  closePeriod: string;
  openNewPeriod: string;
  balanceSheet: string;
  incomeStatement: string;
  cashFlowStatement: string;
  financialStatements: string;
  profitLoss: string;
  assets: string;
  liabilities: string;
  equity: string;
  revenue: string;
  expenses: string;
  netIncome: string;
  grossProfit: string;
  operatingExpenses: string;
  tax: string;
  taxRate: string;
  corporateTax: string;
  incomeTax: string;
  withholdingTax: string;
  taxReport: string;
  chartOfAccounts: string;
  generalLedger: string;
  subsidiary: string;
  consolidatedReports: string;
  intercompanyEliminations: string;
  costOfGoodsSold: string;
  inventory: string;
  accountsReceivable: string;
  accountsPayable: string;
  bank: string;
  purchases: string;
  transfers: string;
  receipts: string;
  payments: string;
  voucher: string;
  voucherNo: string;
  voucherType: string;
  voucherDate: string;
  description: string;
  autoGenerated: string;
  manualEntry: string;
  approved: string;
  pending: string;
  rejected: string;
  posted: string;
  reversed: string;

  // MarketPOS Additional
  quantitySaved: string;
  quantitySavedMessage: string;
  pleaseEnterBarcode: string;
  pleaseEnterQuantityFirst: string;
  pleaseSelectVariant: string;
  barcodeNotFound: string;
  pleaseEnterBarcodeFirst: string;
  openCashRegisterToAddProduct: string;
  productAddedToCart: string;
  productRemovedFromCart: string;
  variantChanged: string;
  receiptCancelled: string;
  cartEmpty: string;
  clearCurrentCartFirst: string;
  parkedReceiptRetrieved: string;
  parkedReceiptDeleted: string;
  openCashRegisterToSell: string;
  discountApplied: string;
  quantitySavedBarcodeEnter: string;
  enterBarcode: string;
  automatic: string;
  discountLabel: string;
  keyboardShortcutsTitle: string;
  shortcuts: string;
  returnCompleted: string;
  productAssignedToSlot: string;
  cashHandedOver: string;
  cashHandedOverMessage: string;
  cashOpenedSuccessfully: string;
  cashOpenedMessage: string;
  defaultQuantity: string;
  zeroPlaceholder: string;
  pageRange: string;
  cashRegisterNumber: string;
  version: string;
  versionTitle: string;
  lastReceiptButton: string;
  systemAdministrator: string;
  administrator: string;
  quickProductPageSelect: string;
  enterNewPrice: string;
  clickToChangePrice: string;

  // Product Detail Modal
  productInfo: string;
  recentMovements: string;
  branchStockStatus: string;
  reserved: string;
  available: string;
  totalStock: string;
  incomingTransfer: string;
  outgoingTransfer: string;
  purchase: string;


  // Product Catalog Modal
  searchProductBarcodeCategory: string;
  detail: string;
  selectVariant: string;
  assignToSlot: string;
  variantAvailable: string;
  stock: string;
  selectVariantLabel: string;
  productSelection: string;
  quickProductSlot: string;



  // Open Cash Register Modal
  openCashRegisterProcess: string;
  cashHandoverAccept: string;
  numpad: string;
  cashHandoverAvailable: string;
  handoverFromCashier: string;
  handoverAmount: string;
  sessionInformation: string;
  banknoteCount: string;
  openingCashAmount: string;
  banknoteAndCoinCount: string;
  totalLabel: string;
  openingCashRegister: string;
  openingCashDescription: string;
  noteOptional: string;
  cashOpeningNotePlaceholder: string;
  zeroOpeningCashConfirm: string;

  // Close Cash Register Modal
  closeCashRegisterProcess: string;
  salesSummary: string;
  grossSales: string;
  returnTotal: string;
  netSales: string;
  paymentMethods: string;
  cashSales: string;
  creditCard: string;
  totalCollection: string;
  cashStatus: string;
  cardSales: string;
  expectedCash: string;
  countedCashAmount: string;
  cashCountExample: string;
  cashDifference: string;
  cashBalanced: string;
  excess: string;
  shortage: string;
  cashClosingNotePlaceholder: string;
  printReport: string;
  transferToOtherCashier: string;
  cashCountRequired: string;
  cashDifferenceConfirm: string;
  cashClosedSuccessfully: string;
  cashHandoverCountRequired: string;
  sessionDay: string;
  session: string;

  // Cancel Receipt Modal
  cancelReceiptTitle: string;
  customerChangedMind: string;
  wrongProductAdded: string;
  priceProblem: string;
  paymentFailed: string;
  systemError: string;
  explainCancelReason: string;
  cancelReasonPlaceholder: string;
  pleaseSelectCancelReason: string;
  pleaseExplainCancelReason: string;
  giveUp: string;
  // Error Boundary
  anErrorOccurred: string;
  unexpectedErrorEncountered: string;
  errorMessage: string;
  technicalDetails: string;
  technicalDetailsForDevelopers: string;
  refreshPage: string;
  goBack: string;
  helpMessage: string;

  // Main Layout
  posModule: string;
  managementModule: string;
  wmsModule: string;
  setDateTime: string;
  requiresAdminPassword: string;
  enterAdminPassword: string;
  managementPanelAccess: string;
  incorrectPassword: string;

  // Central Data Management
  centralDataManagementSystem: string;
  centralDataManagementSubtitle: string;
  backup: string;
  import: string;
  sending: string;
  sendNow: string;
  totalDevicesLabel: string;
  onlineDevicesLabel: string;
  pendingBroadcastsLabel: string;
  scheduledBroadcastsLabel: string;
  successRateLabel: string;
  last24hLabel: string;
  dataTransferLabel: string;
  sendDataTab: string;
  dataTypeLabel: string;

  // Login & System
  supportCenter: string;
  hwid: string;
  copy: string;
  copied: string;
  status: string;
  online: string;
  waiting: string;
  startSupport: string;
  closeWindow: string;
  systemLogsTitle: string;
  diagnosticsSubtitle: string;
  noLogsYet: string;
  totalEntries: string;
  enterUsernamePassword: string;
  step01Auth: string;
  step02Scope: string;
  rememberMe: string;
  firmSelectionScope: string;
  storeSelectionScope: string;
  selectFirmPrompt: string;
  editInfo: string;
  verifying: string;
  continue: string;
  systemLogin: string;
  invalidCredentials: string;
  loginFailed: string;
  networkError: string;
  systemLogs: string;
  factoryResetConfirm: string;
  resetFailed: string;
  selectSystemLanguage: string;
  remoteSupportRequestSent: string;
  remoteSupportWarning: string;
  confirmClearLogs: string;
  logAudit: string;
  systemHealth: string;


  // Menu translations
  menu: {
    [key: string]: string; // Allow all menu keys dynamically
  };
}

export const translations: Record<Language, Translations> = {
  tr: {
    // Header
    systemTitle: 'RetailEX ERP',
    customer: 'Müşteri',
    selectCustomer: 'Müşteri Seç',
    retailCustomer: 'Perakende Müşteri',
    cashier: 'Kasiyer',
    changeCashier: 'Kasiyer Değiştir',
    changeLanguage: 'Dil Değiştir',
    logout: 'Çıkış',

    // Product Grid
    searchProducts: 'Ürün Ara',
    searchPlaceholder: 'Ürün adı veya barkod...',
    categories: 'Kategoriler',
    allCategories: 'Tüm Kategoriler',

    // Cart
    cart: 'Sepet',
    emptyCart: 'Sepet Boş',
    product: 'Ürün',
    quantity: 'Miktar',
    price: 'Fiyat',
    total: 'Toplam',
    rowOrder: 'Sıra',
    productName: 'Ürün Adı',
    action: 'İşlem',
    subtotal: 'Ara Toplam',
    discount: 'İndirim',
    grandTotal: 'Genel Toplam',
    barcodeSearchPlaceholder: 'Barkod ya da Ürün Adı...',
    scanToSearchPlaceholder: 'Ürün aramak için tarayın...',
    changeVariant: 'Varyant Değiştir',
    confirmItemDelete: 'Bu öğeyi silmek istediğinize emin misiniz?',
    yesDelete: 'Evet, Sil',
    actionLabel: 'İşlem',
    logAudit: 'Kayıt/Denetim',
    systemHealth: 'Sistem Sağlığı',

    // Actions
    add: 'Ekle',
    addToCart: 'Sepete Ekle',
    remove: 'Çıkar',
    clear: 'Temizle',
    save: 'Kaydet',
    cancel: 'İptal',
    complete: 'Tamamla',
    payment: 'Ödeme',
    search: 'Ara',
    close: 'Kapat',

    // Numpad
    amount: 'Tutar',
    piece: 'Adet',
    delete: 'Sil',
    enter: 'Tamam',

    // Quick Actions
    campaign: 'Kampanya',
    category: 'Kategori',
    productQuery: 'Ürün Sorgu',
    stockQuery: 'Stok Sorgu',
    parkedReceipts: 'Bekleyen Fiş',
    salesHistory: 'Satış Geçmişi',
    returnTransaction: 'İade İşlemi',
    return: 'İade',
    scale: 'Terazi',
    subtotalAction: 'Ara Toplam',
    receiptNote: 'Fiş Notu',
    barcode: 'Barkod',
    quickProductAdd: 'Hızlı Ürün',
    shiftClick: 'Shift + Tıklama',
    receivePayment: 'Ödeme Al',
    sales: 'Satışlar',
    parkedReceiptsButton: 'Bekleyen',
    parkReceipt: 'Fişi Beklet',
    cancelReceipt: 'Fişi İptal',
    management: 'Yönetim',
    closeRegister: 'Kasa Kapat',
    openRegister: 'Kasa Aç',
    customerInfo: 'Müşteri Bilgisi',
    cardNumber: 'Kart No',

    // Footer
    receipt: 'Fiş',
    store: 'Mağaza',
    cashRegister: 'Kasa',
    shift: 'Vardiya',
    screenSettings: 'Ekran Ayarları',
    language: 'Dil',

    // WebSocket Status
    wsConnected: 'Bağlı',
    wsDisconnected: 'Bağlantı Yok',
    wsConnecting: 'Bağlanıyor',

    // Store Info
    centralStore: 'Merkez Mağaza',
    dayShift: 'Gündüz',

    // Notifications
    productAdded: 'Ürün sepete eklendi',
    productRemoved: 'Ürün sepetten çıkarıldı',
    cartCleared: 'Sepet temizlendi',
    receiptParked: 'Fiş bekletildi',
    saleCompleted: 'Satış tamamlandı',
    error: 'Hata',

    // Payment Modal
    paymentTitle: 'Ödeme İşlemi',
    discountOptional: 'İndirim (İsteğe Bağlı)',
    percentage: 'Yüzde',
    enterDiscountPercentage: 'İndirim yüzdesi girin',
    enterDiscountAmount: 'İndirim tutarı girin',
    paymentSummary: 'Ödeme Özeti',
    subtotalLabel: 'Ara Toplam',
    amountToPay: 'Ödenecek Tutar',
    paymentMethod: 'Ödeme Yöntemi',
    cashPayment: 'Nakit Ödeme',
    cashPaymentDescription: 'Nakit ile ödeme al',
    cardPayment: 'Kart ile Ödeme',
    cardPaymentDescription: 'Kredi/Banka kartı ile ödeme',
    receivedAmount: 'Alınan Tutar',
    enterReceivedCashAmount: 'Alınan nakit tutarı girin',
    fullAmount: 'Tam Tutar',
    completePayment: 'Ödemeyi Tamamla',
    campaignDiscountLabel: 'Kampanya İndirimi',
    campaignAppliedDescription: 'uygulandı',

    // Language Modal
    selectLanguage: 'Dil Seçin',
    turkish: 'Türkçe',
    english: 'English',
    arabic: 'العربية',
    kurdish: 'کوردی',

    // Additional Labels
    campaignApplied: 'Kampanya uygulandı',
    campaignRemoved: 'Kampanya kaldırıldı',
    minimumAmountNotMet: 'Minimum tutar karşılanmadı',
    campaignAutoApplied: 'Kampanya otomatik uygulandı',


    // Customer Modal
    selectCustomerTitle: 'Müşteri Seçin',
    customerSearchPlaceholder: 'Müşteri ara...',
    noCustomerSale: 'Müşterisiz Satış',
    noCustomerSaleDescription: 'Perakende satış yap',
    customerNotFound: 'Müşteri bulunamadı',
    newCustomer: 'Yeni Müşteri',
    individual: 'Bireysel',
    corporate: 'Kurumsal',
    totalPurchases: 'Toplam Alışveriş',
    lastPurchase: 'Son Alışveriş',

    // Staff Modal
    selectStaffTitle: 'Personel Seçin',
    cashier1: 'Kasiyer 1',
    cashier2: 'Kasiyer 2',
    cashier3: 'Kasiyer 3',
    manager: 'Yönetici',
    discountAuthority: 'İndirim yetkisi var',
    errorFetchingUsers: 'Kullanıcı listesi alınamadı',
    welcome: 'Hoş geldiniz',
    invalidPassword: 'Hatalı şifre',
    loginError: 'Giriş yapılırken hata oluştu',
    login: 'Giriş Yap',

    // MarketPOS
    phoneAddress: 'Tel / Adres',
    totalItems: 'Toplam Ürün',
    applyDiscount: 'İndirim Uygula',
    deleteBtn: 'Sil',
    cancelBtn: 'İptal',
    pieces: 'Adet',
    priceLabel: 'Fiyat',
    clearBtn: 'Temizle',
    enterBtn: 'Tamam',
    productCount: 'Ürün',
    totalPieces: 'Toplam Adet',
    pcs: 'ad',
    searchBtn: 'Ara',

    // Login Screen
    storeSelection: 'Mağaza Seçimi',
    username: 'Kullanıcı Adı',
    usernamePlaceholder: 'Kullanıcı adınızı girin',
    password: 'Şifre',
    rememberMe: 'Beni Hatırla',
    connectionSettings: 'Bağlantı Ayarları',
    loginButton: 'Giriş Yap',

    // Campaign Modal
    selectCampaign: 'Kampanya Seç',
    totalCampaigns: 'Toplam Kampanya',
    closeEsc: 'Kapatmak için ESC',

    // Bottom Bar
    subtotalText: 'ARA TOPLAM',
    totalText: 'TOPLAM',
    cashierLabel: 'Kasiyer',

    // Parked Receipts Modal
    parkedReceiptsTitle: 'Bekleyen Fişler',
    noParkedReceipts: 'Bekleyen fiş yok',
    noParkedReceiptsDescription: 'Bekletilen fişler burada görünecek',
    parkedAt: 'Bekletilme',
    parkedBy: 'Bekleyen',
    customerLabel: 'Müşteri',
    itemsCount: 'ürün',
    continueReceipt: 'Devam Et',
    deleteReceipt: 'Sil',
    confirmDelete: 'Silmek istediğinizden emin misiniz?',

    // Stock Query Modal
    productCatalog: 'Ürün Kataloğu',
    productsCount: 'ürün',
    searchProductPlaceholder: 'Ürün ara...',
    gridView: 'Grid',
    listView: 'Liste',
    noProductsFound: 'Ürün bulunamadı',
    changeSearchCriteria: 'Arama kriterlerinizi değiştirin',
    productDetails: 'Ürün Detayları',
    barcodeLabel: 'Barkod',
    stockStatus: 'Stok Durumu',
    currentStock: 'Mevcut Stok',
    unitLabel: 'Birim',
    outOfStock: 'Stokta Yok',
    criticalLevel: 'Kritik Seviye',
    lowStock: 'Düşük Stok',
    sufficientStock: 'Yeterli Stok',
    priceInfo: 'Fiyat Bilgisi',
    salePrice: 'Satış Fiyatı',
    costPrice: 'Alış Fiyatı',
    profitMargin: 'Kar Marjı',
    stockValue: 'Stok Değeri',
    costValue: 'Alış Değeri',
    saleValue: 'Satış Değeri',
    branchVariants: 'Şube Varyantları',
    totalLabel: 'Toplam',
    branchStocks: 'Şube Stokları',
    totalAllBranches: 'Tüm Şubeler Toplam',
    productLabel: 'Ürün',
    categoryLabel: 'Kategori',
    detailButton: 'Detay',
    addToCartButton: 'Sepete Ekle',

    // Stock Query Specific
    grid: 'Izgara',
    list: 'Liste',
    operation: 'İşlem',
    unit: 'Birim',
    pricingInfo: 'Fiyatlandırma Bilgisi',
    cost: 'Maliyet',
    branchVariantStocks: 'Şube Varyant Stokları',

    // Return Modal
    returnCancelTitle: 'İade / İptal İşlemi',
    searchReceiptPlaceholder: 'Fiş numarası veya barkod ara...',
    noSalesFound: 'Satış bulunamadı',
    selectReceiptForReturn: 'İade için fiş seçin',
    returnProducts: 'İade Edilecek Ürünler',
    salesQuantity: 'Satış Adedi',
    returnQuantity: 'İade Adedi',
    allButton: 'Tümü',
    returnReason: 'İade Nedeni',
    returnReasonPlaceholder: 'İade nedenini seçin...',
    returnAmount: 'İade Tutarı',
    confirmReturn: 'İadeyi Onayla',
    productDefective: 'Ürün Kusurlu',
    customerNotSatisfied: 'Müşteri Memnun Değil',
    wrongProduct: 'Yanlış Ürün',
    sizeColorChange: 'Beden/Renk Değişimi',
    otherReason: 'Diğer Nedenler',
    generalSale: 'Genel Satış',

    // Sales History Modal
    salesHistoryTitle: 'Satış Geçmişi',
    allSalesButton: 'Tüm Satışlar',
    todayButton: 'Bugün',
    sevenDaysButton: '7 Gün',
    thirtyDaysButton: '30 Gün',
    noSalesHistory: 'Satış geçmişi yok',
    salesCount: 'satış',
    totalSales: 'Toplam',
    receiptNumberOrCustomerSearch: 'Fiş no veya müşteri adı ile ara...',
    dateRange: 'Tarih Aralığı',
    startDate: 'Başlangıç:',
    endDate: 'Bitiş:',

    noSalesRecordFound: 'Satış kaydı bulunamadı',
    cash: 'Nakit',
    card: 'Kart',
    other: 'Diğer',

    viewDetails: 'Detayları Gör',
    printReceipt: 'Fiş Yazdır',
    download: 'İndir',
    backToList: 'Listeye Dön',
    receiptDetails: 'Fiş Detayları',
    lastReceipt: 'Son Fiş',
    totalSalesCount: 'Toplam',
    salesWillAppearHere: 'Tamamlanan satışlar burada görünecek',
    cashierInfo: 'Kasiyer',
    productsLabel: 'Ürün',
    dateLabel: 'Tarih',
    closeButton: 'Kapat',

    // Language Selection Modal
    languageSelectionTitle: 'Dil Seçimi',
    languageChangeInfo: 'Dil değişikliği tüm ekranları etkiler ve otomatik olarak kaydedilir.',
    textDirection: 'Metin Yönü',
    textDirectionOptional: 'Metin Yönü (İsteğe Bağlı)',

    // Keyboard Shortcuts
    keyboardShortcuts: 'Klavye Kısayolları',
    pos: 'POS İşlemleri',
    quick: 'Hızlı Aksiyonlar',
    navigation: 'Navigasyon',
    productSearch: 'Ürün Ara',
    quickPayment: 'Hızlı Ödeme',
    focusBarcodeInput: 'Barkod Alanına Odaklan',
    confirmBarcode: 'Barkod Onayla',
    clearCart: 'Sepeti Temizle',
    openCashRegister: 'Kasa Aç',
    closeCashRegister: 'Kasa Kapat',

    // Advanced Search
    voiceSearch: 'Sesli Arama',
    results: 'sonuç',
    searching: 'Aranıyor...',

    // Accounting & Finance
    selectFirma: 'Firma Seçin',
    selectDonem: 'Dönem Seçin',
    periodOpen: 'Açık Periyot',
    periodClosed: 'Kapalı Periyot',
    closedMonths: 'Kapalı Aylar',
    firma: 'Firma',
    donem: 'Dönem',
    journalEntry: 'Jurnal Girişi',
    journalEntries: 'Jurnal Girişleri',
    debit: 'Borç',
    credit: 'Alacak',
    balance: 'Bakiye',
    trialBalance: 'Deneme Bakiyesi',
    accountCode: 'Hesap Kodu',
    accountName: 'Hesap Adı',
    fiscalPeriod: 'Mali Periyot',
    fiscalYear: 'Mali Yıl',
    periodManagement: 'Periyot Yönetimi',
    closeMonth: 'Ayı Kapat',
    closePeriod: 'Periyodu Kapat',
    openNewPeriod: 'Yeni Periyot Aç',
    balanceSheet: 'Denge Tablosu',
    incomeStatement: 'Gelir Tablosu',
    cashFlowStatement: 'Nakit Akış Tablosu',
    financialStatements: 'Mali Durum Tabloları',
    profitLoss: 'Kar-Zarar',
    assets: 'Varlıklar',
    liabilities: 'Yükümlülükler',
    equity: 'Mülkiyet',
    revenue: 'Gelir',
    expenses: 'Giderler',
    netIncome: 'Net Gelir',
    grossProfit: 'Brüt Kar',
    operatingExpenses: 'İşletme Giderleri',
    tax: 'Vergi',
    taxRate: 'Vergi Oranı',
    corporateTax: 'Kurumsal Vergi',
    incomeTax: 'Gelir Vergisi',
    withholdingTax: 'Tahsilat Vergisi',
    taxReport: 'Vergi Raporu',
    chartOfAccounts: 'Hesap Kartı',
    generalLedger: 'Genel Defter',
    subsidiary: 'Alt Şirket',
    consolidatedReports: 'Birleştirilmiş Raporlar',
    intercompanyEliminations: 'Şirketler Arası İptaller',
    costOfGoodsSold: 'Satılan Ürün Maliyeti',
    inventory: 'Envanter',
    accountsReceivable: 'Alacaklar',
    accountsPayable: 'Borçlar',

    bank: 'Banka',
    purchases: 'Alışlar',
    transfers: 'Transferler',
    receipts: 'Makbuzlar',
    payments: 'Ödemeler',
    voucher: 'Senet',
    voucherNo: 'Senet No',
    voucherType: 'Senet Tipi',
    voucherDate: 'Senet Tarihi',
    description: 'Açıklama',
    autoGenerated: 'Otomatik Oluşturuldu',
    manualEntry: 'El ile Girişi',
    approved: 'Onaylandı',
    pending: 'Bekliyor',
    rejected: 'Reddedildi',
    posted: 'Yayınlandı',
    reversed: 'Ters çevrildi',

    // MarketPOS Additional
    quantitySaved: 'Adet kaydedildi',
    quantitySavedMessage: 'Adet kaydedildi: {quantity}. Şimdi barkod girin.',
    pleaseEnterBarcode: 'Lütfen barkod girin',
    pleaseEnterQuantityFirst: 'Lütfen önce adet girin, sonra * tuşuna basın',
    pleaseSelectVariant: 'Lütfen varyant seçin',
    barcodeNotFound: 'Barkod bulunamadı',
    pleaseEnterBarcodeFirst: 'Lütfen önce barkod girin',
    openCashRegisterToAddProduct: 'Ürün ekleyebilmek için önce kasayı açmalısınız!',
    productAddedToCart: '{productName} sepete eklendi',
    productRemovedFromCart: 'Ürün sepetten çıkarıldı',
    variantChanged: 'Varyant değiştirildi: {variant}',
    receiptCancelled: 'Fiş iptal edildi: {reason}',
    cartEmpty: 'Sepet boş',
    clearCurrentCartFirst: 'Önce mevcut sepeti temizleyin',
    parkedReceiptRetrieved: 'Bekleyen fiş getirildi',
    parkedReceiptDeleted: 'Bekleyen fiş silindi',
    openCashRegisterToSell: 'Satış yapabilmek için önce kasayı açmalısınız!',
    discountApplied: '%{percent} indirim uygulandı',
    quantitySavedBarcodeEnter: 'Adet: {quantity} - Barkod girin',
    enterBarcode: 'Barkod girin...',
    automatic: '(Otomatik)',
    discountLabel: 'İndirim:',
    keyboardShortcutsTitle: 'Klavye Kısayolları (Press ?)',
    shortcuts: 'Kısayollar',
    returnCompleted: 'İade işlemi tamamlandı',
    productAssignedToSlot: '{productName} Slot #{slotNumber}\'e atandı',
    cashHandedOver: 'Kasa {staff} kasiyerine devredildi',
    cashHandedOverMessage: 'Kasa {staff} kasiyerine devredildi.\n\nDevir Tutarı: {amount}\n\n{staff} kasa açarken devri onaylamalıdır.',
    cashOpenedSuccessfully: 'Kasa başarıyla açıldı!',
    cashOpenedMessage: 'Kasa başarıyla açıldı!\n\nAçılış Kasası: {amount}\nKasiyer: {staff}',
    defaultQuantity: '1x',
    zeroPlaceholder: '0',
    pageRange: '{start}-{end}',
    cashRegisterNumber: 'KASA-91',
    version: 'v1.0',
    versionTitle: 'Versiyon: v1.0',


    // Open Cash Register Modal
    openCashRegisterProcess: 'Kasa Açma İşlemi',
    cashHandoverAccept: 'Para Devri Kabul',
    numpad: 'Numpad',
    cashHandoverAvailable: 'Para Devri Mevcut',
    handoverFromCashier: 'Devreden Kasiyer:',
    handoverAmount: 'Devir Tutarı:',
    sessionInformation: 'Oturum Bilgileri',




    banknoteCount: 'Banknot Sayısı',
    openingCashAmount: 'Açılış Nakit Tutarı',
    banknoteAndCoinCount: 'Banknot ve Madeni Para Sayımı',
    openingCashRegister: 'KASA AÇILIŞI:',

    openingCashDescription: 'Bu tutar oturum boyunca açılış kasası olarak kullanılacaktır',
    noteOptional: 'Not (İsteğe Bağlı)',
    cashOpeningNotePlaceholder: 'Kasa açılışı ile ilgili notlarınızı yazın...',
    zeroOpeningCashConfirm: 'Açılış kasası 0.00 olarak girilecek. Devam etmek istiyor musunuz?',
    administrator: 'Yönetici',
    lastReceiptButton: 'Son Fiş',
    systemAdministrator: 'Sistem Yöneticisi',

    quickProductPageSelect: 'Hızlı Ürün Sayfası Seç',
    enterNewPrice: 'Yeni Fiyat Girin',
    clickToChangePrice: 'Fiyatı Değiştirmek İçin Tıklayın',

    // Product Detail Modal
    productInfo: 'Ürün Bilgileri',
    recentMovements: 'Son Hareketler',
    branchStockStatus: 'Şube Stok Durumu',
    reserved: 'Rezerve',
    available: 'Kullanılabilir',
    totalStock: 'Toplam Stok',
    incomingTransfer: 'Transfer Gelen',
    outgoingTransfer: 'Transfer Giden',
    purchase: 'Alış',

    // Cancel Receipt Modal
    cancelReceiptTitle: 'Fiş İptal - Neden Seçin',
    customerChangedMind: 'Müşteri vazgeçti',
    wrongProductAdded: 'Yanlış ürün eklendi',
    priceProblem: 'Fiyat problemi',
    paymentFailed: 'Ödeme yapılamadı',
    systemError: 'Sistem hatası',
    explainCancelReason: 'İptal Nedenini Açıklayın',
    cancelReasonPlaceholder: 'İptal nedenini yazın...',
    pleaseSelectCancelReason: 'Lütfen iptal nedeni seçin!',
    pleaseExplainCancelReason: 'Lütfen iptal nedenini açıklayın!',
    giveUp: 'Vazgeç',

    // Return Modal
    receiptBased: 'Fatura Bazında',
    productBased: 'Ürün Bazında',
    searchProductByName: 'Ürün adı ile ara...',

    productsToReturn: 'İade Edilecek Ürünler',
    selectedProducts: 'Seçilen Ürünler',
    saleQuantity: 'Satış miktarı',
    unitPrice: 'Birim fiyat',

    all: 'Tümü',

    explainReturnReason: 'İade nedenini açıklayın...',



    selectProductForReturn: 'İade için ürün seçin',
    totalSale: 'Toplam satış',

    differentReceipts: 'farklı fiş',
    pleaseSelectReceipt: 'Lütfen bir fiş seçin!',
    pleaseSelectReturnProducts: 'Lütfen iade edilecek ürünleri seçin!',
    pleaseSelectReturnReason: 'Lütfen iade nedeni seçin!',
    pleaseExplainReturnReason: 'Lütfen iade nedenini açıklayın!',





    // Product Catalog Modal
    searchProductBarcodeCategory: 'Ürün adı, barkod veya kategori ara...',
    detail: 'Detay',
    selectVariant: 'Varyant Seç',
    assignToSlot: 'Slota Ata',
    variantAvailable: 'Varyant Mevcut',
    stock: 'Stok',
    selectVariantLabel: 'Varyant Seçin:',
    productSelection: 'Ürün Seçimi',
    quickProductSlot: 'Hızlı Ürün Slot',


    // Error Boundary
    anErrorOccurred: 'Bir Hata Oluştu',
    unexpectedErrorEncountered: 'Beklenmeyen bir hata ile karşılaşıldı',
    errorMessage: 'Hata Mesajı',
    technicalDetails: 'Teknik Detaylar',
    technicalDetailsForDevelopers: 'Teknik Detaylar (Geliştiriciler için)',
    refreshPage: 'Sayfayı Yenile',
    goBack: 'Geri Dön',
    helpMessage: 'Bu hata devam ederse, lütfen tarayıcı konsolunu (F12) kontrol edin ve teknik destek ekibiyle iletişime geçin.',



    // Close Cash Register Modal
    closeCashRegisterProcess: 'Kasa Kapatma İşlemi',
    salesSummary: 'Satış Özeti',
    grossSales: 'Brüt Satışlar',
    returnTotal: 'İade Toplamı',
    netSales: 'Net Satışlar',
    paymentMethods: 'Ödeme Yöntemleri',
    cashSales: 'Nakit Satışlar',
    creditCard: 'Kredi Kartı',
    totalCollection: 'Toplam Tahsilat',
    cashStatus: 'Nakit Durumu',
    cardSales: 'Kart Satışları',
    expectedCash: 'Beklenen Nakit',
    countedCashAmount: 'Sayılan Nakit',
    cashCountExample: 'Örn: 1000.00',
    cashDifference: 'Nakit Farkı',
    cashBalanced: 'Kasa Denk',
    excess: 'Fazla',
    shortage: 'Eksik',
    cashClosingNotePlaceholder: 'Kasa kapanışı ile ilgili notlarınızı yazın...',
    printReport: 'Rapor Yazdır',
    transferToOtherCashier: 'Başka Kasiyere Devret',
    cashCountRequired: 'Lütfen sayılan nakit tutarını girin!',
    cashDifferenceConfirm: 'Kasa farkı var. Devam etmek istiyor musunuz?',
    cashClosedSuccessfully: 'Kasa başarıyla kapatıldı!',
    cashHandoverCountRequired: 'Devredilecek tutarı giriniz!',
    sessionDay: 'Gün',
    session: 'Oturum',

    menu: {
      materialManagement: "Malzeme Yönetimi",
      masterRecords: "Ana Kayıtlar",
      materialClasses: "Malzeme Sınıfları",
      materials: "Malzemeler",
      unitSets: "Birim Setleri",
      variants: "Varyantlar",
      specialCodes: "Özel Kodlar",
      brandDefinitions: "Marka Tanımları",
      groupCodes: "Grup Kodları",
      productCategories: "Ürün Kategorileri",
      movements: "Hareketler",
      stockManagementPanel: "Stok Yönetim Paneli",
      materialManagementSlips: "Malzeme Yönetim Fişleri",
      reports: "Raporlar",
      materialExtract: "Malzeme Ekstresi",
      materialValue: "Malzeme Değer",
      inventory: "Envanter",
      cost: "Maliyet",
      inOutTotals: "Giriş Çıkış Toplamları",
      materialWarehouseStatus: "Malzeme Ambar Durum",
      transactionBreakdown: "Hareket Dökümü",
      slipList: "Fiş Listesi",
      minMaxStock: "Minimum Maksimum Stok",
      mainMenu: "Ana Menü",
      homepage: "Anasayfa",
      dashboard: "Dashboard",
      storeManagement: "Mağaza Yönetimi",
      storePanel: "Mağaza Paneli",
      storeTransfer: "Mağaza Transferi",
      multiStoreManagement: "Çoklu Mağaza Yönetimi",
      regionalFranchiseManagement: "Bölgesel Bayilik Yönetimi",
      storeConfiguration: "Mağaza Yapılandırması",
      dataBroadcast: "Bilgi Gönder/Al",
      integrations: "Entegrasyonlar",
      excelOperations: "Excel İşlemleri",
      invoices: "Faturalar",
      salesInvoices: "Satış Faturaları",
      salesInvoice: "Toptan Satış Faturası",
      retailSales: "Perakende Satış",
      wholesaleSales: "Toptan Satış",
      consignmentSales: "Konsinye Satış",
      salesReturn: "Satış İade",
      purchasing: "Satın Alma",
      requestSlips: "Talep Fişleri",
      purchaseOrders: "Satınalma Siparişleri",
      purchaseInvoice: "Alış Faturası",
      purchaseReturn: "Alış İade",
      receivedService: "Alınan Hizmet",
      serviceInvoices: "Hizmet Faturaları",
      supplierCards: "Tedarikçi Kartları",
      serviceInvoiceIssued: "Verilen Hizmet Faturası",
      serviceInvoiceReceived: "Alınan Hizmet Faturası",
      waybills: "İrsaliyeler",
      salesWaybill: "Satış İrsaliyesi",
      purchaseWaybill: "Alış İrsaliyesi",
      warehouseTransferWaybill: "Depo Transfer İrsaliyesi",
      wasteWaybill: "Fire İrsaliyesi",
      orders: "Siparişler",
      salesOrder: "Satış Siparişi",
      offers: "Teklifler",
      financeManagement: "Finans Yönetimi",
      definitions: "Tanımlar",
      paymentPlans: "Ödeme Planları",
      bankPaymentPlans: "Banka Ödeme Planları",
      campaignDefinitions: "Kampanya Tanımları",
      cards: "Kartlar",
      currentAccounts: "Cari Hesaplar",
      cashAccounts: "Kasa Hesapları",
      banks: "Bankalar",
      bankAccounts: "Banka Hesapları",
      currentAccountSlips: "Cari Hesap Fişleri",
      cashOperations: "Kasa İşlemleri",
      cashSlips: "Kasa Fişleri",
      bankSlips: "Banka Fişleri",
      creditCardPosSlips: "Kredi Kartı Pos Fişleri",
      journalAndSlips: "Yevmiye Defteri & Fişler",
      currentAccountReports: "Cari Hesap Raporları",
      cashReports: "Kasa Raporları",
      bankReports: "Banka Raporları",
      trialBalanceReport: "Mizan Raporu",
      other: "Diğer",
      accountingManagement: "Muhasebe Yönetimi",
      expenseManagement: "Gider Yönetimi",
      checkPromissory: "Çek/Senet",
      collectionPayment: "Tahsilat/Ödeme",
      multiCurrency: "Çoklu Para Birimi",
      accountingVouchers: "Muhasebe Fişleri",
      retail: "Retail",
      priceAndCampaign: "Fiyat & Kampanya",
      scaleAndWeighedSales: "Terazi & Tartılı Satış",
      communicationAndNotifications: "İletişim & Bildirimler",
      whatsappIntegration: "WhatsApp Entegrasyonu",
      notificationCenter: "Bildirim Merkezi",
      smsManagement: "SMS Yönetimi",
      emailCampaigns: "E-posta Kampanyaları",
      reportsAndAnalysis: "Raporlar & Analiz",
      aiProductAnalytics: "AI Ürün Analitiği",
      advancedReports100: "⭐ Gelişmiş Raporlar (100+)",
      profitabilityAnalyticsDashboard: "💰 Karlılık Analizi Dashboard",
      salesReports: "Satış Raporları",
      stockReports: "Stok Raporları",
      trialBalance: "Mizan (Trial Balance)",
      incomeStatement: "Gelir Tablosu (Income Statement)",
      customerAnalysis: "Müşteri Analizi",
      balanceSheet: "Bilanço (Balance Sheet)",
      graphicalAnalysis: "Grafiksel Analiz",
      customReports: "Özel Raporlar",
      biDashboardAi: "BI Dashboard & AI",
      systemManagement: "Sistem Yönetimi",
      firmPeriodDefinitions: "Firma/Dönem Tanımları",
      workflowAutomation: "Workflow Otomasyonu",
      demoDataManagement: "Demo Veri Yönetimi",
      databaseInfrastructure: "Database Altyapısı",
      exSecureGateSecurity: "ExSecureGate (Güvenlik)",
      generalSettings: "Genel Ayarlar",
      userManagement: "Kullanıcı Yönetimi",
      roleAndAuthorization: "Rol & Yetkilendirme",
      menuManagement: "Menü Yönetimi",
      definitionsParameters: "Tanımlar/Parametreler",
      backupRestore: "Yedekleme/Geri Yükleme",
      logAudit: "Log/Denetim",
      systemHealth: "Sistem Sağlığı"
    },
    // Main Layout (Lines 500-509)
    posModule: 'Satış',
    managementModule: 'Yönetim',
    wmsModule: 'WMS',
    setDateTime: 'Tarih ve Saat Ayarla',
    requiresAdminPassword: 'Bu işlem yönetici yetkisi gerektirir. Tarih değişikliği satış kayıtlarını etkileyebilir.',
    enterAdminPassword: 'Yönetici şifresini girin',
    managementPanelAccess: 'Yönetim Paneli Erişimi',
    incorrectPassword: 'Hatalı şifre!',

    // Central Data Management (Lines 511-526)
    centralDataManagementSystem: 'Merkezi Veri Yönetim Sistemi',
    centralDataManagementSubtitle: 'Enterprise Senkronizasyon ve Broadcast Yönetimi v2.0',
    backup: 'Yedekle',
    import: 'İçe Aktar',
    sending: 'Gönderiliyor...',
    sendNow: 'Şimdi Gönder',
    totalDevicesLabel: 'Toplam Cihaz',
    onlineDevicesLabel: 'Çevrimiçi',
    pendingBroadcastsLabel: 'Bekleyen',
    scheduledBroadcastsLabel: 'Zamanlanmış',
    successRateLabel: 'Başarı Oranı',
    last24hLabel: '24 Saat',
    dataTransferLabel: 'Veri Transfer',
    sendDataTab: 'Veri Gönder',
    dataTypeLabel: 'Veri Tipi',

    // Login & System (Lines 528-556)
    supportCenter: 'Destek Merkezi',
    hwid: 'Cihaz Kimliği (HWID)',
    copy: 'Kopyala',
    copied: 'Kopyalandı',
    status: 'Durum',
    online: 'Çevrimiçi',
    waiting: 'Bekleniyor',
    startSupport: 'Destek Başlat',
    closeWindow: 'Pencereyi Kapat',
    systemLogsTitle: 'SİSTEM GÜNLÜKLERİ',
    diagnosticsSubtitle: 'Gerçek Zamanlı Teşhis ve Denetim',
    noLogsYet: 'HENÜZ KAYIT BULUNMUYOR',
    totalEntries: 'Toplam Kayıt',
    enterUsernamePassword: 'Lütfen kullanıcı adı ve şifre giriniz.',
    step01Auth: 'Adım 01 / Kimlik Doğrulama',
    step02Scope: 'Adım 02 / Kapsam',
    systemLogs: 'Sistem Kayıtları',
    firmSelectionScope: 'Firma Seçimi / FIRM',
    storeSelectionScope: 'Şube Seçimi / STORE',
    selectFirmPrompt: 'Firma Seçiniz',
    editInfo: 'BİLGİLERİ DÜZENLE',
    verifying: 'DOĞRULANIYOR...',
    continue: 'DEVAM ET',
    systemLogin: 'SİSTEME GİRİŞ YAP',
    invalidCredentials: 'Kullanıcı adı veya şifre hatalı',
    loginFailed: 'Giriş başarısız.',
    networkError: 'Bir ağ hatası oluştu.',
    factoryResetConfirm: 'Tebrikler: Uygulama fabrika ayarlarına döndürülecek!\n\n- Tüm yerel ayarlar silinecek.\n- Kurulum sihirbazı tekrar açılacak.\n- Veritabanı verileri korunacaktır.\n\nİşlemi onaylıyor musunuz?',
    resetFailed: 'Sıfırlama başarısız:',
    selectSystemLanguage: 'Sistem Dilini Seçin',
    remoteSupportRequestSent: 'Hızlı destek talebi merkeze iletildi.',
    remoteSupportWarning: 'Uyarı: Uzaktan destek başlatıldığında, teknik ekibe sınırlı erişim yetkisi vermiş olursunuz.',
    confirmClearLogs: 'Tüm kayıtlar temizlenecektir. Emin misiniz?',
  },
  en: {
    // Header
    systemTitle: 'RetailEX ERP',
    customer: 'Customer',
    selectCustomer: 'Select Customer',
    retailCustomer: 'Retail Customer',
    cashier: 'Cashier',
    changeCashier: 'Change Cashier',
    changeLanguage: 'Change Language',
    logout: 'Logout',

    // Product Grid
    searchProducts: 'Search Products',
    searchPlaceholder: 'Product name or barcode...',
    categories: 'Categories',
    allCategories: 'All Categories',

    // Cart
    cart: 'Cart',
    emptyCart: 'Cart Empty',
    product: 'Product',
    quantity: 'Quantity',
    price: 'Price',
    total: 'Total',
    rowOrder: 'Order',
    productName: 'Product Name',
    action: 'Action',
    subtotal: 'Subtotal',
    discount: 'Discount',
    grandTotal: 'Grand Total',

    // Actions
    add: 'Add',
    addToCart: 'Add to Cart',
    remove: 'Remove',
    clear: 'Clear',
    save: 'Save',
    cancel: 'Cancel',
    complete: 'Complete',
    payment: 'Payment',
    search: 'Search',
    close: 'Close',

    // Numpad
    amount: 'Amount',
    piece: 'Piece',
    delete: 'Delete',
    enter: 'OK',

    // Quick Actions
    campaign: 'Campaign',
    category: 'Category',
    productQuery: 'Product Query',
    stockQuery: 'Stock Query',
    parkedReceipts: 'Parked Receipt',
    salesHistory: 'Sales History',
    returnTransaction: 'Return',
    return: 'Return',
    scale: 'Scale',
    subtotalAction: 'Subtotal',
    receiptNote: 'Receipt Note',
    barcode: 'Barcode',
    quickProductAdd: 'Quick Product',
    shiftClick: 'Shift + Click',
    receivePayment: 'Receive Payment',
    sales: 'Sales',
    parkedReceiptsButton: 'Parked',
    parkReceipt: 'Park Receipt',
    cancelReceipt: 'Cancel Receipt',
    management: 'Management',
    closeRegister: 'Close Register',
    openRegister: 'Open Register',
    customerInfo: 'Customer Info',
    cardNumber: 'Card No',

    // Footer
    receipt: 'Receipt',
    store: 'Store',
    cashRegister: 'Register',
    shift: 'Shift',
    screenSettings: 'Screen Settings',
    language: 'Language',

    // WebSocket Status
    wsConnected: 'Connected',
    wsDisconnected: 'Disconnected',
    wsConnecting: 'Connecting',

    // Store Info
    centralStore: 'Central Store',
    dayShift: 'Day',

    // Notifications
    productAdded: 'Product added to cart',
    productRemoved: 'Product removed from cart',
    cartCleared: 'Cart cleared',
    receiptParked: 'Receipt parked',
    saleCompleted: 'Sale completed',
    error: 'Error',

    // Payment Modal
    paymentTitle: 'Payment',
    discountOptional: 'Discount (Optional)',
    percentage: 'Percentage',
    enterDiscountPercentage: 'Enter discount percentage',
    enterDiscountAmount: 'Enter discount amount',
    paymentSummary: 'Payment Summary',
    subtotalLabel: 'Subtotal',
    amountToPay: 'Amount to Pay',
    paymentMethod: 'Payment Method',
    cashPayment: 'Cash Payment',
    cashPaymentDescription: 'Pay with cash',
    cardPayment: 'Card Payment',
    cardPaymentDescription: 'Pay with credit/debit card',
    receivedAmount: 'Received Amount',
    enterReceivedCashAmount: 'Enter received cash amount',
    fullAmount: 'Full Amount',
    completePayment: 'Complete Payment',
    campaignDiscountLabel: 'Campaign Discount',
    campaignAppliedDescription: 'applied',

    // Main Layout (Lines 500-509)
    posModule: 'Sales',
    managementModule: 'Management',
    wmsModule: 'WMS',
    setDateTime: 'Set Date and Time',
    requiresAdminPassword: 'This action requires admin privileges. Date changes may affect sales records.',
    enterAdminPassword: 'Enter admin password',
    managementPanelAccess: 'Management Panel Access',
    incorrectPassword: 'Incorrect password!',
    rememberMe: 'Remember Me',

    // Central Data Management (Lines 511-526)
    centralDataManagementSystem: 'Central Data Management System',
    centralDataManagementSubtitle: 'Enterprise Sync and Broadcast Management v2.0',
    backup: 'Backup',
    import: 'Import',
    sending: 'Sending...',
    sendNow: 'Send Now',
    totalDevicesLabel: 'Total Devices',
    onlineDevicesLabel: 'Online',
    pendingBroadcastsLabel: 'Pending',
    scheduledBroadcastsLabel: 'Scheduled',
    successRateLabel: 'Success Rate',
    last24hLabel: '24 Hours',
    dataTransferLabel: 'Data Transfer',
    sendDataTab: 'Send Data',
    dataTypeLabel: 'Data Type',

    // Login & System (Lines 528-556)
    supportCenter: 'Support Center',
    hwid: 'Hardware ID (HWID)',
    copy: 'Copy',
    copied: 'Copied',
    status: 'Status',
    online: 'Online',
    waiting: 'Waiting',
    startSupport: 'Start Support',
    closeWindow: 'Close Window',
    systemLogsTitle: 'SYSTEM LOGS',
    diagnosticsSubtitle: 'Real-time Diagnostics & Audit',
    noLogsYet: 'NO RECORDS FOUND YET',
    totalEntries: 'Total Entries',
    enterUsernamePassword: 'Please enter username and password.',
    step01Auth: 'Step 01 / Auth',
    step02Scope: 'Step 02 / Scope',
    firmSelectionScope: 'Firm Selection / FIRM',
    storeSelectionScope: 'Store Selection / STORE',
    selectFirmPrompt: 'Select Firm',
    editInfo: 'EDIT INFORMATION',
    verifying: 'VERIFYING...',
    continue: 'CONTINUE',
    systemLogin: 'LOGIN TO SYSTEM',
    invalidCredentials: 'Invalid username or password',
    loginFailed: 'Login failed.',
    networkError: 'A network error occurred.',
    systemLogs: 'System Logs',
    factoryResetConfirm: 'CAUTION: The application will be reset to factory settings!\n\n- All local settings will be deleted.\n- Setup Wizard will open again.\n- Database data will be PRESERVED.\n\nDo you confirm?',
    resetFailed: 'Reset failed:',
    selectSystemLanguage: 'Select System Language',
    remoteSupportRequestSent: 'Quick support request sent to center.',
    remoteSupportWarning: 'Notice: By starting remote support, you grant the technical team limited access.',
    confirmClearLogs: 'All logs will be cleared. Are you sure?',
    logAudit: 'Log/Audit',
    systemHealth: 'System Health',
    scanToSearchPlaceholder: 'Scan barcode to search',
    changeVariant: 'Change Variant',
    confirmItemDelete: 'Are you sure you want to delete this item?',
    yesDelete: 'Yes, Delete',
    barcodeSearchPlaceholder: 'Scan barcode or product name',
    actionLabel: 'Action',


    // Language Modal
    selectLanguage: 'Select Language',
    turkish: 'Turkish',
    english: 'English',
    arabic: 'Arabic',
    kurdish: 'Kurdish',

    // Additional Labels
    campaignApplied: 'Campaign applied',
    campaignRemoved: 'Campaign removed',
    minimumAmountNotMet: 'Minimum amount not met',
    campaignAutoApplied: 'Campaign auto applied',


    // Customer Modal
    selectCustomerTitle: 'Select Customer',
    customerSearchPlaceholder: 'Search customer...',
    noCustomerSale: 'No Customer Sale',
    noCustomerSaleDescription: 'Retail sale',
    customerNotFound: 'Customer not found',
    newCustomer: 'New Customer',
    individual: 'Individual',
    corporate: 'Corporate',
    totalPurchases: 'Total Purchases',
    lastPurchase: 'Last Purchase',

    // Staff Modal
    selectStaffTitle: 'Select Staff',
    cashier1: 'Cashier 1',
    cashier2: 'Cashier 2',
    cashier3: 'Cashier 3',
    manager: 'Manager',
    discountAuthority: 'Has discount authority',
    errorFetchingUsers: 'Failed to fetch user list',
    welcome: 'Welcome',
    invalidPassword: 'Invalid password',
    loginError: 'Error logging in',
    login: 'Login',

    // MarketPOS
    phoneAddress: 'Phone / Address',
    totalItems: 'Total Items',
    applyDiscount: 'Apply Discount',
    deleteBtn: 'Delete',
    cancelBtn: 'Cancel',
    pieces: 'Pieces',
    priceLabel: 'Price',
    clearBtn: 'Clear',
    enterBtn: 'OK',
    productCount: 'Product',
    totalPieces: 'Total Pieces',
    pcs: 'pcs',
    searchBtn: 'Search',

    // Login Screen
    storeSelection: 'Store Selection',
    username: 'Username',
    usernamePlaceholder: 'Enter your username',
    password: 'Password',
    connectionSettings: 'Connection Settings',
    loginButton: 'Login',

    // Campaign Modal
    selectCampaign: 'Select Campaign',
    totalCampaigns: 'Total Campaigns',
    closeEsc: 'Press ESC to close',

    // Bottom Bar
    subtotalText: 'SUBTOTAL',
    totalText: 'TOTAL',
    cashierLabel: 'Cashier',

    // Parked Receipts Modal
    parkedReceiptsTitle: 'Parked Receipts',
    noParkedReceipts: 'No parked receipts',
    noParkedReceiptsDescription: 'Parked receipts will appear here',
    parkedAt: 'Parked At',
    parkedBy: 'Parked By',
    customerLabel: 'Customer',
    itemsCount: 'items',
    continueReceipt: 'Continue',
    deleteReceipt: 'Delete',
    confirmDelete: 'Are you sure you want to delete?',

    // Stock Query Modal
    productCatalog: 'Product Catalog',
    productsCount: 'products',
    searchProductPlaceholder: 'Search product...',
    gridView: 'Grid',
    listView: 'List',
    noProductsFound: 'No products found',
    changeSearchCriteria: 'Change your search criteria',
    productDetails: 'Product Details',
    barcodeLabel: 'Barcode',
    stockStatus: 'Stock Status',
    currentStock: 'Current Stock',
    unitLabel: 'Unit',
    outOfStock: 'Out of Stock',
    criticalLevel: 'Critical Level',
    lowStock: 'Low Stock',
    sufficientStock: 'Sufficient Stock',
    priceInfo: 'Price Info',
    salePrice: 'Sale Price',
    costPrice: 'Cost Price',
    profitMargin: 'Profit Margin',
    stockValue: 'Stock Value',
    costValue: 'Cost Value',
    saleValue: 'Sale Value',
    branchVariants: 'Branch Variants',
    totalLabel: 'Total',
    branchStocks: 'Branch Stocks',
    totalAllBranches: 'All Branches Total',
    productLabel: 'Product',
    categoryLabel: 'Category',
    detailButton: 'Detail',
    addToCartButton: 'Add to Cart',

    // Stock Query Specific
    grid: 'Grid',
    list: 'List',
    operation: 'Operation',
    unit: 'Unit',
    pricingInfo: 'Pricing Information',
    cost: 'Cost',
    branchVariantStocks: 'Branch Variant Stocks',

    // Return Modal
    returnCancelTitle: 'Return / Cancel',
    searchReceiptPlaceholder: 'Search receipt number or barcode...',
    noSalesFound: 'No sales found',
    selectReceiptForReturn: 'Select receipt for return',
    returnProducts: 'Products to Return',
    salesQuantity: 'Sales Qty',
    saleQuantity: 'Sales Qty',

    returnQuantity: 'Return Qty',
    allButton: 'All',
    returnReason: 'Return Reason',
    returnReasonPlaceholder: 'Select return reason...',
    returnAmount: 'Return Amount',
    confirmReturn: 'Confirm Return',
    productDefective: 'Product Defective',
    customerNotSatisfied: 'Customer Not Satisfied',
    wrongProduct: 'Wrong Product',
    sizeColorChange: 'Size/Color Change',
    otherReason: 'Other Reasons',
    generalSale: 'General Sale',

    // Sales History Modal
    salesHistoryTitle: 'Sales History',
    allSalesButton: 'All Sales',
    todayButton: 'Today',
    sevenDaysButton: '7 Days',
    thirtyDaysButton: '30 Days',
    noSalesHistory: 'No sales history',
    salesCount: 'sales',
    totalSales: 'Total',
    receiptNumberOrCustomerSearch: 'Search by receipt number or customer name...',
    dateRange: 'Date Range',
    startDate: 'Start:',
    endDate: 'End:',

    noSalesRecordFound: 'No sales record found',
    cash: 'Cash',
    card: 'Card',
    other: 'Other',

    viewDetails: 'View Details',
    printReceipt: 'Print Receipt',
    download: 'Download',
    backToList: 'Back to List',
    receiptDetails: 'Receipt Details',
    lastReceipt: 'Last Receipt',
    totalSalesCount: 'Total',
    salesWillAppearHere: 'Completed sales will appear here',
    cashierInfo: 'Cashier',
    productsLabel: 'Product',
    dateLabel: 'Date',
    closeButton: 'Close',

    // Language Selection Modal
    languageSelectionTitle: 'Language Selection',
    languageChangeInfo: 'Language changes affect all screens and are automatically saved.',
    textDirection: 'Text Direction',
    textDirectionOptional: 'Text Direction (Optional)',

    // Keyboard Shortcuts
    keyboardShortcuts: 'Keyboard Shortcuts',
    pos: 'POS Operations',
    quick: 'Quick Actions',
    navigation: 'Navigation',
    productSearch: 'Product Search',
    quickPayment: 'Quick Payment',
    focusBarcodeInput: 'Focus Barcode Field',
    confirmBarcode: 'Confirm Barcode',
    clearCart: 'Clear Cart',
    openCashRegister: 'Open Cash Register',
    closeCashRegister: 'Close Cash Register',

    // Advanced Search
    voiceSearch: 'Voice Search',
    results: 'results',
    searching: 'Searching...',

    // Accounting & Finance
    selectFirma: 'Select Company',
    selectDonem: 'Select Period',
    periodOpen: 'Open Period',
    periodClosed: 'Closed Period',
    closedMonths: 'Closed Months',
    firma: 'Company',
    donem: 'Period',
    journalEntry: 'Journal Entry',
    journalEntries: 'Journal Entries',
    debit: 'Debit',
    credit: 'Credit',
    balance: 'Balance',
    trialBalance: 'Trial Balance',
    accountCode: 'Account Code',
    accountName: 'Account Name',
    fiscalPeriod: 'Fiscal Period',
    fiscalYear: 'Fiscal Year',
    periodManagement: 'Period Management',
    closeMonth: 'Close Month',
    closePeriod: 'Close Period',
    openNewPeriod: 'Open New Period',
    balanceSheet: 'Balance Sheet',
    incomeStatement: 'Income Statement',
    cashFlowStatement: 'Cash Flow Statement',
    financialStatements: 'Financial Statements',
    profitLoss: 'Profit and Loss',
    assets: 'Assets',
    liabilities: 'Liabilities',
    equity: 'Equity',
    revenue: 'Revenue',
    expenses: 'Expenses',
    netIncome: 'Net Income',
    grossProfit: 'Gross Profit',
    operatingExpenses: 'Operating Expenses',
    tax: 'Tax',
    taxRate: 'Tax Rate',
    corporateTax: 'Corporate Tax',
    incomeTax: 'Income Tax',
    withholdingTax: 'Withholding Tax',
    taxReport: 'Tax Report',
    chartOfAccounts: 'Chart of Accounts',
    generalLedger: 'General Ledger',
    subsidiary: 'Subsidiary',
    consolidatedReports: 'Consolidated Reports',
    intercompanyEliminations: 'Intercompany Eliminations',
    costOfGoodsSold: 'Cost of Goods Sold',
    inventory: 'Inventory',
    accountsReceivable: 'Accounts Receivable',
    accountsPayable: 'Accounts Payable',

    bank: 'Bank',
    purchases: 'Purchases',
    transfers: 'Transfers',
    receipts: 'Receipts',
    payments: 'Payments',
    voucher: 'Voucher',
    voucherNo: 'Voucher No',
    voucherType: 'Voucher Type',
    voucherDate: 'Voucher Date',
    description: 'Description',
    autoGenerated: 'Auto Generated',
    manualEntry: 'Manual Entry',
    approved: 'Approved',
    pending: 'Pending',
    rejected: 'Rejected',
    posted: 'Posted',
    reversed: 'Reversed',

    // MarketPOS Additional
    quantitySaved: 'Quantity saved',
    quantitySavedMessage: 'Quantity saved: {quantity}. Now enter barcode.',
    pleaseEnterBarcode: 'Please enter barcode',
    pleaseEnterQuantityFirst: 'Please enter quantity first, then press *',
    pleaseSelectVariant: 'Please select variant',
    barcodeNotFound: 'Barcode not found',
    pleaseEnterBarcodeFirst: 'Please enter barcode first',
    openCashRegisterToAddProduct: 'You must open the cash register first to add products!',
    productAddedToCart: '{productName} added to cart',
    productRemovedFromCart: 'Product removed from cart',
    variantChanged: 'Variant changed: {variant}',
    receiptCancelled: 'Receipt cancelled: {reason}',
    cartEmpty: 'Cart is empty',
    clearCurrentCartFirst: 'Clear current cart first',
    parkedReceiptRetrieved: 'Parked receipt retrieved',
    parkedReceiptDeleted: 'Parked receipt deleted',
    openCashRegisterToSell: 'You must open the cash register first to make a sale!',
    discountApplied: '{percent}% discount applied',
    quantitySavedBarcodeEnter: 'Quantity: {quantity} - Enter barcode',
    enterBarcode: 'Enter barcode...',
    automatic: '(Automatic)',
    discountLabel: 'Discount:',
    keyboardShortcutsTitle: 'Keyboard Shortcuts (Press ?)',
    shortcuts: 'Shortcuts',
    returnCompleted: 'Return completed',
    productAssignedToSlot: '{productName} assigned to Slot #{slotNumber}',
    cashHandedOver: 'Cash handed over to {staff}',
    cashHandedOverMessage: 'Cash handed over to {staff}.\n\nHandover Amount: {amount}\n\n{staff} must confirm the handover when opening the cash register.',
    cashOpenedSuccessfully: 'Cash register opened successfully!',
    cashOpenedMessage: 'Cash register opened successfully!\n\nOpening Cash: {amount}\nCashier: {staff}',
    defaultQuantity: '1x',
    zeroPlaceholder: '0',
    pageRange: '{start}-{end}',
    cashRegisterNumber: 'REG-91',
    version: 'v1.0',
    versionTitle: 'Version: v1.0',

    lastReceiptButton: 'Last Receipt',
    systemAdministrator: 'System Administrator',
    administrator: 'Administrator',
    quickProductPageSelect: 'Quick Product Page Select',
    enterNewPrice: 'Enter New Price',
    clickToChangePrice: 'Click to Change Price',

    // Product Detail Modal
    productInfo: 'Product Information',
    recentMovements: 'Recent Movements',
    branchStockStatus: 'Branch Stock Status',
    reserved: 'Reserved',
    available: 'Available',
    totalStock: 'Total Stock',
    incomingTransfer: 'Incoming Transfer',
    outgoingTransfer: 'Outgoing Transfer',
    purchase: 'Purchase',

    // Open Cash Register Modal
    openCashRegisterProcess: 'Cash Register Opening Process',
    cashHandoverAccept: 'Cash Handover Accept',
    numpad: 'Numpad',
    cashHandoverAvailable: 'Cash Handover Available',
    handoverFromCashier: 'Handover From Cashier:',
    handoverAmount: 'Handover Amount:',
    sessionInformation: 'Session Information',

    banknoteCount: 'Banknote Count',
    openingCashAmount: 'Opening Cash Amount',
    banknoteAndCoinCount: 'Banknote and Coin Count',

    openingCashRegister: 'OPENING CASH REGISTER:',
    openingCashDescription: 'This amount will be used as the opening cash register throughout the session',
    noteOptional: 'Note (Optional)',
    cashOpeningNotePlaceholder: 'Write your notes regarding the cash register opening...',

    zeroOpeningCashConfirm: 'Opening cash will be entered as 0.00. Do you want to continue?',

    // Cancel Receipt Modal
    cancelReceiptTitle: 'Cancel Receipt - Select Reason',
    customerChangedMind: 'Customer changed mind',
    wrongProductAdded: 'Wrong product added',
    priceProblem: 'Price problem',
    paymentFailed: 'Payment could not be made',
    systemError: 'System error',
    explainCancelReason: 'Explain Cancel Reason',
    cancelReasonPlaceholder: 'Write the cancel reason...',
    pleaseSelectCancelReason: 'Please select a cancel reason!',
    pleaseExplainCancelReason: 'Please explain the cancel reason!',
    giveUp: 'Give Up',

    // Return Modal
    receiptBased: 'Receipt Based',
    productBased: 'Product Based',
    searchProductByName: 'Search by product name...',

    productsToReturn: 'Products to Return',
    selectedProducts: 'Selected Products',

    unitPrice: 'Unit price',

    all: 'All',

    explainReturnReason: 'Explain return reason...',



    selectProductForReturn: 'Select products for return',
    totalSale: 'Total sale',

    differentReceipts: 'different receipts',
    pleaseSelectReceipt: 'Please select a receipt!',
    pleaseSelectReturnProducts: 'Please select products to return!',
    pleaseSelectReturnReason: 'Please select return reason!',
    pleaseExplainReturnReason: 'Please explain return reason!',





    // Product Catalog Modal
    // Product Catalog Modal
    searchProductBarcodeCategory: 'Search product name, barcode or category...',
    detail: 'Detail',
    selectVariant: 'Select Variant',
    assignToSlot: 'Assign to Slot',
    variantAvailable: 'Variant Available',
    stock: 'Stock',
    selectVariantLabel: 'Select Variant:',
    productSelection: 'Product Selection',
    quickProductSlot: 'Quick Product Slot',


    // Error Boundary
    anErrorOccurred: 'An Error Occurred',
    unexpectedErrorEncountered: 'An unexpected error was encountered',
    errorMessage: 'Error Message',
    technicalDetails: 'Technical Details',
    technicalDetailsForDevelopers: 'Technical Details (for Developers)',
    refreshPage: 'Refresh Page',
    goBack: 'Go Back',
    helpMessage: 'If this error persists, please check the browser console (F12) and contact the technical support team.',

    // Close Cash Register Modal
    closeCashRegisterProcess: 'Close Cash Register Process',
    salesSummary: 'Sales Summary',
    grossSales: 'Gross Sales',
    returnTotal: 'Return Total',
    netSales: 'Net Sales',
    paymentMethods: 'Payment Methods',
    cashSales: 'Cash Sales',
    creditCard: 'Credit Card',
    totalCollection: 'Total Collection',
    cashStatus: 'Cash Status',
    cardSales: 'Card Sales',
    expectedCash: 'Expected Cash',
    countedCashAmount: 'Counted Cash Amount',
    cashCountExample: 'Ex: 1000.00',
    cashDifference: 'Cash Difference',
    cashBalanced: 'Cash Balanced',
    excess: 'Excess',
    shortage: 'Shortage',
    cashClosingNotePlaceholder: 'Write your notes regarding cash closing...',
    printReport: 'Print Report',
    transferToOtherCashier: 'Transfer to Other Cashier',
    cashCountRequired: 'Please enter counted cash amount!',
    cashDifferenceConfirm: 'There is a cash difference. Do you want to continue?',
    cashClosedSuccessfully: 'Cash register closed successfully!',
    cashHandoverCountRequired: 'Please enter handover amount!',
    sessionDay: 'Day',
    session: 'Session',

    menu: {
      materialManagement: "Material Management",
      masterRecords: "Master Records",
      materialClasses: "Material Classes",
      materials: "Materials",
      unitSets: "Unit Sets",
      variants: "Variants",
      specialCodes: "Special Codes",
      brandDefinitions: "Brand Definitions",
      groupCodes: "Group Codes",
      productCategories: "Product Categories",
      movements: "Movements",
      stockManagementPanel: "Stock Management Panel",
      materialManagementSlips: "Material Management Slips",
      reports: "Reports",
      materialExtract: "Material Extract",
      materialValue: "Material Value",
      inventory: "Inventory",
      cost: "Cost",
      inOutTotals: "Entry/Exit Totals",
      materialWarehouseStatus: "Material Warehouse Status",
      transactionBreakdown: "Transaction Breakdown",
      slipList: "Slip List",
      minMaxStock: "Min/Max Stock",
      mainMenu: "Main Menu",
      homepage: "Homepage",
      dashboard: "Dashboard",
      storeManagement: "Store Management",
      storePanel: "Store Panel",
      storeTransfer: "Store Transfer",
      multiStoreManagement: "Multi-Store Management",
      regionalFranchiseManagement: "Regional Dealership Management",
      storeConfiguration: "Store Configuration",
      dataBroadcast: "Data Broadcast",
      integrations: "Integrations",
      excelOperations: "Excel Operations",
      invoices: "Invoices",
      salesInvoices: "Sales Invoices",
      salesInvoice: "Sales Invoice",
      retailSales: "Retail Sales",
      wholesaleSales: "Wholesale Sales",
      consignmentSales: "Consignment Sales",
      salesReturn: "Sales Return",
      purchasing: "Purchasing",
      requestSlips: "Request Slips",
      purchaseOrders: "Purchase Orders",
      purchaseInvoice: "Purchase Invoice",
      purchaseReturn: "Purchase Return",
      receivedService: "Received Service",
      serviceInvoices: "Service Invoices",
      supplierCards: "Supplier Cards",
      serviceInvoiceIssued: "Service Invoice Issued",
      serviceInvoiceReceived: "Service Invoice Received",
      waybills: "Waybills",
      salesWaybill: "Sales Waybill",
      purchaseWaybill: "Purchase Waybill",
      warehouseTransferWaybill: "Warehouse Transfer Waybill",
      wasteWaybill: "Waste Waybill",
      orders: "Orders",
      salesOrder: "Sales Order",
      offers: "Offers",
      financeManagement: "Finance Management",
      definitions: "Definitions",
      paymentPlans: "Payment Plans",
      bankPaymentPlans: "Bank Payment Plans",
      campaignDefinitions: "Campaign Definitions",
      cards: "Cards",
      currentAccounts: "Current Accounts",
      cashAccounts: "Cash Accounts",
      banks: "Banks",
      bankAccounts: "Bank Accounts",
      currentAccountSlips: "Current Account Slips",
      cashOperations: "Cash Operations",
      cashSlips: "Cash Slips",
      bankSlips: "Bank Slips",
      creditCardPosSlips: "Credit Card POS Slips",
      journalAndSlips: "Journal Book & Slips",
      currentAccountReports: "Current Account Reports",
      cashReports: "Cash Reports",
      bankReports: "Bank Reports",
      trialBalanceReport: "Trial Balance Report",
      other: "Other",
      accountingManagement: "Accounting Management",
      expenseManagement: "Expense Management",
      checkPromissory: "Check/Promissory Note",
      collectionPayment: "Collection/Payment",
      multiCurrency: "Multi-Currency",
      accountingVouchers: "Accounting Slips",
      retail: "Retail",
      priceAndCampaign: "Price & Campaign",
      scaleAndWeighedSales: "Scale & Weighed Sales",
      communicationAndNotifications: "Communication & Notifications",
      whatsappIntegration: "WhatsApp Integration",
      notificationCenter: "Notification Center",
      smsManagement: "SMS Management",
      emailCampaigns: "Email Campaigns",
      reportsAndAnalysis: "Reports & Analysis",
      aiProductAnalytics: "AI Product Analytics",
      advancedReports100: "⭐ Advanced Reports (100+)",
      profitabilityAnalyticsDashboard: "💰 Profitability Analysis Dashboard",
      salesReports: "Sales Reports",
      stockReports: "Stock Reports",
      trialBalance: "Trial Balance",
      incomeStatement: "Income Statement",
      customerAnalysis: "Customer Analysis",
      balanceSheet: "Balance Sheet",
      graphicalAnalysis: "Graphical Analysis",
      customReports: "Custom Reports",
      biDashboardAi: "BI Dashboard & AI",
      systemManagement: "System Management",
      firmPeriodDefinitions: "Firm/Period Definitions",
      workflowAutomation: "Workflow Automation",
      demoDataManagement: "Demo Data Management",
      databaseInfrastructure: "Database Infrastructure",
      exSecureGateSecurity: "ExSecureGate (Security)",
      generalSettings: "General Settings",
      userManagement: "User Management",
      roleAndAuthorization: "Role & Authorization",
      menuManagement: "Menu Management",
      definitionsParameters: "Definitions/Parameters",
      backupRestore: "Backup/Restore",
      logAudit: "Log/Audit",
      systemHealth: "System Health",
    },
  },
  ar: {
    // Header
    systemTitle: 'RetailEX ERP',
    customer: 'العميل',
    selectCustomer: 'اختر العميل',
    retailCustomer: 'عميل التجزئة',
    cashier: 'الصراف',
    changeCashier: 'تغيير الصراف',
    changeLanguage: 'تغيير اللغة',
    logout: 'تسجيل الخروج',
    logAudit: 'السجلات والتدقيق',
    systemHealth: 'حالة النظام',
    scanToSearchPlaceholder: 'امسح للبحث عن المنتج...',
    changeVariant: 'تغيير النوع',
    confirmItemDelete: 'هل أنت متأكد من حذف هذا العنصر؟',
    yesDelete: 'نعم، حذف',
    barcodeSearchPlaceholder: 'الباركود أو اسم المنتج...',
    actionLabel: 'العملية',

    // Product Grid
    searchProducts: 'بحث عن المنتجات',
    searchPlaceholder: 'اسم المنتج أو الباركود...',
    categories: 'الفئات',
    allCategories: 'جميع الفئات',

    // Cart
    cart: 'السلة',
    emptyCart: 'السلة فارغة',
    product: 'المنتج',
    quantity: 'الكمية',
    price: 'السعر',
    total: 'المجموع',
    subtotal: 'المجموع الفرعي',
    discount: 'الخصم',
    grandTotal: 'المجموع الكلي',
    rowOrder: 'سلسلة',
    productName: 'اسم المنتج',
    action: 'عملية',

    // Actions
    add: 'إضافة',
    addToCart: 'أضف إلى السلة',
    remove: 'إزالة',
    clear: 'مسح',
    save: 'حفظ',
    cancel: 'إلغاء',
    complete: 'إتمام',
    payment: 'الدفع',
    search: 'بحث',
    close: 'إغلاق',

    // Numpad
    amount: 'المبلغ',
    piece: 'قطعة',
    'delete': 'حذف',
    enter: 'موافق',

    // Quick Actions
    campaign: 'الحملة',
    category: 'الفئة',
    productQuery: 'استعلام المنتج',
    stockQuery: 'استعلام المخزون',
    parkedReceipts: 'الإيصال المعلق',
    salesHistory: 'تاريخ المبيعات',
    returnTransaction: 'إرجاع',
    return: 'إرجاع',
    scale: 'الميزان',
    subtotalAction: 'المجموع الفرعي',
    receiptNote: 'ملاحظة الإيصال',
    barcode: 'الباركود',
    quickProductAdd: 'منتج سريع',
    shiftClick: 'Shift + نقرة',
    receivePayment: 'استلام الدفع',
    sales: 'المبيعات',
    parkedReceiptsButton: 'معلق',
    parkReceipt: 'تعليق الإيصال',
    cancelReceipt: 'إلغاء الإيصال',
    management: 'الإدارة',
    closeRegister: 'إغلاق الصندوق',
    openRegister: 'فتح الصندوق',
    customerInfo: 'معلومات العميل',
    cardNumber: 'رقم البطاقة',

    // Footer
    receipt: 'الإيصال',
    store: 'المتجر',
    cashRegister: 'الصندوق',
    shift: 'الوردية',
    screenSettings: 'إعدادات الشاشة',
    language: 'اللغة',

    // WebSocket Status
    wsConnected: 'متصل',
    wsDisconnected: 'غير متصل',
    wsConnecting: 'جاري الاتصال',

    // Store Info
    centralStore: 'المتجر المركزي',
    dayShift: 'النهار',

    // Notifications
    productAdded: 'تمت إضافة المنتج إلى السلة',
    productRemoved: 'تمت إزالة المنتج من السلة',
    cartCleared: 'تم مسح السلة',
    receiptParked: 'تم تعليق الإيصال',
    saleCompleted: 'تم إتمام البيع',
    error: 'خطأ',

    // Payment Modal
    paymentTitle: 'الدفع',
    discountOptional: 'الخصم (اختياري)',
    percentage: 'النسبة المئوية',
    enterDiscountPercentage: 'أدخل نسبة الخصم',
    enterDiscountAmount: 'أدخل مبلغ الخصم',
    paymentSummary: 'ملخص الدفع',
    subtotalLabel: 'المجموع الفرعي',
    amountToPay: 'المبلغ المطلوب دفعه',
    paymentMethod: 'طريقة الدفع',
    cashPayment: 'الدفع نقدًا',
    cashPaymentDescription: 'الدفع بالنقد',
    cardPayment: 'الدفع بالبطاقة',
    cardPaymentDescription: 'الدفع ببطاقة الائتمان/الخصم',
    receivedAmount: 'المبلغ المستلم',
    enterReceivedCashAmount: 'أدخل المبلغ النقدي المستلم',
    fullAmount: 'المبلغ الكامل',
    completePayment: 'إتمام الدفع',
    campaignDiscountLabel: 'خصم الحملة',
    campaignAppliedDescription: 'مطبق',

    // Language Modal
    selectLanguage: 'اختر اللغة',
    turkish: 'التركية',
    english: 'الإنجليزية',
    arabic: 'العربية',
    kurdish: 'الكردية',

    // Additional Labels
    campaignApplied: 'تم تطبيق الحملة',
    campaignRemoved: 'تمت إزالة الحملة',
    minimumAmountNotMet: 'لم يتم استيفاء الحد الأدنى للمبلغ',
    campaignAutoApplied: 'تم تطبيق الحملة تلقائيًا',


    // Customer Modal
    selectCustomerTitle: 'اختر العميل',
    customerSearchPlaceholder: 'بحث عن العميل...',
    noCustomerSale: 'بيع بدون عميل',
    noCustomerSaleDescription: 'بيع بالتجزئة',
    customerNotFound: 'لم يتم العثور على العميل',
    newCustomer: 'عميل جديد',
    individual: 'فردي',
    corporate: 'شركة',
    totalPurchases: 'إجمالي المشتريات',
    lastPurchase: 'آخر شراء',

    // Staff Modal
    selectStaffTitle: 'اختر الموظف',
    cashier1: 'صراف 1',
    cashier2: 'صراف 2',
    cashier3: 'صراف 3',
    manager: 'المدير',
    discountAuthority: 'لديه صلاحية الخصم',
    errorFetchingUsers: 'فشل في جلب قائمة المستخدمين',
    welcome: 'أهلاً بك',
    invalidPassword: 'كلمة المرور غير صحيحة',
    loginError: 'خطأ في تسجيل الدخول',
    login: 'تسجيل الدخول',

    // MarketPOS
    phoneAddress: 'الهاتف / العنوان',
    totalItems: 'إجمالي العناصر',
    applyDiscount: 'تطبيق الخصم',
    deleteBtn: 'حذف',
    cancelBtn: 'إلغاء',
    pieces: 'قطع',
    priceLabel: 'السعر',
    clearBtn: 'مسح',
    enterBtn: 'موافق',
    productCount: 'المنتج',
    totalPieces: 'إجمالي القطع',
    pcs: 'قطعة',
    searchBtn: 'بحث',

    // Login Screen
    storeSelection: 'اختيار المتجر',
    username: 'اسم المستخدم',
    usernamePlaceholder: 'أدخل اسم المستخدم',
    password: 'كلمة المرور',
    rememberMe: 'تذكرني',
    connectionSettings: 'إعدادات الاتصال',
    loginButton: 'تسجيل الدخول',

    // Campaign Modal
    selectCampaign: 'اختر الحملة',
    totalCampaigns: 'إجمالي الحملات',
    closeEsc: 'اضغط ESC للإغلاق',

    // Bottom Bar
    subtotalText: 'المجموع الفرعي',
    totalText: 'المجموع',
    cashierLabel: 'الصراف',

    // Parked Receipts Modal
    parkedReceiptsTitle: 'الإيصالات المعلقة',
    noParkedReceipts: 'لا توجد إيصالات معلقة',
    noParkedReceiptsDescription: 'ستظهر الإيصالات المعلقة هنا',
    parkedAt: 'تم التعليق في',
    parkedBy: 'تم التعليق بواسطة',
    customerLabel: 'العميل',
    itemsCount: 'عناصر',
    continueReceipt: 'متابعة',
    deleteReceipt: 'حذف',
    confirmDelete: 'هل أنت متأكد من الحذف؟',

    // Stock Query Modal
    productCatalog: 'كتالوج المنتجات',
    productsCount: 'منتجات',
    searchProductPlaceholder: 'بحث عن المنتج...',
    gridView: 'شبكة',
    listView: 'قائمة',
    noProductsFound: 'لم يتم العثور على منتجات',
    changeSearchCriteria: 'غير معايير البحث',
    productDetails: 'تفاصيل المنتج',
    barcodeLabel: 'الباركود',
    stockStatus: 'حالة المخزون',
    currentStock: 'المخزون الحالي',
    unitLabel: 'الوحدة',
    outOfStock: 'نفد من المخزون',
    criticalLevel: 'مستوى حرج',
    lowStock: 'مخزون منخفض',
    sufficientStock: 'مخزون كافٍ',
    priceInfo: 'معلومات السعر',
    salePrice: 'سعر البيع',
    costPrice: 'سعر التكلفة',
    profitMargin: 'هامش الربح',
    stockValue: 'قيمة المخزون',
    costValue: 'قيمة التكلفة',
    saleValue: 'قيمة البيع',
    branchVariants: 'أشكال الفروع',
    totalLabel: 'المجموع',
    branchStocks: 'مخزون الفروع',
    totalAllBranches: 'إجمالي جميع الفروع',
    productLabel: 'المنتج',
    categoryLabel: 'الفئة',
    detailButton: 'تفاصيل',
    addToCartButton: 'أضف إلى السلة',

    // Stock Query Specific
    grid: 'شبكة',
    list: 'قائمة',
    operation: 'عملية',
    unit: 'وحدة',
    pricingInfo: 'معلومات التسعير',
    cost: 'التكلفة',
    branchVariantStocks: 'مخزون متغيرات الفرع',

    // Return Modal
    returnCancelTitle: 'إرجاع / إلغاء',
    searchReceiptPlaceholder: 'بحث عن رقم الإيصال أو الباركود...',
    noSalesFound: 'لم يتم العثور على مبيعات',
    selectReceiptForReturn: 'اختر الإيصال للإرجاع',
    returnProducts: 'المنتجات المراد إرجاعها',
    salesQuantity: 'كمية البيع',
    returnQuantity: 'كمية الإرجاع',
    allButton: 'الكل',
    returnReason: 'سبب الإرجاع',
    returnReasonPlaceholder: 'اختر سبب الإرجاع...',
    returnAmount: 'مبلغ الإرجاع',
    confirmReturn: 'تأكيد الإرجاع',
    productDefective: 'المنتج معيب',
    customerNotSatisfied: 'العميل غير راضٍ',
    wrongProduct: 'منتج خاطئ',
    sizeColorChange: 'تغيير الحجم/اللون',
    otherReason: 'أسباب أخرى',
    generalSale: 'بيع عام',

    // Sales History Modal
    salesHistoryTitle: 'تاريخ المبيعات',
    allSalesButton: 'جميع المبيعات',
    todayButton: 'اليوم',
    sevenDaysButton: '7 أيام',
    thirtyDaysButton: '30 يومًا',
    noSalesHistory: 'لا يوجد تاريخ مبيعات',
    salesCount: 'مبيعات',
    totalSales: 'المجموع',
    receiptNumberOrCustomerSearch: 'ابحث برقم الإيصال أو اسم العميل...',
    dateRange: 'نطاق التاريخ',
    startDate: 'البداية:',
    endDate: 'النهاية:',

    noSalesRecordFound: 'لم يتم العثور على سجل مبيعات',
    cash: 'نقد',
    card: 'بطاقة',
    other: 'أخرى',

    viewDetails: 'عرض التفاصيل',
    printReceipt: 'طباعة الإيصال',
    download: 'تحميل',
    backToList: 'العودة إلى القائمة',
    receiptDetails: 'تفاصيل الإيصال',
    lastReceipt: 'آخر إيصال',
    totalSalesCount: 'المجموع',
    salesWillAppearHere: 'ستظهر المبيعات المكتملة هنا',
    cashierInfo: 'الصراف',
    productsLabel: 'المنتج',
    dateLabel: 'التاريخ',
    closeButton: 'إغلاق',
    menu: {
      materialManagement: "إدارة المواد",
      masterRecords: "السجلات الرئيسية",
      materialClasses: "فئات المواد",
      materials: "المواد",
      unitSets: "مجموعات الوحدات",
      variants: "الأشكال والمتغيرات",
      specialCodes: "الأكواد الخاصة",
      brandDefinitions: "تعريفات العلامات التجارية",
      groupCodes: "أكواد المجموعات",
      productCategories: "فئات المنتجات",
      movements: "الحركات",
      stockManagementPanel: "لوحة إدارة المخزون",
      materialManagementSlips: "سندات إدارة المواد",
      reports: "التقارير",
      materialExtract: "كشف المواد",
      materialValue: "قيمة المواد",
      inventory: "الجرد",
      cost: "التكلفة",
      inOutTotals: "إجمالي الداخل/الخارج",
      materialWarehouseStatus: "حالة مخزن المواد",
      transactionBreakdown: "تحليل المعاملات",
      slipList: "قائمة السندات",
      minMaxStock: "الحد الأدنى/الأقصى للمخزون",
      mainMenu: "القائمة الرئيسية",
      homepage: "الصفحة الرئيسية",
      dashboard: "لوحة التحكم",
      storeManagement: "إدارة المتجر",
      storePanel: "لوحة المتجر",
      storeTransfer: "تحويل بين المتاجر",
      multiStoreManagement: "إدارة المتاجر المتعددة",
      regionalFranchiseManagement: "إدارة الموزعين الإقليميين",
      storeConfiguration: "تكوين المتجر",
      dataBroadcast: "بث البيانات",
      integrations: "التكاملات",
      excelOperations: "عمليات إكسل",
      invoices: "الفواتير",
      salesInvoices: "فواتير المبيعات",
      salesInvoice: "فاتورة مبيعات",
      retailSales: "مبيعات التجزئة",
      wholesaleSales: "مبيعات الجملة",
      consignmentSales: "مبيعات الأمانة",
      salesReturn: "مرتجع مبيعات",
      purchasing: "المشتريات",
      requestSlips: "طلبات الشراء",
      purchaseOrders: "أوامر الشراء",
      purchaseInvoice: "فاتورة مشتريات",
      purchaseReturn: "مرتجع مشتريات",
      receivedService: "الخدمات المستلمة",
      serviceInvoices: "فواتير الخدمات",
      supplierCards: "بطاقات الموردين",
      serviceInvoiceIssued: "فاتورة خدمة صادرة",
      serviceInvoiceReceived: "فاتورة خدمة واردة",
      waybills: "سندات الشحن (Waybills)",
      salesWaybill: "سند شحن مبيعات",
      purchaseWaybill: "سند شحن مشتريات",
      warehouseTransferWaybill: "سند تحويل مخزني",
      wasteWaybill: "سند هالك",
      orders: "الأوامr",
      salesOrder: "أمر مبيعات",
      offers: "العروض",
      financeManagement: "إدارة المالية",
      definitions: "التعريفات",
      paymentPlans: "خطط الدفع",
      bankPaymentPlans: "خطط الدفع البنكية",
      campaignDefinitions: "تعريفات الحملات",
      cards: "البطاقات",
      currentAccounts: "الحسابات الجارية",
      cashAccounts: "حسابات الصندوق",
      banks: "البنوك",
      bankAccounts: "الحسابات البنكية",
      currentAccountSlips: "سندات الحسابات الجارية",
      cashOperations: "عمليات الصندوق",
      cashSlips: "سندات الصندوق",
      bankSlips: "سندات البنوك",
      creditCardPosSlips: "سندات نقاط البيع (POS)",
      journalAndSlips: "دفتر اليومية والسندات",
      currentAccountReports: "تقارير الحسابات الجارية",
      cashReports: "تقارير الصندوق",
      bankReports: "تقارير البنوك",
      trialBalanceReport: "تقرير ميزان المراجعة",
      other: "أخرى",
      accountingManagement: "إدارة المحاسبة",
      expenseManagement: "إدارة المصروفات",
      checkPromissory: "شيكات/كمبيالات",
      collectionPayment: "تحصيل/دفع",
      multiCurrency: "متعدد العملات",
      accountingVouchers: "سندات محاسبية",
      retail: "التجزئة",
      priceAndCampaign: "الأسعار والحملات",
      scaleAndWeighedSales: "مبيعات الميزان",
      communicationAndNotifications: "الاتصالات والتنبيهات",
      whatsappIntegration: "تكامل واتساب",
      notificationCenter: "مركز التنبيهات",
      smsManagement: "إدارة SMS",
      emailCampaigns: "حملات البريد الإلكتروني",
      reportsAndAnalysis: "التقارير والتحليل",
      aiProductAnalytics: "تحليلات المنتجات بالذكاء الاصطناعي",
      advancedReports100: "⭐ التقارير المتقدمة (+100)",
      profitabilityAnalyticsDashboard: "💰 لوحة تحليل الربحية",
      salesReports: "تقارير المبيعات",
      stockReports: "تقارير المخزون",
      trialBalance: "ميزان المراجعة",
      incomeStatement: "بيان الدخل",
      customerAnalysis: "تحليل العملاء",
      balanceSheet: "الميزانية العمومية",
      graphicalAnalysis: "التحليل الرسومي",
      customReports: "تقارير مخصصة",
      biDashboardAi: "لوحة BI والذكاء الاصطناعي",
      systemManagement: "إدارة النظام",
      firmPeriodDefinitions: "تعريفات الشركة/الفترة",
      workflowAutomation: "أتمتة سير العمل",
      demoDataManagement: "إدارة البيانات التجريبية",
      databaseInfrastructure: "بنية قاعدة البيانات",
      exSecureGateSecurity: "ExSecureGate (الأمن)",
      generalSettings: "الإعدادات العامة",
      userManagement: "إدارة المستخدمين",
      roleAndAuthorization: "الأدوار والصلاحيات",
      menuManagement: "إدارة القوائم",
      definitionsParameters: "التعريفات/المعاملات",
      backupRestore: "النسخ الاحتياطي/الاستعادة",
      logAudit: "السجلات والتدقيق",
      systemHealth: "صحة النظام"
    },

    // Language Selection Modal
    languageSelectionTitle: 'اختيار اللغة',
    languageChangeInfo: 'تؤثر تغييرات اللغة على جميع الشاشات ويتم حفظها تلقائيًا.',
    textDirection: 'اتجاه النص',
    textDirectionOptional: 'اتجاه النص (اختياري)',
    enterNewPrice: 'أدخل السعر الجديد',
    clickToChangePrice: 'انقر لتغيير السعر',

    // Product Detail Modal
    productInfo: 'معلومات المنتج',
    recentMovements: 'الحركات الأخيرة',
    branchStockStatus: 'حالة مخزون الفرع',
    reserved: 'محجوز',
    available: 'متاح',
    totalStock: 'إجمالي المخزون',
    incomingTransfer: 'تحويل وارد',
    outgoingTransfer: 'تحويل صادر',
    purchase: 'شراء',

    // Keyboard Shortcuts
    keyboardShortcuts: 'اختصارات لوحة المفاتيح',
    pos: 'عمليات نقاط البيع',
    quick: 'إجراءات سريعة',
    navigation: 'التنقل',
    productSearch: 'بحث المنتج',
    quickPayment: 'دفع سريع',
    focusBarcodeInput: 'التركيز على حقل الباركود',
    confirmBarcode: 'تأكيد الباركود',
    clearCart: 'مسح السلة',
    openCashRegister: 'فتح السجل النقدي',
    closeCashRegister: 'إغلاق السجل النقدي',

    // Advanced Search
    voiceSearch: 'البحث الصوتي',
    results: 'نتائج',
    searching: 'جارٍ البحث...',

    // Accounting & Finance
    selectFirma: 'اختر الشركة',
    selectDonem: 'اختر الفترة',
    periodOpen: 'فترة مفتوحة',
    periodClosed: 'فترة مغلقة',
    closedMonths: 'أشهر مغلقة',
    firma: 'شركة',
    donem: 'فترة',
    journalEntry: 'قيد يومي',
    journalEntries: 'القيود اليومية',
    debit: 'مدين',
    credit: 'دائن',
    balance: 'رصيد',
    trialBalance: 'ميزان مراجعة',
    accountCode: 'رمز الحساب',
    accountName: 'اسم الحساب',
    fiscalPeriod: 'فترة مالية',
    fiscalYear: 'سنة مالية',
    periodManagement: 'إدارة الفترات',
    closeMonth: 'إغلاق الشهر',
    closePeriod: 'إغلاق الفترة',
    openNewPeriod: 'فتح فترة جديدة',
    balanceSheet: 'الخاتمة المالية',
    incomeStatement: 'الجملة الدخلية',
    cashFlowStatement: 'بيانات تدفق النقديات',
    financialStatements: 'القوائم المالية',
    profitLoss: 'الربح والخسارة',
    assets: 'الأصول',
    liabilities: 'الالتزامات',
    equity: 'الأسهم',
    revenue: 'الإيرادات',
    expenses: 'المصروفات',
    netIncome: 'الدخل الصافي',
    grossProfit: 'الربح الإجمالي',
    operatingExpenses: 'المصروفات التشغيلية',
    tax: 'الضريبة',
    taxRate: 'نسبة الضريبة',
    corporateTax: 'ضريبة الشركات',
    incomeTax: 'ضريبة الدخل',
    withholdingTax: 'ضريبة الاستقطاع',
    taxReport: 'تقرير الضريبة',
    chartOfAccounts: 'دليل الحسابات',
    generalLedger: 'دفتر الأستاذ العام',
    subsidiary: 'شركة فرعية',
    consolidatedReports: 'التقارير المجمعة',
    intercompanyEliminations: 'الإلغاءات بين الشركات',
    costOfGoodsSold: 'تكلفة البضائع المباعة',
    inventory: 'المخزون',
    accountsReceivable: 'الحسابات المستحقة',
    accountsPayable: 'الحسابات المدفوعة',

    bank: 'بنك',
    purchases: 'المشتريات',
    transfers: 'التحويلات',
    receipts: 'المقبوضات',
    payments: 'المدفوعات',
    voucher: 'سند قبض',
    voucherNo: 'رقم السند',
    voucherType: 'نوع السند',
    voucherDate: 'تاريخ السند',
    description: 'الوصف',
    autoGenerated: 'تم إنشاؤه تلقائيًا',
    manualEntry: 'إدخال يدوي',
    approved: 'معتمد',
    pending: 'في انتظار الموافقة',
    rejected: 'مرفوض',
    posted: 'منشور',
    reversed: 'مقلوب',

    // MarketPOS Additional
    quantitySaved: 'تم حفظ الكمية',
    quantitySavedMessage: 'تم حفظ الكمية: {quantity}. أدخل الباركود الآن.',
    pleaseEnterBarcode: 'يرجى إدخال الباركود',
    pleaseEnterQuantityFirst: 'يرجى إدخال الكمية أولاً، ثم اضغط *',
    pleaseSelectVariant: 'يرجى اختيار المتغير',
    barcodeNotFound: 'لم يتم العثور على الباركود',
    pleaseEnterBarcodeFirst: 'يرجى إدخال الباركود أولاً',
    openCashRegisterToAddProduct: 'يجب فتح الصندوق أولاً لإضافة المنتجات!',
    productAddedToCart: 'تمت إضافة {productName} إلى السلة',
    productRemovedFromCart: 'تمت إزالة المنتج من السلة',
    variantChanged: 'تم تغيير المتغير: {variant}',
    receiptCancelled: 'تم إلغاء الإيصال: {reason}',
    cartEmpty: 'السلة فارغة',
    clearCurrentCartFirst: 'امسح السلة الحالية أولاً',
    parkedReceiptRetrieved: 'تم استرجاع الإيصال المعلق',
    parkedReceiptDeleted: 'تم حذف الإيصال المعلق',
    openCashRegisterToSell: 'يجب فتح الصندوق أولاً لإتمام البيع!',
    discountApplied: 'تم تطبيق خصم {percent}%',
    quantitySavedBarcodeEnter: 'الكمية: {quantity} - أدخل الباركود',
    enterBarcode: 'أدخل الباركود...',
    automatic: '(تلقائي)',
    discountLabel: 'الخصم:',
    keyboardShortcutsTitle: 'اختصارات لوحة المفاتيح (اضغط ?)',
    shortcuts: 'الاختصارات',
    returnCompleted: 'تم إتمام الإرجاع',
    productAssignedToSlot: 'تم تعيين {productName} إلى الفتحة #{slotNumber}',
    cashHandedOver: 'تم تسليم النقد إلى {staff}',
    cashHandedOverMessage: 'تم تسليم النقد إلى {staff}.\n\nمبلغ التسليم: {amount}\n\nيجب على {staff} تأكيد التسليم عند فتح الصندوق.',
    cashOpenedSuccessfully: 'تم فتح الصندوق بنجاح!',
    cashOpenedMessage: 'تم فتح الصندوق بنجاح!\n\nالنقد الافتتاحي: {amount}\nالصراف: {staff}',
    defaultQuantity: '1x',
    zeroPlaceholder: '0',
    pageRange: '{start}-{end}',
    cashRegisterNumber: 'الصندوق-91',
    version: 'v1.0',
    versionTitle: 'الإصدار: v1.0',

    lastReceiptButton: 'آخر إيصال',
    systemAdministrator: 'مدير النظام',

    // Open Cash Register Modal
    openCashRegisterProcess: 'عملية فتح الصندوق',
    cashHandoverAccept: 'قبول تسليم النقد',
    numpad: 'لوحة الأرقام',
    cashHandoverAvailable: 'تسليم نقدي متاح',
    handoverFromCashier: 'الصراف المسلم:',
    handoverAmount: 'مبلغ التسليم:',
    sessionInformation: 'معلومات الجلسة',

    banknoteCount: 'عد الأوراق النقدية',
    openingCashAmount: 'مبلغ فتح الصندوق',
    banknoteAndCoinCount: 'عد الأوراق النقدية والعملات المعدنية',

    openingCashRegister: 'صندوق الافتتاح:',
    openingCashDescription: 'سيتم استخدام هذا المبلغ كصندوق افتتاحي طوال الجلسة',
    noteOptional: 'ملاحظة (اختياري)',
    cashOpeningNotePlaceholder: 'اكتب ملاحظاتك المتعلقة بفتح الصندوق...',

    zeroOpeningCashConfirm: 'سيتم إدخال صندوق الافتتاح كـ 0.00. هل تريد المتابعة؟',
    administrator: 'مدير',

    quickProductPageSelect: 'اختر صفحة المنتج السريع',

    // Cancel Receipt Modal
    cancelReceiptTitle: 'إلغاء الإيصال - اختر السبب',
    customerChangedMind: 'العميل تراجع',
    wrongProductAdded: 'تمت إضافة منتج خاطئ',
    priceProblem: 'مشكلة السعر',
    paymentFailed: 'لم يتم الدفع',
    systemError: 'خطأ في النظام',
    explainCancelReason: 'اشرح سبب الإلغاء',
    cancelReasonPlaceholder: 'اكتب سبب الإلغاء...',
    pleaseSelectCancelReason: 'الرجاء اختيار سبب الإلغاء!',
    pleaseExplainCancelReason: 'الرجاء شرح سبب الإلغاء!',
    giveUp: 'تراجع',

    // Return Modal
    receiptBased: 'حسب الفاتورة',
    productBased: 'حسب المنتج',
    searchProductByName: 'ابحث باسم المنتج...',



    productsToReturn: 'المنتجات المراد إرجاعها',
    selectedProducts: 'المنتجات المحددة',
    saleQuantity: 'كمية البيع',
    unitPrice: 'سعر الوحدة',


    all: 'الكل',


    explainReturnReason: 'اشرح سبب الإرجاع...',







    selectProductForReturn: 'اختر المنتجات للإرجاع',
    totalSale: 'إجمالي البيع',

    differentReceipts: 'إيصالات مختلفة',
    pleaseSelectReceipt: 'الرجاء اختيار إيصال!',
    pleaseSelectReturnProducts: 'الرجاء اختيار المنتجات المراد إرجاعها!',
    pleaseSelectReturnReason: 'الرجاء اختيار سبب الإرجاع!',
    pleaseExplainReturnReason: 'الرجاء شرح سبب الإرجاع!',






    // Product Catalog Modal
    searchProductBarcodeCategory: 'ابحث عن اسم المنتج أو الباركود أو الفئة...',

    detail: 'التفاصيل',
    selectVariant: 'اختر المتغير',
    assignToSlot: 'تعيين إلى الفتحة',

    variantAvailable: 'متغير متاح',
    stock: 'المخزون',

    selectVariantLabel: 'اختر المتغير:',
    productSelection: 'اختيار المنتج',
    quickProductSlot: 'فتحة منتج سريع',

    // Stock Query Modal keys cleaned up (Duplicates removed)
    // productCatalog: 'كتالوج المنتجات',
    // stockStatus: 'حالة المخزون',
    // currentStock: 'المخزون الحالي',
    // unit: 'الوحدة',
    // pricingInfo: 'معلومات التسعير',
    // salePrice: 'سعر البيع',
    // cost: 'التكلفة',
    // profitMargin: 'هامش الربح',
    // stockValue: 'قيمة المخزون',
    // costValue: 'قيمة التكلفة',
    // saleValue: 'قيمة البيع',
    // branchVariantStocks: 'مخزونات المتغيرات حسب الفرع',
    // branchStocks: 'مخزونات الفروع',
    // totalAllBranches: 'إجمالي جميع الفروع',
    // noProductsFound: 'لم يتم العثور على منتجات',
    // changeSearchCriteria: 'حاول تغيير معايير البحث',
    // grid: 'شبكة',
    // list: 'قائمة',


    // Error Boundary
    anErrorOccurred: 'حدث خطأ',
    unexpectedErrorEncountered: 'تم مواجهة خطأ غير متوقع',
    errorMessage: 'رسالة الخطأ',
    technicalDetails: 'التفاصيل التقنية',
    technicalDetailsForDevelopers: 'التفاصيل التقنية (للمطورين)',
    refreshPage: 'تحديث الصفحة',
    goBack: 'رجوع',
    helpMessage: 'إذا استمر هذا الخطأ، يرجى التحقق من وحدة تحكم المتصفح (F12) والاتصال بفريق الدعم الفني.',

    // Close Cash Register Modal
    closeCashRegisterProcess: 'عملية إغلاق الصندوق',
    salesSummary: 'ملخص المبيعات',
    grossSales: 'إجمالي المبيعات',
    returnTotal: 'إجمالي المرتجعات',
    netSales: 'صافي المبيعات',
    paymentMethods: 'طرق الدفع',
    cashSales: 'مبيعات نقدية',
    creditCard: 'بطاقة ائتمان',
    totalCollection: 'إجمالي التحصيل',
    cashStatus: 'حالة النقد',
    cardSales: 'مبيعات البطاقة',
    expectedCash: 'النقد المتوقع',
    countedCashAmount: 'النقد المعدود',
    cashCountExample: 'مثال: 1000.00',
    cashDifference: 'فرق النقد',
    cashBalanced: 'متوازن',
    excess: 'زيادة',
    shortage: 'نقص',
    cashClosingNotePlaceholder: 'اكتب ملاحظاتك بخصوص إغلاق الصندوق...',
    printReport: 'طباعة التقرير',
    transferToOtherCashier: 'تحويل لصراف آخر',
    cashCountRequired: 'يرجى إدخال المبلغ النقدي المعدود!',
    cashDifferenceConfirm: 'يوجد فرق في النقد. هل تريد المتابعة؟',
    cashClosedSuccessfully: 'تم إغلاق الصندوق بنجاح!',
    cashHandoverCountRequired: 'يرجى إدخال مبلغ التسليم!',
    sessionDay: 'يوم',
    session: 'جلسة',


    // Main Layout (Lines 500-509)
    posModule: 'المبيعات',
    managementModule: 'الإدارة',
    wmsModule: 'نظام إدارة المستودعات',
    setDateTime: 'ضبط التاريخ والوقت',
    requiresAdminPassword: 'يتطلب هذا الإجراء امتيازات المسؤول. قد تؤثر تغييرات التاريخ على سجلات المبيعات.',
    enterAdminPassword: 'أدخل كلمة مرور المسؤول',
    managementPanelAccess: 'الوصول إلى لوحة الإدارة',
    incorrectPassword: 'كلمة مرور خاطئة!',

    // Central Data Management (Lines 511-526)
    centralDataManagementSystem: 'نظام إدارة البيانات المركزي',
    centralDataManagementSubtitle: 'إدارة المزامنة والبث للمؤسسات v2.0',
    backup: 'نسخ احتياطي',
    import: 'استيراد',
    sending: 'جاري الإرسال...',
    sendNow: 'إرسال الآن',
    totalDevicesLabel: 'إجمالي الأجهزة',
    onlineDevicesLabel: 'متصل',
    pendingBroadcastsLabel: 'معلق',
    scheduledBroadcastsLabel: 'مجدول',
    successRateLabel: 'نسبة النجاح',
    last24hLabel: '24 ساعة',
    dataTransferLabel: 'نقل البيانات',
    sendDataTab: 'إرسال البيانات',
    dataTypeLabel: 'نوع البيانات',

    // Login & System (Lines 528-556)
    supportCenter: 'مركز الدعم',
    hwid: 'معرف الجهاز (HWID)',
    copy: 'نسخ',
    copied: 'تم النسخ',
    status: 'الحالة',
    online: 'متصل',
    waiting: 'قيد الانتظار',
    startSupport: 'بدء الدعم',
    closeWindow: 'إغلاق النافذة',
    systemLogsTitle: 'سجلات النظام',
    diagnosticsSubtitle: 'التشخيص والتدقيق في الوقت الفعلي',
    noLogsYet: 'لا توجد سجلات بعد',
    totalEntries: 'إجمالي السجلات',
    enterUsernamePassword: 'الرجاء إدخال اسم المستخدم وكلمة المرور.',
    step01Auth: 'الخطوة 01 / المصادقة',
    step02Scope: 'الخطوة 02 / النطاق',
    verifying: 'جاري التحقق...',
    firmSelectionScope: 'اختيار الشركة / FIRM',
    storeSelectionScope: 'اختيار الفرع / STORE',
    selectFirmPrompt: 'اختر الشركة',
    editInfo: 'تعديل المعلومات',

    continue: 'استمرار',
    systemLogin: 'تسجيل الدخول للنظام',
    invalidCredentials: 'اسم المستخدم أو كلمة المرور غير صحيحة',
    loginFailed: 'فشل تسجيل الدخول.',
    networkError: 'حدث خطأ في الشبكة.',
    systemLogs: 'سجلات النظام',
    factoryResetConfirm: 'تنبيه: سيتم إرجاع التطبيق إلى إعدادات المصنع!\n\n- سيتم حذف جميع الإعدادات المحلية.\n- سيفتح معالج الإعداد مرة أخرى.\n- سيتم الحفاظ على بيانات قاعدة البيانات.\n\nهل تؤكد الإجراء؟',
    resetFailed: 'فشل إعادة الضبط:',
    selectSystemLanguage: 'اختر لغة النظام',
    remoteSupportRequestSent: 'تم إرسال طلب الدعم السريع إلى المركز.',
    remoteSupportWarning: 'تنبيه: عند بدء الدعم عن بعد، فإنك تمنح الفريق الفني صلاحية وصول محدودة.',
    confirmClearLogs: 'سیتم مسح جميع السجلات. هل أنت متأكد؟',
  },
  ku: {
    // Header
    systemTitle: 'RetailEX ERP',
    customer: 'کڕیار',
    selectCustomer: 'کڕیار هەڵبژێرە',
    retailCustomer: 'کڕیاری تاک',
    cashier: 'سندوقدار',
    changeCashier: 'گۆڕینی سندوقدار',
    changeLanguage: 'گۆڕینی زمان',
    logout: 'دەرچوون',

    // Product Grid
    searchProducts: 'گەڕان بەدوای بەرهەمدا',
    searchPlaceholder: 'ناوی بەرهەم یان بارکۆد...',
    categories: 'هاوپۆلەکان',
    allCategories: 'هەموو هاوپۆلەکان',

    // Cart
    cart: 'سەبەتە',
    emptyCart: 'سەبەتە بەتاڵە',
    product: 'بەرهەم',
    quantity: 'بڕ',
    price: 'نرخ',
    total: 'کۆ',
    subtotal: 'کۆی لاوەکی',
    discount: 'داشکاندن',
    grandTotal: 'کۆی گشتی',
    rowOrder: 'ڕیز',
    productName: 'ناوی بەرهەم',
    action: 'کردار',
    scanToSearchPlaceholder: 'بۆ گەڕان سکان بکە...',
    changeVariant: 'گۆڕینی جۆر',
    confirmItemDelete: 'ئایا دڵنیایت لە سڕینەوە؟',
    yesDelete: 'بەڵێ، بسڕەوە',
    barcodeSearchPlaceholder: 'بارکۆد یان ناوی بەرهەم...',
    actionLabel: 'کردار',
    systemHealth: 'تەندروستی سیستەم',
    enterNewPrice: 'نرخی نوێ بنووسە',
    clickToChangePrice: 'کلیک بکە بۆ گۆڕینی نرخ',
    trialBalance: 'میزانی پێداچوونەوە',
    balanceSheet: 'بەیانی دارایی',
    incomeStatement: 'بەیانی داهات',
    inventory: 'سەرژمێری',
    periodOpen: 'ماوەی کراوە',
    periodClosed: 'ماوەی داخراو',
    closedMonths: 'مانگە داخراوەکان',
    firma: 'کۆمپانیا',
    donem: 'ماوە',
    journalEntry: 'تۆماری ڕۆژنامە',
    journalEntries: 'تۆمارەکانی ڕۆژنامە',
    debit: 'قەرزدار',
    credit: 'قەرزدەر',
    balance: 'باڵانس',
    accountCode: 'کۆدی حساب',
    accountName: 'ناوی حساب',
    fiscalPeriod: 'ماوەی دارایی',
    fiscalYear: 'ساڵی دارایی',
    periodManagement: 'بەڕێوەبردنی ماوە',
    closeMonth: 'داخستنی مانگ',
    closePeriod: 'داخستنی ماوە',
    openNewPeriod: 'کردنەوەی ماوەی نوێ',
    cashFlowStatement: 'بەیانی جەریانی نەقد',
    financialStatements: 'بەیانە داراییەکان',
    profitLoss: 'قازانج و زەرەر',
    assets: 'سامانەکان',
    liabilities: 'قەرزەکان',
    equity: 'مافی خاوەندارێتی',
    revenue: 'داهات',
    expenses: 'خەرجییەکان',
    netIncome: 'داهاتی خاوێن',
    grossProfit: 'قازانجی گشتی',
    operatingExpenses: 'خەرجییەکانی کارپێکردن',
    tax: 'باج',
    taxRate: 'ڕێژەی باج',
    corporateTax: 'باجی کۆمپانیا',
    incomeTax: 'باجی داهات',
    withholdingTax: 'باجی بڕین',
    taxReport: 'ڕاپۆرتی باج',
    chartOfAccounts: 'نەخشەی حسابەکان',
    generalLedger: 'دەفتەری گشتی',
    subsidiary: 'کۆمپانیای پاشکۆ',
    consolidatedReports: 'ڕاپۆرتە یەکگرتووەکان',
    intercompanyEliminations: 'سڕینەوەی نێوان کۆمپانیاکان',
    costOfGoodsSold: 'تێچووی کاڵای فرۆشراو',
    accountsReceivable: 'حسابە وەرگیراوەکان',
    accountsPayable: 'حسابە ددراوەکان',
    bank: 'بانک',
    purchases: 'کڕینەکان',
    transfers: 'گواستنەوەکان',
    receipts: 'پسوڵەکان',
    payments: 'پارەدانەکان',
    voucher: 'سند',
    voucherNo: 'ژمارەی سند',
    voucherType: 'جۆری سند',
    voucherDate: 'بەرواری سند',
    description: 'وەسف',
    autoGenerated: 'بە شێوەی خۆکار دروستکراوە',
    manualEntry: 'داخڵکردنی دەستی',
    approved: 'پەسندکراو',
    pending: 'چاوەڕوان',
    rejected: 'ڕەتکراوە',
    posted: 'تۆمارکراو',
    reversed: 'پێچەوانەکراو',
    selectFirma: 'کۆمپانیا هەڵبژێرە',
    selectDonem: 'ماوە هەڵبژێرە',

    // Actions
    add: 'زیادکردن',
    addToCart: 'زیادکردن بۆ سەبەتە',
    remove: 'لابردن',
    clear: 'پاککردنەوە',
    save: 'پاشەکەوتکردن',
    cancel: 'پاشگەزبوونەوە',
    complete: 'تەواوکردن',
    payment: 'پارەدان',
    search: 'گەڕان',
    close: 'داخستن',

    // Numpad
    amount: 'بڕ',
    piece: 'دانە',
    delete: 'سڕینەوە',
    enter: 'باشە',

    // Quick Actions
    campaign: 'کەمپەین',
    category: 'هاوپۆل',
    productQuery: 'پرسیاری بەرهەم',
    stockQuery: 'پرسیاری کۆگا',
    parkedReceipts: 'پسوڵە هەڵواسراوەکان',
    salesHistory: 'مێژووی فرۆشتن',
    returnTransaction: 'گەڕاندنەوە',
    return: 'گەڕاندنەوە',
    scale: 'تەرازوو',
    subtotalAction: 'کۆی لاوەکی',
    receiptNote: 'تێبینی پسوڵە',
    barcode: 'بارکۆد',
    quickProductAdd: 'بەرهەمی خێرا',
    shiftClick: 'Shift + کرتە',
    receivePayment: 'وەرگرتنی پارە',
    sales: 'فرۆشتنەکان',
    parkedReceiptsButton: 'هەڵواسراو',
    parkReceipt: 'هەڵواسینی پسوڵە',
    cancelReceipt: 'هەڵوەشاندنەوەی پسوڵە',
    management: 'بەڕێوەبردن',
    closeRegister: 'داخستنی سندوق',
    openRegister: 'کردنەوەی سندوق',
    customerInfo: 'زانیاری کڕیار',
    cardNumber: 'ژمارەی کارت',

    // Footer
    receipt: 'پسوڵە',
    store: 'فرۆشگا',
    cashRegister: 'سندوق',
    shift: 'شیفت',
    screenSettings: 'ڕێکخستنی شاشە',
    language: 'زمان',

    // WebSocket Status
    wsConnected: 'پەیوەستە',
    wsDisconnected: 'پەیوەست نییە',
    wsConnecting: 'پەیوەست دەبێت...',

    // Store Info
    centralStore: 'فرۆشگای ناوەندی',
    dayShift: 'ڕۆژ',

    // Notifications
    productAdded: 'بەرهەم زیادکرا بۆ سەبەتە',
    productRemoved: 'بەرهەم لابرا لە سەبەتە',
    cartCleared: 'سەبەتە پاککرایەوە',
    receiptParked: 'پسوڵە هەڵواسرا',
    saleCompleted: 'فرۆشتن تەواو بوو',
    error: 'هەڵە',

    // Payment Modal
    paymentTitle: 'پارەدان',
    discountOptional: 'داشکاندن (دڵخواز)',
    percentage: 'ڕێژە',
    enterDiscountPercentage: 'ڕێژەی داشکاندن بنووسە',
    enterDiscountAmount: 'بڕی داشکاندن بنووسە',
    paymentSummary: 'پوختەی پارەدان',
    subtotalLabel: 'کۆی لاوەکی',
    amountToPay: 'بڕی پارەی پێویست',
    paymentMethod: 'شێوازی پارەدان',
    cashPayment: 'پارەدان بە نەقد',
    cashPaymentDescription: 'پارەدان بە پارەی کاش',
    cardPayment: 'پارەدان بە کارت',
    cardPaymentDescription: 'پارەدان بە کارتی بانکی',
    receivedAmount: 'بڕی وەرگیراو',
    enterReceivedCashAmount: 'بڕی نەقدی وەرگیراو بنووسە',
    fullAmount: 'بڕی تەواو',
    completePayment: 'تەواوکردنی پارەدان',
    campaignDiscountLabel: 'داشکاندنی کەمپەین',
    campaignAppliedDescription: 'جێبەجێکرا',

    // Language Modal
    selectLanguage: 'زمان هەڵبژێرە',
    turkish: 'تورکی',
    english: 'ئینگلیزی',
    arabic: 'عەرەبی',
    kurdish: 'کوردی',

    // Additional Labels
    campaignApplied: 'کەمپەین جێبەجێکرا',
    campaignRemoved: 'کەمپەین لابرا',
    minimumAmountNotMet: 'کەمترین بڕ بەردەست نییە',
    campaignAutoApplied: 'کەمپەین بە خۆکاری جێبەجێکرا',


    // Customer Modal
    selectCustomerTitle: 'کڕیار هەڵبژێرە',
    customerSearchPlaceholder: 'گەڕان بەدوای کڕیاردا...',
    noCustomerSale: 'فرۆشتن بەبێ کڕیار',
    noCustomerSaleDescription: 'فرۆشتنی تاک',
    customerNotFound: 'کڕیار نەدۆزرایەوە',
    newCustomer: 'کڕیاری نوێ',
    individual: 'تاکی',
    corporate: 'کۆمپانیا',
    totalPurchases: 'کۆی کڕینەکان',
    lastPurchase: 'دوایین کڕین',

    // Staff Modal
    selectStaffTitle: 'کارمەند هەڵبژێرە',
    cashier1: 'سندوقدار ١',
    cashier2: 'سندوقدار ٢',
    cashier3: 'سندوقدار ٣',
    manager: 'بەڕێوەبەر',
    discountAuthority: 'مافی داشکاندنی هەیە',
    errorFetchingUsers: 'Lîsteya bikarhêneran nehat girtin',
    welcome: 'Bi xêr hatî',
    invalidPassword: 'Şîfre şaş e',
    loginError: 'Di têketinê de çewtî derket',
    login: 'Têkeve',

    // MarketPOS (Additional)
    phoneAddress: 'تەلەفۆن / ناونیشان',
    totalItems: 'کۆی بەرهەمەکان',
    applyDiscount: 'جێبەجێکردنی داشکاندن',
    deleteBtn: 'سڕینەوە',
    cancelBtn: 'پاشگەزبوونەوە',
    pieces: 'دانەكان',
    priceLabel: 'نرخ',
    clearBtn: 'پاككردنەوە',
    enterBtn: 'باشە',
    productCount: 'ژمارەی بەرهەم',
    totalPieces: 'کۆی دانەکان',
    pcs: 'دانە',
    searchBtn: 'گەڕان',

    // Login Screen
    storeSelection: 'هەڵبژاردنی فرۆشگا',
    username: 'ناوی بەکارهێنەر',
    usernamePlaceholder: 'ناوی بەکارهێنەرت بنووسە',
    password: 'وشەی نهێنی',
    rememberMe: 'لەبیرم بێت',
    connectionSettings: 'ڕێکخستنی پەیوەندی',
    loginButton: 'چوونە ژوورەوە',

    // Campaign Modal
    selectCampaign: 'کەمپەین هەڵبژێرە',
    totalCampaigns: 'کۆی کەمپەینەکان',
    closeEsc: 'ESC دابگرە بۆ داخستن',

    // Bottom Bar
    subtotalText: 'کۆی لاوەکی',
    totalText: 'کۆ',

    // Parked Receipts Modal
    parkedReceiptsTitle: 'پسوڵە هەڵواسراوەکان',
    noParkedReceipts: 'هیچ پسوڵەیەکی هەڵواسراو نییە',
    noParkedReceiptsDescription: 'پسوڵە هەڵواسراوەکان لێرە دەردەکەون',
    parkedAt: 'هەڵواسرا لە',
    parkedBy: 'هەڵواسرا لەلایەن',
    customerLabel: 'کڕیار',
    itemsCount: 'بەرهەم',
    continueReceipt: 'بەردەوامبوون',
    deleteReceipt: 'سڕینەوە',
    confirmDelete: 'دڵنیایت لە سڕینەوە؟',

    // Stock Query Modal
    productCatalog: 'کاتالۆگی بەرهەمەکان',
    productsCount: 'بەرهەم',
    searchProductPlaceholder: 'گەڕان بەدوای بەرهەمدا...',
    gridView: 'تۆڕ',
    listView: 'لیست',
    noProductsFound: 'هیچ بەرهەمێک نەدۆزرایەوە',
    changeSearchCriteria: 'پێوەرەکانی گەڕانت بگۆڕە',
    productDetails: 'وردەکاریی بەرهەم',
    anErrorOccurred: 'هەڵەیەک ڕوویدا',
    unexpectedErrorEncountered: 'هەڵەیەکی چاوەڕواننەکراو ڕوویدا',
    errorMessage: 'پەیامی هەڵە',
    technicalDetails: 'وردەکارییە تەکنیکییەکان',
    technicalDetailsForDevelopers: 'وردەکارییە تەکنیکییەکان (بۆ گەشەپێدەران)',
    refreshPage: 'لاپەڕە نوێ بکەوە',
    goBack: 'گەڕانەوە',
    searchProductBarcodeCategory: 'گەڕان بەدوای بەرهەم/بارکۆد/هاوپۆل...',
    detail: 'وردەکاری',
    selectVariant: 'جۆر هەڵبژێرە',
    assignToSlot: 'دیاریکردن بۆ شوێن',
    variantAvailable: 'جۆر بەردەستە',
    stock: 'کۆگا',
    selectVariantLabel: 'جۆر هەڵبژێرە',
    productSelection: 'هەڵبژاردنی بەرهەم',
    quickProductSlot: 'شوێنی بەرهەمی خێرا',

    // Inventory & Stock
    barcodeLabel: 'بارکۆد',
    stockStatus: 'دۆخی کۆگا',
    currentStock: 'کۆگای ئێستا',
    unitLabel: 'یەکە',
    outOfStock: 'لە کۆگا نییە',
    criticalLevel: 'ئاستی مەترسیدار',
    lowStock: 'کۆگای کەم',
    sufficientStock: 'کۆگای بەس',
    priceInfo: 'زانیاری نرخ',
    salePrice: 'نرخی فرۆشتن',
    costPrice: 'نرخی کڕین',
    profitMargin: 'ڕێژەی قازانج',
    stockValue: 'بەهای کۆگا',
    costValue: 'بەهای کڕین',
    saleValue: 'بەهای فرۆشتن',
    branchVariants: 'جۆرەکانی لق',
    totalLabel: 'کۆ',
    branchStocks: 'کۆگای لقەکان',
    totalAllBranches: 'کۆی هەموو لقەکان',
    productLabel: 'بەرهەم',
    categoryLabel: 'هاوپۆل',

    detailButton: 'وردەکاری',
    addToCartButton: 'زیادکردن بۆ سەبەتە',

    // Stock Query Specific
    grid: 'تۆڕ',
    list: 'لیست',
    operation: 'کردار',
    unit: 'یەکە',
    pricingInfo: 'زانیاری نرخ',
    cost: 'تێچوو',
    branchVariantStocks: 'کۆگای جۆرەکانی لق',

    // Return Modal
    returnCancelTitle: 'گەڕاندنەوە / هەڵوەشاندنەوە',
    receiptBased: 'لەسەر بنەمای پسوڵە',
    productBased: 'لەسەر بنەمای بەرهەم',
    searchProductByName: 'گەڕان بە ناوی بەرهەم...',
    productsToReturn: 'بەرهەمەکان بۆ گەڕاندنەوە',
    selectedProducts: 'بەرهەمە هەڵبژێردراوەکان',
    saleQuantity: 'بڕی فرۆشراو',
    unitPrice: 'نرخی یەکە',
    all: 'هەموو',
    explainReturnReason: 'هۆکاری گەڕاندنەوە ڕوون بکەرەوە...',
    selectProductForReturn: 'بەرهەمەکان هەڵبژێرە بۆ گەڕاندنەوە',
    totalSale: 'کۆی فرۆشتن',
    differentReceipts: 'پسوڵەی جیاواز',
    pleaseSelectReceipt: 'تکایە پسوڵەیەک هەڵبژێرە!',
    pleaseSelectReturnProducts: 'تکایە بەرهەمەکان هەڵبژێرە بۆ گەڕاندنەوە!',
    pleaseSelectReturnReason: 'تکایە هۆکاری گەڕاندنەوە هەڵبژێرە!',
    pleaseExplainReturnReason: 'تکایە هۆکاری گەڕاندنەوە ڕوون بکەرەوە!',
    searchReceiptPlaceholder: 'گەڕان بە ژمارەی پسوڵە یان بارکۆد...',
    noSalesFound: 'هیچ فرۆشتنێک نەدۆزرایەوە',
    selectReceiptForReturn: 'پسوڵە هەڵبژێرە بۆ گەڕاندنەوە',
    returnProducts: 'بەرهەمەکانی گەڕاندنەوە',
    salesQuantity: 'بڕی فرۆشتن',
    returnQuantity: 'بڕی گەڕاندنەوە',
    allButton: 'هەموو',
    returnReason: 'هۆکاری گەڕاندنەوە',
    returnReasonPlaceholder: 'هۆکاری گەڕاندنەوە هەڵبژێرە...',
    returnAmount: 'بڕی گەڕاندنەوە',
    confirmReturn: 'پشتڕاستکردنەوەی گەڕاندنەوە',
    productDefective: 'بەرهەم کێشەی هەیە',
    customerNotSatisfied: 'کڕیار ڕازی نییە',
    wrongProduct: 'بەرهەمی هەڵە',
    sizeColorChange: 'گۆڕینی قەبارە/ڕەنگ',
    otherReason: 'هۆکارەکانی تر',
    generalSale: 'فرۆشتنی گشتی',

    // Sales History Modal
    salesHistoryTitle: 'مێژووی فرۆشتن',
    allSalesButton: 'هەموو فرۆشتنەکان',
    todayButton: 'ئەمڕۆ',
    sevenDaysButton: '٧ ڕۆژ',
    thirtyDaysButton: '٣٠ ڕۆژ',
    noSalesHistory: 'مێژووی فرۆشتن بەردەست نییە',
    salesCount: 'ژمارەی فرۆشتن',
    totalSales: 'کۆی فرۆشتن',
    receiptNumberOrCustomerSearch: 'گەڕان بە ژمارەی پسوڵە یان ناوی کڕیار...',
    dateRange: 'مەودای بەروار',
    startDate: 'بەرواری دەستپێکردن:',
    endDate: 'بەرواری کۆتایی:',
    noSalesRecordFound: 'هیچ تۆمارێکی فرۆشتن نەدۆزرایەوە',
    cash: 'نەقد',
    card: 'کارت',
    other: 'ئەوی تر',
    viewDetails: 'بینینی وردەکاری',
    printReceipt: 'چاپکردنی پسوڵە',
    download: 'داگرتن',
    backToList: 'گەڕانەوە بۆ لیست',
    receiptDetails: 'وردەکاریی پسوڵە',
    lastReceipt: 'دوایین پسوڵە',
    totalSalesCount: 'کۆی گشتی',
    salesWillAppearHere: 'فرۆشتنە تەواوبووەکان لێرە دەردەکەون',
    cashierInfo: 'سندوقدار',
    productsLabel: 'بەرهەمەکان',
    dateLabel: 'بەروار',
    closeButton: 'داخستن',

    // Language Selection Modal
    languageSelectionTitle: 'زمان هەڵبژێرە',
    languageChangeInfo: 'گۆڕینی زمان کاریگەری لەسەر هەموو شاشەکان دەبێت و بە شێوەیەکی خۆکار پاشەکەوت دەکرێت.',
    textDirection: 'ئاراستەی دەق',
    textDirectionOptional: 'ئاراستەی دەق (دڵخواز)',

    // Keyboard Shortcuts
    keyboardShortcuts: 'کورتەڕێگەی تەختەکلیل',
    pos: 'کردارەکانی پۆس',
    quick: 'کردارە خێراکان',
    navigation: 'گەڕان',
    productSearch: 'گەڕانی بەرهەم',
    quickPayment: 'پارەدانی خێرا',
    focusBarcodeInput: 'سەرنج خستنە سەر خانەی بارکۆد',
    confirmBarcode: 'پشتڕاستکردنەوەی بارکۆد',
    clearCart: 'پاککردنەوەی سەبەتە',
    openCashRegister: 'کردنەوەی سندوقی نەقد',
    closeCashRegister: 'داخستنی سندوقی نەقد',

    // Voice & Advanced Search
    voiceSearch: 'گەڕانی دەنگی',
    results: 'ئەنجامەکان',
    searching: 'گەڕان...',

    // POS Interactive
    quantitySaved: 'بڕ پاشەکەوتکرا',
    quantitySavedMessage: 'بڕ پاشەکەوتکرا: {quantity}. ئێستا بارکۆد داخڵ بکە.',
    pleaseEnterBarcode: 'تکایە بارکۆد داخڵ بکە',
    pleaseEnterQuantityFirst: 'تکایە سەرەتا بڕ داخڵ بکە، پاشان * دابگرە',
    pleaseSelectVariant: 'تکایە جۆرێک هەڵبژێرە',
    barcodeNotFound: 'بارکۆد نەدۆزرایەوە',
    pleaseEnterBarcodeFirst: 'تکایە سەرەتا بارکۆد بنووسە',
    openCashRegisterToAddProduct: 'بۆ زیادکردنی بەرهەم سەرەتا سندوق بکەرەوە!',
    productAddedToCart: '{productName} زیادکرا بۆ سەبەتە',
    productRemovedFromCart: 'بەرهەم لە سەبەتە لابرا',
    variantChanged: 'جۆر گۆڕدرا بۆ: {variant}',
    receiptCancelled: 'پسوڵە هەڵوەشێنرایەوە: {reason}',
    cartEmpty: 'سەبەتە بەتاڵە',
    clearCurrentCartFirst: 'سەرەتا سەبەتەی ئێستا پاک بکەرەوە',
    parkedReceiptRetrieved: 'پسوڵەی هەڵواسراو گەڕێندرایەوە',
    parkedReceiptDeleted: 'پسوڵەی هەڵواسراو سڕایەوە',
    openCashRegisterToSell: 'بۆ فرۆشتن سەرەتا سندوق بکەرەوە!',
    discountApplied: '{percent}% داشکاندن جێبەجێکرا',
    quantitySavedBarcodeEnter: 'بڕ: {quantity} - بارکۆد داخڵ بکە',
    enterBarcode: 'بارکۆد داخڵ بکە...',
    automatic: '(خۆکار)',
    discountLabel: 'داشکاندن:',
    keyboardShortcutsTitle: 'کورتەڕێگەی تەختەکلیل (? دابگرە)',
    shortcuts: 'کورتەڕێگەکان',
    returnCompleted: 'گەڕاندنەوە تەواو بوو',
    productAssignedToSlot: '{productName} دانرا بۆ شوێنی #{slotNumber}',
    cashHandedOver: 'نەقد گواسترایەوە بۆ {staff}',
    cashHandedOverMessage: 'نەقد گواسترایەوە بۆ {staff}.\n\nبڕ: {amount}\n\n{staff} دەبێت ئەمە پشتڕاست بکاتەوە لە کاتی کردنەوەی سندوق.',
    cashOpenedSuccessfully: 'سندوق بە سەرکەوتوویی کرایەوە!',
    cashOpenedMessage: 'سندوق بە سەرکەوتوویی کرایەوە!\n\nنەقدی سەرەتا: {amount}\nسندوقدار: {staff}',
    defaultQuantity: '1x',
    zeroPlaceholder: '0',
    pageRange: '{start}-{end}',
    cashRegisterNumber: 'سندوق-٩١',
    version: 'v1.0',
    versionTitle: 'وەشان: v1.0',
    lastReceiptButton: 'دوایین پسوڵە',
    systemAdministrator: 'بەڕێوەبەری سیستەم',

    // Cash Register Process
    openCashRegisterProcess: 'کرداری کردنەوەی سندوق',
    cashHandoverAccept: 'قبوڵکردنی گواستنەوەی نەقد',
    numpad: 'تەختەکلیل',
    cashHandoverAvailable: 'گواستنەوەی نەقد بەردەستە',
    handoverFromCashier: 'سندوقداری گواستنەوە:',
    handoverAmount: 'بڕی گواستنەوە:',
    sessionInformation: 'زانیاری دانیشتن',
    cashierLabel: 'سندوقدار:',
    banknoteCount: 'ژماردنی بانکنۆت',
    openingCashAmount: 'بڕی نەقدی کردنەوە',
    banknoteAndCoinCount: 'ژماردنی بانکنۆت و دراو',
    openingCashRegister: 'کردنەوەی سندوق',
    openingCashDescription: 'بڕی نەقدی سەرەتایی سندوق بنووسە',
    noteOptional: 'تێبینی (ئارەزوومەندانە)',
    cashOpeningNotePlaceholder: 'تێبینییەکانت لێرە بنووسە...',
    zeroOpeningCashConfirm: 'دڵنیایت لە کردنەوەی سندوق بە 0؟',
    helpMessage: 'ئەگەر ئەم هەڵەیە بەردەوام بوو، تکایە پەیوەندی بە تیمی پشتگیری تەکنیکییەوە بکە.',
    closeCashRegisterProcess: 'کرداری داخستنی سندوق',
    salesSummary: 'پوختەی فرۆشتن',
    grossSales: 'کۆی فرۆشتنی گشتی',
    returnTotal: 'کۆی گەڕاندنەوە',
    netSales: 'فرۆشتنی خاوێن',
    paymentMethods: 'شێوازەکانی پارەدان',
    cashSales: 'فرۆشتنی نەقد',
    creditCard: 'کارتی بانکی',
    totalCollection: 'کۆی کۆکراوە',
    cashStatus: 'دۆخی نەقد',
    cardSales: 'فرۆشتن بە کارت',
    expectedCash: 'نەقدی چاوەڕوانکراو',
    countedCashAmount: 'نەقدی ژمێردراو',
    cashCountExample: 'نموونە: ١٠٠٠.٠٠',
    cashDifference: 'جیاوازی نەقد',
    cashBalanced: 'هاوسەنگ',
    excess: 'زیادە',
    shortage: 'کەم',
    cashClosingNotePlaceholder: 'تێبینییەکانت لێرە بنووسە...',
    printReport: 'ڕاپۆرت چاپ بکە',
    transferToOtherCashier: 'گواستنەوە بۆ سندوقدارێکی تر',
    cashCountRequired: 'تکایە بڕی نەقدی ژمێردراو داخڵ بکە!',
    cashDifferenceConfirm: 'جیاوازی نەقد هەیە. دەتەوێت بەردەوام بیت؟',
    cashClosedSuccessfully: 'سندوق بە سەرکەوتوویی داخرا!',
    cashHandoverCountRequired: 'تکایە بڕی گواستنەوە داخڵ بکە!',
    sessionDay: 'ڕۆژ',
    session: 'دانیشتن',

    // Diagnostic & System
    firmSelectionScope: 'هەڵبژاردنی کۆمپانیا / FIRM',
    step01Auth: 'هەنگاوی 01 / ڕێپێدان',
    step02Scope: 'هەنگاوی 02 / مەودا',
    selectFirmPrompt: 'کۆمپانیا هەڵبژێرە',
    storeSelectionScope: 'هەڵبژاردنی لق / STORE',
    editInfo: 'دەستکاری زانیاری',
    verifying: 'پشکنین دەکرێت...',
    systemLogin: 'چوونە ژوورەوە بۆ سیستەم',
    continue: 'بەردەوامبە',
    enterUsernamePassword: 'تکایە ناوی بەکارهێنەر و وشەی نهێنی بنووسە.',
    invalidCredentials: 'ناوی بەکارهێنەر یان وشەی نهێنی هەڵەیە',
    loginFailed: 'چوونە ژوورەوە سەرکەوتوو نەبوو.',
    networkError: 'هەڵەیەکی تۆڕ ڕوویدا.',
    systemLogs: 'تۆمارەکانی سیستەم',
    supportCenter: 'سەنتەری پشتگیری',
    hwid: 'ناسنامەی ئامێر (HWID)',
    copy: 'کۆپی',
    copied: 'کۆپی کرا',
    status: 'بارودۆخ',
    online: 'پەیوەستە',
    waiting: 'چاوەڕوانە',
    startSupport: 'دەستپێکردنی پشتگیری',
    closeWindow: 'داخستنی پەنجەرە',
    systemLogsTitle: 'تۆمارەکانی سیستەم',
    diagnosticsSubtitle: 'پشکنین و وردبینی کاتی ڕاستەقینە',
    noLogsYet: 'هیچ تۆمارێک نییە',
    totalEntries: 'کۆی تۆمارەکان',

    // Main Layout
    posModule: 'فرۆشتن',
    managementModule: 'بەڕێوەبردن',
    wmsModule: 'کۆگا (WMS)',
    setDateTime: 'ڕێکخستنی کات و بەروار',
    requiresAdminPassword: 'ئەم کارە پێویستی بە دەسەڵاتی بەڕێوەبەر هەیە. گۆڕینی بەروار ڕەنگە کار بکاتە سەر تۆمارەکانی فرۆشتن.',
    enterAdminPassword: 'وشەی نهێنی بەڕێوەبەر بنووسە',
    managementPanelAccess: 'دەستگەیشتن بە پانێڵی بەڕێوەبردن',
    incorrectPassword: 'وشەی نهێنی هەڵەیە!',

    // Central Data Management
    centralDataManagementSystem: 'سیستەمی بەڕێوەبردنی داتای ناوەندی',
    centralDataManagementSubtitle: 'بەڕێوەبردنی هاوکاتکردن و پەخشی دامەزراوەکان v2.0',
    backup: 'پاڵپشتی',
    import: 'هێنان',
    sending: 'ناردن دەکرێت...',
    sendNow: 'ئێستا بنێرە',
    totalDevicesLabel: 'کۆی ئامێرەکان',
    onlineDevicesLabel: 'پەیوەستە',
    pendingBroadcastsLabel: 'چاوەڕوانە',
    scheduledBroadcastsLabel: 'کاتی بۆ دانراوە',
    successRateLabel: 'ڕێژەی سەرکەوتن',
    last24hLabel: '٢٤ کاتژمێر',
    dataTransferLabel: 'گواستنەوەی داتا',
    sendDataTab: 'ناردنی داتا',
    dataTypeLabel: 'جۆری داتا',
    administrator: 'بەڕێوەبەر',
    quickProductPageSelect: 'هەڵبژاردنی پەڕەی بەرهەمی خێرا',

    // Product Detail Modal
    productInfo: 'زانیاری بەرهەم',
    recentMovements: 'جوڵەکانی دوایی',
    branchStockStatus: 'دۆخی کۆگای لق',
    reserved: 'پارێزراو',
    available: 'بەردەست',
    totalStock: 'کۆی کۆگا',
    incomingTransfer: 'گواستنەوەی هاتوو',
    outgoingTransfer: 'گواستنەوەی ڕۆیشتوو',
    purchase: 'کڕین',
    cancelReceiptTitle: 'هەڵوەشاندنەوەی پسوڵە',
    customerChangedMind: 'کڕیار پەشیمان بووەوە',
    wrongProductAdded: 'بەرهەمی هەڵە زیادکراوە',
    priceProblem: 'کێشەی نرخ',
    paymentFailed: 'پارەدان سەرکەوتوو نەبوو',
    systemError: 'هەڵەی سیستەم',
    explainCancelReason: 'هۆکاری هەڵوەشاندنەوە ڕوون بکەرەوە...',
    cancelReasonPlaceholder: 'هۆکاری هەڵوەشاندنەوە هەڵبژێرە...',
    pleaseSelectCancelReason: 'تکایە هۆکاری هەڵوەشاندنەوە هەڵبژێرە!',
    pleaseExplainCancelReason: 'تکایە هۆکاری هەڵوەشاندنەوە ڕوون بکەرەوە!',
    giveUp: 'وازهێنان',
    factoryResetConfirm: 'هەموو داتا و ڕێکخستنەکان دەسڕێنەوە. دڵنیایت؟',
    resetFailed: 'هەڵە لە گەڕاندنەوە بۆ باری کارگە:',
    selectSystemLanguage: 'زمانی سیستەم هەڵبژێرە',
    remoteSupportRequestSent: 'داواکاری پشتگیری نێردرا.',
    remoteSupportWarning: 'تێبینی: پشتگیری دوورەدەست دەستپێدەکات.',
    confirmClearLogs: 'هەموو تۆمارەکان دەسڕێنەوە. دڵنیایت؟',
    logAudit: 'تۆمار/پشکنین',

    menu: {
      materialManagement: "بەڕێوەبردنی ماددەکان",
      masterRecords: "تۆمارە سەرەکییەکان",
      materialClasses: "پۆلەکانی ماددە",
      materials: "ماددەکان",
      unitSets: "کۆمەڵە یەکەکان",
      variants: "جۆرەکان",
      specialCodes: "کۆدە تایبەتەکان",
      brandDefinitions: "پێناسەی براندەکان",
      groupCodes: "کۆدی گروپەکان",
      productCategories: "ھاوبۆلەکانی بەرهەم",
      movements: "جوڵەکان",
      stockManagementPanel: "پانێڵی بەڕێوەبردنی کۆگا",
      materialManagementSlips: "پسوڵەکانی بەڕێوەبردنی ماددە",
      reports: "ڕاپۆرتەکان",
      materialExtract: "کورتەی ماددە",
      materialValue: "بەهای ماددە",
      inventory: "سەرژمێری",
      cost: "تێچوو",
      inOutTotals: "کۆی هاتوو و چوو",
      materialWarehouseStatus: "باری کۆگای ماددەکان",
      transactionBreakdown: "وردەکاری جوڵەکان",
      slipList: "لیستی پسوڵەکان",
      minMaxStock: "کەمترین و زۆرترین کۆگا",
      mainMenu: "مێنوی سەرەکی",
      homepage: "پەڕەی سەرەکی",
      dashboard: "داشبۆرد",
      storeManagement: "بەڕێوەبردنی فرۆشگا",
      storePanel: "پانێڵی فرۆشگا",
      storeTransfer: "گواستنەوەی فرۆشگا",
      multiStoreManagement: "بەڕێوەبردنی چەند فرۆشگا",
      regionalFranchiseManagement: "بەڕێوەبردنی بریکارە هەرێمییەکان",
      storeConfiguration: "ڕێکخستنی فرۆشگا",
      dataBroadcast: "ناردن/وەرگرتنی زانیاری",
      integrations: "بەستنەوەکان",
      excelOperations: "کردارەکانی ئێکسڵ",
      invoices: "پسوڵەکان",
      salesInvoices: "پسوڵەکانی فرۆشتن",
      salesInvoice: "پسوڵەی فرۆشتن",
      retailSales: "فرۆشتنی تاک",
      wholesaleSales: "فرۆشتنی کۆ",
      consignmentSales: "فرۆشتنی ئەمانەت",
      salesReturn: "گەڕانەوەی فرۆشتن",
      purchasing: "کڕین",
      requestSlips: "پسوڵەکانی داواکاری",
      purchaseOrders: "داواکاری کڕین",
      purchaseInvoice: "پسوڵەی کڕین",
      purchaseReturn: "گەڕانەوەی کڕین",
      receivedService: "خزمەتگوزاری وەرگیراو",
      serviceInvoices: "پسوڵەکانی خزمەتگوزاری",
      supplierCards: "کارتی دابینکەران",
      serviceInvoiceIssued: "پسوڵەی خزمەتگوزاری دراو",
      serviceInvoiceReceived: "پسوڵەی خزمەتگوزاری وەرگیراو",
      waybills: "پسوڵەکانی گواستنەوە",
      salesWaybill: "گواستنەوەی فرۆشتن",
      purchaseWaybill: "گواستنەوەی کڕین",
      warehouseTransferWaybill: "پسوڵەی گواستنەوەی کۆگا",
      wasteWaybill: "پسوڵەی بەفیڕۆچوون",
      orders: "داواکارییەکان",
      salesOrder: "داواکاری فرۆشتن",
      offers: "پێشنیارەکان",
      financeManagement: "بەڕێوەبردنی دارایی",
      definitions: "پێناسەکان",
      paymentPlans: "پلانی پارەدان",
      bankPaymentPlans: "پلانی پارەدانی بانکی",
      campaignDefinitions: "پێناسەی کەمپەینەکان",
      cards: "کارتەکان",
      currentAccounts: "حیسابە جارییەکان",
      cashAccounts: "حیسابەکانی نەقد",
      banks: "بانکەکان",
      bankAccounts: "حیسابە بانکییەکان",
      currentAccountSlips: "پسوڵەکانی حیسابی جاری",
      cashOperations: "کردارەکانی نەقد",
      cashSlips: "پسوڵەکانی نەقد",
      bankSlips: "پسوڵەکانی بانک",
      creditCardPosSlips: "پسوڵەکانی پۆس",
      journalAndSlips: "دەفتەری ڕۆژانە و پسوڵەکان",
      currentAccountReports: "ڕاپۆرتەکانی حیسابی جاری",
      cashReports: "ڕاپۆرتەکانی نەقد",
      bankReports: "ڕاپۆرتەکانی بانک",
      trialBalanceReport: "ڕاپۆرتی میزان",
      other: "هیتر",
      accountingManagement: "بەڕێوەبردنی ژمێریاری",
      expenseManagement: "بەڕێوەبردنی خەرجییەکان",
      checkPromissory: "چەک/بەڵێننامە",
      collectionPayment: "وەرگرتن/پارەدان",
      multiCurrency: "چەند دراوێک",
      accountingVouchers: "پسوڵە ژمێریارییەکان",
      retail: "تاک",
      priceAndCampaign: "نرخ و کەمپەین",
      scaleAndWeighedSales: "تەرازوو و فرۆشتنی کێشراو",
      communicationAndNotifications: "پەیوەندی و ئاگادارکردنەوەکان",
      whatsappIntegration: "بەستنەوەی واتسئەپ",
      notificationCenter: "سەنتەری ئاگادارکردنەوە",
      smsManagement: "بەڕێوەبردنی کورتەنامە",
      emailCampaigns: "کەمپەینەکانی ئیمەیڵ",
      reportsAndAnalysis: "ڕاپۆرت و شیکاری",
      aiProductAnalytics: "شیکاری بەرهەم بە ژیری دەستکرد",
      advancedReports100: "⭐ ڕاپۆرتە پێشکەوتووەکان (100+)",
      profitabilityAnalyticsDashboard: "💰 داشبۆردی شیکاری قازانج",
      salesReports: "ڕاپۆرتەکانی فرۆشتن",
      stockReports: "ڕاپۆرتەکانی کۆگا",
      trialBalance: "میزانی پێداچوونەوە",
      incomeStatement: "بەیانی داهات",
      customerAnalysis: "شیکاری کڕیار",
      balanceSheet: "بەیانی دارایی",
      graphicalAnalysis: "شیکاری گرافیکی",
      customReports: "ڕاپۆرتە تایبەتەکان",
      biDashboardAi: "BI Dashboard & AI",
      systemManagement: "بەڕێوەبردنی سیستەم",
      firmPeriodDefinitions: "پێناسەی کۆمپانیا/ماوە",
      workflowAutomation: "خۆکارکردنی کارەکان",
      demoDataManagement: "بەڕێوەبردنی داتای تاقیکاری",
      databaseInfrastructure: "بنیاتنانی بنکەدراوە",
      exSecureGateSecurity: "ExSecureGate (ئاسایش)",
      generalSettings: "ڕێکخستنە گشتییەکان",
      userManagement: "بەڕێوەبردنی بەکارهێنەران",
      roleAndAuthorization: "ڕۆڵ و دەسەڵاتەکان",
      menuManagement: "بەڕێوەبردنی مێنۆ",
      definitionsParameters: "پێناسە/پارامێتەرەکان",
      backupRestore: "پاڵپشتی و گەڕاندنەوە",
      logAudit: "تۆمار/پشکنین",
      systemHealth: "تەندروستی سیستەم",
    }
  }
};
