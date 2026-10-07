/**
 * AVANS → FATURA (Basit Model) — servis katmanı
 *
 * Sağladığı işlemler:
 *   - `recordAdvance`: POS'tan tek seferde avans + cari hareketi + kasa hareketi
 *     + (varsa) stok rezervasyonu. Fatura oluşturmaz.
 *   - `getOpenAdvances`: müşterinin açık avanslarını listeler (fatura formu
 *     müşteri seçildiğinde bu listeyi gösterir).
 *   - `applyAdvanceToSale`: avansı belirli bir satışa uygular (status=applied,
 *     applied_sale_id set). Stok rezervasyonları finalize olur.
 *   - `keepAdvanceOnCancel`: iptal durumunda avans bakiyede kalır
 *     (status=kept_on_cancel). Stok rezervasyonları released olur.
 *
 * Tablolar:
 *   - rex_<firmNr>_<periodNr>_cari_avans
 *   - rex_<firmNr>_<periodNr>_inventory_reservations
 *   - rex_<firmNr>_<periodNr>_cash_lines
 *   - rex_<firmNr>_<periodNr>_account_movements (cari hareket)
 *
 * NOT (Tauri uyumu): Ham SQL string'leri kullanılır; `DO $$ … END $$` blokları
 * YAZILMAZ. Migration 194 tabloları period düzeyinde (sales pattern'i) oluşturur.
 *
 * NOT (muhasebe denetimi):
 *   - Avans, cari hesabı **borçlandırmaz** (fatura yok). Müşteri **alacaklı**
 *     olur (işletmenin borcu — parasını peşin vermiş).
 *   - `account_movements`: customer_id + sign=+1 (alacak / para girişi)
 *   - `cash_lines`: CH_TAHSILAT (müşteriden tahsilat) — kasa +, cari alacak +
 *   - İptalde avans status=kept_on_cancel, cari bakiyesi aynen korunur
 *     (cari hareket iptal edilmez), stok rezervasyonu released olur.
 */

import { postgres, ERP_SETTINGS } from './postgres';
import type {
  AvansRecord,
  AvansStatus,
  AvansPaymentMethod,
  InventoryReservation,
  RecordAdvanceInput,
  RecordAdvanceResult,
  ReservationStatus,
} from '../core/types/avans';
import { createKasaIslemi } from './api/kasa';

/* ------------------------------------------------------------------ */
/* Tablo adı yardımcıları                                              */
/* ------------------------------------------------------------------ */

function getCariAvansTable(): string {
  const firm = String(ERP_SETTINGS.firmNr || '001').padStart(3, '0');
  const period = String(ERP_SETTINGS.periodNr || '01').padStart(2, '0');
  return `rex_${firm}_${period}_cari_avans`;
}

function getInventoryReservationsTable(): string {
  const firm = String(ERP_SETTINGS.firmNr || '001').padStart(3, '0');
  const period = String(ERP_SETTINGS.periodNr || '01').padStart(2, '0');
  return `rex_${firm}_${period}_inventory_reservations`;
}

/** Beauty randevu tablosu — `beauty.rex_<firmNr>_<periodNr>_beauty_appointments`. */
function getBeautyAppointmentsTable(): string {
  const firm = String(ERP_SETTINGS.firmNr || '001').padStart(3, '0');
  const period = String(ERP_SETTINGS.periodNr || '01').padStart(2, '0');
  return `beauty.rex_${firm}_${period}_beauty_appointments`;
}

/* ------------------------------------------------------------------ */
/* DB row → TypeScript dönüşümü                                        */
/* ------------------------------------------------------------------ */

function rowToAvans(row: Record<string, unknown>): AvansRecord {
  return {
    id: String(row.id),
    firmNr: String(row.firm_nr ?? '001'),
    periodNr: String(row.period_nr ?? '01'),
    customerId: String(row.customer_id),
    amount: Number(row.amount ?? 0),
    originalAmount: row.original_amount != null ? Number(row.original_amount) : null,
    originalCurrency: row.original_currency != null ? String(row.original_currency) : null,
    paymentMethod: String(row.payment_method ?? 'cash') as AvansPaymentMethod,
    status: String(row.status ?? 'open') as AvansStatus,
    appliedSaleId: row.applied_sale_id != null ? String(row.applied_sale_id) : null,
    referenceNo: row.reference_no != null ? String(row.reference_no) : null,
    cashRegisterId: row.cash_register_id != null ? String(row.cash_register_id) : null,
    cashRegisterCode: row.cash_register_code != null ? String(row.cash_register_code) : null,
    cashLineId: row.cash_line_id != null ? String(row.cash_line_id) : null,
    cariMovementId: row.cari_movement_id != null ? String(row.cari_movement_id) : null,
    createdAt: row.created_at ? String(row.created_at) : new Date().toISOString(),
    createdBy: row.created_by != null ? String(row.created_by) : null,
    notes: row.notes != null ? String(row.notes) : null,
  };
}

