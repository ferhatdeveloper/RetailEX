/**
 * ExRetailOS - Period Control Service
 * 
 * Dönem bağımlı ve bağımsız işlemleri yöneten servis.
 * Logo muhasebe mantığına uygun dönem kontrolü sağlar.
 * 
 * @created 2024-12-18
 */

import { logger } from '../utils/logger';

// Dönem durumu
export type PeriodStatus = 'OPEN' | 'CLOSED' | 'LOCKED';

// İşlem tipleri
export type OperationType = 
  // Dönem Bağımlı İşlemler
  | 'SALES_INVOICE'
  | 'PURCHASE_INVOICE'
  | 'PAYMENT'
  | 'RECEIPT'
  | 'JOURNAL_ENTRY'
  | 'STOCK_MOVEMENT'
  | 'TRANSFER'
  | 'INVENTORY_COUNT'
  | 'COST_CALCULATION'
  | 'DEPRECIATION'
  | 'SALARY_PAYMENT'
  | 'TAX_PAYMENT'
  | 'PERIOD_CLOSE'
  | 'PERIOD_OPEN'
  // Dönem Bağımsız İşlemler
  | 'PRODUCT_DEFINITION'
  | 'CUSTOMER_DEFINITION'
  | 'SUPPLIER_DEFINITION'
  | 'USER_MANAGEMENT'
  | 'CAMPAIGN_DEFINITION'
  | 'PRICE_LIST'
  | 'CATEGORY_DEFINITION'
  | 'WAREHOUSE_DEFINITION'
  | 'SYSTEM_SETTINGS'
  | 'STORE_DEFINITION'
  | 'CHART_OF_ACCOUNTS'
  | 'REPORT_VIEW';

// Dönem bağımlı işlemler listesi
const PERIOD_DEPENDENT_OPERATIONS: OperationType[] = [
  'SALES_INVOICE',
  'PURCHASE_INVOICE',
  'PAYMENT',
  'RECEIPT',
  'JOURNAL_ENTRY',
  'STOCK_MOVEMENT',
  'TRANSFER',
  'INVENTORY_COUNT',
  'COST_CALCULATION',
  'DEPRECIATION',
  'SALARY_PAYMENT',
  'TAX_PAYMENT',
  'PERIOD_CLOSE',
  'PERIOD_OPEN',
];

// Dönem bağımsız işlemler listesi
const PERIOD_INDEPENDENT_OPERATIONS: OperationType[] = [
  'PRODUCT_DEFINITION',
  'CUSTOMER_DEFINITION',
  'SUPPLIER_DEFINITION',
  'USER_MANAGEMENT',
  'CAMPAIGN_DEFINITION',
  'PRICE_LIST',
  'CATEGORY_DEFINITION',
  'WAREHOUSE_DEFINITION',
  'SYSTEM_SETTINGS',
  'STORE_DEFINITION',
  'CHART_OF_ACCOUNTS',
  'REPORT_VIEW',
];

// Dönem bilgisi interface
export interface PeriodInfo {
  firmaId: string;
  firmaName: string;
  donemId: string;
  donemName: string;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  closedMonths: number[];
}

// Kontrol sonucu
export interface PeriodControlResult {
  allowed: boolean;
  reason?: string;
  requiresPeriod: boolean;
  currentPeriod?: PeriodInfo;
}

/**
 * Dönem Kontrol Servisi
 */
export class PeriodControlService {
  
