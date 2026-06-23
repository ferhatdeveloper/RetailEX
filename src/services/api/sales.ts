/**
 * Sales API - Dynamic Public Tables Implementation
 * Uses: rex_FIRM_PERIOD_sales, rex_FIRM_PERIOD_sale_items
 */

import { postgres, ERP_SETTINGS } from '../postgres';
import { SQL_COUNTABLE_SALE_STATUS_PLAIN } from '../../utils/saleInvoiceStatus';
import type { Sale, SaleItem } from '../../core/types/models';

import { invoicesAPI } from './invoices';
import { batchCalculateFIFOCost } from '../../hooks/useFIFOCost';
import { fetchKasalar, createKasaIslemi, type KasaIslemi } from './kasa';
import { normalizeWeightProductQuantity, resolveStockQuantityFromLine } from '../../utils/scaleQuantity';

export const salesAPI = {
  /**
   * Create new sale
   * Uses invoicesAPI to ensure consistency with UniversalInvoiceForm
   */
  async create(sale: Omit<Sale, 'id'>): Promise<Sale | null> {
    try {
      if (import.meta.env.DEV) {
        console.log('[SalesAPI] Creating sale via invoicesAPI...', sale?.receiptNumber);
      }

      const firmNr = sale.firmNr || ERP_SETTINGS.firmNr;
      const periodNr = sale.periodNr || ERP_SETTINGS.periodNr;

      // 1. Calculate Costs (FIFO) — stok miktarı (baseQuantity / normalize)
      const itemsForFIFO = sale.items.map(item => ({
        productId: item.productId,
        productCode: item.productId,
        quantity: resolveStockQuantityFromLine(item),
      })).filter(i => i.productId);

      let costMap = new Map<string, { unitCost: number; totalCost: number; available: boolean }>();

      const tFifo = import.meta.env.DEV ? '[SalesAPI] FIFOCost' : '';
      if (import.meta.env.DEV) console.time(tFifo);
      try {
        costMap = await batchCalculateFIFOCost({
          items: itemsForFIFO,
          firmaId: firmNr.toString(),
          donemId: periodNr.toString()
        });
      } catch (costError) {
        console.warn('[SalesAPI] Cost calculation failed, proceeding with zero cost:', costError);
      }
      if (import.meta.env.DEV) console.timeEnd(tFifo);

      // 2. Map Sale items to Invoice items with cost info
      const invoiceItems = sale.items.map(item => {
        const costInfo = costMap.get(item.productId || '');
        const unitCost = costInfo?.unitCost || 0;
        const totalCost = costInfo?.totalCost || 0;
        const netAmount = item.total || 0;
        const grossProfit = netAmount - totalCost;
        const unit = item.unit || 'Adet';
        const multiplier = item.multiplier || 1;
        const quantity = normalizeWeightProductQuantity(Number(item.quantity), unit);
        const baseQuantity = resolveStockQuantityFromLine({ ...item, quantity, unit, multiplier });

        return {
          productId: item.productId,
          code: item.productId,
          productName: item.productName,
          description: item.productName,
          quantity,
          unit,
          multiplier,
          baseQuantity,
          unitPrice: item.price,
          price: item.price,
          discount: item.discount,
          total: item.total ?? (quantity * item.price - (item.discount || 0)),
          netAmount: item.total ?? (quantity * item.price - (item.discount || 0)),
          unitCost,
          totalCost,
          grossProfit,
        };
      });

      // 3. Construct Invoice Data
      // MarketPOS sales are "Retail Invoices" -> fiche_type: 'sales_invoice', trcode: 7 (Retail) or 8 (Wholesale)
      // Usually POS is Retail (7). UniversalInvoiceForm uses category 'Satis' -> trcode 8 by default in InvoicesAPI if not specified? 
      // InvoicesAPI: if trcode=0, Satis -> 8. 
      // We should explicitly set trcode to 7 (Retail Sales Invoice) for POS if that's the distinction we want, or 8.
      // Let's stick to 7 for POS.

      const totalCost = invoiceItems.reduce((sum, item) => sum + item.totalCost, 0);
      const totalGrossProfit = invoiceItems.reduce((sum, item) => sum + item.grossProfit, 0);
      const profitMargin = sale.total > 0 ? (totalGrossProfit / sale.total) * 100 : 0;

      // Safety fallback for receiptNumber to prevent "undefined" in DB
      const finalReceiptNumber = sale.receiptNumber ||
        `SAL-${new Date().getTime()}-${Math.floor(Math.random() * 1000)}`;

      const invoiceData: any = {
        invoice_no: finalReceiptNumber,
        invoice_date: sale.date,
        invoice_type: 7, // Retail Sales Invoice
        invoice_category: 'Satis', // Category
        customer_id: sale.customerId || undefined,
        customer_name: sale.customerName || 'Peşin Müşteri',
        subtotal: sale.subtotal,
        discount: sale.discount,
        tax: sale.tax || 0,
        total_amount: sale.total,
        total: sale.total,
        total_cost: totalCost,
        gross_profit: totalGrossProfit,
        profit_margin: profitMargin,

        // Metadata
        firma_id: firmNr,
        donem_id: periodNr,

        payment_method: sale.paymentMethod || 'Nakit',
        cashier: sale.cashier || '',
        status: 'completed', // POS sales are completed immediately
        notes: sale.notes || 'MarketPOS Satışı',
        store_id: sale.storeId,

        items: invoiceItems
      };

      const tInv = import.meta.env.DEV ? '[SalesAPI] InvoicesAPI_Create' : '';
      if (import.meta.env.DEV) console.time(tInv);
      const savedInvoice = await invoicesAPI.create(invoiceData);

      if (!savedInvoice) throw new Error("Sale creation failed via InvoicesAPI");
      if (import.meta.env.DEV) console.timeEnd(tInv);

      if (import.meta.env.DEV) console.log('[SalesAPI] Sale created successfully:', savedInvoice.id);

      // 6. Create Cash Transaction (Kasa İşlemi) if payment method is Cash
      // MarketPOS sales usually come with paymentMethod: 'cash'
      if (sale.paymentMethod === 'cash') {
        const tKasa = import.meta.env.DEV ? '[SalesAPI] KasaIslemi_Create' : '';
        if (import.meta.env.DEV) console.time(tKasa);
        try {
          // 6a. Find target Cash Register
          // Use selected cash register from settings if available, otherwise first active one
          let targetKasaId = ERP_SETTINGS.selected_cash_registers?.[0];

          if (!targetKasaId) {
            const kasalar = await fetchKasalar({ firm_nr: String(firmNr), aktif: true });
            if (kasalar.length > 0) {
              targetKasaId = kasalar[0].id;
              if (import.meta.env.DEV) {
                console.log('[SalesAPI] No default register selected, using first available:', targetKasaId);
              }
            }
          }

          if (targetKasaId) {
            const kasaAciklama = String(sale.notes || '').includes('GüzellikPOS')
              ? `Güzellik Satışı - ${sale.receiptNumber}`
              : `Market Satışı - ${sale.receiptNumber}`;
            const islem: KasaIslemi = {
              firma_id: String(firmNr),
              kasa_id: targetKasaId,
              islem_no: sale.receiptNumber,
              islem_tarihi: sale.date || new Date().toISOString(),
              islem_tipi: 'KASA_GIRIS', // Cash In
              tutar: sale.total,
              islem_aciklamasi: kasaAciklama,
              cari_hesap_id: sale.customerId || undefined,
              cari_hesap_unvani: sale.customerName || 'Peşin Müşteri',
              doviz_kodu: 'YEREL', // Local Currency for now
              dovizli_tutar: 0,
              target_register_id: undefined
            };

            await createKasaIslemi(islem);
            if (import.meta.env.DEV) {
              console.log('[SalesAPI] Cash transaction created for sale:', sale.receiptNumber);
            }
          } else {
            console.warn('[SalesAPI] No active cash register found for cash payment!');
          }
        } catch (kasaError) {
          console.error('[SalesAPI] Failed to create cash transaction:', kasaError);
          // Don't fail the sale creation itself, just log the error
        }
        if (import.meta.env.DEV) console.timeEnd(tKasa);
      }

      // Veresiye cari borcu: invoicesAPI.create içinde (paymentMethodImpliesCustomerDebt) tek kez güncellenir — burada tekrarlanmaz.

      // 5. Map back to Sale
      return {
        ...sale,
        id: savedInvoice.id,
        status: 'completed'
      } as Sale;

    } catch (error: any) {
      console.error('[SalesAPI] create failed:', error);
      throw new Error(error.message || 'Satış kaydedilemedi');
    }
  },

  /**
   * POS iade — müşteri iade faturası (trcode 3, kategori Iade)
   */
  async createReturn(params: {
    originalReceiptNumber?: string;
    returnNumber: string;
    date: string;
    customerId?: string;
    customerName?: string;
    cashier: string;
    firmNr?: string;
    periodNr?: string;
    storeId?: string;
    paymentMethod?: string;
    returnReason?: string;
    items: Array<{
      productId: string;
      productName: string;
      productCode?: string;
      barcode?: string;
      quantity: number;
      price: number;
      unit?: string;
      multiplier?: number;
      variant?: SaleItem['variant'];
    }>;
  }): Promise<Sale | null> {
    try {
      const firmNr = params.firmNr || ERP_SETTINGS.firmNr;
      const periodNr = params.periodNr || ERP_SETTINGS.periodNr;

      const invoiceItems = params.items.map((item) => {
        const unit = item.unit || 'Adet';
        const multiplier = item.multiplier || 1;
        const quantity = normalizeWeightProductQuantity(Number(item.quantity), unit);
        const baseQuantity = resolveStockQuantityFromLine({ ...item, quantity, unit, multiplier });
        const lineTotal = quantity * item.price;

        return {
          productId: item.productId,
          code: item.productId,
          productName: item.productName,
          description: item.productName,
          quantity,
          unit,
          multiplier,
          baseQuantity,
          unitPrice: item.price,
          price: item.price,
          discount: 0,
          total: lineTotal,
          netAmount: lineTotal,
          unitCost: 0,
          totalCost: 0,
          grossProfit: 0,
        };
      });

      const subtotal = invoiceItems.reduce((sum, row) => sum + row.total, 0);
      const reasonNote = params.returnReason
        ? `POS İade — ${params.returnReason}${params.originalReceiptNumber ? ` (Fiş: ${params.originalReceiptNumber})` : ''}`
        : `POS İade${params.originalReceiptNumber ? ` — Fiş: ${params.originalReceiptNumber}` : ''}`;

      const invoiceData: any = {
        invoice_no: params.returnNumber,
        invoice_date: params.date,
        invoice_type: 3,
        invoice_category: 'Iade',
        customer_id: params.customerId || undefined,
        customer_name: params.customerName || 'Peşin Müşteri',
        subtotal,
        discount: 0,
        tax: 0,
        total_amount: subtotal,
        total: subtotal,
        firma_id: firmNr,
        donem_id: periodNr,
        payment_method: params.paymentMethod || 'Nakit',
        cashier: params.cashier || '',
        status: 'completed',
        notes: reasonNote,
        store_id: params.storeId,
        items: invoiceItems,
      };

      const savedInvoice = await invoicesAPI.create(invoiceData);
      if (!savedInvoice) throw new Error('İade faturası oluşturulamadı');

      if (params.paymentMethod === 'cash' || !params.paymentMethod) {
        try {
          let targetKasaId = ERP_SETTINGS.selected_cash_registers?.[0];
          if (!targetKasaId) {
            const kasalar = await fetchKasalar({ firm_nr: String(firmNr), aktif: true });
            if (kasalar.length > 0) targetKasaId = kasalar[0].id;
          }
          if (targetKasaId && subtotal > 0) {
            const islem: KasaIslemi = {
              firma_id: String(firmNr),
              kasa_id: targetKasaId,
              islem_no: params.returnNumber,
              islem_tarihi: params.date || new Date().toISOString(),
              islem_tipi: 'KASA_CIKIS',
              tutar: subtotal,
              islem_aciklamasi: `POS İade — ${params.returnNumber}`,
              cari_hesap_id: params.customerId || undefined,
              cari_hesap_unvani: params.customerName || 'Peşin Müşteri',
              doviz_kodu: 'YEREL',
              dovizli_tutar: 0,
            };
            await createKasaIslemi(islem);
          }
        } catch (kasaError) {
          console.warn('[SalesAPI] Return cash transaction failed:', kasaError);
        }
      }

      return {
        id: savedInvoice.id || `RETURN-${Date.now()}`,
        receiptNumber: params.returnNumber,
        date: params.date,
        customerId: params.customerId,
        customerName: params.customerName,
        items: params.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          productCode: item.productCode,
          barcode: item.barcode,
          quantity: item.quantity,
          unit: item.unit,
          multiplier: item.multiplier,
          price: item.price,
          discount: 0,
          total: item.quantity * item.price,
          variant: item.variant,
        })),
        subtotal: -subtotal,
        discount: 0,
        total: -subtotal,
        paymentMethod: params.paymentMethod || 'cash',
        status: 'return',
        notes: reasonNote,
        cashier: params.cashier,
        firmNr: String(firmNr),
        periodNr: String(periodNr),
        storeId: params.storeId,
      } as Sale;
    } catch (error: any) {
      console.error('[SalesAPI] createReturn failed:', error);
      throw new Error(error.message || 'İade kaydedilemedi');
    }
  },

  /**
   * Get all sales
   */
  async getAll(limit: number = 100): Promise<Sale[]> {
    try {
      // Satış faturası listesi (InvoiceListModule, Satis + tür Tümü) ile aynı kapsam: trcode 7,8,9,… — yalnızca 7 değil
      const result = await invoicesAPI.getPaginated({
        page: 1,
        pageSize: limit,
        invoiceCategory: 'Satis'
      });

      // Map Invoice[] to Sale[]
      return result.data.map(mapInvoiceToSale);
    } catch (error) {
      console.error('[SalesAPI] getAll failed:', error);
      return [];
    }
  },

  /**
   * Get sale by ID
   */
  async getById(id: string): Promise<Sale | null> {
    try {
      const invoice = await invoicesAPI.getById(id);
      if (!invoice) return null;
      return mapInvoiceToSale(invoice);
    } catch (error) {
      console.error('[SalesAPI] getById failed:', error);
      return null;
    }
  },

  /**
   * Get sales by date range
   */
  async getByDateRange(startDate: string, endDate: string): Promise<Sale[]> {
    try {
      const pageSize = 5000;
      const all: Sale[] = [];
      let page = 1;
      let totalPages = 1;
      while (page <= totalPages) {
        const result = await invoicesAPI.getPaginated({
          page,
          startDate,
          endDate,
          invoiceCategory: 'Satis',
          pageSize,
        });
        all.push(...result.data.map(mapInvoiceToSale));
        totalPages = Math.max(1, result.totalPages || 1);
        if (!result.data.length) break;
        page += 1;
      }
      return all;
    } catch (error) {
      console.error('[SalesAPI] getByDateRange failed:', error);
      return [];
    }
  },

  /**
   * Get sales summary
   */
  async getSummary(startDate?: string, endDate?: string) {
    // Re-implement using same logic as previous but ensuring we target 'sales' table which invoicesAPI uses
    // invoicesAPI doesn't have a direct summary method yet, so keeping this custom query is fine 
    // BUT ensuring it uses same table and filtering logic as invoicesAPI (firm_nr, period_nr)
    try {
      let sql = `SELECT net_amount as total, total_discount as discount, total_vat as tax, payment_method FROM sales WHERE (fiche_type = 'sales_invoice' OR trcode = 7) AND ${SQL_COUNTABLE_SALE_STATUS_PLAIN}`;
      const params: any[] = [];

      if (startDate) {
        params.push(startDate);
        sql += ` AND date >= $${params.length}`;
      }
      if (endDate) {
        params.push(endDate);
        sql += ` AND date <= $${params.length}`;
      }

      params.push(ERP_SETTINGS.firmNr);
      sql += ` AND firm_nr = $${params.length}`;

      params.push(ERP_SETTINGS.periodNr);
      sql += ` AND period_nr = $${params.length}`;

      const { rows } = await postgres.query(sql, params);

      const summary = {
        totalSales: rows.length,
        totalRevenue: rows.reduce((sum, s) => sum + parseFloat(s.total || 0), 0),
        totalDiscount: rows.reduce((sum, s) => sum + parseFloat(s.discount || 0), 0),
        totalTax: rows.reduce((sum, s) => sum + parseFloat(s.tax || 0), 0),
        paymentMethods: {} as Record<string, number>,
      };

      rows.forEach((sale) => {
        const method = sale.payment_method || 'Unknown';
        summary.paymentMethods[method] =
          (summary.paymentMethods[method] || 0) + parseFloat(sale.total || 0);
      });

      return summary;
    } catch (error) {
      console.error('[SalesAPI] getSummary failed:', error);
      return {
        totalSales: 0,
        totalRevenue: 0,
        totalDiscount: 0,
        totalTax: 0,
        paymentMethods: {},
      };
    }
  },

  /**
   * Get daily and monthly sale counts for sequence numbering
   */
  async getSequenceCounts(): Promise<{ daily: number; monthly: number }> {
    try {
      const firmNr = ERP_SETTINGS.firmNr;
      const periodNr = ERP_SETTINGS.periodNr;
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const monthStr = todayStr.substring(0, 7); // YYYY-MM

      // SQL for daily and monthly counts
      // Using universal sales table (rex_FIRM_PERIOD_sales via dynamic routing in postgres.ts)
      const dailySql = `SELECT COUNT(*) as count FROM sales WHERE date::date = $1::date AND firm_nr = $2 AND period_nr = $3`;
      const monthlySql = `SELECT COUNT(*) as count FROM sales WHERE date::text LIKE $1 || '%' AND firm_nr = $2 AND period_nr = $3`;

      const [dailyRes, monthlyRes] = await Promise.all([
        postgres.query(dailySql, [todayStr, String(firmNr), String(periodNr)]),
        postgres.query(monthlySql, [monthStr, String(firmNr), String(periodNr)])
      ]);

      return {
        daily: (parseInt(dailyRes.rows[0]?.count) || 0) + 1,
        monthly: (parseInt(monthlyRes.rows[0]?.count) || 0) + 1
      };
    } catch (error) {
      console.error('[SalesAPI] getSequenceCounts failed:', error);
      return { daily: 1, monthly: 1 };
    }
  },

  /**
   * Refund sale
   */
  async refund(id: string): Promise<boolean> {
    return await invoicesAPI.refund(id);
  },
};