function rowToReservation(row: Record<string, unknown>): InventoryReservation {
  return {
    id: String(row.id),
    firmNr: String(row.firm_nr ?? '001'),
    periodNr: String(row.period_nr ?? '01'),
    customerId: String(row.customer_id),
    productId: String(row.product_id),
    quantity: Number(row.quantity ?? 0),
    status: String(row.status ?? 'reserved') as ReservationStatus,
    avansId: row.avans_id != null ? String(row.avans_id) : null,
    saleId: row.sale_id != null ? String(row.sale_id) : null,
    createdAt: row.created_at ? String(row.created_at) : new Date().toISOString(),
    releasedAt: row.released_at != null ? String(row.released_at) : null,
    notes: row.notes != null ? String(row.notes) : null,
  };
}

/* ------------------------------------------------------------------ */
/* recordAdvance — ana API                                             */
/* ------------------------------------------------------------------ */

/**
 * POS'tan peşinatlı ödeme alındığında çağrılır.
 *
 * Akış:
 *   1. cari_avans satırı ekle (status=open)
 *   2. cash_lines CH_TAHSILAT yaz (kasa +)
 *   3. account_movements yaz (müşteri alacak +)
 *   4. cari_avans satırını cash_line_id + cari_movement_id ile güncelle
 *   5. items varsa: her satır için inventory_reservations yaz (status=reserved)
 *   6. appointmentId verilmişse `beauty.rex_*_beauty_appointments` tablosunda
 *      `deposit_amount`, `deposit_date`, `deposit_provider='pos'` alanlarını
 *      yaz ki sonraki girişte kalan doğru hesaplansın. Fişsiz avans modunda
 *      (skipInvoice=true) bu güncelleme appointmentPOS updateAppointment
 *      yerine burada yapılır — randevu yine de caride yansır.
 *
 * Döndürür: avans + rezervasyonlar + kasa/cari id'leri
 */
