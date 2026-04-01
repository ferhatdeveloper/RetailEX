/**
 * Invoices API - Direct PostgreSQL Implementation
 */

import { postgres, ERP_SETTINGS } from '../postgres';
import { type Invoice } from '../../core/types';
export type { Invoice };

// Helper to validate UUID format
const isValidUuid = (uuid: any): boolean => {
  if (!uuid || typeof uuid !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

function isNonEmptyScalar(v: string | number | undefined | null): boolean {
  if (v === undefined || v === null) return false;
  return String(v).trim() !== '';
}

/**
 * Firma kodu: önce faturadan gelen değer (seçili firma), yoksa oturumdaki ERP_SETTINGS.
 * `v ?? ERP_SETTINGS` zincirinde `''` atlanmazdı → yanlışlıkla boş string ile '001'e düşmez;
 * firma değişince fatura `firma_id` güncellenmediyse en azından aktif oturum firması kullanılır.
 */
function normalizeFirmNrForRow(v: string | number | undefined | null): string {
  const fromInvoice = isNonEmptyScalar(v) ? String(v).trim() : '';
  const fromSession = String(ERP_SETTINGS.firmNr ?? '').trim();
  const raw = fromInvoice || fromSession;
  if (!raw) {
    console.warn(
      '[InvoicesAPI] Firma numarası yok: fatura firma_id ve ERP_SETTINGS.firmNr boş. rex_* eşleşmesi için 001 kullanılıyor — config kontrol edin.'
    );
    return '001';
  }
  return raw.padStart(3, '0').slice(0, 10);
}

function normalizePeriodNrForRow(v: string | number | undefined | null): string {
  const fromInvoice = isNonEmptyScalar(v) ? String(v).trim() : '';
  const fromSession = String(ERP_SETTINGS.periodNr ?? '').trim();
  const raw = fromInvoice || fromSession;
  if (!raw) {
    console.warn(
      '[InvoicesAPI] Dönem numarası yok: fatura donem_id ve ERP_SETTINGS.periodNr boş. 01 kullanılıyor.'
    );
    return '01';
  }
  return raw.padStart(2, '0').slice(0, 10);
}

/** Logo trcode grupları — getPaginated SQL ile birebir; liste ekranı istemci filtresi burayı kullanmalı (INVOICE_TYPES ile değil). */
export const TRCODES_BY_INVOICE_CATEGORY: Record<string, readonly number[]> = {
  Alis: [1, 4, 5, 6, 13, 26, 41, 42],
  Satis: [7, 8, 9, 14, 29, 30, 31, 32],
  Iade: [2, 3, 6],
  Irsaliye: [10, 11, 12, 13, 25],
  Siparis: [20, 21],
  Teklif: [30, 31],
  Hizmet: [4, 9, 21, 24]
};

/** Modül kategorisi (Alis/Satis/…) ile satırın uyumu — önce DB invoice_category, yoksa Logo trcode grubu */
export function invoiceMatchesModuleCategory(
  inv: { invoice_category?: string; invoice_type?: number; trcode?: number },
  moduleCategory: string
): boolean {
  if (!moduleCategory) return true;
  if (inv.invoice_category) {
    return inv.invoice_category === moduleCategory;
  }
  const tc = Number(inv.invoice_type ?? inv.trcode ?? 0);
  const set = TRCODES_BY_INVOICE_CATEGORY[moduleCategory];
  return set ? set.includes(tc) : true;
}

export const invoicesAPI = {
  /**
   * Create new invoice
   */
  async create(invoice: Invoice): Promise<Invoice | null> {
    try {
      console.log('[InvoicesAPI] Creating invoice via Dynamic Public Tables...', invoice.invoice_no);

      // Firma/dönem: fatura logicalref "1" iken ürünler firm_nr "001" — stok UPDATE eşleşmesi için normalize et
      const firmNr = normalizeFirmNrForRow((invoice as any).firma_id ?? ERP_SETTINGS.firmNr);
      const periodNr = normalizePeriodNrForRow((invoice as any).donem_id ?? ERP_SETTINGS.periodNr);

      const queryOptions = { firmNr, periodNr };

      // Map Invoice Category to TRCODE and Fiche Type based on Logo standards
      let trcode = Number(invoice.invoice_type || 0);
      let ficheType = 'sales_invoice';

      if (trcode === 0) {
        switch (invoice.invoice_category) {
          case 'Alis': trcode = 1; ficheType = 'purchase_invoice'; break;
          case 'Satis': trcode = 8; ficheType = 'sales_invoice'; break;
          case 'Iade': trcode = 3; ficheType = 'return_invoice'; break;
          case 'Irsaliye': trcode = 8; ficheType = 'waybill'; break;
          case 'Siparis': trcode = 1; ficheType = 'order'; break;
          case 'Hizmet': trcode = 9; ficheType = 'sales_invoice'; break;
          default: trcode = 8; ficheType = 'sales_invoice';
        }
      } else {
        // Infer ficheType from trcode (Logo standards)
        if ([1, 4, 5, 6, 13, 26, 41, 42].includes(trcode)) ficheType = 'purchase_invoice';
        else if ([7, 8, 9, 14, 29, 30, 31, 32].includes(trcode)) ficheType = 'sales_invoice';
        else if ([2, 3].includes(trcode)) ficheType = 'return_invoice';
        // Waybills (Irsaliye)
        else if ([10, 11, 12, 13, 25].includes(trcode)) ficheType = 'waybill';
        // Orders (Siparis)
        else if ([20, 21].includes(trcode)) ficheType = 'order';
        // Quotes (Teklif)
        else if ([30, 31].includes(trcode)) ficheType = 'quote';
      }

      // 1. Insert invoice header
      let rows;
      const newId = self.crypto.randomUUID();

      // 1a. Try Enhanced Schema (with store_id etc)
      console.time('[InvoicesAPI] Enhanced_Insert');
      try {
        const result = await postgres.query(
          `INSERT INTO sales (
              id,
              firm_nr, period_nr, fiche_no, date, fiche_type, trcode,
              customer_id, customer_name, total_net, total_vat, total_discount, net_amount, 
              total_cost, gross_profit, profit_margin, currency, currency_rate,
              status, notes, document_no,
              payment_method, cashier, store_id
          ) VALUES ($1::text::uuid, $2::text, $3::text, $4::text, $5::text::timestamptz, $6::text, $7::text::int, $8::text::uuid, $9::text, $10::text::numeric, $11::text::numeric, $12::text::numeric, $13::text::numeric, $14::text::numeric, $15::text::numeric, $16::text::numeric, $17::text, $18::text::numeric, $19::text, $20::text, $21::text, $22::text, $23::text, $24::text::uuid) RETURNING id`,
          [
            newId,
            String(firmNr),
            String(periodNr),
            String(invoice.invoice_no),
            invoice.created_at || new Date(),
            ficheType,
            Number(trcode),
            // customer_id yoksa supplier_id'yi kullan (alış faturalarında tedarikçi UUID buraya yazılır)
            isValidUuid(invoice.customer_id) ? invoice.customer_id
              : isValidUuid(invoice.supplier_id) ? invoice.supplier_id : null,
            String(invoice.customer_name || invoice.supplier_name || ''),
            Number(invoice.subtotal || 0),
            Number(invoice.tax || 0),
            Number(invoice.discount || 0),
            Number(invoice.total_amount || 0),
            Number(invoice.total_cost || 0),
            Number(invoice.gross_profit || 0),
            Number(invoice.profit_margin || 0),
            String(invoice.currency || 'IQD'),
            Number(invoice.currency_rate || 1),
            'approved',
            String(invoice.notes || ''),
            String(invoice.invoice_no),
            String((invoice as any).payment_method || 'Nakit'),
            String((invoice as any).cashier || ''),
            isValidUuid((invoice as any).store_id) ? (invoice as any).store_id : null
          ],
          queryOptions
        );
        rows = result.rows;
      } catch (e) {
        console.warn('Enhanced insert threw error directly:', e);
        rows = [];
      }
      console.timeEnd('[InvoicesAPI] Enhanced_Insert');

      // Check if enhanced insert failed (empty rows mean failure in postgres.ts wrapper)
      // If rows is empty, it means the INSERT failed, likely due to schema mismatch or data error.
      if (!rows || rows.length === 0) {
        console.warn('[InvoicesAPI] Enhanced INSERT failed (swallowed error or 0 rows), trying legacy fallback...');

        // 1b. Fallback to Legacy Schema
        console.time('[InvoicesAPI] Legacy_Insert');
        const result = await postgres.query(
          `INSERT INTO sales (
              id,
              firm_nr, period_nr, fiche_no, date, fiche_type, trcode,
              customer_id, customer_name, total_net, total_vat, total_discount, net_amount, 
              total_cost, gross_profit, profit_margin, currency, currency_rate,
              status, notes
          ) VALUES ($1::text::uuid, $2::text, $3::text, $4::text, $5::text::timestamptz, $6::text, $7::text::int, $8::text::uuid, $9::text, $10::text::numeric, $11::text::numeric, $12::text::numeric, $13::text::numeric, $14::text::numeric, $15::text::numeric, $16::text::numeric, $17::text, $18::text::numeric, $19::text, $20::text) RETURNING id`,
          [
            newId,
            String(firmNr),
            String(periodNr),
            String(invoice.invoice_no),
            invoice.created_at || new Date(),
            ficheType,
            Number(trcode),
            isValidUuid(invoice.customer_id) ? invoice.customer_id : null,
            String(invoice.customer_name || invoice.supplier_name || ''),
            Number(invoice.subtotal || 0),
            Number(invoice.tax || 0),
            Number(invoice.discount || 0),
            Number(invoice.total_amount || 0),
            Number(invoice.total_cost || 0),
            Number(invoice.gross_profit || 0),
            Number(invoice.profit_margin || 0),
            String(invoice.currency || 'IQD'),
            Number(invoice.currency_rate || 1),
            'approved',
            String(invoice.notes || '')
          ],
          queryOptions
        );
        rows = result.rows;
        console.timeEnd('[InvoicesAPI] Legacy_Insert');
      }

      const invoiceId = rows[0]?.id;
      if (!invoiceId) throw new Error("Invoice creation failed");

      // 2. Insert invoice items
      if (invoice.items && invoice.items.length > 0) {
        for (const item of invoice.items) {
          const productId = item.code || item.productId;
          const unitMultiplier = Number((item as any).multiplier || 1);
          const baseQty = Number((item as any).baseQuantity ?? (Number(item.quantity) * unitMultiplier));
          const unitPriceFC = Number((item as any).unitPriceFC || item.unitPrice || item.price || 0);
          const itemCurrency = String((item as any).currency || (invoice as any).currency || 'IQD');

          await postgres.query(
            `INSERT INTO sale_items (
                id,
                invoice_id, firm_nr, period_nr, item_code, item_name,
                quantity, unit, unit_price, discount_rate, vat_rate,
                total_amount, net_amount,
                unit_cost, total_cost, gross_profit,
                unit_multiplier, base_quantity, unit_price_fc, currency
             ) VALUES ($1::text::uuid, $2::text::uuid, $3::text, $4::text, $5::text, $6::text,
               $7::text::numeric, $8::text, $9::text::numeric, $10::text::numeric, $11::text::numeric,
               $12::text::numeric, $13::text::numeric,
               $14::text::numeric, $15::text::numeric, $16::text::numeric,
               $17::text::numeric, $18::text::numeric, $19::text::numeric, $20::text)`,
            [
              self.crypto.randomUUID(),
              invoiceId,
              String(firmNr),
              String(periodNr),
              String(productId),
              String(item.description || item.productName),
              Number(item.quantity),
              String((item as any).unit || 'Adet'),
              Number(item.unitPrice || item.price),
              Number(item.discount || 0),
              Number((item as any).taxRate || (item as any).vat_rate || 0),
              Number(item.total || item.netAmount),
              Number(item.netAmount || item.total),
              Number(item.unitCost || 0),
              Number(item.totalCost || 0),
              Number(item.grossProfit || 0),
              unitMultiplier,
              baseQty,
              unitPriceFC,
              itemCurrency
            ],
            queryOptions
          );

          // 3. Update stock — use base_quantity (accounts for unit multiplier)
          if (productId) {
            let stockModifier = 0;
            if (invoice.invoice_category === 'Alis') stockModifier = baseQty;
            else if (invoice.invoice_category === 'Satis') stockModifier = -baseQty;
            else if (invoice.invoice_category === 'Iade') {
              if (Number(trcode) === 3) stockModifier = baseQty;
              else if (Number(trcode) === 2 || Number(trcode) === 6) stockModifier = -baseQty;
              else stockModifier = baseQty;
            }

            if (stockModifier !== 0) {
              const pid = String(productId).trim();
              // firm_nr: DB'de "1" / "001" karışıklığı; code: ana kod, barkod tablosu ve UUID
              const stkRes = await postgres.query<{ id: string; code: string; stock: string }>(
                `UPDATE products AS p
                 SET stock = COALESCE(p.stock::numeric, 0) + $1::numeric
                 FROM (
                   SELECT p2.id
                   FROM products p2
                   LEFT JOIN product_barcodes pb ON pb.product_id = p2.id
                   WHERE (
                     btrim(COALESCE(p2.code, '')) = btrim($2::text)
                     OR btrim(COALESCE(p2.barcode, '')) = btrim($2::text)
                     OR p2.id::text = btrim($2::text)
                     OR btrim(COALESCE(pb.barcode_code, '')) = btrim($2::text)
                   )
                   AND (
                     btrim(p2.firm_nr::text) = btrim($3::text)
                     OR (
                       btrim(p2.firm_nr::text) ~ '^[0-9]+$'
                       AND btrim($3::text) ~ '^[0-9]+$'
                       AND btrim(p2.firm_nr::text)::bigint = btrim($3::text)::bigint
                     )
                   )
                   LIMIT 1
                 ) AS sub
                 WHERE p.id = sub.id
                 RETURNING p.id, p.code, p.stock`,
                [stockModifier, pid, firmNr],
                queryOptions
              );
              if (!stkRes.rows?.length) {
                console.warn('[InvoicesAPI] Stok güncellenemedi — ürün veya firma eşleşmedi', {
                  item_code: pid,
                  firmNr,
                  stockModifier,
                  invoice_no: invoice.invoice_no,
                  category: invoice.invoice_category
                });
              }
            }
          }
        }
      }

      // 4. Update current account balance
      const accountId = invoice.customer_id || invoice.supplier_id;
      if (accountId && isValidUuid(accountId)) {
        const amount = Number(invoice.total_amount || 0);

        if (invoice.invoice_category === 'Satis' || invoice.invoice_category === 'Hizmet') {
          // Satış: müşteri borcu artar (bizim alacağımız)
          await postgres.query(
            `UPDATE customers SET balance = COALESCE(balance, 0) + $1::numeric WHERE id = $2::uuid AND firm_nr = $3`,
            [amount, accountId, firmNr],
            queryOptions
          ).catch(() => { }); // Müşteri bulunamazsa sessizce geç
        } else if (invoice.invoice_category === 'Alis') {
          // Alış: tedarikçiye borcumuz artar
          await postgres.query(
            `UPDATE suppliers SET balance = COALESCE(balance, 0) + $1::numeric WHERE id = $2::uuid`,
            [amount, accountId],
            queryOptions
          ).catch(() => { });
        } else if (invoice.invoice_category === 'Iade') {
          // İade: trcode'a göre yön belirle
          // trcode 3 = müşteriden iade → müşteri bakiyesi azalır
          // trcode 2 = tedarikçiye iade → tedarikçi bakiyesi azalır
          if (trcode === 3 || ficheType === 'return_invoice') {
            const { rowCount } = await postgres.query(
              `UPDATE customers SET balance = COALESCE(balance, 0) - $1::numeric WHERE id = $2::uuid AND firm_nr = $3`,
              [amount, accountId, firmNr],
              queryOptions
            ).catch(() => ({ rowCount: 0 }));
            if (!rowCount) {
              await postgres.query(
                `UPDATE suppliers SET balance = COALESCE(balance, 0) - $1::numeric WHERE id = $2::uuid`,
                [amount, accountId],
                queryOptions
              ).catch(() => { });
            }
          }
        }
      }

      return {
        ...invoice,
        id: invoiceId,
        created_at: new Date().toISOString()
      };
    } catch (error: any) {
      console.error('[InvoicesAPI] create failed:', error);
      console.error('[InvoicesAPI] Failed Invoice Data:', JSON.stringify(invoice, null, 2));
      throw new Error(error.message || 'Fatura kaydedilemedi');
    }
  },

  /**
   * Get invoices with pagination and filters
   */
  async getPaginated(options: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    customerId?: string;
    invoiceCategory?: string;
    invoiceType?: number;
  }): Promise<{ data: Invoice[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const {
      page = 1,
      pageSize = 50,
      search,
      status,
      startDate,
      endDate,
      customerId,
      invoiceCategory,
      invoiceType
    } = options;

    try {
      const firmNr = ERP_SETTINGS.firmNr;
      const periodNr = ERP_SETTINGS.periodNr;

      let sql = `SELECT * FROM sales WHERE 1=1`;
      const params: any[] = [];
      let paramIndex = 1;

      console.log('[InvoicesAPI] [getPaginated] Base SQL:', sql);
      console.log('[InvoicesAPI] [getPaginated] ERP Context:', { firmNr, periodNr });
      console.log('[InvoicesAPI] [getPaginated] Options:', options);

      // Filter by fiche_type or trcode based on category
      if (invoiceType !== undefined && invoiceType !== null && invoiceType !== 0) {
        sql += ` AND trcode::text = $${paramIndex}::text`;
        params.push(String(invoiceType));
        paramIndex++;
      } else if (invoiceCategory) {
        const trcodes = [...(TRCODES_BY_INVOICE_CATEGORY[invoiceCategory] || [])];

        if (trcodes.length > 0) {
          sql += ` AND trcode::int IN (${trcodes.join(',')})`;
        } else {
          // Fallback to fiche_type if unknown category
          let ficheType = 'sales_invoice';
          if (invoiceCategory === 'Alis') ficheType = 'purchase_invoice';
          sql += ` AND fiche_type::text = $${paramIndex}::text`;
          params.push(ficheType);
          paramIndex++;
        }
      }

      if (search) {
        sql += ` AND (fiche_no::text ILIKE $${paramIndex}::text OR notes::text ILIKE $${paramIndex}::text OR document_no::text ILIKE $${paramIndex}::text)`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      if (status) {
        sql += ` AND status::text = $${paramIndex}::text`;
        params.push(status);
        paramIndex++;
      }

      if (customerId) {
        sql += ` AND customer_id::text = $${paramIndex}::text`;
        params.push(customerId);
        paramIndex++;
      }

      if (startDate) {
        sql += ` AND date::date >= $${paramIndex}::date`;
        // Fix: Truncate to YYYY-MM-DD to avoid "error serializing parameter"
        params.push(String(startDate).substring(0, 10));
        paramIndex++;
      }

      if (endDate) {
        sql += ` AND date::date <= $${paramIndex}::date`;
        // Fix: Truncate to YYYY-MM-DD to avoid "error serializing parameter"
        params.push(String(endDate).substring(0, 10));
        paramIndex++;
      }

      // Count total
      const { rows: countRows } = await postgres.query(`SELECT COUNT(*) as total FROM (${sql}) as sub`, params);
      const total = countRows && countRows[0] ? parseInt(countRows[0].total) : 0;

      // Add ordering and pagination
      sql += ` ORDER BY date DESC LIMIT $${paramIndex}::text::int OFFSET $${paramIndex + 1}::text::int`;
      params.push(pageSize);
      params.push((page - 1) * pageSize);

      const { rows } = await postgres.query(sql, params);
      const invoices = rows.map(mapDatabaseInvoiceToInvoice);

      return {
        data: invoices,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      };
    } catch (error) {
      console.error('[InvoicesAPI] getPaginated failed:', error);
      return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }
  },

  /**
   * Get invoice by ID
   */
  async getById(id: string): Promise<Invoice | null> {
    const firmNr = ERP_SETTINGS.firmNr;
    const cleanId = String(id || '').trim();
    if (!cleanId) return null;

    const firmNrStr = String(firmNr ?? '').trim();
    const parsedFirm = firmNrStr ? parseInt(firmNrStr, 10) : NaN;
    const firmFromInt = Number.isFinite(parsedFirm) ? String(parsedFirm).padStart(3, '0') : '';
    const firmVariants = Array.from(
      new Set(
        [firmNrStr, firmNrStr ? firmNrStr.padStart(3, '0') : '', firmFromInt].filter((x) => Boolean(x))
      )
    );
    if (firmVariants.length === 0) {
      firmVariants.push(String(ERP_SETTINGS.firmNr || '001').padStart(3, '0'));
    }

    let rows: any[];
    try {
      /* join_* ile s.customer_name çakışması yok; tedarikçi adı her zaman join'den gelir */
      let res = await postgres.query(
        `SELECT s.*, c.name AS join_customer_name, sup.name AS join_supplier_name
         FROM sales s
         LEFT JOIN customers c ON s.customer_id = c.id
         LEFT JOIN suppliers sup ON s.customer_id = sup.id
         WHERE s.id::text = $1 AND s.firm_nr::text = $2`,
        [cleanId, firmVariants[0] || firmNrStr]
      );
      rows = res.rows;
      if (rows.length === 0 && firmVariants.length > 1) {
        for (let i = 1; i < firmVariants.length; i++) {
          res = await postgres.query(
            `SELECT s.*, c.name AS join_customer_name, sup.name AS join_supplier_name
             FROM sales s
             LEFT JOIN customers c ON s.customer_id = c.id
             LEFT JOIN suppliers sup ON s.customer_id = sup.id
             WHERE s.id::text = $1 AND s.firm_nr::text = $2`,
            [cleanId, firmVariants[i]]
          );
          if (res.rows.length > 0) {
            rows = res.rows;
            break;
          }
        }
      }
      /* firm_nr 1 vs 001 uyuşmazlığı: id UUID yeterli (tekil) */
      if (rows.length === 0) {
        res = await postgres.query(
          `SELECT s.*, c.name AS join_customer_name, sup.name AS join_supplier_name
           FROM sales s
           LEFT JOIN customers c ON s.customer_id = c.id
           LEFT JOIN suppliers sup ON s.customer_id = sup.id
           WHERE s.id::text = $1`,
          [cleanId]
        );
        rows = res.rows;
      }
    } catch (error) {
      console.error('[InvoicesAPI] getById header failed:', error);
      return null;
    }

    if (rows.length === 0) return null;

    const header = rows[0];
    const invoice = mapDatabaseInvoiceToInvoice(header);

    /* Satırlar: sales + sale_items aynı firma/dönem önekine çözülsün diye JOIN; başlıktaki period_nr öncelikli */
    const itemTableOpts = {
      firmNr: header.firm_nr != null && header.firm_nr !== '' ? String(header.firm_nr) : String(firmNr),
      periodNr:
        header.period_nr != null && header.period_nr !== ''
          ? String(header.period_nr)
          : String(ERP_SETTINGS.periodNr || '01')
    };

    /** Düzenleme: fatura dövizi USD vb. ise gridde unit_price_fc + satır currency; tutarlar yerelden kura bölünür */
    const mapSaleItemRow = (item: any, inv: Invoice) => {
      const codeRaw = item.item_code ?? item.product_id;
      const code = codeRaw != null && codeRaw !== '' ? String(codeRaw) : '';
      const hdrCur = String(inv.currency || 'IQD').trim().toUpperCase();
      const rowCur = String(item.currency || hdrCur || 'IQD').trim().toUpperCase();
      const rate = Number(inv.currency_rate) > 0 ? Number(inv.currency_rate) : 1;
      const uFCraw = item.unit_price_fc;
      const uFC =
        uFCraw != null && uFCraw !== '' && !Number.isNaN(parseFloat(String(uFCraw)))
          ? parseFloat(String(uFCraw))
          : NaN;
      const uLoc = parseFloat(item.unit_price || 0);
      const grossIQD = parseFloat(item.total_amount || 0);
      const netIQD = parseFloat(item.net_amount || 0);
      const useFc = Number.isFinite(uFC) && rowCur !== 'IQD';
      const unitPrice = useFc ? uFC : uLoc;
      const netAmount = useFc ? netIQD / rate : netIQD;
      const total = useFc ? grossIQD / rate : grossIQD;
      return {
        id: item.id,
        productId: item.product_id != null ? String(item.product_id) : code,
        code,
        description: item.item_name || '',
        productName: item.item_name || '',
        quantity: parseFloat(item.quantity),
        unit: item.unit || 'Adet',
        unitPrice,
        price: unitPrice,
        discount: parseFloat(item.discount_rate || 0),
        tax: 0,
        netAmount,
        total,
        unitCost: parseFloat(item.unit_cost || 0),
        totalCost: parseFloat(item.total_cost || 0),
        grossProfit: parseFloat(item.gross_profit || 0),
        multiplier: parseFloat(item.unit_multiplier || 1),
        baseQuantity: parseFloat(item.base_quantity ?? item.quantity),
        unitPriceFC: Number.isFinite(uFC) ? uFC : uLoc,
        currency: item.currency || inv.currency || 'IQD'
      };
    };

    let itemRows: any[] = [];

    const tryJoinItems = async (opts?: { firmNr: string; periodNr: string }) => {
      const q = `
        SELECT si.*
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.invoice_id
        WHERE s.id::text = $1
      `;
      const r = await postgres.query(q, [cleanId], opts);
      return r.rows || [];
    };

    const tryDirectItems = async (opts?: { firmNr: string; periodNr: string }) => {
      const q = `SELECT * FROM sale_items WHERE invoice_id = $1::uuid`;
      const r = await postgres.query(q, [cleanId], opts);
      return r.rows || [];
    };

    try {
      itemRows = await tryJoinItems(itemTableOpts);
    } catch (e) {
      console.warn('[InvoicesAPI] getById sale_items JOIN (header period) failed:', e);
    }

    if (itemRows.length === 0) {
      try {
        itemRows = await tryDirectItems(itemTableOpts);
      } catch (e) {
        console.warn('[InvoicesAPI] getById sale_items direct (header period) failed:', e);
      }
    }

    if (itemRows.length === 0) {
      try {
        itemRows = await tryJoinItems();
      } catch (e) {
        console.warn('[InvoicesAPI] getById sale_items JOIN (ERP period) failed:', e);
      }
    }

    if (itemRows.length === 0) {
      try {
        itemRows = await tryDirectItems();
      } catch (e) {
        console.warn('[InvoicesAPI] getById sale_items direct (ERP period) failed:', e);
      }
    }

    if (itemRows.length === 0) {
      try {
        const r = await postgres.query(
          `SELECT * FROM sale_items WHERE invoice_id::text = $1`,
          [cleanId],
          itemTableOpts
        );
        itemRows = r.rows || [];
      } catch (e) {
        console.warn('[InvoicesAPI] getById sale_items text match failed:', e);
      }
    }

    if (itemRows.length === 0) {
      try {
        const r = await postgres.query(
          `SELECT * FROM sale_items WHERE invoice_id::text = $1`,
          [cleanId]
        );
        itemRows = r.rows || [];
      } catch (e) {
        console.warn('[InvoicesAPI] getById sale_items text (ERP period) failed:', e);
      }
    }

    /* Eski şemada sale_id kullanılmış olabilir */
    if (itemRows.length === 0) {
      try {
        const r = await postgres.query(
          `SELECT * FROM sale_items WHERE sale_id = $1::uuid OR sale_id::text = $1`,
          [cleanId],
          itemTableOpts
        );
        itemRows = r.rows || [];
      } catch {
        /* sale_id kolonu yoksa normal */
      }
    }

    invoice.items = itemRows.map((row) => mapSaleItemRow(row, invoice));

    if (itemRows.length === 0) {
      console.warn('[InvoicesAPI] getById: no sale_items for invoice', cleanId, itemTableOpts);
    }

    return invoice;
  },

  /**
   * Update existing invoice
   */
  async update(id: string, invoice: Partial<Invoice>): Promise<Invoice | null> {
    try {
      console.log('[InvoicesAPI] Updating invoice...', id);
      const firmNr = ERP_SETTINGS.firmNr;

      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;

      if (invoice.invoice_no) { fields.push(`fiche_no = $${i++}`); values.push(invoice.invoice_no); }
      if (invoice.status) { fields.push(`status = $${i++}`); values.push(invoice.status); }
      if (invoice.notes !== undefined) { fields.push(`notes = $${i++}`); values.push(invoice.notes); }
      if (invoice.total_amount !== undefined) { fields.push(`net_amount = $${i++}`); values.push(invoice.total_amount); }
      if (invoice.customer_name !== undefined) { fields.push(`customer_name = $${i++}`); values.push(invoice.customer_name); }
      const partnerId = invoice.customer_id || invoice.supplier_id;
      if (partnerId !== undefined && isValidUuid(String(partnerId))) {
        fields.push(`customer_id = $${i++}::uuid`);
        values.push(String(partnerId));
      }
      if (invoice.subtotal !== undefined) { fields.push(`total_net = $${i++}`); values.push(invoice.subtotal); }
      if (invoice.tax !== undefined) { fields.push(`total_vat = $${i++}`); values.push(invoice.tax); }
      if (invoice.discount !== undefined) { fields.push(`total_discount = $${i++}`); values.push(invoice.discount); }
      if (invoice.total_cost !== undefined) { fields.push(`total_cost = $${i++}`); values.push(invoice.total_cost); }
      if (invoice.gross_profit !== undefined) { fields.push(`gross_profit = $${i++}`); values.push(invoice.gross_profit); }
      if (invoice.currency !== undefined) { fields.push(`currency = $${i++}`); values.push(invoice.currency); }
      if (invoice.currency_rate !== undefined) { fields.push(`currency_rate = $${i++}`); values.push(invoice.currency_rate); }

      if (fields.length > 0) {
        values.push(id);
        values.push(firmNr);
        await postgres.query(
          `UPDATE sales SET ${fields.join(', ')} WHERE id::text = $${i} AND firm_nr = $${i + 1}`,
          values
        );
      }

      if (invoice.items) {
        await postgres.query(`DELETE FROM sale_items WHERE invoice_id::text::uuid = $1::text::uuid`, [id]);
        for (const item of invoice.items) {
          const productId = item.code || item.productId;
          const unitMultiplier = Number((item as any).multiplier || 1);
          const baseQty = Number((item as any).baseQuantity ?? (Number(item.quantity) * unitMultiplier));
          const unitPriceFC = Number((item as any).unitPriceFC || item.unitPrice || item.price || 0);
          const itemCurrency = String((item as any).currency || (invoice as any).currency || 'IQD');
          await postgres.query(
            `INSERT INTO sale_items (
                invoice_id, firm_nr, period_nr, item_code, item_name,
                quantity, unit, unit_price, discount_rate, vat_rate,
                total_amount, net_amount,
                unit_cost, total_cost, gross_profit,
                unit_multiplier, base_quantity, unit_price_fc, currency
             ) VALUES ($1::text::uuid, $2::text, $3::text, $4::text, $5::text,
               $6::text::numeric, $7::text, $8::text::numeric, $9::text::numeric, $10::text::numeric,
               $11::text::numeric, $12::text::numeric,
               $13::text::numeric, $14::text::numeric, $15::text::numeric,
               $16::text::numeric, $17::text::numeric, $18::text::numeric, $19::text)`,
            [
              id,
              String(firmNr),
              String(ERP_SETTINGS.periodNr),
              String(productId),
              String(item.description || item.productName),
              Number(item.quantity),
              String((item as any).unit || 'Adet'),
              Number(item.unitPrice || item.price),
              Number(item.discount || 0),
              Number((item as any).taxRate || (item as any).vat_rate || 0),
              Number(item.total || item.netAmount),
              Number(item.netAmount || item.total),
              Number(item.unitCost || 0),
              Number(item.totalCost || 0),
              Number(item.grossProfit || 0),
              unitMultiplier,
              baseQty,
              unitPriceFC,
              itemCurrency
            ]
          );
        }
      }

      return await this.getById(id);
    } catch (error: any) {
      console.error('[InvoicesAPI] update failed:', error);
      throw new Error(error.message || 'Fatura güncellenemedi');
    }
  },

  async getProductHistory(productId: string): Promise<any[]> {
    try {
      const { rows } = await postgres.query(
        `SELECT 
            it.quantity, it.unit_price, it.total_amount, s.fiche_no, s.date, s.fiche_type,
            COALESCE(c.name, sup.name) as partner_name
         FROM sale_items it 
         JOIN sales s ON it.invoice_id = s.id 
         LEFT JOIN customers c ON s.customer_id = c.id 
         LEFT JOIN suppliers sup ON s.customer_id = sup.id
         WHERE it.item_code = $1 
         ORDER BY s.date DESC`,
        [productId]
      );

      return rows.map(r => ({
        date: r.date,
        documentNo: r.fiche_no,
        supplier: r.partner_name || 'N/A',
        quantity: r.quantity,
        unitPrice: parseFloat(r.unit_price),
        total: parseFloat(r.total_amount),
        type: r.fiche_type === 'purchase_invoice' ? 'purchase' : 'sales'
      }));
    } catch (error) {
      console.error('[InvoicesAPI] getProductHistory failed:', error);
      return [];
    }
  },



  /**
   * Refund invoice (POS style status update)
   * Ideally this should be a new Return Invoice, but for quick POS actions we might just flag it.
   */
  async refund(id: string): Promise<boolean> {
    try {
      const firmNr = ERP_SETTINGS.firmNr;

      // Faturayı getir → bakiyeyi geri al
      const invoice = await this.getById(id);
      if (invoice) {
        const accountId = invoice.customer_id || invoice.supplier_id;
        const amount = Number(invoice.total_amount || invoice.total || 0);
        if (accountId && isValidUuid(accountId) && amount > 0) {
          if (invoice.invoice_category === 'Satis' || invoice.invoice_category === 'Hizmet') {
            await postgres.query(
              `UPDATE customers SET balance = COALESCE(balance, 0) - $1::numeric WHERE id = $2::uuid AND firm_nr = $3`,
              [amount, accountId, firmNr]
            ).catch(() => { });
          } else if (invoice.invoice_category === 'Alis') {
            await postgres.query(
              `UPDATE suppliers SET balance = COALESCE(balance, 0) - $1::numeric WHERE id = $2::uuid`,
              [amount, accountId]
            ).catch(() => { });
          }
        }
      }

      const { rowCount } = await postgres.query(
        `UPDATE sales SET status = 'refunded' WHERE id = $1 AND firm_nr = $2`,
        [id, String(firmNr)]
      );
      return (rowCount || 0) > 0;
    } catch (error) {
      console.error('[InvoicesAPI] refund failed:', error);
      return false;
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      console.log('[InvoicesAPI] Deleting invoice...', id);
      const firmNr = ERP_SETTINGS.firmNr;
      await postgres.query(`DELETE FROM sale_items WHERE invoice_id::text::uuid = $1::text::uuid`, [id]);
      await postgres.query(`DELETE FROM sales WHERE id::text::uuid = $1::text::uuid AND firm_nr::text = $2::text`, [id, String(firmNr)]);
      return true;
    } catch (error) {
      console.error('[InvoicesAPI] delete failed:', error);
      return false;
    }
  }
};

function mapDatabaseInvoiceToInvoice(dbInv: any): Invoice {
  let category: Invoice['invoice_category'] = 'Hizmet';

  if (dbInv.fiche_type === 'purchase_invoice') category = 'Alis';
  else if (dbInv.fiche_type === 'sales_invoice') category = 'Satis';
  else if (dbInv.fiche_type === 'return_invoice') category = 'Iade';
  else if (dbInv.fiche_type === 'waybill') category = 'Irsaliye';
  else if (dbInv.fiche_type === 'order') category = 'Siparis';

  const joinCust = dbInv.join_customer_name;
  const joinSup = dbInv.join_supplier_name;
  /* Alış: customer_id tedarikçi UUID; customers join boş — ünvan suppliers veya sales.customer_name */
  const partnerNameAlis = joinSup || dbInv.customer_name || '';
  const partnerNameSatis = joinCust || dbInv.customer_name || '';

  return {
    id: dbInv.id || '',
    invoice_no: dbInv.fiche_no || dbInv.document_no,
    invoice_date: dbInv.created_at || dbInv.date,
    customer_id: dbInv.customer_id,
    customer_name: category === 'Alis' ? partnerNameAlis : partnerNameSatis,
    supplier_id: dbInv.customer_id,
    supplier_name: category === 'Alis' ? partnerNameAlis : (joinSup || dbInv.supplier_name || ''),
    trcode: dbInv.trcode != null ? Number(dbInv.trcode) : undefined,
    subtotal: parseFloat(dbInv.total_net || 0),
    tax: parseFloat(dbInv.total_vat || 0),
    discount: parseFloat(dbInv.total_discount || 0),
    total_amount: parseFloat(dbInv.net_amount || 0),
    total: parseFloat(dbInv.net_amount || 0),
    status: dbInv.status,
    notes: dbInv.notes,
    invoice_category: category,
    created_at: dbInv.created_at || dbInv.date,
    items: [],
    source: 'invoice',
    invoice_type: dbInv.trcode != null ? Number(dbInv.trcode) : 0,
    firma_id: dbInv.firm_nr,
    firma_name: '',
    donem_id: dbInv.period_nr,
    donem_name: '',
    total_cost: parseFloat(dbInv.total_cost || 0),
    gross_profit: parseFloat(dbInv.gross_profit || 0),
    profit_margin: parseFloat(dbInv.profit_margin || 0),
    currency: dbInv.currency || 'IQD',
    currency_rate: parseFloat(dbInv.currency_rate || 1),
  } as Invoice;
}
