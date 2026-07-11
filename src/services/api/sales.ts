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
import { normalizePaymentMethodBucket } from '../../utils/paymentMethodUtils';
import { dbItemTypeToInvoiceLine } from '../../utils/invoiceLineType';

async function enrichSalesWithLineItems(sales: Sale[]): Promise<Sale[]> {
  if (!sales.length) return sales;
  const ids = sales.map((s) => s.id).filter(Boolean);
  if (!ids.length) return sales;

  try {
    const { rows } = await postgres.query(
      `SELECT * FROM sale_items WHERE invoice_id = ANY($1::uuid[])`,
      [ids],
    );
    const byInvoice = new Map<string, any[]>();
    for (const row of rows) {
      const key = String(row.invoice_id);
      if (!byInvoice.has(key)) byInvoice.set(key, []);
      byInvoice.get(key)!.push(row);
    }
    return sales.map((sale) => {
      const rawItems = byInvoice.get(sale.id) || [];
      const items: SaleItem[] = rawItems.map((item: any) => ({
        productId: item.product_id != null ? String(item.product_id) : String(item.item_code || ''),
        productName: item.item_name || '',
        quantity: Number(item.quantity || 0),
        price: Number(item.unit_price || 0),
        discount: Number(item.discount_rate || 0),
        total: Number(item.total_amount || item.net_amount || 0),
        unit: item.unit || 'Adet',
        lineType: dbItemTypeToInvoiceLine(item.item_type ?? item.type),
      }));
      return { ...sale, items };
    });
  } catch (e) {
    console.warn('[SalesAPI] enrichSalesWithLineItems failed:', e);
    return sales;
  }
}

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

      // Karma ödeme: veresiye + nakit/kart → faturayı veresiye yaz, peşin kısmı için anında CH_TAHSILAT
      const paymentRows = Array.isArray((sale as any).payments) ? (sale as any).payments : [];
      let cashPortion = 0;
      let cardPortion = 0;
      let veresiyePortion = 0;
      if (paymentRows.length > 0) {
        for (const p of paymentRows) {
          const amt = Math.abs(Number(p.amount) || 0);
          if (!amt) continue;
          let method = String(p.method || '').toLowerCase();
          if (method === 'gateway') method = 'card';
          if (method === 'veresiye' || method === 'credit' || method === 'open_account') veresiyePortion += amt;
          else if (method === 'card' || method === 'kart') cardPortion += amt;
          else cashPortion += amt;
        }
      }
      const hasMixedWithCredit = veresiyePortion > 0 && (cashPortion > 0 || cardPortion > 0);
      if (hasMixedWithCredit) {
        invoiceData.payment_method = 'veresiye';
      }

      const tInv = import.meta.env.DEV ? '[SalesAPI] InvoicesAPI_Create' : '';
      if (import.meta.env.DEV) console.time(tInv);
      const savedInvoice = await invoicesAPI.create(invoiceData);

      if (!savedInvoice) throw new Error("Sale creation failed via InvoicesAPI");
      if (import.meta.env.DEV) console.timeEnd(tInv);

      if (import.meta.env.DEV) console.log('[SalesAPI] Sale created successfully:', savedInvoice.id);

      // 6. Kasa / kısmi tahsilat
      // - Saf nakit: KASA_GIRIS (tam tutar)
      // - Karma veresiye+peşin: CH_TAHSILAT (peşin kısım) + KASA_GIRIS (nakit kısım)
      const settledNonCredit = cashPortion + cardPortion;
      const needsCashIn =
        sale.paymentMethod === 'cash' ||
        (hasMixedWithCredit && cashPortion > 0) ||
        (!hasMixedWithCredit && cashPortion > 0 && veresiyePortion === 0);

      const createRegisterTx = async (
        islemTipi: 'KASA_GIRIS' | 'CH_TAHSILAT',
        tutar: number,
        aciklamaSuffix: string,
      ) => {
        if (tutar <= 0) return;
        let targetKasaId = ERP_SETTINGS.selected_cash_registers?.[0];
        if (!targetKasaId) {
          const kasalar = await fetchKasalar({ firm_nr: String(firmNr), aktif: true });
          if (kasalar.length > 0) targetKasaId = kasalar[0].id;
        }
        if (!targetKasaId) {
          console.warn('[SalesAPI] No active cash register found for', islemTipi);
          return;
        }
        const kasaAciklama = String(sale.notes || '').includes('GüzellikPOS')
          ? `Güzellik Satışı - ${sale.receiptNumber}${aciklamaSuffix}`
          : `Market Satışı - ${sale.receiptNumber}${aciklamaSuffix}`;
        const islem: KasaIslemi = {
          firma_id: String(firmNr),
          kasa_id: targetKasaId,
          islem_no: sale.receiptNumber,
          islem_tarihi: sale.date || new Date().toISOString(),
          islem_tipi: islemTipi,
          tutar,
          islem_aciklamasi: kasaAciklama,
          cari_hesap_id: sale.customerId || undefined,
          cari_hesap_unvani: sale.customerName || 'Peşin Müşteri',
          doviz_kodu: 'YEREL',
          dovizli_tutar: 0,
          target_register_id: undefined,
        };
        await createKasaIslemi(islem);
      };

      try {
        if (hasMixedWithCredit && settledNonCredit > 0 && sale.customerId) {
          // Veresiye fatura tam tutarı borç yazdı; peşin kısmı tahsilat ile düş
          await createRegisterTx('CH_TAHSILAT', settledNonCredit, ' (kısmi tahsilat)');
          if (cashPortion > 0) {
            // CH_TAHSILAT kasaya girmez; nakit kısmı için ayrıca KASA_GIRIS
            // Not: CH_TAHSILAT zaten kasa sign=+1 yapıyor createKasaIslemi içinde — çift yazmamak için
            // yalnızca kart+veresiye karışımında ekstra KASA_GIRIS gerekmez.
            // createKasaIslemi CH_TAHSILAT → kasa bakiyesi artar. Nakit için yeterli.
          }
        } else if (sale.paymentMethod === 'cash' || (needsCashIn && !hasMixedWithCredit)) {
          await createRegisterTx('KASA_GIRIS', sale.total, '');
        }
      } catch (kasaError) {
        console.error('[SalesAPI] Failed to create cash transaction:', kasaError);
      }

      // Veresiye cari borcu: invoicesAPI.create içinde (paymentMethodImpliesCustomerDebt) tek kez güncellenir — burada tekrarlanmaz.

      // 5. Map back to Sale
      return {
        ...sale,
        id: savedInvoice.id,
        paymentMethod: hasMixedWithCredit ? 'veresiye' : sale.paymentMethod,
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
      const [salesResult, returnsResult] = await Promise.all([
        invoicesAPI.getPaginated({
          page: 1,
          pageSize: limit,
          invoiceCategory: 'Satis',
        }),
        invoicesAPI.getPaginated({
          page: 1,
          pageSize: limit,
          invoiceCategory: 'Iade',
          invoiceType: 3,
        }),
      ]);

      const merged = [
        ...salesResult.data.map(mapInvoiceToSale),
        ...returnsResult.data.map(mapInvoiceToSale),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return merged.slice(0, limit);
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
      const fetchCategory = async (
        invoiceCategory: 'Satis' | 'Iade',
        invoiceType?: number,
      ): Promise<Sale[]> => {
        const pageSize = 5000;
        const all: Sale[] = [];
        let page = 1;
        let totalPages = 1;
        while (page <= totalPages) {
          const result = await invoicesAPI.getPaginated({
            page,
            startDate,
            endDate,
            invoiceCategory,
            invoiceType,
            pageSize,
          });
          all.push(...result.data.map(mapInvoiceToSale));
          totalPages = Math.max(1, result.totalPages || 1);
          if (!result.data.length) break;
          page += 1;
        }
        return all;
      };

      const [sales, returns] = await Promise.all([
        fetchCategory('Satis'),
        fetchCategory('Iade', 3),
      ]);

      const merged = [...sales, ...returns].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
      return enrichSalesWithLineItems(merged);
    } catch (error) {
      console.error('[SalesAPI] getByDateRange failed:', error);
      return [];
    }
  },

  /** Hizmet Bazlı Rapor — perakende / market / restoran: satış + hizmet faturaları */
  async getServiceBreakdownSource(
    startDate: string,
    endDate: string,
  ): Promise<{ sales: Sale[]; hizmetSaleIds: Set<string> }> {
    try {
      const pageSize = 5000;
      const fetchHizmet = async (): Promise<Sale[]> => {
        const all: Sale[] = [];
        let page = 1;
        let totalPages = 1;
        while (page <= totalPages) {
          const result = await invoicesAPI.getPaginated({
            page,
            startDate,
            endDate,
            invoiceCategory: 'Hizmet',
            pageSize,
          });
          const mapped = result.data.map(mapInvoiceToSale);
          all.push(...(await enrichSalesWithLineItems(mapped)));
          totalPages = Math.max(1, result.totalPages || 1);
          if (!result.data.length) break;
          page += 1;
        }
        return all;
      };

      const [salesRows, hizmetRows] = await Promise.all([
        this.getByDateRange(startDate, endDate),
        fetchHizmet(),
      ]);

      const hizmetSaleIds = new Set(hizmetRows.map((s) => s.id).filter(Boolean));
      const byId = new Map<string, Sale>();
      for (const s of [...salesRows, ...hizmetRows]) {
        if (s.id && !byId.has(s.id)) byId.set(s.id, s);
      }
      return { sales: [...byId.values()], hizmetSaleIds };
    } catch (error) {
      console.error('[SalesAPI] getServiceBreakdownSource failed:', error);
      return { sales: [], hizmetSaleIds: new Set() };
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

function resolveInvoiceTrcode(invoice: Invoice): number {
  return Number((invoice as Invoice & { trcode?: number }).trcode ?? invoice.invoice_type ?? 0);
}

/** Müşteri satış iadesi (trcode 3) — POS / Z raporu için negatif satış satırı */
function isCustomerSalesReturnInvoice(invoice: Invoice): boolean {
  return resolveInvoiceTrcode(invoice) === 3;
}

function mapInvoiceToSale(invoice: Invoice): Sale {
  const isCustomerReturn = isCustomerSalesReturnInvoice(invoice);
  const amount = Math.abs(Number(invoice.total_amount ?? invoice.total ?? 0));
  const signedTotal = isCustomerReturn ? -amount : amount;
  const signedSubtotal = isCustomerReturn ? -Math.abs(Number(invoice.subtotal) || amount) : invoice.subtotal;

  return {
    id: invoice.id || '',
    receiptNumber: invoice.invoice_no,
    date: invoice.invoice_date,
    customerId: invoice.customer_id,
    customerName: invoice.customer_name,
    storeId: invoice.store_id || 'DEFAULT',
    cashier: invoice.cashier || 'Unknown',
    subtotal: signedSubtotal,
    discount: invoice.discount,
    tax: invoice.tax,
    total: signedTotal,
    profit: invoice.gross_profit || 0,
    paymentMethod: normalizePaymentMethodBucket(invoice.payment_method || 'cash'),
    status: isCustomerReturn ? 'return' : invoice.status,
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