  /**
   * İşlem yapılabilir mi kontrol et
   */
  static canPerformOperation(
    operationType: OperationType,
    periodInfo: PeriodInfo | null,
    operationDate?: Date
  ): PeriodControlResult {
    
    // Dönem bağımsız işlemler için her zaman izin ver
    if (PERIOD_INDEPENDENT_OPERATIONS.includes(operationType)) {
      return {
        allowed: true,
        requiresPeriod: false,
      };
    }

    // Dönem bağımlı işlemler için dönem kontrolü
    if (PERIOD_DEPENDENT_OPERATIONS.includes(operationType)) {
      
      // Dönem seçilmemiş
      if (!periodInfo) {
        return {
          allowed: false,
          reason: 'Dönem seçilmemiş. Lütfen firma ve dönem seçiniz.',
          requiresPeriod: true,
        };
      }

      // Dönem kapalı
      if (periodInfo.status === 'CLOSED') {
        return {
          allowed: false,
          reason: `${periodInfo.donemName} dönemi kapalıdır. Kapalı dönemde işlem yapılamaz.`,
          requiresPeriod: true,
          currentPeriod: periodInfo,
        };
      }

      // Dönem kilitli
      if (periodInfo.status === 'LOCKED') {
        return {
          allowed: false,
          reason: `${periodInfo.donemName} dönemi kilitlidir. Kilitli dönemde işlem yapılamaz.`,
          requiresPeriod: true,
          currentPeriod: periodInfo,
        };
      }

      // İşlem tarihi kontrolü
      if (operationDate) {
        const opDate = new Date(operationDate);
        const startDate = new Date(periodInfo.startDate);
        const endDate = new Date(periodInfo.endDate);

        // İşlem tarihi dönem dışında
        if (opDate < startDate || opDate > endDate) {
          return {
            allowed: false,
            reason: `İşlem tarihi (${opDate.toLocaleDateString('tr-TR')}) dönem aralığı dışında. Dönem: ${startDate.toLocaleDateString('tr-TR')} - ${endDate.toLocaleDateString('tr-TR')}`,
            requiresPeriod: true,
            currentPeriod: periodInfo,
          };
        }

        // Kapalı ayda işlem yapılamaz
        const opMonth = opDate.getMonth() + 1; // 1-12
        if (periodInfo.closedMonths.includes(opMonth)) {
          return {
            allowed: false,
            reason: `${opMonth}. ay kapalıdır. Kapalı ayda işlem yapılamaz.`,
            requiresPeriod: true,
            currentPeriod: periodInfo,
          };
        }
      }

      // Her şey OK
      return {
        allowed: true,
        requiresPeriod: true,
        currentPeriod: periodInfo,
      };
    }

    // Bilinmeyen işlem tipi
    logger.warn(`[PeriodControl] Unknown operation type: ${operationType}`);
    return {
      allowed: false,
      reason: 'Bilinmeyen işlem tipi.',
      requiresPeriod: false,
    };
  }

  /**
   * İşlem yapılabilir mi - throw exception variant
   */
  static assertCanPerformOperation(
    operationType: OperationType,
    periodInfo: PeriodInfo | null,
    operationDate?: Date
  ): void {
    const result = this.canPerformOperation(operationType, periodInfo, operationDate);
    if (!result.allowed) {
      throw new Error(result.reason || 'İşlem yapılamaz.');
    }
  }

  /**
   * Dönem bağımlı mı kontrol et
   */
  static isPeriodDependent(operationType: OperationType): boolean {
    return PERIOD_DEPENDENT_OPERATIONS.includes(operationType);
  }

  /**
   * Dönem bağımsız mı kontrol et
   */
  static isPeriodIndependent(operationType: OperationType): boolean {
    return PERIOD_INDEPENDENT_OPERATIONS.includes(operationType);
  }

  /**
   * Ay kapalı mı kontrol et
   */
  static isMonthClosed(periodInfo: PeriodInfo, month: number): boolean {
    return periodInfo.closedMonths.includes(month);
  }

  /**
   * Tarih dönem içinde mi kontrol et
   */
  static isDateInPeriod(periodInfo: PeriodInfo, date: Date): boolean {
    const checkDate = new Date(date);
    const startDate = new Date(periodInfo.startDate);
    const endDate = new Date(periodInfo.endDate);
    return checkDate >= startDate && checkDate <= endDate;
  }

  /**
   * Açık ayları getir
   */
  static getOpenMonths(periodInfo: PeriodInfo): number[] {
    const allMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    return allMonths.filter(month => !periodInfo.closedMonths.includes(month));
  }

  /**
   * Kapalı ayları getir
   */
  static getClosedMonths(periodInfo: PeriodInfo): number[] {
    return [...periodInfo.closedMonths];
  }

