export type PaymentProviderId =
  | 'iyzico'
  | 'stripe'
  | 'fib'
  | 'nebula'
  | 'swift'
  | 'paytr'
  | 'papara'
  | 'param'
  | 'sipay'
  | 'akbank'
  | 'garanti'
  | 'other';

export type PaymentProviderMode = 'test' | 'live';

export type PaymentProviderConfig = {
  id: PaymentProviderId;
  enabled: boolean;
  label: string;
  mode: PaymentProviderMode;
  apiKey?: string;
  secretKey?: string;
  merchantId?: string;
  webhookSecret?: string;
  storeKey?: string;
  extra?: Record<string, string>;
};

export type PaymentInitRequest = {
  tenantCode: string;
  orderId: string;
  orderNo: string;
  amount: number;
  currency: string;
  provider: PaymentProviderId;
  customerEmail?: string;
  customerName?: string;
  returnUrl: string;
  cancelUrl?: string;
};

export type PaymentInitResult = {
  ok: boolean;
  provider: PaymentProviderId;
  mode: 'redirect' | 'client_token' | 'iframe' | 'manual';
  redirectUrl?: string;
  clientToken?: string;
  paymentRef?: string;
  message?: string;
};

export const PAYMENT_PROVIDER_CATALOG: Array<{
  id: PaymentProviderId;
  label: string;
  region: string;
  description: string;
}> = [
  { id: 'iyzico', label: 'iyzico', region: 'TR', description: 'Kart, taksit, 3D Secure' },
  { id: 'stripe', label: 'Stripe', region: 'Global', description: 'Kart, Apple Pay, Google Pay' },
  { id: 'paytr', label: 'PayTR', region: 'TR', description: 'Sanal POS, taksit' },
  { id: 'papara', label: 'Papara', region: 'TR', description: 'Papara cüzdan / kart' },
  { id: 'param', label: 'Param', region: 'TR', description: 'Türk sanal POS' },
  { id: 'sipay', label: 'Sipay', region: 'TR', description: 'Ödeme kuruluşu' },
  { id: 'fib', label: 'FIB', region: 'IQ', description: 'First Iraqi Bank ödeme' },
  { id: 'nebula', label: 'Nebula', region: 'IQ', description: 'Nebula Pay / yerel ödeme' },
  { id: 'swift', label: 'SWIFT / Havale', region: 'Global', description: 'Banka havalesi talimatı' },
  { id: 'akbank', label: 'Akbank Sanal POS', region: 'TR', description: 'Banka sanal POS' },
  { id: 'garanti', label: 'Garanti BBVA', region: 'TR', description: 'Garanti sanal POS' },
  { id: 'other', label: 'Diğer', region: '—', description: 'Özel entegrasyon' },
];
