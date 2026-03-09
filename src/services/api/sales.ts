/**
 * Sales API - Dynamic Public Tables Implementation
 * Uses: rex_FIRM_PERIOD_sales, rex_FIRM_PERIOD_sale_items
 */

import { postgres, ERP_SETTINGS } from '../postgres';
import type { Sale, SaleItem } from '../../core/types/models';

import { invoicesAPI } from './invoices';
import { customerAPI } from './customers';
import { batchCalculateFIFOCost } from '../../hooks/useFIFOCost';
import { fetchKasalar, createKasaIslemi, type KasaIslemi } from './kasa';

export const salesAPI = {
  /**
   * Create new sale
   * Uses invoicesAPI to ensure consistency with UniversalInvoiceForm
   */
  async create(sale: Omit<Sale, 'id'>): Promise<Sale | null> {
    try {
      console.log('[SalesAPI] Creating sale via invoicesAPI...', JSON.stringify(sale, null, 2));

      const firmNr = sale.firmNr || ERP_SETTINGS.firmNr;
      const periodNr = sale.periodNr || ERP_SETTINGS.periodNr;

      console.log('[SalesAPI] Context:', { firmNr, periodNr, saleFirmNr: sale.firmNr, salePeriodNr: sale.periodNr });

      // 1. Calculate Costs (FIFO)
      const itemsForFIFO = sale.items.map(item => ({
        productId: item.productId,
        productCode: item.productId, // FIFO hook might expect this, mapping ID as code fallback
        quantity: item.quantity
      })).filter(i => i.productId); // Ensure we have product IDs

      let costMap = new Map<string, { unitCost: number; totalCost: number; available: boolean }>();

      console.time('[SalesAPI] FIFOCost');
      try {
        costMap = await batchCalculateFIFOCost({
          items: itemsForFIFO,
          firmaId: firmNr.toString(),
          donemId: periodNr.toString()
        });
      } catch (costError) {
        console.warn('[SalesAPI] Cost calculation failed, proceeding with zero cost:', costError);
      }
      console.timeEnd('[SalesAPI] FIFOCost');

      // 2. Map Sale items to Invoice items with cost info
      const invoiceItems = sale.items.map(item => {
        const costInfo = costMap.get(item.productId || '');
        const unitCost = costInfo?.unitCost || 0;
        const totalCost = costInfo?.totalCost || 0;

        // Calculate Gross Profit
        // Net Amount (Sales Price * Qty - Discount) - Cost
        const netAmount = item.total || 0;
        const grossProfit = netAmount - totalCost;

        return {
          productId: item.productId,
          code: item.productId, // Fallback since SaleItem usually doesn't have code
          productName: item.productName,
          description: item.productName,
          quantity: item.quantity,
          unitPrice: item.price,
          price: item.price,
          discount: item.discount, // This might be total discount amount or rate? MarketPOS sends total discount per item usually? 
          // MarketPOS item: { discount: number (amount), subtotal: (qty*price - discount) }
          // InvoiceItem: discount (amount or rate? InvoicesAPI map assumes discount_rate from DB but input item handles amounts differently depending on context)
          // UniversalInvoiceForm sends: discount: item.discountPercent (rate)
          // MarketPOS sends: discount: item.discount (amount?)
          // Let's check MarketPOS again. 
          // MarketPOS: discount: item.discount (which seems to be amount based on `subtotal: item.subtotal` calculation in `handleApplyItemDiscount`)
          // Actually `handleApplyItemDiscount` sets `discount: discountPercent`. But `cart` item has `discount` as percent?
          // MarketPOS: `discount: discountPercent`.
          // MarketPOS `sale.items`: `discount: item.discount` (which is percent).
          // invoicesAPI `create` -> `INSERT`: `discount_rate` takes `item.discount` (which is mapped to `discount_rate`).
          // So if MarketPOS sends percent, we are good.

          total: item.total ?? (item.quantity * item.price - (item.discount || 0)),
          netAmount: item.total ?? (item.quantity * item.price - (item.discount || 0)),
          unitCost: unitCost,
          totalCost: totalCost,
          grossProfit: grossProfit
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

      console.log('[SalesAPI] Final Invoice Data to be sent:', JSON.stringify(invoiceData, null, 2));

      console.time('[SalesAPI] InvoicesAPI_Create');
      // 4. Create via InvoicesAPI
      const savedInvoice = await invoicesAPI.create(invoiceData);

      if (!savedInvoice) throw new Error("Sale creation failed via InvoicesAPI");
      console.timeEnd('[SalesAPI] InvoicesAPI_Create');

      console.log('[SalesAPI] Sale created successfully:', savedInvoice.id);

      // 6. Create Cash Transaction (Kasa İşlemi) if payment method is Cash
      // MarketPOS sales usually come with paymentMethod: 'cash'
      if (sale.paymentMethod === 'cash') {
        console.time('[SalesAPI] KasaIslemi_Create');
        try {
          // 6a. Find target Cash Register
          // Use selected cash register from settings if available, otherwise first active one
          let targetKasaId = ERP_SETTINGS.selected_cash_registers?.[0];

          if (!targetKasaId) {
            const kasalar = await fetchKasalar({ firm_nr: String(firmNr), aktif: true });
            if (kasalar.length > 0) {
              targetKasaId = kasalar[0].id;
              console.log('[SalesAPI] No default register selected, using first available:', targetKasaId);
            }
          }

          if (targetKasaId) {
            const islem: KasaIslemi = {
              firma_id: String(firmNr),
              kasa_id: targetKasaId,
              islem_no: sale.receiptNumber,
              islem_tarihi: sale.date || new Date().toISOString(),
              islem_tipi: 'KASA_GIRIS', // Cash In
              tutar: sale.total,
              islem_aciklamasi: `Market Satışı - ${sale.receiptNumber}`,
              cari_hesap_id: sale.customerId || undefined,
              cari_hesap_unvani: sale.customerName || 'Peşin Müşteri',
              doviz_kodu: 'YEREL', // Local Currency for now
              dovizli_tutar: 0,
              target_register_id: undefined
            };

            await createKasaIslemi(islem);
            console.log('[SalesAPI] Cash transaction created for sale:', sale.receiptNumber);
          } else {
            console.warn('[SalesAPI] No active cash register found for cash payment!');
          }
        } catch (kasaError) {
          console.error('[SalesAPI] Failed to create cash transaction:', kasaError);
          // Don't fail the sale creation itself, just log the error
        }
        console.timeEnd('[SalesAPI] KasaIslemi_Create');
      }

      // 7. Handle 'Veresiye' (Open Account) - Update Customer Balance
      if (sale.paymentMethod === 'veresiye' && sale.customerId) {
        try {
          console.log('[SalesAPI] Processing Veresiye for customer:', sale.customerId);
          // Add to customer balance (Debt/Borç)
          // Note: In most systems, positive balance means customer owes us.
          await customerAPI.addBalance(sale.customerId, sale.total);
          console.log('[SalesAPI] Customer balance updated for veresiye sale:', sale.receiptNumber);
        } catch (veresiyeError) {
          console.error('[SalesAPI] Failed to update customer balance for veresiye:', veresiyeError);
          // Non-fatal, but should be logged/alerted
        }
      }

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
   * Get all sales
   */
  async getAll(limit: number = 100): Promise<Sale[]> {
    try {
      // Use invoicesAPI.getPaginated which is more robust
      const result = await invoicesAPI.getPaginated({
        pageSize: limit,
        invoiceType: 7 // Retail Sales Invoice
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
      const result = await invoicesAPI.getPaginated({
        startDate,
        endDate,
        invoiceType: 7, // Retail Sales
        pageSize: 1000 // Large limit for range
      });
      return result.data.map(mapInvoiceToSale);
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
      let sql = `SELECT net_amount as total, total_discount as discount, total_vat as tax, payment_method FROM sales WHERE (fiche_type = 'sales_invoice' OR trcode = 7) AND status = 'completed'`;
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
    // customerPhone: invoice.customer_phone, // Invoice doesn't have phone in interface yet, maybe fetch or ignore
    storeId: (invoice as any).store_id || 'DEFAULT',
    cashier: (invoice as any).cashier || 'Unknown',
    // userId: invoice.user_id,
    subtotal: invoice.subtotal,
    discount: invoice.discount,
    tax: invoice.tax,
    total: invoice.total_amount,
    paymentMethod: (invoice as any).payment_method || 'cash',
    status: invoice.status,
    notes: invoice.notes,
    firmNr: invoice.firma_id,
    periodNr: invoice.donem_id,
    items: invoice.items.map(res => ({
      productId: res.productId || res.code,
      productName: res.productName || res.description,
      quantity: res.quantity,
      price: res.unitPrice,
      discount: res.discount,
      total: res.total,
      // variants: ...
    }))
  } as Sale;
}


