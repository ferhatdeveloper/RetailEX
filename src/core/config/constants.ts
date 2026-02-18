// System Constants

// Discount Limits by Role
export const DISCOUNT_LIMITS = {
  cashier: 10,   // Kasiyer max %10 indirim
  manager: 50,   // Yönetici max %50 indirim
  admin: 100,    // Admin sınırsız
} as const;

// Tax Rates
export const TAX_RATES = {
  standard: 18,
  reduced: 8,
  superReduced: 1,
} as const;

// Payment Methods
export const PAYMENT_METHODS = {
  CASH: 'cash',
  CARD: 'card',
  ONLINE: 'online',
} as const;

// Roles
export const USER_ROLES = {
  CASHIER: 'cashier',
  MANAGER: 'manager',
  ADMIN: 'admin',
} as const;

// Default Manager Password (should be in env in production)
export const DEFAULT_MANAGER_PASSWORD = '1234';

// Invoice Prefix
export const INVOICE_PREFIX = 'FIS';

// Campaign Prefix
export const CAMPAIGN_PREFIX = 'CMP';

// Discount Reasons
export const DISCOUNT_REASONS = [
  'Kampanya',
  'Müşteri Sadakati',
  'Hasar',
  'Son Kullanma Tarihi',
  'Toplu Satış',
  'Diğer'
] as const;

// Stock Alert Threshold
export const LOW_STOCK_THRESHOLD = 10;

// Default Language
export const DEFAULT_LANGUAGE = 'tr';

// LocalStorage Keys
export const STORAGE_KEYS = {
  USER: 'retailos_user',
  LANGUAGE: 'retailos_language',
  NUMPAD_VISIBLE: 'retailos_numpad_visible',
  THEME: 'retailos_theme',
} as const;

// API Endpoints (for future use)
export const API_ENDPOINTS = {
  LOGIN: '/api/auth/login',
  LOGOUT: '/api/auth/logout',
  PRODUCTS: '/api/products',
  CUSTOMERS: '/api/customers',
  SALES: '/api/sales',
  CAMPAIGNS: '/api/campaigns',
  REPORTS: '/api/reports',
} as const;

// Date Formats
export const DATE_FORMATS = {
  DISPLAY: 'DD.MM.YYYY',
  DISPLAY_TIME: 'DD.MM.YYYY HH:mm',
  ISO: 'YYYY-MM-DD',
  ISO_TIME: 'YYYY-MM-DDTHH:mm:ss',
} as const;

