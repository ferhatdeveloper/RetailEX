/**
 * ExRetailOS - Journal Entry Generator Service
 * 
 * Otomatik yörü kaydetme sistemi - Logo muhasebe mantığıyla uyumlu
 * Her satış, alış, transfer ve ödeme işleminden otomatik muhasebe fişi oluşturur
 */

import { projectId, publicAnonKey } from '../utils/supabase/info';

// Types
interface JournalLine {
  hesap_kodu: string;
  hesap_adi?: string;
  borc: number;
  alacak: number;
  aciklama?: string;
}

interface JournalEntry {
  id?: string;
  firma_id: string;
  donem_id: string;
  fis_no: string;
  fis_tarihi: string;
  fis_tipi: 'Mahsup' | 'Tahsilat' | 'Tediye' | 'Virman';
  fis_aciklama: string;
  lines: JournalLine[];
  kaynak_belge?: string;
  kaynak_id?: string;
  created_at?: string;
  updated_at?: string;
}

interface Sale {
  id: string;
  invoice_no: string;
  sale_date: string;
  total: number;
  subtotal: number;
  tax_amount?: number;
  discount_amount?: number;
  customer_id?: string;
  customer_name?: string;
  payment_method?: string;
  items?: SaleItem[];
}

interface SaleItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  total: number;
}

interface Purchase {
  id: string;
  invoice_no: string;
  purchase_date: string;
  total: number;
  subtotal: number;
  tax_amount?: number;
  supplier_id?: string;
  supplier_name?: string;
  payment_method?: string;
}

interface Transfer {
  id: string;
  transfer_no: string;
  transfer_date: string;
  from_store_id: string;
  to_store_id: string;
  total_cost: number;
  items?: TransferItem[];
}

interface TransferItem {
  product_id: string;
  product_name: string;
  quantity: number;
  cost_price: number;
}

interface Payment {
  id: string;
  payment_no: string;
  payment_date: string;
  amount: number;
  payment_type: 'receipt' | 'payment';
  payment_method: 'cash' | 'bank' | 'check' | 'credit_card';
  customer_id?: string;
  supplier_id?: string;
  description?: string;
}

interface FirmaDonemContext {
  firma_id: string;
  donem_id: string;
}

/**
 * Journal Entry Generator Class
 * Tüm muhasebe fişlerini otomatik oluşturur
 */
export class JournalEntryGenerator {
  private context: FirmaDonemContext;
  private baseUrl: string;