export async function recordAdvance(input: RecordAdvanceInput): Promise<RecordAdvanceResult> {
  const table = getCariAvansTable();
  const invTable = getInventoryReservationsTable();
  const firm = String(ERP_SETTINGS.firmNr || '001').padStart(3, '0');
  const period = String(ERP_SETTINGS.periodNr || '01').padStart(2, '0');

  if (!input.customerId) throw new Error('recordAdvance: customerId zorunlu');
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('recordAdvance: amount > 0 olmalı');
  }
  if (!input.paymentMethod) {
    throw new Error('recordAdvance: paymentMethod zorunlu');
  }

  // 1) cari_avans INSERT
  const avansId = crypto.randomUUID();
  const insertSql = `
    INSERT INTO ${table} (
      id, firm_nr, period_nr, customer_id, amount,
      original_amount, original_currency,
      payment_method, status,
      cash_register_id, cash_register_code,
      created_by, notes
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7,
      $8, 'open',
      $9, $10,
      $11, $12
    )
    RETURNING *
  `;
  const { rows: avansRows } = await postgres.query(insertSql, [
    avansId,
    firm,
    period,
    input.customerId,
    amount,
    input.currency && input.currency !== 'IQD' ? amount : null,
    input.currency ?? null,
    input.paymentMethod,
    input.cashRegisterId ?? null,
    input.cashRegisterCode ?? null,
    input.userName ?? input.userId ?? null,
    input.notes ?? null,
  ]);
  if (!avansRows || avansRows.length === 0) {
    throw new Error('recordAdvance: cari_avans INSERT başarısız');
  }
  const avans = rowToAvans(avansRows[0]);

  // 2) cash_lines CH_TAHSILAT (kasa +)
  let cashLineId: string | null = null;
  // skipInvoice modunda Kasa İşlemleri listesinde avansın görünmesi için
  // cash_lines satırı ZORUNLU. Caller POSPaymentModal `selectedCashRegister`'ı
  // payload'a ekliyor; yine de caller boş bırakırsa DB'den ilk aktif
  // kasayı bul — yoksa skipInvoice avansı cari_avans + account_movements
  // yazılır ama kasaya yansımaz (muhasebe simetrisi bozulur + Kasa
  // İşlemleri listesinde görünmez).
  let effectiveCashRegisterId = input.cashRegisterId || null;
  let effectiveCashRegisterCode = input.cashRegisterCode || null;
  let effectiveCashRegisterName = input.cashRegisterName || null;
  if (!effectiveCashRegisterId) {
    try {
      const { rows: kasaRows } = await postgres.query<{
        id: string;
        code?: string;
        name?: string;
      }>(
        `SELECT id, code, name
           FROM rex_${firm}_cash_registers
          WHERE firm_nr = $1 AND is_active = TRUE
          ORDER BY created_at ASC
          LIMIT 1`,
        [firm],
      );
      if (kasaRows && kasaRows[0]?.id) {
        effectiveCashRegisterId = String(kasaRows[0].id);
        effectiveCashRegisterCode = kasaRows[0].code
          ? String(kasaRows[0].code)
          : null;
        effectiveCashRegisterName = kasaRows[0].name
          ? String(kasaRows[0].name)
          : null;
      }
    } catch (kasaErr) {
      console.warn(
        '[avansService] default kasa aranamadı (cash_lines yazımı atlanır):',
        kasaErr instanceof Error ? kasaErr.message : String(kasaErr),
      );
    }
  }
  if (effectiveCashRegisterId) {
    const kasaIslem = await createKasaIslemi({
      firma_id: firm,
      donem_id: period,
      kasa_id: effectiveCashRegisterId,
      islem_tarihi: new Date().toISOString(),
      islem_tipi: 'CH_TAHSILAT',
      tutar: amount,
      cari_hesap_id: input.customerId,
      islem_aciklamasi: `Rezervasyon tahsilatı · ${avans.referenceNo ?? avans.id}`,
      doviz_kodu: input.currency ?? 'IQD',
      payment_method: input.paymentMethod,
      ozel_kod: 'REZERVASYON',
      // skipInvoice → cari_avans üzerinden bağlantı kuracak ek bağlam notu.
      // Kasa İşlemleri listesinde `special_code='REZERVASYON'` filtresi
      // `is_reservation_deposit` badge'i için kullanılacak
      // (fetchKasaIslemleri tarafında işaretlenir).
      // 07.10.2026 — UI rename: 'AVANS' → 'REZERVASYON' (DB serbest string,
      // migration gerekmez). DB kolon adı (cari_avans) ve transaction_type
      // ('AVANS') KORUNUR — muhasebe terminolojisi gereği.
    } as any);
    cashLineId = kasaIslem?.id ? String(kasaIslem.id) : null;
  }

  // 3) account_movements (cari alacak +)
  //
  // 07.10.2026 düzeltmesi (B1 — çift account_movements): `createKasaIslemi`
  // CH_TAHSILAT için zaten `account_movements` (kasa tarafı, sign=+1) +
  // `party_ledger_movements` (cari tarafı, sign=-1) yazıyor (kasa.ts).
  // Bu INSERT avans başına 2. account_movements satırına yol açıyordu.
  // Düzeltme: buradaki INSERT kaldırıldı; `cariMovementId` createKasaIslemi'nin
  // yazdığı `party_ledger_movements.cash_line_id` üzerinden takip edilir
  // veya null kalır (geriye uyumluluk).
  //
  // createKasaIslemi'nin yazdığı party_ledger_movements + account_movements
  // satırları cari tarafı + kasa tarafı simetrisini zaten sağlıyor. Yine
  // de `cariMovementId` alanını doldurmak için createKasaIslemi sonrası
  // party_ledger_movements'tan cash_line_id eşleşmesi ile id alınabilir.
  let cariMovementId: string | null = null;
  if (cashLineId) {
    try {
      const { rows: partyRows } = await postgres.query(
        `SELECT id FROM rex_${firm}_${period}_party_ledger_movements
          WHERE cash_line_id = $1::text::uuid
          ORDER BY created_at DESC
          LIMIT 1`,
        [cashLineId],
      );
      cariMovementId = partyRows?.[0]?.id ? String(partyRows[0].id) : null;
    } catch (plErr) {
      console.warn(
        '[avansService] party_ledger_movements sorgusu başarısız (cariMovementId null kalır):',
        plErr instanceof Error ? plErr.message : String(plErr),
      );
    }
  }

  // 4) cari_avans güncelle (cash_line_id + cari_movement_id)
  await postgres.query(
    `UPDATE ${table}
        SET cash_line_id = $2,
            cari_movement_id = $3
      WHERE id = $1`,
    [avansId, cashLineId, cariMovementId],
  );
  avans.cashLineId = cashLineId;
  avans.cariMovementId = cariMovementId;

  // 5) inventory_reservations (ürünler için rezerve)
  const reservations: InventoryReservation[] = [];
  if (Array.isArray(input.items) && input.items.length > 0) {
    for (const it of input.items) {
      if (!it.productId) continue;
      const qty = Number(it.quantity ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      const resId = crypto.randomUUID();
      const { rows: resRows } = await postgres.query(
        `INSERT INTO ${invTable} (
           id, firm_nr, period_nr, customer_id, product_id,
           quantity, status, avans_id, notes
         ) VALUES ($1, $2, $3, $4, $5, $6, 'reserved', $7, $8)
         RETURNING *`,
        [
          resId,
          firm,
          period,
          input.customerId,
          it.productId,
          qty,
          avansId,
          input.notes ?? null,
        ],
      );
      if (resRows?.[0]) reservations.push(rowToReservation(resRows[0]));
    }
  }

  // 6) Beauty randevu bağlantısı — fişsiz avans modunda randevuya yansıt.
  // appointmentId verilmişse `beauty_appointments.deposit_amount` +
  // `deposit_date` + `deposit_provider='pos'` alanlarını yaz ki sonraki
  // girişte kalan doğru hesaplansın ve randevu paneli "Ön Ödenen" satırı
  // güncellensin. Randevu panelinde "Rezervasyon Tutarı" girilmemiş olsa
  // bile POS'ta fiilen ödenen peşinat randevuya yansır.
  if (input.appointmentId) {
    const aptTable = getBeautyAppointmentsTable();
    try {
      // `GREATEST` ile: zaten yazılmış deposit varsa KORU (AppointmentPOS
      // createAppointment INSERT'te deposit_amount=reservationForSubmit yazar);
      // burada sıfırsa veya eksikse bu avansın tutarını set et.
      await postgres.query(
        `UPDATE ${aptTable}
            SET deposit_amount = GREATEST(COALESCE(deposit_amount, 0), $2),
                deposit_date = COALESCE(deposit_date, NOW()),
                deposit_provider = COALESCE(deposit_provider, 'pos')
          WHERE id = $1`,
        [input.appointmentId, amount],
      );
    } catch (aptErr) {
      // Randevu güncellemesi başarısız olursa avans kaydını GERİ ALMA — kasa +
      // cari bakiye yazıldı, bunlar zaten müşterinin alacağı. Randevu
      // güncellemesi tek başına başarısız olursa logla ve devam et; parent
      // state'inde yine de `setReservationAmount` ile input senkronize edilebilir.
      console.warn(
        '[avansService] appointment deposit_amount güncellenemedi:',
        aptErr instanceof Error ? aptErr.message : String(aptErr),
      );
    }
  }

  return {
    avans,
    reservations,
    cashLineId,
    cariMovementId,
  };
}

