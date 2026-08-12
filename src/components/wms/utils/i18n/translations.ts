/**
 * WMS Module - Translations
 * Supported languages: TR, EN, AR, CKB (Sorani Kurdish)
 */

export type Language = 'tr' | 'en' | 'ar' | 'ckb';

export interface Translations {
  // Common
  common: {
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    add: string;
    search: string;
    filter: string;
    export: string;
    import: string;
    print: string;
    refresh: string;
    close: string;
    back: string;
    next: string;
    previous: string;
    submit: string;
    reset: string;
    loading: string;
    noData: string;
    error: string;
    success: string;
    warning: string;
    info: string;
    confirm: string;
    total: string;
    date: string;
    time: string;
    status: string;
    actions: string;
    details: string;
    settings: string;
  };

  // Navigation
  nav: {
    dashboard: string;
    receiving: string;
    returns: string;
    shipping: string;
    transfer: string;
    stockCount: string;
    stockQuery: string;
    multiWarehouse: string;
    binLocation: string;
    qualityControl: string;
    vehicleLoading: string;
    orderSplitting: string;
    salesVelocity: string;
    profitLoss: string;
    performance: string;
    liveTv: string;
    reporting: string;
    autoOrdering: string;
    pricing: string;
    staff: string;
    gpsTracking: string;
    alerts: string;
    tasks: string;
    metrics: string;
    notifications: string;
  };

  // Dashboard
  dashboard: {
    title: string;
    totalStockValue: string;
    todayReceived: string;
    todayShipped: string;
    activeAlerts: string;
    warehouseStatus: string;
    pickingStatus: string;
    transfers: string;
    totalWarehouses: string;
    activeWarehouses: string;
    totalProducts: string;
    stockItems: string;
    pendingPicking: string;
    inProgressPicking: string;
    completedPicking: string;
    todayTransfers: string;
    thisWeekTransfers: string;
    thisMonthTransfers: string;
    recentActivities: string;
    topProducts: string;
    lowStockAlerts: string;
    expiringProducts: string;
  };

  // Receiving
  receiving: {
    title: string;
    newReceiving: string;
    receivingList: string;
    supplier: string;
    referenceNo: string;
    receivedDate: string;
    quantity: string;
    warehouse: string;
    product: string;
    barcode: string;
    serialNo: string;
    lotNo: string;
    expiryDate: string;
    qualityStatus: string;
    approved: string;
    rejected: string;
    pending: string;
    notes: string;
  };

  // Shipping
  shipping: {
    title: string;
    newShipment: string;
    shipmentList: string;
    customer: string;
    shippingDate: string;
    deliveryAddress: string;
    carrier: string;
    trackingNo: string;
    shippingStatus: string;
    packed: string;
    shipped: string;
    delivered: string;
    pickingList: string;
    packingList: string;
  };

  // Transfer
  transfer: {
    title: string;
    newTransfer: string;
    transferList: string;
    fromWarehouse: string;
    toWarehouse: string;
    transferDate: string;
    transferStatus: string;
    requested: string;
    inTransit: string;
    completed: string;
    cancelled: string;
  };

  // Stock
  stock: {
    title: string;
    stockCount: string;
    stockQuery: string;
    currentStock: string;
    availableStock: string;
    reservedStock: string;
    inTransitStock: string;
    minStock: string;
    maxStock: string;
    reorderPoint: string;
    stockValue: string;
    lastUpdate: string;
  };

  // Warehouse
  warehouse: {
    title: string;
    warehouseName: string;
    warehouseCode: string;
    location: string;
    capacity: string;
    usedCapacity: string;
    availableCapacity: string;
    zones: string;
    aisles: string;
    racks: string;
    bins: string;
    active: string;
    inactive: string;
  };

  // GPS Tracking
  gps: {
    title: string;
    liveTracking: string;
    vehicleList: string;
    vehicleNo: string;
    driver: string;
    currentLocation: string;
    destination: string;
    estimatedArrival: string;
    distance: string;
    speed: string;
    route: string;
    mapView: string;
    listView: string;
  };

  // Alerts
  alerts: {
    title: string;
    lowStock: string;
    expiringProducts: string;
    qualityIssues: string;
    delayedShipments: string;
    warehouseCapacity: string;
    urgentTasks: string;
    systemAlerts: string;
    priority: string;
    high: string;
    medium: string;
    low: string;
  };

  // Reports
  reports: {
    title: string;
    inventoryReport: string;
    movementReport: string;
    receivingReport: string;
    shippingReport: string;
    transferReport: string;
    performanceReport: string;
    financialReport: string;
    customReport: string;
    dateRange: string;
    from: string;
    to: string;
    generateReport: string;
    exportPDF: string;
    exportExcel: string;
  };

  // Settings
  settings: {
    title: string;
    general: string;
    warehouse: string;
    users: string;
    permissions: string;
    integrations: string;
    notifications: string;
    language: string;
    darkMode: string;
    currency: string;
    timezone: string;
    dateFormat: string;
    numberFormat: string;
  };

  // Messages
  messages: {
    saveSuccess: string;
    saveError: string;
    deleteSuccess: string;
    deleteError: string;
    loadError: string;
    noPermission: string;
    confirmDelete: string;
    confirmCancel: string;
    processingPleaseWait: string;
  };
}