  constructor(context: FirmaDonemContext) {
    this.context = context;
    this.baseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0`;
  }

  /**
   * Satış fişi oluştur
   * Iraq COA'ya göre:
   * - 100.01 (Kasa) Borç
   * - 600 (Satışlar) Alacak
   * - 710 (SMM) Borç
   * - 153 (Ticari Mal) Alacak
   */
  async generateSaleEntry(sale: Sale): Promise<JournalEntry> {
    const fisNo = await this.generateFisNo('Mahsup');

    // Satış maliyeti hesapla
    const cogs = sale.items?.reduce((sum, item) =>
      sum + (item.cost_price * item.quantity), 0
    ) || 0;

    const lines: JournalLine[] = [];

    // 1. Kasa/Banka Borç (Tahsilat)
    if (sale.payment_method === 'cash') {
      lines.push({
        hesap_kodu: '100.01',
        hesap_adi: 'Kasa',
        borc: sale.total,
        alacak: 0,
        aciklama: `Satış tahsilatı - ${sale.invoice_no}`,
      });
    } else if (sale.payment_method === 'bank' || sale.payment_method === 'credit_card') {
      lines.push({
        hesap_kodu: '102',
        hesap_adi: 'Banka',
        borc: sale.total,
        alacak: 0,
        aciklama: `Satış tahsilatı - ${sale.invoice_no}`,
      });
    } else {
      // Cari hesap (veresiye)
      lines.push({
        hesap_kodu: '120',
        hesap_adi: 'Alıcılar',
        borc: sale.total,
        alacak: 0,
        aciklama: `Veresiye satış - ${sale.customer_name || 'Müşteri'}`,
      });
    }

    // 2. Satışlar Alacak
    lines.push({
      hesap_kodu: '600',
      hesap_adi: 'Yurtiçi Satışlar',
      borc: 0,
      alacak: sale.subtotal,
      aciklama: `Satış geliri - ${sale.invoice_no}`,
    });

    // 3. İndirim varsa
    if (sale.discount_amount && sale.discount_amount > 0) {
      lines.push({
        hesap_kodu: '610',
        hesap_adi: 'Satış İndirimleri',
        borc: sale.discount_amount,
        alacak: 0,
        aciklama: 'Satış indirimi',
      });
    }

    // 4. Maliyet kaydı (SMM Borç, Stok Alacak)
    if (cogs > 0) {
      lines.push({
        hesap_kodu: '710',
        hesap_adi: 'Satılan Malların Maliyeti',
        borc: cogs,
        alacak: 0,
        aciklama: 'Satılan mal maliyeti',
      });

      lines.push({
        hesap_kodu: '153',
        hesap_adi: 'Ticari Mal',
        borc: 0,
        alacak: cogs,
        aciklama: 'Stok çıkışı',
      });
    }

    const entry: JournalEntry = {
      firma_id: this.context.firma_id,
      donem_id: this.context.donem_id,
      fis_no: fisNo,
      fis_tarihi: sale.sale_date,
      fis_tipi: 'Mahsup',
      fis_aciklama: `Satış Fişi - ${sale.invoice_no}`,
      kaynak_belge: 'SATIS',
      kaynak_id: sale.id,
      lines,
    };

    return this.saveJournalEntry(entry);
  }

  /**
   * Alış fişi oluştur
   * - 153 (Ticari Mal) Borç
   * - 100.01 (Kasa) veya 320 (Satıcılar) Alacak
   */
  async generatePurchaseEntry(purchase: Purchase): Promise<JournalEntry> {
    const fisNo = await this.generateFisNo('Mahsup');

    const lines: JournalLine[] = [];

    // 1. Stok Borç
    lines.push({
      hesap_kodu: '153',
      hesap_adi: 'Ticari Mal',
      borc: purchase.subtotal,
      alacak: 0,
      aciklama: `Mal alışı - ${purchase.invoice_no}`,
    });

    // 2. Kasa/Banka/Cari Alacak
    if (purchase.payment_method === 'cash') {
      lines.push({
        hesap_kodu: '100.01',
        hesap_adi: 'Kasa',
        borc: 0,
        alacak: purchase.total,
        aciklama: `Mal bedeli ödemesi - ${purchase.invoice_no}`,
      });
    } else if (purchase.payment_method === 'bank') {
      lines.push({
        hesap_kodu: '102',
        hesap_adi: 'Banka',
        borc: 0,
        alacak: purchase.total,
        aciklama: `Mal bedeli ödemesi - ${purchase.invoice_no}`,
      });
    } else {
      // Cari hesap (veresiye)
      lines.push({
        hesap_kodu: '320',
        hesap_adi: 'Satıcılar',
        borc: 0,
        alacak: purchase.total,
        aciklama: `Veresiye alış - ${purchase.supplier_name || 'Tedarikçi'}`,
      });
    }

    const entry: JournalEntry = {
      firma_id: this.context.firma_id,
      donem_id: this.context.donem_id,
      fis_no: fisNo,
      fis_tarihi: purchase.purchase_date,
      fis_tipi: 'Mahsup',
      fis_aciklama: `Alış Fişi - ${purchase.invoice_no}`,
      kaynak_belge: 'ALIS',
      kaynak_id: purchase.id,
      lines,
    };

    return this.saveJournalEntry(entry);
  }

  /**
   * Mağazalar arası transfer fişi
   * - 153.01 (Mağaza A Stok) Borç
   * - 153.02 (Mağaza B Stok) Alacak
   */
  async generateTransferEntry(transfer: Transfer): Promise<JournalEntry> {
    const fisNo = await this.generateFisNo('Virman');

    const lines: JournalLine[] = [
      {
        hesap_kodu: `153.${transfer.to_store_id}`,
        hesap_adi: 'Hedef Mağaza Stok',
        borc: transfer.total_cost,
        alacak: 0,
        aciklama: `Transfer alış - ${transfer.transfer_no}`,
      },
      {
        hesap_kodu: `153.${transfer.from_store_id}`,
        hesap_adi: 'Kaynak Mağaza Stok',
        borc: 0,
        alacak: transfer.total_cost,
        aciklama: `Transfer çıkış - ${transfer.transfer_no}`,
      },
    ];

    const entry: JournalEntry = {
      firma_id: this.context.firma_id,
      donem_id: this.context.donem_id,
      fis_no: fisNo,
      fis_tarihi: transfer.transfer_date,
      fis_tipi: 'Virman',
      fis_aciklama: `Mağaza Transfer - ${transfer.transfer_no}`,
      kaynak_belge: 'TRANSFER',
      kaynak_id: transfer.id,
      lines,
    };

    return this.saveJournalEntry(entry);
  }

  /**
   * Tahsilat/Tediye fişi
   */
  async generatePaymentEntry(payment: Payment): Promise<JournalEntry> {
    const fisNo = await this.generateFisNo(
      payment.payment_type === 'receipt' ? 'Tahsilat' : 'Tediye'
    );

    const lines: JournalLine[] = [];

    if (payment.payment_type === 'receipt') {
      // Tahsilat (Müşteriden para alımı)
      // Kasa Borç, Alıcılar Alacak
      if (payment.payment_method === 'cash') {
        lines.push({
          hesap_kodu: '100.01',
          hesap_adi: 'Kasa',
          borc: payment.amount,
          alacak: 0,
          aciklama: payment.description || 'Tahsilat',
        });
      } else if (payment.payment_method === 'bank') {
        lines.push({
          hesap_kodu: '102',
          hesap_adi: 'Banka',
          borc: payment.amount,
          alacak: 0,
          aciklama: payment.description || 'Tahsilat',
        });
      }

      lines.push({
        hesap_kodu: '120',
        hesap_adi: 'Alıcılar',
        borc: 0,
        alacak: payment.amount,
        aciklama: payment.description || 'Cari tahsilat',
      });

    } else {
      // Tediye (Tedarikçiye ödeme)
      // Satıcılar Borç, Kasa Alacak
      lines.push({
        hesap_kodu: '320',
        hesap_adi: 'Satıcılar',
        borc: payment.amount,
        alacak: 0,
        aciklama: payment.description || 'Cari ödeme',
      });

      if (payment.payment_method === 'cash') {
        lines.push({
          hesap_kodu: '100.01',
          hesap_adi: 'Kasa',
          borc: 0,
          alacak: payment.amount,
          aciklama: payment.description || 'Ödeme',
        });
      } else if (payment.payment_method === 'bank') {
        lines.push({
          hesap_kodu: '102',
          hesap_adi: 'Banka',
          borc: 0,
          alacak: payment.amount,
          aciklama: payment.description || 'Ödeme',
        });
      }
    }

    const entry: JournalEntry = {
      firma_id: this.context.firma_id,
      donem_id: this.context.donem_id,
      fis_no: fisNo,
      fis_tarihi: payment.payment_date,
      fis_tipi: payment.payment_type === 'receipt' ? 'Tahsilat' : 'Tediye',
      fis_aciklama: payment.description || (payment.payment_type === 'receipt' ? 'Tahsilat Fişi' : 'Tediye Fişi'),
      kaynak_belge: 'PAYMENT',
      kaynak_id: payment.id,
      lines,
    };

    return this.saveJournalEntry(entry);
  }

  /**
   * Fiş numarası oluştur
   */
  private async generateFisNo(fisTipi: string): Promise<string> {
    const prefix = fisTipi.substring(0, 3).toUpperCase();
    const year = new Date().getFullYear();
    const timestamp = Date.now().toString().slice(-6);
    return `${prefix}-${year}-${timestamp}`;
  }

  /**
   * Journal entry'yi kaydet
   */
  private async saveJournalEntry(entry: JournalEntry): Promise<JournalEntry> {
    try {
      // Balance kontrolü
      const totalBorc = entry.lines.reduce((sum, line) => sum + line.borc, 0);
      const totalAlacak = entry.lines.reduce((sum, line) => sum + line.alacak, 0);

      if (Math.abs(totalBorc - totalAlacak) > 0.01) {
        throw new Error(
          `Muhasebe fişi dengesi tutmuyor! Borç: ${totalBorc}, Alacak: ${totalAlacak}`
        );
      }

      const response = await fetch(`${this.baseUrl}/journal-entries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify(entry),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save journal entry');
      }

