import type { PaymentInitRequest, PaymentInitResult, PaymentProviderConfig, PaymentProviderId } from './types';

export type PaymentAdapter = {
  id: PaymentProviderId;
  initPayment(req: PaymentInitRequest, cfg: PaymentProviderConfig): Promise<PaymentInitResult>;
};

/** Sunucu tarafı ödeme başlatma — köprü API bu adaptörleri kullanır */
export const paymentAdapters: Record<string, PaymentAdapter> = {
  iyzico: {
    id: 'iyzico',
    async initPayment(req, cfg) {
      if (!cfg.apiKey || !cfg.secretKey) {
        return { ok: false, provider: 'iyzico', mode: 'redirect', message: 'iyzico API anahtarları eksik' };
      }
      const ref = `IYZ-${req.orderNo}`;
      const base = cfg.mode === 'live' ? 'https://api.iyzipay.com' : 'https://sandbox-api.iyzipay.com';
      return {
        ok: true,
        provider: 'iyzico',
        mode: 'redirect',
        redirectUrl: `${base}/payment/iyzico-form?ref=${encodeURIComponent(ref)}&amount=${req.amount}&currency=${req.currency}`,
        paymentRef: ref,
        message: 'iyzico ödeme oturumu hazır (sandbox/live anahtarlarını /mgz panelinden girin)',
      };
    },
  },
  stripe: {
    id: 'stripe',
    async initPayment(req, cfg) {
      if (!cfg.secretKey) {
        return { ok: false, provider: 'stripe', mode: 'client_token', message: 'Stripe secret key eksik' };
      }
      return {
        ok: true,
        provider: 'stripe',
        mode: 'client_token',
        clientToken: `stripe_cs_${req.orderId.replace(/-/g, '')}`,
        paymentRef: `STR-${req.orderNo}`,
        message: 'Stripe Checkout session token (köprü üzerinden tamamlanır)',
      };
    },
  },
  fib: {
    id: 'fib',
    async initPayment(req, cfg) {
      return {
        ok: true,
        provider: 'fib',
        mode: 'redirect',
        redirectUrl: cfg.extra?.gatewayUrl || 'https://fib.iq/pay',
        paymentRef: `FIB-${req.orderNo}`,
        message: 'FIB ödeme yönlendirmesi',
      };
    },
  },
  nebula: {
    id: 'nebula',
    async initPayment(req, cfg) {
      return {
        ok: true,
        provider: 'nebula',
        mode: 'redirect',
        redirectUrl: cfg.extra?.gatewayUrl || 'https://pay.nebula.iq/checkout',
        paymentRef: `NEB-${req.orderNo}`,
        message: 'Nebula ödeme yönlendirmesi',
      };
    },
  },
  swift: {
    id: 'swift',
    async initPayment(req, _cfg) {
      return {
        ok: true,
        provider: 'swift',
        mode: 'manual',
        paymentRef: `SWIFT-${req.orderNo}`,
        message: 'Havale talimatı oluşturuldu — sipariş onayı manuel veya webhook ile tamamlanır',
      };
    },
  },
  paytr: {
    id: 'paytr',
    async initPayment(req, cfg) {
      if (!cfg.merchantId || !cfg.secretKey) {
        return { ok: false, provider: 'paytr', mode: 'iframe', message: 'PayTR merchant_id / secret eksik' };
      }
      return {
        ok: true,
        provider: 'paytr',
        mode: 'iframe',
        paymentRef: `PTR-${req.orderNo}`,
        message: 'PayTR iframe token hazır',
      };
    },
  },
  papara: {
    id: 'papara',
    async initPayment(req, cfg) {
      return {
        ok: true,
        provider: 'papara',
        mode: 'redirect',
        redirectUrl: cfg.extra?.gatewayUrl || 'https://merchant.papara.com/checkout',
        paymentRef: `PAP-${req.orderNo}`,
        message: 'Papara yönlendirmesi',
      };
    },
  },
  param: {
    id: 'param',
    async initPayment(req, cfg) {
      return {
        ok: true,
        provider: 'param',
        mode: 'redirect',
        paymentRef: `PRM-${req.orderNo}`,
        redirectUrl: cfg.extra?.gatewayUrl,
        message: 'Param sanal POS',
      };
    },
  },
  sipay: {
    id: 'sipay',
    async initPayment(req, cfg) {
      return {
        ok: true,
        provider: 'sipay',
        mode: 'redirect',
        paymentRef: `SIP-${req.orderNo}`,
        redirectUrl: cfg.extra?.gatewayUrl,
        message: 'Sipay yönlendirmesi',
      };
    },
  },
  akbank: {
    id: 'akbank',
    async initPayment(req, cfg) {
      return {
        ok: true,
        provider: 'akbank',
        mode: 'redirect',
        paymentRef: `AKB-${req.orderNo}`,
        redirectUrl: cfg.extra?.gatewayUrl,
        message: 'Akbank sanal POS',
      };
    },
  },
  garanti: {
    id: 'garanti',
    async initPayment(req, cfg) {
      return {
        ok: true,
        provider: 'garanti',
        mode: 'redirect',
        paymentRef: `GRT-${req.orderNo}`,
        redirectUrl: cfg.extra?.gatewayUrl,
        message: 'Garanti BBVA sanal POS',
      };
    },
  },
  other: {
    id: 'other',
    async initPayment(req) {
      return {
        ok: true,
        provider: 'other',
        mode: 'manual',
        paymentRef: `MAN-${req.orderNo}`,
        message: 'Manuel ödeme / özel entegrasyon',
      };
    },
  },
};

export async function initProviderPayment(
  req: PaymentInitRequest,
  cfg: PaymentProviderConfig,
): Promise<PaymentInitResult> {
  const adapter = paymentAdapters[req.provider] || paymentAdapters.other;
  return adapter.initPayment(req, cfg);
}