  /**
   * Dönem durumunu açıkla (insan okunabilir)
   */
  static describePeriodStatus(periodInfo: PeriodInfo): string {
    if (periodInfo.status === 'OPEN') {
      const openMonths = this.getOpenMonths(periodInfo);
      if (openMonths.length === 12) {
        return 'Tüm aylar açık';
      }
      return `${openMonths.length} ay açık, ${periodInfo.closedMonths.length} ay kapalı`;
    }
    if (periodInfo.status === 'CLOSED') {
      return 'Dönem kapalı';
    }
    if (periodInfo.status === 'LOCKED') {
      return 'Dönem kilitli';
    }
    return 'Bilinmeyen durum';
  }

  /**
   * İşlem tipi açıklaması (insan okunabilir)
   */
  static describeOperationType(operationType: OperationType): string {
    const descriptions: Record<OperationType, string> = {
      'SALES_INVOICE': 'Satış Faturası',
      'PURCHASE_INVOICE': 'Alış Faturası',
      'PAYMENT': 'Ödeme',
      'RECEIPT': 'Tahsilat',
      'JOURNAL_ENTRY': 'Muhasebe Fişi',
      'STOCK_MOVEMENT': 'Stok Hareketi',
      'TRANSFER': 'Transfer',
      'INVENTORY_COUNT': 'Sayım',
      'COST_CALCULATION': 'Maliyet Hesaplama',
      'DEPRECIATION': 'Amortisman',
      'SALARY_PAYMENT': 'Maaş Ödemesi',
      'TAX_PAYMENT': 'Vergi Ödemesi',
      'PERIOD_CLOSE': 'Dönem Kapama',
      'PERIOD_OPEN': 'Dönem Açma',
      'PRODUCT_DEFINITION': 'Ürün Tanımlama',
      'CUSTOMER_DEFINITION': 'Müşteri Tanımlama',
      'SUPPLIER_DEFINITION': 'Tedarikçi Tanımlama',
      'USER_MANAGEMENT': 'Kullanıcı Yönetimi',
      'CAMPAIGN_DEFINITION': 'Kampanya Tanımlama',
      'PRICE_LIST': 'Fiyat Listesi',
      'CATEGORY_DEFINITION': 'Kategori Tanımlama',
      'WAREHOUSE_DEFINITION': 'Depo Tanımlama',
      'SYSTEM_SETTINGS': 'Sistem Ayarları',
      'STORE_DEFINITION': 'Mağaza Tanımlama',
      'CHART_OF_ACCOUNTS': 'Hesap Planı',
      'REPORT_VIEW': 'Rapor Görüntüleme',
    };
    return descriptions[operationType] || operationType;
  }

  /**
   * Hata mesajı oluştur
   */
  static createErrorMessage(result: PeriodControlResult): string {
    if (result.allowed) return '';
    
    let message = result.reason || 'İşlem yapılamaz.';
    
    if (result.currentPeriod) {
      message += `\n\nMevcut Dönem: ${result.currentPeriod.firmaName} - ${result.currentPeriod.donemName}`;
      message += `\nDurum: ${this.describePeriodStatus(result.currentPeriod)}`;
    }
    
    return message;
  }

  /**
   * Validasyon helper - React component'lerde kullanım için
   */
  static validateOperation(
    operationType: OperationType,
    periodInfo: PeriodInfo | null,
    operationDate?: Date,
    onError?: (message: string) => void
  ): boolean {
    const result = this.canPerformOperation(operationType, periodInfo, operationDate);
    
    if (!result.allowed && onError) {
      const errorMsg = this.createErrorMessage(result);
      onError(errorMsg);
    }
    
    return result.allowed;
  }
}

// Export helper functions
export const canPerformOperation = PeriodControlService.canPerformOperation.bind(PeriodControlService);
export const assertCanPerformOperation = PeriodControlService.assertCanPerformOperation.bind(PeriodControlService);
export const isPeriodDependent = PeriodControlService.isPeriodDependent.bind(PeriodControlService);
export const isPeriodIndependent = PeriodControlService.isPeriodIndependent.bind(PeriodControlService);
export const validateOperation = PeriodControlService.validateOperation.bind(PeriodControlService);