      const result = await response.json();
      return result.entry;

    } catch (error) {
      console.error('Error saving journal entry:', error);
      throw error;
    }
  }

  /**
   * Dönem kontrolü yap
   */
  async checkPeriodStatus(): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const response = await fetch(
        `${this.baseUrl}/donemler/${this.context.donem_id}`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (!response.ok) {
        return { allowed: false, reason: 'Dönem bulunamadı' };
      }

      const { donem } = await response.json();

      if (donem.durum !== 'acik') {
        return { allowed: false, reason: 'Dönem kapalı' };
      }

      return { allowed: true };

    } catch (error) {
      console.error('Error checking period status:', error);
      return { allowed: false, reason: 'Dönem kontrolü başarısız' };
    }
  }

  /**
   * Mizan (Trial Balance) al
   */
  async getTrialBalance(): Promise<any[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/mizan?firma_id=${this.context.firma_id}&donem_id=${this.context.donem_id}`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch trial balance');
      }

      const { mizan } = await response.json();
      return mizan;

    } catch (error) {
      console.error('Error fetching trial balance:', error);
      throw error;
    }
  }
}

/**
 * Helper function - Satış sonrası otomatik muhasebe
 */
export async function autoGenerateSaleJournal(
  sale: Sale,
  context: FirmaDonemContext
): Promise<JournalEntry> {
  const generator = new JournalEntryGenerator(context);

  // Dönem kontrolü
  const periodCheck = await generator.checkPeriodStatus();
  if (!periodCheck.allowed) {
    throw new Error(`İşlem yapılamaz: ${periodCheck.reason}`);
  }

  return generator.generateSaleEntry(sale);
}

/**
 * Helper function - Alış sonrası otomatik muhasebe
 */
export async function autoGeneratePurchaseJournal(
  purchase: Purchase,
  context: FirmaDonemContext
): Promise<JournalEntry> {
  const generator = new JournalEntryGenerator(context);

  const periodCheck = await generator.checkPeriodStatus();
  if (!periodCheck.allowed) {
    throw new Error(`İşlem yapılamaz: ${periodCheck.reason}`);
  }

  return generator.generatePurchaseEntry(purchase);
}

/**
 * Helper function - Transfer sonrası otomatik muhasebe
 */
export async function autoGenerateTransferJournal(
  transfer: Transfer,
  context: FirmaDonemContext
): Promise<JournalEntry> {
  const generator = new JournalEntryGenerator(context);

  const periodCheck = await generator.checkPeriodStatus();
  if (!periodCheck.allowed) {
    throw new Error(`İşlem yapılamaz: ${periodCheck.reason}`);
  }

  return generator.generateTransferEntry(transfer);
}

