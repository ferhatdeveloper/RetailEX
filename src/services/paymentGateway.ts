/**
 * RetailOS - Payment Gateway Service
 * FIB (First Iraqi Bank) ve Fast Pay entegrasyonları
 * 
 * NOTLAR:
 * - Bu servis production ortamında gerçek API bilgileri ile yapılandırılmalıdır
 * - API key'ler environment variables'dan okunmalıdır
 * - Tüm ödeme işlemleri backend üzerinden yapılmalıdır (güvenlik)
 */

export interface PaymentProvider {
  id: string;
  name: string;
  logo?: string;
  enabled: boolean;
  config: {
    apiKey?: string;
    merchantId?: string;
    apiUrl?: string;
    [key: string]: any;
  };
}

export interface PaymentTransaction {
  id: string;
  provider: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'cancelled';
  receiptNumber?: string;
  transactionId?: string;
  timestamp: string;
  metadata?: any;
}

/**
 * FIB (First Iraqi Bank) Payment Integration
 * Docs: https://fib.iq/integrations/web-payments/
 */
export class FIBPaymentProvider {
  private apiUrl: string;
  private merchantId: string;
  private apiKey: string;

  constructor(config: { apiUrl?: string; merchantId?: string; apiKey?: string }) {
    this.apiUrl = config.apiUrl || 'https://fib.iq/api/v1';
    this.merchantId = config.merchantId || '';
    this.apiKey = config.apiKey || '';
  }

  /**
   * Ödeme başlatma
   */
  async initiatePayment(params: {
    amount: number;
    currency: string;
    orderId: string;
    description?: string;
    customerInfo?: {
      name?: string;
      phone?: string;
      email?: string;
    };
  }): Promise<{ success: boolean; paymentUrl?: string; transactionId?: string; error?: string }> {
    try {
      // GERÇEK API çağrısı yapılacak
      // Bu örnek implementasyondur

      const requestBody = {
        merchantId: this.merchantId,
        amount: params.amount,
        currency: params.currency,
        orderId: params.orderId,
        description: params.description || `Ödeme - ${params.orderId}`,
        customerInfo: params.customerInfo,
        returnUrl: `${window.location.origin}/payment/callback`,
        cancelUrl: `${window.location.origin}/payment/cancel`
      };

      const response = await fetch(`${this.apiUrl}/payments/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Merchant-ID': this.merchantId
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`FIB Payment API error: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        success: true,
        paymentUrl: data.paymentUrl,
        transactionId: data.transactionId
      };
    } catch (error: any) {
      console.error('FIB Payment initiation failed:', error);
      return {
        success: false,
        error: error.message || 'Ödeme başlatılamadı'
      };
    }
  }