export const translations: Record<Language, Translations> = {
  tr: {
    common: {
      save: 'Kaydet',
      cancel: 'İptal',
      delete: 'Sil',
      edit: 'Düzenle',
      add: 'Ekle',
      search: 'Ara',
      filter: 'Filtrele',
      export: 'Dışa Aktar',
      import: 'İçe Aktar',
      print: 'Yazdır',
      refresh: 'Yenile',
      close: 'Kapat',
      back: 'Geri',
      next: 'İleri',
      previous: 'Önceki',
      submit: 'Gönder',
      reset: 'Sıfırla',
      loading: 'Yükleniyor...',
      noData: 'Veri bulunamadı',
      error: 'Hata',
      success: 'Başarılı',
      warning: 'Uyarı',
      info: 'Bilgi',
      confirm: 'Onayla',
      total: 'Toplam',
      date: 'Tarih',
      time: 'Saat',
      status: 'Durum',
      actions: 'İşlemler',
      details: 'Detaylar',
      settings: 'Ayarlar',
    },
    nav: {
      dashboard: 'Dashboard',
      receiving: 'Mal Kabul',
      returns: 'İade Yönetimi',
      shipping: 'Sevkiyat Planlama',
      transfer: 'Depo Transfer',
      stockCount: 'Stok Sayım',
      stockQuery: 'Stok Sorgulama',
      multiWarehouse: 'Çoklu Depo',
      binLocation: 'Raf/Alan Yönetimi',
      qualityControl: 'Kalite Kontrol',
      vehicleLoading: 'Araç Yükleme',
      orderSplitting: 'Sipariş Bölme',
      salesVelocity: 'Satış Hızı Analiz',
      profitLoss: 'Kar-Zarar',
      performance: 'Performans',
      liveTv: 'Live TV',
      reporting: 'Raporlama',
      autoOrdering: 'Otomatik Sipariş',
      pricing: 'Fiyatlandırma',
      staff: 'Personel',
      gpsTracking: 'GPS Tracking',
      alerts: 'Uyarılar',
      tasks: 'Görevler',
      metrics: 'Metrikler',
      notifications: 'Bildirimler',
    },
    dashboard: {
      title: 'WMS Dashboard',
      totalStockValue: 'Toplam Stok Değeri',
      todayReceived: 'Bugün Gelen',
      todayShipped: 'Bugün Giden',
      activeAlerts: 'Aktif Uyarılar',
      warehouseStatus: 'Depo Durumu',
      pickingStatus: 'Picking Durumu',
      transfers: 'Transferler',
      totalWarehouses: 'Toplam Depo',
      activeWarehouses: 'Aktif Depo',
      totalProducts: 'Toplam Ürün',
      stockItems: 'Stok Kalemi',
      pendingPicking: 'Bekleyen',
      inProgressPicking: 'Devam Eden',
      completedPicking: 'Tamamlanan',
      todayTransfers: 'Bugün',
      thisWeekTransfers: 'Bu Hafta',
      thisMonthTransfers: 'Bu Ay',
      recentActivities: 'Son İşlemler',
      topProducts: 'En Çok Satan Ürünler',
      lowStockAlerts: 'Düşük Stok Uyarıları',
      expiringProducts: 'Yaklaşan Son Kullanma Tarihleri',
    },
    receiving: {
      title: 'Mal Kabul Yönetimi',
      newReceiving: 'Yeni Mal Kabul',
      receivingList: 'Mal Kabul Listesi',
      supplier: 'Tedarikçi',
      referenceNo: 'Referans No',
      receivedDate: 'Kabul Tarihi',
      quantity: 'Miktar',
      warehouse: 'Depo',
      product: 'Ürün',
      barcode: 'Barkod',
      serialNo: 'Seri No',
      lotNo: 'Lot No',
      expiryDate: 'Son Kullanma Tarihi',
      qualityStatus: 'Kalite Durumu',
      approved: 'Onaylandı',
      rejected: 'Reddedildi',
      pending: 'Bekliyor',
      notes: 'Notlar',
    },
    shipping: {
      title: 'Sevkiyat Planlama',
      newShipment: 'Yeni Sevkiyat',
      shipmentList: 'Sevkiyat Listesi',
      customer: 'Müşteri',
      shippingDate: 'Sevkiyat Tarihi',
      deliveryAddress: 'Teslimat Adresi',
      carrier: 'Kargo Firması',
      trackingNo: 'Takip No',
      shippingStatus: 'Sevkiyat Durumu',
      packed: 'Paketlendi',
      shipped: 'Gönderildi',
      delivered: 'Teslim Edildi',
      pickingList: 'Toplama Listesi',
      packingList: 'Paketleme Listesi',
    },
    transfer: {
      title: 'Depo Transfer',
      newTransfer: 'Yeni Transfer',
      transferList: 'Transfer Listesi',
      fromWarehouse: 'Kaynak Depo',
      toWarehouse: 'Hedef Depo',
      transferDate: 'Transfer Tarihi',
      transferStatus: 'Transfer Durumu',
      requested: 'Talep Edildi',
      inTransit: 'Yolda',
      completed: 'Tamamlandı',
      cancelled: 'İptal Edildi',
    },
    stock: {
      title: 'Stok Yönetimi',
      stockCount: 'Stok Sayım',
      stockQuery: 'Stok Sorgulama',
      currentStock: 'Mevcut Stok',
      availableStock: 'Kullanılabilir Stok',
      reservedStock: 'Rezerve Stok',
      inTransitStock: 'Yoldaki Stok',
      minStock: 'Min. Stok',
      maxStock: 'Max. Stok',
      reorderPoint: 'Yeniden Sipariş Noktası',
      stockValue: 'Stok Değeri',
      lastUpdate: 'Son Güncelleme',
    },
    warehouse: {
      title: 'Depo Yönetimi',
      warehouseName: 'Depo Adı',
      warehouseCode: 'Depo Kodu',
      location: 'Konum',
      capacity: 'Kapasite',
      usedCapacity: 'Kullanılan Kapasite',
      availableCapacity: 'Müsait Kapasite',
      zones: 'Bölgeler',
      aisles: 'Koridorlar',
      racks: 'Raflar',
      bins: 'Hücreler',
      active: 'Aktif',
      inactive: 'Pasif',
    },
    gps: {
      title: 'GPS Tracking',
      liveTracking: 'Canlı Takip',
      vehicleList: 'Araç Listesi',
      vehicleNo: 'Araç No',
      driver: 'Sürücü',
      currentLocation: 'Mevcut Konum',
      destination: 'Hedef',
      estimatedArrival: 'Tahmini Varış',
      distance: 'Mesafe',
      speed: 'Hız',
      route: 'Rota',
      mapView: 'Harita Görünümü',
      listView: 'Liste Görünümü',
    },
    alerts: {
      title: 'Uyarılar',
      lowStock: 'Düşük Stok',
      expiringProducts: 'Son Kullanma Tarihi Yaklaşan',
      qualityIssues: 'Kalite Sorunları',
      delayedShipments: 'Geciken Sevkiyatlar',
      warehouseCapacity: 'Depo Kapasitesi',
      urgentTasks: 'Acil Görevler',
      systemAlerts: 'Sistem Uyarıları',
      priority: 'Öncelik',
      high: 'Yüksek',
      medium: 'Orta',
      low: 'Düşük',
    },
    reports: {
      title: 'Raporlama',
      inventoryReport: 'Envanter Raporu',
      movementReport: 'Hareket Raporu',
      receivingReport: 'Mal Kabul Raporu',
      shippingReport: 'Sevkiyat Raporu',
      transferReport: 'Transfer Raporu',
      performanceReport: 'Performans Raporu',
      financialReport: 'Mali Rapor',
      customReport: 'Özel Rapor',
      dateRange: 'Tarih Aralığı',
      from: 'Başlangıç',
      to: 'Bitiş',
      generateReport: 'Rapor Oluştur',
      exportPDF: 'PDF İndir',
      exportExcel: 'Excel İndir',
    },
    settings: {
      title: 'Ayarlar',
      general: 'Genel',
      warehouse: 'Depo',
      users: 'Kullanıcılar',
      permissions: 'Yetkiler',
      integrations: 'Entegrasyonlar',
      notifications: 'Bildirimler',
      language: 'Dil',
      darkMode: 'Karanlık Mod',
      currency: 'Para Birimi',
      timezone: 'Saat Dilimi',
      dateFormat: 'Tarih Formatı',
      numberFormat: 'Sayı Formatı',
    },
    messages: {
      saveSuccess: 'Başarıyla kaydedildi',
      saveError: 'Kaydetme hatası',
      deleteSuccess: 'Başarıyla silindi',
      deleteError: 'Silme hatası',
      loadError: 'Veri yükleme hatası',
      noPermission: 'Bu işlem için yetkiniz yok',
      confirmDelete: 'Silmek istediğinizden emin misiniz?',
      confirmCancel: 'İptal etmek istediğinizden emin misiniz?',
      processingPleaseWait: 'İşleniyor, lütfen bekleyin...',
    },
  },

  en: {
    common: {
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      add: 'Add',
      search: 'Search',
      filter: 'Filter',
      export: 'Export',
      import: 'Import',
      print: 'Print',
      refresh: 'Refresh',
      close: 'Close',
      back: 'Back',
      next: 'Next',
      previous: 'Previous',
      submit: 'Submit',
      reset: 'Reset',
      loading: 'Loading...',
      noData: 'No data found',
      error: 'Error',
      success: 'Success',
      warning: 'Warning',
      info: 'Info',
      confirm: 'Confirm',
      total: 'Total',
      date: 'Date',
      time: 'Time',
      status: 'Status',
      actions: 'Actions',
      details: 'Details',
      settings: 'Settings',
    },
    nav: {
      dashboard: 'Dashboard',
      receiving: 'Receiving',
      returns: 'Returns',
      shipping: 'Shipping',
      transfer: 'Transfer',
      stockCount: 'Stock Count',
      stockQuery: 'Stock Query',
      multiWarehouse: 'Multi Warehouse',
      binLocation: 'Bin Location',
      qualityControl: 'Quality Control',
      vehicleLoading: 'Vehicle Loading',
      orderSplitting: 'Order Splitting',
      salesVelocity: 'Sales Velocity',
      profitLoss: 'Profit/Loss',
      performance: 'Performance',
      liveTv: 'Live TV',
      reporting: 'Reporting',
      autoOrdering: 'Auto Ordering',
      pricing: 'Pricing',
      staff: 'Staff',
      gpsTracking: 'GPS Tracking',
      alerts: 'Alerts',
      tasks: 'Tasks',
      metrics: 'Metrics',
      notifications: 'Notifications',
    },
    dashboard: {
      title: 'WMS Dashboard',
      totalStockValue: 'Total Stock Value',
      todayReceived: 'Today Received',
      todayShipped: 'Today Shipped',
      activeAlerts: 'Active Alerts',
      warehouseStatus: 'Warehouse Status',
      pickingStatus: 'Picking Status',
      transfers: 'Transfers',
      totalWarehouses: 'Total Warehouses',
      activeWarehouses: 'Active Warehouses',
      totalProducts: 'Total Products',
      stockItems: 'Stock Items',
      pendingPicking: 'Pending',
      inProgressPicking: 'In Progress',
      completedPicking: 'Completed',
      todayTransfers: 'Today',
      thisWeekTransfers: 'This Week',
      thisMonthTransfers: 'This Month',
      recentActivities: 'Recent Activities',
      topProducts: 'Top Products',
      lowStockAlerts: 'Low Stock Alerts',
      expiringProducts: 'Expiring Products',
    },
    receiving: {
      title: 'Receiving Management',
      newReceiving: 'New Receiving',
      receivingList: 'Receiving List',
      supplier: 'Supplier',
      referenceNo: 'Reference No',
      receivedDate: 'Received Date',
      quantity: 'Quantity',
      warehouse: 'Warehouse',
      product: 'Product',
      barcode: 'Barcode',
      serialNo: 'Serial No',
      lotNo: 'Lot No',
      expiryDate: 'Expiry Date',
      qualityStatus: 'Quality Status',
      approved: 'Approved',
      rejected: 'Rejected',
      pending: 'Pending',
      notes: 'Notes',
    },
    shipping: {
      title: 'Shipping Planning',
      newShipment: 'New Shipment',
      shipmentList: 'Shipment List',
      customer: 'Customer',
      shippingDate: 'Shipping Date',
      deliveryAddress: 'Delivery Address',
      carrier: 'Carrier',
      trackingNo: 'Tracking No',
      shippingStatus: 'Shipping Status',
      packed: 'Packed',
      shipped: 'Shipped',
      delivered: 'Delivered',
      pickingList: 'Picking List',
      packingList: 'Packing List',
    },
    transfer: {
      title: 'Warehouse Transfer',
      newTransfer: 'New Transfer',
      transferList: 'Transfer List',
      fromWarehouse: 'From Warehouse',
      toWarehouse: 'To Warehouse',
      transferDate: 'Transfer Date',
      transferStatus: 'Transfer Status',
      requested: 'Requested',
      inTransit: 'In Transit',
      completed: 'Completed',
      cancelled: 'Cancelled',
    },
    stock: {
      title: 'Stock Management',
      stockCount: 'Stock Count',
      stockQuery: 'Stock Query',
      currentStock: 'Current Stock',
      availableStock: 'Available Stock',
      reservedStock: 'Reserved Stock',
      inTransitStock: 'In Transit Stock',
      minStock: 'Min Stock',
      maxStock: 'Max Stock',
      reorderPoint: 'Reorder Point',
      stockValue: 'Stock Value',
      lastUpdate: 'Last Update',
    },
    warehouse: {
      title: 'Warehouse Management',
      warehouseName: 'Warehouse Name',
      warehouseCode: 'Warehouse Code',
      location: 'Location',
      capacity: 'Capacity',
      usedCapacity: 'Used Capacity',
      availableCapacity: 'Available Capacity',
      zones: 'Zones',
      aisles: 'Aisles',
      racks: 'Racks',
      bins: 'Bins',
      active: 'Active',
      inactive: 'Inactive',
    },
    gps: {
      title: 'GPS Tracking',
      liveTracking: 'Live Tracking',
      vehicleList: 'Vehicle List',
      vehicleNo: 'Vehicle No',
      driver: 'Driver',
      currentLocation: 'Current Location',
      destination: 'Destination',
      estimatedArrival: 'Estimated Arrival',
      distance: 'Distance',
      speed: 'Speed',
      route: 'Route',
      mapView: 'Map View',
      listView: 'List View',
    },
    alerts: {
      title: 'Alerts',
      lowStock: 'Low Stock',
      expiringProducts: 'Expiring Products',
      qualityIssues: 'Quality Issues',
      delayedShipments: 'Delayed Shipments',
      warehouseCapacity: 'Warehouse Capacity',
      urgentTasks: 'Urgent Tasks',
      systemAlerts: 'System Alerts',
      priority: 'Priority',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
    },
    reports: {
      title: 'Reporting',
      inventoryReport: 'Inventory Report',
      movementReport: 'Movement Report',
      receivingReport: 'Receiving Report',
      shippingReport: 'Shipping Report',
      transferReport: 'Transfer Report',
      performanceReport: 'Performance Report',
      financialReport: 'Financial Report',
      customReport: 'Custom Report',
      dateRange: 'Date Range',
      from: 'From',
      to: 'To',
      generateReport: 'Generate Report',
      exportPDF: 'Export PDF',
      exportExcel: 'Export Excel',
    },
    settings: {
      title: 'Settings',
      general: 'General',
      warehouse: 'Warehouse',
      users: 'Users',
      permissions: 'Permissions',
      integrations: 'Integrations',
      notifications: 'Notifications',
      language: 'Language',
      darkMode: 'Dark Mode',
      currency: 'Currency',
      timezone: 'Timezone',
      dateFormat: 'Date Format',
      numberFormat: 'Number Format',
    },
    messages: {
      saveSuccess: 'Saved successfully',
      saveError: 'Save error',
      deleteSuccess: 'Deleted successfully',
      deleteError: 'Delete error',
      loadError: 'Data loading error',
      noPermission: 'You do not have permission for this action',
      confirmDelete: 'Are you sure you want to delete?',
      confirmCancel: 'Are you sure you want to cancel?',
      processingPleaseWait: 'Processing, please wait...',
    },
  },

  ar: {
    common: {
      save: 'حفظ',
      cancel: 'إلغاء',
      delete: 'حذف',
      edit: 'تعديل',
      add: 'إضافة',
      search: 'بحث',
      filter: 'تصفية',
      export: 'تصدير',
      import: 'استيراد',
      print: 'طباعة',
      refresh: 'تحديث',
      close: 'إغلاق',
      back: 'رجوع',
      next: 'التالي',
      previous: 'السابق',
      submit: 'إرسال',
      reset: 'إعادة تعيين',
      loading: 'جاري التحميل...',
      noData: 'لا توجد بيانات',
      error: 'خطأ',
      success: 'نجح',
      warning: 'تحذير',
      info: 'معلومات',
      confirm: 'تأكيد',
      total: 'المجموع',
      date: 'التاريخ',
      time: 'الوقت',
      status: 'الحالة',
      actions: 'الإجراءات',
      details: 'التفاصيل',
      settings: 'الإعدادات',
    },
    nav: {
      dashboard: 'لوحة التحكم',
      receiving: 'استلام البضائع',
      returns: 'إدارة المرتجعات',
      shipping: 'تخطيط الشحن',
      transfer: 'نقل المخزون',
      stockCount: 'جرد المخزون',
      stockQuery: 'استعلام المخزون',
      multiWarehouse: 'المستودعات المتعددة',
      binLocation: 'إدارة المواقع',
      qualityControl: 'مراقبة الجودة',
      vehicleLoading: 'تحميل المركبات',
      orderSplitting: 'تقسيم الطلبات',
      salesVelocity: 'تحليل سرعة المبيعات',
      profitLoss: 'الأرباح والخسائر',
      performance: 'الأداء',
      liveTv: 'الشاشة الحية',
      reporting: 'التقارير',
      autoOrdering: 'الطلب التلقائي',
      pricing: 'التسعير',
      staff: 'الموظفين',
      gpsTracking: 'تتبع GPS',
      alerts: 'التنبيهات',
      tasks: 'المهام',
      metrics: 'المقاييس',
      notifications: 'الإشعارات',
    },
    dashboard: {
      title: 'لوحة تحكم WMS',
      totalStockValue: 'إجمالي قيمة المخزون',
      todayReceived: 'الوارد اليوم',
      todayShipped: 'المشحون اليوم',
      activeAlerts: 'التنبيهات النشطة',
      warehouseStatus: 'حالة المستودع',
      pickingStatus: 'حالة الانتقاء',
      transfers: 'التحويلات',
      totalWarehouses: 'إجمالي المستودعات',
      activeWarehouses: 'المستودعات النشطة',
      totalProducts: 'إجمالي المنتجات',
      stockItems: 'عناصر المخزون',
      pendingPicking: 'قيد الانتظار',
      inProgressPicking: 'قيد التنفيذ',
      completedPicking: 'مكتمل',
      todayTransfers: 'اليوم',
      thisWeekTransfers: 'هذا الأسبوع',
      thisMonthTransfers: 'هذا الشهر',
      recentActivities: 'الأنشطة الأخيرة',
      topProducts: 'المنتجات الأكثر مبيعاً',
      lowStockAlerts: 'تنبيهات المخزون المنخفض',
      expiringProducts: 'المنتجات منتهية الصلاحية قريباً',
    },
    receiving: {
      title: 'إدارة استلام البضائع',
      newReceiving: 'استلام جديد',
      receivingList: 'قائمة الاستلام',
      supplier: 'المورد',
      referenceNo: 'الرقم المرجعي',
      receivedDate: 'تاريخ الاستلام',
      quantity: 'الكمية',
      warehouse: 'المستودع',
      product: 'المنتج',
      barcode: 'الباركود',
      serialNo: 'الرقم التسلسلي',
      lotNo: 'رقم الدفعة',
      expiryDate: 'تاريخ انتهاء الصلاحية',
      qualityStatus: 'حالة الجودة',
      approved: 'موافق عليه',
      rejected: 'مرفوض',
      pending: 'قيد الانتظار',
      notes: 'ملاحظات',
    },
    shipping: {
      title: 'تخطيط الشحن',
      newShipment: 'شحنة جديدة',
      shipmentList: 'قائمة الشحنات',
      customer: 'العميل',
      shippingDate: 'تاريخ الشحن',
      deliveryAddress: 'عنوان التسليم',
      carrier: 'شركة الشحن',
      trackingNo: 'رقم التتبع',
      shippingStatus: 'حالة الشحن',
      packed: 'معبأ',
      shipped: 'مشحون',
      delivered: 'تم التسليم',
      pickingList: 'قائمة الانتقاء',
      packingList: 'قائمة التعبئة',
    },
    transfer: {
      title: 'نقل المخزون',
      newTransfer: 'نقل جديد',
      transferList: 'قائمة النقل',
      fromWarehouse: 'من المستودع',
      toWarehouse: 'إلى المستودع',
      transferDate: 'تاريخ النقل',
      transferStatus: 'حالة النقل',
      requested: 'مطلوب',
      inTransit: 'في الطريق',
      completed: 'مكتمل',
      cancelled: 'ملغى',
    },
    stock: {
      title: 'إدارة المخزون',
      stockCount: 'جرد المخزون',
      stockQuery: 'استعلام المخزون',
      currentStock: 'المخزون الحالي',
      availableStock: 'المخزون المتاح',
      reservedStock: 'المخزون المحجوز',
      inTransitStock: 'المخزون في الطريق',
      minStock: 'الحد الأدنى للمخزون',
      maxStock: 'الحد الأقصى للمخزون',
      reorderPoint: 'نقطة إعادة الطلب',
      stockValue: 'قيمة المخزون',
      lastUpdate: 'آخر تحديث',
    },
    warehouse: {
      title: 'إدارة المستودعات',
      warehouseName: 'اسم المستودع',
      warehouseCode: 'كود المستودع',
      location: 'الموقع',
      capacity: 'السعة',
      usedCapacity: 'السعة المستخدمة',
      availableCapacity: 'السعة المتاحة',
      zones: 'المناطق',
      aisles: 'الممرات',
      racks: 'الرفوف',
      bins: 'الخلايا',
      active: 'نشط',
      inactive: 'غير نشط',
    },
    gps: {
      title: 'تتبع GPS',
      liveTracking: 'التتبع المباشر',
      vehicleList: 'قائمة المركبات',
      vehicleNo: 'رقم المركبة',
      driver: 'السائق',
      currentLocation: 'الموقع الحالي',
      destination: 'الوجهة',
      estimatedArrival: 'الوصول المتوقع',
      distance: 'المسافة',
      speed: 'السرعة',
      route: 'المسار',
      mapView: 'عرض الخريطة',
      listView: 'عرض القائمة',
    },
    alerts: {
      title: 'التنبيهات',
      lowStock: 'مخزون منخفض',
      expiringProducts: 'منتجات منتهية الصلاحية قريباً',
      qualityIssues: 'مشاكل الجودة',
      delayedShipments: 'شحنات متأخرة',
      warehouseCapacity: 'سعة المستودع',
      urgentTasks: 'مهام عاجلة',
      systemAlerts: 'تنبيهات النظام',
      priority: 'الأولوية',
      high: 'عالية',
      medium: 'متوسطة',
      low: 'منخفضة',
    },
    reports: {
      title: 'التقارير',
      inventoryReport: 'تقرير الجرد',
      movementReport: 'تقرير الحركة',
      receivingReport: 'تقرير الاستلام',
      shippingReport: 'تقرير الشحن',
      transferReport: 'تقرير النقل',
      performanceReport: 'تقرير الأداء',
      financialReport: 'التقرير المالي',
      customReport: 'تقرير مخصص',
      dateRange: 'نطاق التاريخ',
      from: 'من',
      to: 'إلى',
      generateReport: 'إنشاء تقرير',
      exportPDF: 'تصدير PDF',
      exportExcel: 'تصدير Excel',
    },
    settings: {
      title: 'الإعدادات',
      general: 'عام',
      warehouse: 'المستودع',
      users: 'المستخدمين',
      permissions: 'الصلاحيات',
      integrations: 'التكاملات',
      notifications: 'الإشعارات',
      language: 'اللغة',
      darkMode: 'الوضع الداكن',
      currency: 'العملة',
      timezone: 'المنطقة الزمنية',
      dateFormat: 'صيغة التاريخ',
      numberFormat: 'صيغة الأرقام',
    },
    messages: {
      saveSuccess: 'تم الحفظ بنجاح',
      saveError: 'خطأ في الحفظ',
      deleteSuccess: 'تم الحذف بنجاح',
      deleteError: 'خطأ في الحذف',
      loadError: 'خطأ في تحميل البيانات',
      noPermission: 'ليس لديك صلاحية لهذا الإجراء',
      confirmDelete: 'هل أنت متأكد من الحذف؟',
      confirmCancel: 'هل أنت متأكد من الإلغاء؟',
      processingPleaseWait: 'جاري المعالجة، يرجى الانتظار...',
    },
  },

  ckb: {
    common: {
      save: 'خزنەو',
      cancel: 'داخستن',
      delete: 'سڕینەو',
      edit: 'دەستکاری کردن',
      add: 'زیادکردن',
      search: 'گەڕاندن',
      filter: 'پیشگیراندن',
      export: 'دەرەکەوت کردن',
      import: 'داوردن',
      print: 'چاپ کردن',
      refresh: 'نوێکردن',
      close: 'داخستن',
      back: 'گەڕاندن',
      next: 'دواتر',
      previous: 'پێشتر',
      submit: 'پێشکەوەندن',
      reset: 'نوێکردن',
      loading: 'داگرتن...',
      noData: 'زانیاری نەکەوتەوە',
      error: 'هەڵە',
      success: 'کەسەرەت',
      warning: 'ئاگاداری',
      info: 'زانیاری',
      confirm: 'پشتیواندن',
      total: 'کۆل',
      date: 'تاریخ',
      time: 'کات',
      status: 'حەڵەت',
      actions: 'کارەکەوتەکان',
      details: 'تفاوتەکان',
      settings: 'ڕێکخستنەکان',
    },
    nav: {
      dashboard: 'داشبورد',
      receiving: 'پەیوەندی کردن',
      returns: 'گەشتیارەکان',
      shipping: 'پەیوەندی کردن',
      transfer: 'گەشتنەکان',
      stockCount: 'ژمارەکردنی مخزون',
      stockQuery: 'پرسەندنی مخزون',
      multiWarehouse: 'مخازنەکان چەند',
      binLocation: 'مەکانی بین',
      qualityControl: 'کنترۆلی کیفیت',
      vehicleLoading: 'بارکردنی وەسەیلەکان',
      orderSplitting: 'پاشکردنی فرۆشتنەکان',
      salesVelocity: 'ڕێکارییەتی فرۆشتنەکان',
      profitLoss: 'کەسەرەت و خسارة',
      performance: 'پەیامەت',
      liveTv: 'تی وی',
      reporting: 'گزارشەکان',
      autoOrdering: 'پەیوەندی کردنی خۆتۆخەوتی',
      pricing: 'نرخەکان',
      staff: 'کارمەندان',
      gpsTracking: 'پیشگیراندنی GPS',
      alerts: 'ئاگاداری',
      tasks: 'کارەکەوتەکان',
      metrics: 'مەتریکەکان',
      notifications: 'ئاگاداری',
    },
    dashboard: {
      title: 'داشبوردی WMS',
      totalStockValue: 'کۆلی قیمتی مخزون',
      todayReceived: 'کەتێکەی گەشتیارەکان',
      todayShipped: 'کەتێکەی پەیوەندی کردن',
      activeAlerts: 'ئاگاداریەکانی فعال',
      warehouseStatus: 'حەڵەتی مخزن',
      pickingStatus: 'حەڵەتی گەشتیارەکان',
      transfers: 'گەشتنەکان',
      totalWarehouses: 'کۆلی مخازنەکان',
      activeWarehouses: 'مخازنەکانی فعال',
      totalProducts: 'کۆلی مەلەکان',
      stockItems: 'مەلەکانی مخزون',
      pendingPicking: 'کەتێکەی گەشتیارەکان',
      inProgressPicking: 'کەتێکەی گەشتیارەکان',
      completedPicking: 'کەتێکەی گەشتیارەکان',
      todayTransfers: 'کەتێکەی گەشتنەکان',
      thisWeekTransfers: 'کەتێکەی گەشتنەکانی هەفتەکە ئێم',
      thisMonthTransfers: 'کەتێکەی گەشتنەکانی مەوەژەکە ئێم',
      recentActivities: 'کارەکەوتەکانی نوێترین',
      topProducts: 'مەلەکانی پێشترین',
      lowStockAlerts: 'ئاگاداریەکانی مخزون کەم',
      expiringProducts: 'مەلەکانی کەتێکەی پایانی کارەکەوتی',
    },
    receiving: {
      title: 'پەیوەندی کردنی گەشتیارەکان',
      newReceiving: 'پەیوەندی کردنی نوێ',
      receivingList: 'فهرستی گەشتیارەکان',
      supplier: 'پیشکەوەندەر',
      referenceNo: 'ژمارەی مەرجع',
      receivedDate: 'تاریخی گەشتیارەکان',
      quantity: 'ژمارە',
      warehouse: 'مخزن',
      product: 'مەل',
      barcode: 'بارکۆد',
      serialNo: 'ژمارەی سێریال',
      lotNo: 'ژمارەی لۆت',
      expiryDate: 'تاریخی پایانی کارەکەوتی',
      qualityStatus: 'حەڵەتی کیفیت',
      approved: 'پێشکەوەندراوە',
      rejected: 'داخستراوە',
      pending: 'کەتێکەی پێشکەوەندن',
      notes: 'تێبینیەکان',
    },
    shipping: {
      title: 'پەیوەندی کردنی پەیوەندی کردن',
      newShipment: 'پەیوەندی کردنی نوێ',
      shipmentList: 'فهرستی پەیوەندی کردن',
      customer: 'بەکارهێنەر',
      shippingDate: 'تاریخی پەیوەندی کردن',
      deliveryAddress: 'ناونیشانی دەستەوازی',
      carrier: 'کاریەر',
      trackingNo: 'ژمارەی پیشگیراندن',
      shippingStatus: 'حەڵەتی پەیوەندی کردن',
      packed: 'پەکەوەندراوە',
      shipped: 'پەیوەندی کردنراوە',
      delivered: 'دەستەوازیراوە',
      pickingList: 'فهرستی گەشتیارەکان',
      packingList: 'فهرستی پەکەوەندن',
    },
    transfer: {
      title: 'گەشتنەکانی مخزن',
      newTransfer: 'گەشتنەکانی نوێ',
      transferList: 'فهرستی گەشتنەکان',
      fromWarehouse: 'مەنابەتەکان لە مخزن',
      toWarehouse: 'مەنابەتەکان بۆ مخزن',
      transferDate: 'تاریخی گەشتنەکان',
      transferStatus: 'حەڵەتی گەشتنەکان',
      requested: 'پێشکەوەندراوە',
      inTransit: 'لە دراوە',
      completed: 'کەمەڵکراوە',
      cancelled: 'داخستراوە',
    },
    stock: {
      title: 'کنترۆلی مخزون',
      stockCount: 'ژمارەکردنی مخزون',
      stockQuery: 'پرسەندنی مخزون',
      currentStock: 'مخزونی ئێم',
      availableStock: 'مخزونی دەستی دروستەوە',
      reservedStock: 'مخزونی گەشتنەکراوە',
      inTransitStock: 'مخزونی لە دراوە',
      minStock: 'مینیموم مخزون',
      maxStock: 'مەکسیموم مخزون',
      reorderPoint: 'نقطەی دەستکاری کردن دوبارە',
      stockValue: 'قیمتی مخزون',
      lastUpdate: 'نوێکردنی دوبارە',
    },
    warehouse: {
      title: 'کنترۆلی مخازنەکان',
      warehouseName: 'ناوی مخزن',
      warehouseCode: 'کۆدی مخزن',
      location: 'مەکان',
      capacity: 'داپەکەوتی',
      usedCapacity: 'داپەکەوتی گەشتنەکراوە',
      availableCapacity: 'داپەکەوتی دەستی دروستەوە',
      zones: 'ناوەکان',
      aisles: 'مەمرەکان',
      racks: 'رفەکان',
      bins: 'بینەکان',
      active: 'فعال',
      inactive: 'نافعال',
    },
    gps: {
      title: 'پیشگیراندنی GPS',
      liveTracking: 'پیشگیراندنی زیاتر',
      vehicleList: 'فهرستی وەسەیلەکان',
      vehicleNo: 'ژمارەی وەسەیلەکان',
      driver: 'سەیارەکەر',
      currentLocation: 'مەکانی ئێم',
      destination: 'ناونیشان',
      estimatedArrival: 'پایانی کارەکەوتی پێشترین',
      distance: 'فاصلە',
      speed: 'سێرەتی',
      route: 'ڕوتە',
      mapView: 'دەربەستەی خەریتە',
      listView: 'دەربەستەی فهرست',
    },
    alerts: {
      title: 'ئاگاداری',
      lowStock: 'مخزون کەم',
      expiringProducts: 'مەلەکانی کەتێکەی پایانی کارەکەوتی',
      qualityIssues: 'پەشکەوەندنی کیفیت',
      delayedShipments: 'پەیوەندی کردنەکانی دەستکاری کراوە',
      warehouseCapacity: 'داپەکەوتی مخزن',
      urgentTasks: 'کارەکەوتەکانی ئاگاداری',
      systemAlerts: 'ئاگاداریەکانی سیستەم',
      priority: 'پێشترینی',
      high: 'زۆر',
      medium: 'مەتوسط',
      low: 'کەم',
    },
    reports: {
      title: 'گزارشەکان',
      inventoryReport: 'گزارشەکانی مخزون',
      movementReport: 'گزارشەکانی گەشتنەکان',
      receivingReport: 'گزارشەکانی گەشتیارەکان',
      shippingReport: 'گزارشەکانی پەیوەندی کردن',
      transferReport: 'گزارشەکانی گەشتنەکان',
      performanceReport: 'گزارشەکانی پەیامەت',
      financialReport: 'گزارشەکانی مالی',
      customReport: 'گزارشەکانی خۆتۆخەوتی',
      dateRange: 'مەوەژەکانی تاریخ',
      from: 'لە',
      to: 'بۆ',
      generateReport: 'سازکردنی گزارشەکان',
      exportPDF: 'دەرەکەوت کردنی PDF',
      exportExcel: 'دەرەکەوت کردنی Excel',
    },
    settings: {
      title: 'ڕێکخستنەکان',
      general: 'گشتاورەکان',
      warehouse: 'مخزن',
      users: 'کارمەندان',
      permissions: 'دەستەوازیەکان',
      integrations: 'پیشکەوەندنەکان',
      notifications: 'ئاگاداری',
      language: 'زمان',
      darkMode: 'دەستەوازیەکانی ئارەک',
      currency: 'دەستەوازیەکانی پارە',
      timezone: 'زمانی زۆنە',
      dateFormat: 'دەستەوازیەکانی تاریخ',
      numberFormat: 'دەستەوازیەکانی ژمارە',
    },
    messages: {
      saveSuccess: 'کەسەرەتەوە',
      saveError: 'هەڵەی خزنەو',
      deleteSuccess: 'کەسەرەتەوە',
      deleteError: 'هەڵەی سڕینەو',
      loadError: 'هەڵەی داگرتنی زانیاری',
      noPermission: 'دەستەوازیەکانی ئێم نەکەوتەوە',
      confirmDelete: 'دڵنیاییت کەتێکەی سڕینەو؟',
      confirmCancel: 'دڵنیاییت کەتێکەی داخستن؟',
      processingPleaseWait: 'دەستکاری کردن، لطفاً کەمێک لەمەوە دەستکاری کەوە...',
    },
  },
};
