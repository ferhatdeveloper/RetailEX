// Mock data for 50 stores retail chain

export interface Store {
  id: string;
  code: string;
  name: string;
  region: string;
  city: string;
  district: string;
  manager: string;
  phone: string;
  status: 'active' | 'inactive' | 'maintenance';
  openingDate: string;
  size: number; // m2
  employeeCount: number;
}

export interface StoreStats {
  storeId: string;
  date: string;
  revenue: number;
  transactionCount: number;
  customerCount: number;
  avgBasket: number;
  cashBalance: number;
  stockValue: number;
}

export interface StoreAlert {
  id: string;
  storeId: string;
  storeName: string;
  type: 'critical' | 'warning' | 'info';
  category: 'stock' | 'cash' | 'system' | 'personnel';
  message: string;
  timestamp: string;
  resolved: boolean;
}

const regions = ['Baghdad', 'Basra', 'Erbil', 'Sulaymaniyah', 'Najaf'];
const cities = {
  'Baghdad': ['Karrada', 'Mansour', 'Sadr City', 'Adamiyah', 'Karkh', 'Rusafa'],
  'Basra': ['Ashar', 'Jumhuriya', 'Qibla', 'Minawi Pasha'],
  'Erbil': ['Downtown', 'Ankawa', 'Sami Abdulrahman Park', 'Masif'],
  'Sulaymaniyah': ['City Center', 'Bakhtiyari', 'Tasluja', 'Qularaisi'],
  'Najaf': ['Old City', 'New City', 'Kufa']
};

const managers = [
  'Ahmed Al-Maliki', 'Mohammed Hassan', 'Layla Hassan', 'Fatima Al-Zaidi', 'Ali Al-Obeidi',
  'Zainab Al-Najjar', 'Mustafa Al-Sadr', 'Noor Mohammed', 'Hassan Karim', 'Aisha Al-Sadr',
  'Omar Al-Tikriti', 'Sara Ahmed', 'Hussein Al-Najjar', 'Zainab Ali', 'Kareem Al-Basri',
  'Bashar Al-Mosuli', 'Layla Ibrahim', 'Omar Khalil', 'Fatima Al-Hashimi', 'Ali Al-Sistani'
];

// Generate 50 stores
export const stores: Store[] = Array.from({ length: 50 }, (_, i) => {
  const region = regions[i % regions.length];
  const cityList = cities[region];
  const city = cityList[Math.floor(Math.random() * cityList.length)];
  
  return {
    id: `store-${String(i + 1).padStart(3, '0')}`,
    code: `MG${String(i + 1).padStart(3, '0')}`,
    name: `${city} ${['AVM', 'Merkez', 'Plaza', 'Center', 'Cadde'][i % 5]} Mağaza`,
    region,
    city: region,
    district: city,
    manager: managers[i % managers.length],
    phone: `0312 ${Math.floor(Math.random() * 900 + 100)} ${Math.floor(Math.random() * 9000 + 1000)}`,
    status: i === 49 ? 'maintenance' : (Math.random() > 0.95 ? 'inactive' : 'active'),
    openingDate: `2020-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-15`,
    size: Math.floor(Math.random() * 300 + 100),
    employeeCount: Math.floor(Math.random() * 15 + 5)
  };
});

// Generate today's stats for all stores
export const todayStats: StoreStats[] = stores.map(store => {
  const transactionCount = Math.floor(Math.random() * 200 + 50);
  const revenue = transactionCount * (Math.random() * 200 + 150);
  
  return {
    storeId: store.id,
    date: new Date().toISOString().split('T')[0],
    revenue: Math.round(revenue),
    transactionCount,
    customerCount: Math.floor(transactionCount * 0.8),
    avgBasket: Math.round(revenue / transactionCount),
    cashBalance: Math.round(Math.random() * 50000 + 10000),
    stockValue: Math.round(Math.random() * 500000 + 100000)
  };
});

// Generate alerts
export const storeAlerts: StoreAlert[] = [
  {
    id: 'alert-001',
    storeId: 'store-005',
    storeName: stores[4].name,
    type: 'critical',
    category: 'stock',
    message: '15 ürün kritik stok seviyesinde',
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    resolved: false
  },
  {
    id: 'alert-002',
    storeId: 'store-012',
    storeName: stores[11].name,
    type: 'warning',
    category: 'cash',
    message: 'Kasa dengesi yüksek (75,000 TL) - nakit transferi önerilir',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    resolved: false
  },
  {
    id: 'alert-003',
    storeId: 'store-023',
    storeName: stores[22].name,
    type: 'critical',
    category: 'system',
    message: 'POS cihazı çevrimdışı - son bağlantı 2 saat önce',
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    resolved: false
  },
  {
    id: 'alert-004',
    storeId: 'store-018',
    storeName: stores[17].name,
    type: 'warning',
    category: 'personnel',
    message: 'Vardiya değişimi gecikmesi - 15 dakika',
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    resolved: false
  },
  {
    id: 'alert-005',
    storeId: 'store-031',
    storeName: stores[30].name,
    type: 'critical',
    category: 'stock',
    message: '8 ürün stokta tükendi',
    timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    resolved: false
  },
  {
    id: 'alert-006',
    storeId: 'store-007',
    storeName: stores[6].name,
    type: 'info',
    category: 'system',
    message: 'Sistem güncellemesi mevcut - v1.1.0',
    timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    resolved: false
  }
];

// Helper functions
export const getStoreById = (id: string): Store | undefined => {
  return stores.find(s => s.id === id);
};

export const getStoresByRegion = (region: string): Store[] => {
  return stores.filter(s => s.region === region);
};

export const getActiveStores = (): Store[] => {
  return stores.filter(s => s.status === 'active');
};

export const getTodayStatsForStore = (storeId: string): StoreStats | undefined => {
  return todayStats.find(s => s.storeId === storeId);
};

export const getUnresolvedAlerts = (): StoreAlert[] => {
  return storeAlerts.filter(a => !a.resolved);
};

export const getCriticalAlerts = (): StoreAlert[] => {
  return storeAlerts.filter(a => !a.resolved && a.type === 'critical');
};

// Aggregate stats
export const getTotalStats = () => {
  const total = todayStats.reduce((acc, stat) => ({
    revenue: acc.revenue + stat.revenue,
    transactions: acc.transactions + stat.transactionCount,
    customers: acc.customers + stat.customerCount,
    cashBalance: acc.cashBalance + stat.cashBalance,
    stockValue: acc.stockValue + stat.stockValue
  }), { revenue: 0, transactions: 0, customers: 0, cashBalance: 0, stockValue: 0 });

  return {
    ...total,
    avgBasket: Math.round(total.revenue / total.transactions),
    activeStores: getActiveStores().length,
    totalStores: stores.length
  };
};