  /**
   * Ödeme durumu sorgulama
   */
  async checkPaymentStatus(transactionId: string): Promise<{
    success: boolean;
    status?: 'pending' | 'success' | 'failed' | 'cancelled';
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.apiUrl}/payments/${transactionId}/status`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Merchant-ID': this.merchantId
        }
      });

      if (!response.ok) {
        throw new Error(`FIB Payment status check failed: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        success: true,
        status: data.status
      };
    } catch (error: any) {
      console.error('FIB Payment status check failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Ödeme iptali/iade
   */
  async refundPayment(transactionId: string, amount?: number): Promise<{
    success: boolean;
    refundId?: string;
    error?: string;
  }> {
    try {
      const requestBody = {
        transactionId,
        amount: amount // Partial refund için
      };

      const response = await fetch(`${this.apiUrl}/payments/${transactionId}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Merchant-ID': this.merchantId
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`FIB Payment refund failed: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        success: true,
        refundId: data.refundId
      };
    } catch (error: any) {
      console.error('FIB Payment refund failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

/**
 * Fast Pay Integration
 * Docs: https://developer.fast-pay.iq/
 */
export class FastPayProvider {
  private apiUrl: string;
  private apiKey: string;
  private storeId: string;

  constructor(config: { apiUrl?: string; apiKey?: string; storeId?: string }) {
    this.apiUrl = config.apiUrl || 'https://api.fast-pay.iq/v1';
    this.apiKey = config.apiKey || '';
    this.storeId = config.storeId || '';
  }

  /**
   * Ödeme başlatma
   */
  async initiatePayment(params: {
    amount: number;
    currency: string;
    orderId: string;
    description?: string;
    customerPhone?: string;
  }): Promise<{ success: boolean; paymentUrl?: string; transactionId?: string; error?: string }> {
    try {
      const requestBody = {
        storeId: this.storeId,
        amount: params.amount,
        currency: params.currency,
        referenceId: params.orderId,
        description: params.description,
        customerPhone: params.customerPhone,
        callbackUrl: `${window.location.origin}/payment/fastpay/callback`
      };

      const response = await fetch(`${this.apiUrl}/payments/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `ApiKey ${this.apiKey}`,
          'X-Store-ID': this.storeId
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`Fast Pay API error: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        success: true,
        paymentUrl: data.paymentUrl || data.qrCodeUrl,
        transactionId: data.paymentId
      };
    } catch (error: any) {
      console.error('Fast Pay initiation failed:', error);
      return {
        success: false,
        error: error.message || 'Ödeme başlatılamadı'
      };
    }
  }

  /**
   * Ödeme durumu sorgulama
   */
  async checkPaymentStatus(transactionId: string): Promise<{
    success: boolean;
    status?: 'pending' | 'success' | 'failed' | 'cancelled';
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.apiUrl}/payments/${transactionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `ApiKey ${this.apiKey}`,
          'X-Store-ID': this.storeId
        }
      });

      if (!response.ok) {
        throw new Error(`Fast Pay status check failed: ${response.statusText}`);
      }

      const data = await response.json();

      // Fast Pay status mapping
      let status: 'pending' | 'success' | 'failed' | 'cancelled' = 'pending';
      if (data.status === 'COMPLETED' || data.status === 'PAID') {
        status = 'success';
      } else if (data.status === 'FAILED' || data.status === 'REJECTED') {
        status = 'failed';
      } else if (data.status === 'CANCELLED') {
        status = 'cancelled';
      }

      return {
        success: true,
        status
      };
    } catch (error: any) {
      console.error('Fast Pay status check failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Ödeme iptali
   */
  async cancelPayment(transactionId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.apiUrl}/payments/${transactionId}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `ApiKey ${this.apiKey}`,
          'X-Store-ID': this.storeId
        }
      });

      if (!response.ok) {
        throw new Error(`Fast Pay cancellation failed: ${response.statusText}`);
      }

      return { success: true };
    } catch (error: any) {
      console.error('Fast Pay cancellation failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}


// Import ZainCash Provider
import { ZainCashPaymentProvider } from './zainCashService';

/**
 * Payment Gateway Manager
 * Tüm ödeme sağlayıcılarını yöneten merkezi servis
 */
export class PaymentGatewayManager {
  private providers: Map<string, PaymentProvider>;
  private fibProvider?: FIBPaymentProvider;
  private fastPayProvider?: FastPayProvider;
  private zainCashProvider?: ZainCashPaymentProvider;

  constructor() {
    this.providers = new Map();
    this.initializeProviders();
  }

  private initializeProviders() {
    // FIB Provider
    const fibConfig = this.loadProviderConfig('fib');
    if (fibConfig.enabled) {
      this.fibProvider = new FIBPaymentProvider(fibConfig.config);
      this.providers.set('fib', fibConfig);
    }

    // Fast Pay Provider
    const fastPayConfig = this.loadProviderConfig('fastpay');
    if (fastPayConfig.enabled) {
      this.fastPayProvider = new FastPayProvider(fastPayConfig.config);
      this.providers.set('fastpay', fastPayConfig);
    }

    // ZainCash Provider
    const zainCashConfig = this.loadProviderConfig('zaincash');
    if (zainCashConfig.enabled) {
      this.zainCashProvider = new ZainCashPaymentProvider(zainCashConfig.config);
      this.providers.set('zaincash', zainCashConfig);
    }
  }

  private loadProviderConfig(providerId: string): PaymentProvider {
    // LocalStorage veya backend'den provider konfigürasyonu yükle
    const storedConfig = localStorage.getItem(`payment_provider_${providerId}`);

    if (storedConfig) {
      return JSON.parse(storedConfig);
    }

    // Default konfigürasyon
    const defaults: { [key: string]: PaymentProvider } = {
      fib: {
        id: 'fib',
        name: 'FIB',
        logo: '/payment-logos/fib.png',
        enabled: true, // Demo için aktif
        config: {
          apiUrl: 'https://fib.iq/api/v1',
          merchantId: 'DEMO_MERCHANT',
          apiKey: 'DEMO_API_KEY'
        }
      },
      fastpay: {
        id: 'fastpay',
        name: 'FastPay',
        logo: '/payment-logos/fastpay.png',
        enabled: true, // Demo için aktif
        config: {
          apiUrl: 'https://api.fast-pay.iq/v1',
          apiKey: 'DEMO_API_KEY',
          storeId: 'DEMO_STORE'
        }
      },
      zaincash: {
        id: 'zaincash',
        name: 'ZainCash',
        logo: '/payment-logos/zaincash.png',
        enabled: true,
        config: {
          merchantId: '758055f4a8044779a35f6ceb69f858b3', // UAT ID
          secret: 'bibLCGTxVAig5To3OLLKPJQMlRR7Pefp', // UAT Secret
          msisdn: '9647829744545', // UAT MSISDN
          isTest: true,
          apiUrl: 'https://pg-api-uat.zaincash.iq/api/v2/payment-gateway/transaction',
          useSimulator: true // Demo ortamı için simülatör modu aktif
        }
      }
    };

    return defaults[providerId] || {
      id: providerId,
      name: providerId,
      enabled: false,
      config: {}
    };
  }

  /**
   * Provider konfigürasyonunu kaydet
   */
  saveProviderConfig(providerId: string, config: PaymentProvider) {
    localStorage.setItem(`payment_provider_${providerId}`, JSON.stringify(config));
    this.providers.set(providerId, config);
    this.initializeProviders();
  }

  /**
   * Aktif provider'ları getir
   */
  getActiveProviders(): PaymentProvider[] {
    return Array.from(this.providers.values()).filter(p => p.enabled);
  }

  /**
   * Ödeme başlat
   */
  async initiatePayment(
    providerId: string,
    params: {
      amount: number;
      currency: string;
      orderId: string;
      description?: string;
      customerInfo?: any;
    }
  ): Promise<{ success: boolean; paymentUrl?: string; transactionId?: string; error?: string; providerName?: string }> {
    const provider = this.providers.get(providerId);

    // DEMO MODE ONLY FOR FIB/FASTPAY IF CONFIGURED AS SUCH
    // But now we try to use real logic if available

    if (providerId === 'fib' && this.fibProvider) {
      if (provider?.config?.merchantId === 'DEMO_MERCHANT') {
        // Mock
        return {
          success: true,
          transactionId: `FIB-${Date.now()}`,
          paymentUrl: `https://demo.fib.iq/pay/${Date.now()}`,
          providerName: 'FIB'
        };
      }
      const result = await this.fibProvider.initiatePayment(params);
      return { ...result, providerName: provider?.name || 'FIB' };
    }
    else if (providerId === 'fastpay' && this.fastPayProvider) {
      if (provider?.config?.storeId === 'DEMO_STORE') {
        // Mock
        return {
          success: true,
          transactionId: `FASTPAY-${Date.now()}`,
          paymentUrl: `https://demo.fast-pay.iq/pay/${Date.now()}`,
          providerName: 'FastPay'
        };
      }
      const result = await this.fastPayProvider.initiatePayment(params);
      return { ...result, providerName: provider?.name || 'FastPay' };
    }
    else if (providerId === 'zaincash' && this.zainCashProvider) {
      // ZainCash real implementation (even if test mode)
      const result = await this.zainCashProvider.initiatePayment({
        amount: params.amount,
        orderId: params.orderId,
        description: params.description
        // we might need to handle currency conversion if amount is not IQD?
        // ZainCash usually expects IQD.
      });
      return { ...result, providerName: provider?.name || 'ZainCash' };
    }

    return {
      success: false,
      error: 'Geçersiz ödeme sağlayıcısı'
    };
  }

  /**
   * Ödeme durumu kontrol et
   */
  async checkPaymentStatus(
    providerId: string,
    transactionId: string
  ): Promise<{ success: boolean; status?: string; error?: string }> {
    if (providerId === 'fib' && this.fibProvider) {
      return this.fibProvider.checkPaymentStatus(transactionId);
    } else if (providerId === 'fastpay' && this.fastPayProvider) {
      return this.fastPayProvider.checkPaymentStatus(transactionId);
    } else if (providerId === 'zaincash' && this.zainCashProvider) {
      // Note: ZainCash checkStatus usually needs the token returned in callback.
      // If transactionId is actually the token, this works. 
      // If not, we might need a different flow for checking status by ID (which requires a different API call).
      // Standard ZainCash flow is: Init -> Redirect -> Callback with Token -> Verify Token.
      // For "check status" polling, we might need another endpoint usually not standard in simple docs.
      // We'll assume the transactionId passed here might be the token or we construct a check if API supports it.
      // For now, let's assume we can't easily poll without the token from callback.
      return { success: false, error: 'ZainCash status check requires token from callback' };
    }

    return {
      success: false,
      error: 'Geçersiz ödeme sağlayıcısı'
    };
  }
}

// Singleton instance
export const paymentGateway = new PaymentGatewayManager();