// Helper to map Invoice to Sale
import type { Invoice } from '../../core/types';
function mapInvoiceToSale(invoice: Invoice): Sale {
  return {
    id: invoice.id || '',
    receiptNumber: invoice.invoice_no,
    date: invoice.invoice_date,
    customerId: invoice.customer_id,
    customerName: invoice.customer_name,
    storeId: invoice.store_id || 'DEFAULT',
    cashier: invoice.cashier || 'Unknown',
    subtotal: invoice.subtotal,
    discount: invoice.discount,
    tax: invoice.tax,
    total: Number(invoice.total_amount ?? invoice.total ?? 0),
    profit: invoice.gross_profit || 0,
    paymentMethod: invoice.payment_method || 'cash',
    status: invoice.status,
    notes: invoice.notes,
    firmNr: invoice.firma_id,
    periodNr: invoice.donem_id,
    items: invoice.items.map(res => ({
      productId: res.productId || res.code,
      productName: res.productName || res.description,
      quantity: res.quantity,
      unit: res.unit || 'Adet',
      multiplier: (res as any).multiplier || 1,
      baseQuantity: (res as any).baseQuantity ?? res.quantity,
      price: res.unitPrice,
      discount: res.discount,
      cost: res.unitCost || 0,
      profit: res.grossProfit || 0,
      total: res.total,
    }))
  } as Sale;
}