/* ------------------------------------------------------------------ */
/* getOpenAdvances                                                      */
/* ------------------------------------------------------------------ */

/** Müşterinin `status=open` olan avanslarını listeler. */
export async function getOpenAdvances(customerId: string): Promise<AvansRecord[]> {
  if (!customerId) return [];
  const table = getCariAvansTable();
  const { rows } = await postgres.query(
    `SELECT * FROM ${table}
      WHERE customer_id = $1
        AND status = 'open'
      ORDER BY created_at DESC`,
    [customerId],
  );
  return (rows || []).map((r) => rowToAvans(r));
}

/** Tüm avansları (open + applied + kept_on_cancel) — fatura formu için. */
export async function listCustomerAdvances(customerId: string): Promise<AvansRecord[]> {
  if (!customerId) return [];
  const table = getCariAvansTable();
  const { rows } = await postgres.query(
    `SELECT * FROM ${table}
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
    [customerId],
  );
  return (rows || []).map((r) => rowToAvans(r));
}

/* ------------------------------------------------------------------ */
/* applyAdvanceToSale                                                   */
/* ------------------------------------------------------------------ */

/**
 * Avansı belirli bir sales fişine uygular. Fatura modülü `finalizeSale` çağırır.
 *
 *   - cari_avans.status = 'applied'
 *   - cari_avans.applied_sale_id = saleId
 *   - inventory_reservations.status = 'finalized' (avans_id üzerinden)
 *   - inventory_reservations.sale_id = saleId
 *
 * Stok düşme işlemi `finalizeSale` tarafından ayrıca yapılır (sales_items üzerinden).
 */
export async function applyAdvanceToSale(avansId: string, saleId: string): Promise<void> {
  if (!avansId) throw new Error('applyAdvanceToSale: avansId zorunlu');
  if (!saleId) throw new Error('applyAdvanceToSale: saleId zorunlu');
  const table = getCariAvansTable();
  const invTable = getInventoryReservationsTable();

  const { rows } = await postgres.query(
    `UPDATE ${table}
        SET status = 'applied',
            applied_sale_id = $2
      WHERE id = $1
        AND status = 'open'
      RETURNING id`,
    [avansId, saleId],
  );
  if (!rows || rows.length === 0) {
    throw new Error('Avans uygulanamadı (status=open olmayabilir veya bulunamadı).');
  }

  // İlgili rezervasyonları finalized yap + sale_id bağla
  await postgres.query(
    `UPDATE ${invTable}
        SET status = 'finalized',
            sale_id = $2
      WHERE avans_id = $1
        AND status = 'reserved'`,
    [avansId, saleId],
  );
}

/* ------------------------------------------------------------------ */
/* keepAdvanceOnCancel                                                  */
/* ------------------------------------------------------------------ */

/**
 * Satış iptal edildiğinde çağrılır. Avans cari bakiyesinde kalır
 * (müşteri alacaklı) — rezervasyonlar serbest bırakılır.
 */
export async function keepAdvanceOnCancel(avansId: string): Promise<void> {
  if (!avansId) return;
  const table = getCariAvansTable();
  const invTable = getInventoryReservationsTable();
  await postgres.query(
    `UPDATE ${table}
        SET status = 'kept_on_cancel'
      WHERE id = $1
        AND status = 'open'`,
    [avansId],
  );
  await postgres.query(
    `UPDATE ${invTable}
        SET status = 'released',
            released_at = NOW()
      WHERE avans_id = $1
        AND status = 'reserved'`,
    [avansId],
  );
}

/* ------------------------------------------------------------------ */
/* releaseReservation (stok rezervasyonu serbest bırak)                 */
/* ------------------------------------------------------------------ */

/** Belirli bir avansa bağlı rezervasyonları serbest bırakır (timeout/iptal). */
export async function releaseReservation(avansId: string, _reason: 'cancel' | 'timeout'): Promise<void> {
  if (!avansId) return;
  const invTable = getInventoryReservationsTable();
  await postgres.query(
    `UPDATE ${invTable}
        SET status = 'released',
            released_at = NOW()
      WHERE avans_id = $1
        AND status = 'reserved'`,
    [avansId],
  );
}

/* ------------------------------------------------------------------ */
/* Stok envanteri sorguları (UI)                                        */
/* ------------------------------------------------------------------ */

/** Ürün için aktif rezervasyon miktarını döner. */
export async function getReservedQuantityForProduct(productId: string): Promise<number> {
  if (!productId) return 0;
  const invTable = getInventoryReservationsTable();
  const { rows } = await postgres.query(
    `SELECT COALESCE(SUM(quantity), 0) AS reserved
       FROM ${invTable}
      WHERE product_id = $1
        AND status = 'reserved'`,
    [productId],
  );
  return Number(rows?.[0]?.reserved ?? 0);
}

/** Müşterinin aktif rezervasyonlarını döner. */
export async function listActiveReservationsForCustomer(
  customerId: string,
): Promise<InventoryReservation[]> {
  if (!customerId) return [];
  const invTable = getInventoryReservationsTable();
  const { rows } = await postgres.query(
    `SELECT * FROM ${invTable}
      WHERE customer_id = $1
        AND status = 'reserved'
      ORDER BY created_at DESC`,
    [customerId],
  );
  return (rows || []).map((r) => rowToReservation(r));
}
