/**
 * Satış fiş serisinden numara ayırma ve okuma.
 * Yazma yalnızca yeni tahsilatta not etiketidir. Ekran okuması satır tutarını değiştirmez.
 * Kasa fişinin benzersiz anahtarı KL- olarak kalır; kullanıcıya satış numarası gösterilir.
 */

import { postgres, ERP_SETTINGS } from './postgres';
import { foldCashFlowByFiche } from '../utils/cashFlowByFiche';
import {
  buildReservationFicheIndexFromSources,
  isInternalReservationFiche,
  isReservationCollectionText,
  isSaleSeriesFiche,
  presentCashFlowReservationFiches,
  readReservedSaleFiche,
  reserveSaleSeriesFiche,
  resolveReservationDisplayFiche,
  type CashFlowFicheStamp,
  type ReservationFicheIndex,
  type ReservationFicheSourceRow,
} from '../utils/reservationSaleFiche';

function firmPeriod(): { firm: string; period: string; avansTable: string } {
  const firm = String(ERP_SETTINGS.firmNr || '001').replace(/\D/g, '').padStart(3, '0').slice(0, 3) || '001';
  const period = String(ERP_SETTINGS.periodNr || '01').replace(/\D/g, '').padStart(2, '0').slice(0, 2) || '01';
  return { firm, period, avansTable: `rex_${firm}_${period}_cari_avans` };
}

async function queryRows<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { rows } = await postgres.query<T>(sql, params);
  return Array.isArray(rows) ? rows : [];
}

/** Kayıtlı satış fişleri. Ayrılmış numara bu listeyle çarpışmasın. */
export async function listSaleSeriesCodes(): Promise<string[]> {
  const rows = await queryRows<{ code?: string }>(
    `SELECT invoice_number AS code FROM beauty_sales
      WHERE invoice_number LIKE 'BEA-%'
     UNION ALL
     SELECT fiche_no AS code FROM sales
      WHERE fiche_no LIKE 'BEA-%'
     LIMIT 8000`,
  );
  return rows.map((row) => String(row.code ?? '').trim()).filter(Boolean);
}

/** Henüz faturaya yazılmamış, notta ayrılmış satış numaraları. */
export async function listReservedSaleFicheCodes(): Promise<string[]> {
  const { avansTable } = firmPeriod();
  const rows = await queryRows<{ notes?: string }>(
    `SELECT notes FROM beauty_appointments
      WHERE COALESCE(notes, '') LIKE '%reserved_sale_fiche:%'
     UNION ALL
     SELECT notes FROM ${avansTable}
      WHERE COALESCE(notes, '') LIKE '%reserved_sale_fiche:%'
     LIMIT 8000`,
  );
  const codes: string[] = [];
  for (const row of rows) {
    const fiche = readReservedSaleFiche(row.notes);
    if (fiche) codes.push(fiche);
  }
  return codes;
}

async function loadReservationSources(): Promise<ReservationFicheSourceRow[]> {
  const { avansTable } = firmPeriod();
  const [sales, beauty, advances] = await Promise.all([
    queryRows<{ id?: string; fiche_no?: string; notes?: string }>(
      `SELECT id::text AS id, fiche_no, notes
         FROM sales
        WHERE fiche_no LIKE 'BEA-%'
           OR COALESCE(notes, '') LIKE '%rex_appt:%'
           OR COALESCE(notes, '') LIKE '%sale_group:%'
        ORDER BY date DESC NULLS LAST
        LIMIT 4000`,
    ),
    queryRows<{ id?: string; fiche_no?: string; notes?: string }>(
      `SELECT id::text AS id, invoice_number AS fiche_no, notes
         FROM beauty_sales
        WHERE invoice_number LIKE 'BEA-%'
           OR COALESCE(notes, '') LIKE '%rex_appt:%'
           OR COALESCE(notes, '') LIKE '%sale_group:%'
           OR COALESCE(notes, '') LIKE '%reserved_sale_fiche:%'
        ORDER BY created_at DESC NULLS LAST
        LIMIT 4000`,
    ).catch(() => queryRows<{ id?: string; fiche_no?: string; notes?: string }>(
      `SELECT id::text AS id, invoice_number AS fiche_no, notes
         FROM beauty_sales
        WHERE invoice_number LIKE 'BEA-%'
           OR COALESCE(notes, '') LIKE '%rex_appt:%'
        LIMIT 4000`,
    )),
    queryRows<{
      id?: string;
      notes?: string;
      reference_no?: string;
      cash_line_id?: string;
      applied_sale_id?: string;
    }>(
      `SELECT id::text AS id, notes, reference_no,
              cash_line_id::text AS cash_line_id,
              applied_sale_id::text AS applied_sale_id
         FROM ${avansTable}
        ORDER BY created_at DESC NULLS LAST
        LIMIT 4000`,
    ),
  ]);
  const out: ReservationFicheSourceRow[] = [];
  for (const row of [...sales, ...beauty]) {
    out.push({
      kind: 'sale',
      id: row.id,
      ficheNo: row.fiche_no,
      notes: row.notes,
    });
  }
  for (const row of advances) {
    out.push({
      kind: 'advance',
      id: row.id,
      notes: row.notes,
      referenceNo: row.reference_no,
      cashLineId: row.cash_line_id,
      appliedSaleId: row.applied_sale_id,
    });
  }
  return out;
}

export async function loadReservationFicheIndex(): Promise<ReservationFicheIndex> {
  return buildReservationFicheIndexFromSources(await loadReservationSources());
}

function lookupHeldFiche(
  index: ReservationFicheIndex,
  appointmentId?: string | null,
  saleGroupId?: string | null,
): string {
  const appointment = String(appointmentId ?? '').trim().toLowerCase();
  const group = String(saleGroupId ?? '').trim().toLowerCase();
  return (
    (appointment && index.byAppointmentId.get(appointment))
    || (group && index.bySaleGroupId.get(group))
    || ''
  );
}

/**
 * Tahsilat, fatura yokken satış serisinden numara alır.
 * Aynı randevu veya satış grubu ikinci kez yeni numara almaz.
 */
export async function reserveSaleFicheForCollection(input: {
  appointmentId?: string | null;
  saleGroupId?: string | null;
}): Promise<string> {
  const index = await loadReservationFicheIndex();
  const held = lookupHeldFiche(index, input.appointmentId, input.saleGroupId);
  if (isSaleSeriesFiche(held)) return held;
  const existing = [
    ...(await listSaleSeriesCodes()),
    ...(await listReservedSaleFicheCodes()),
  ];
  return reserveSaleSeriesFiche(existing, new Date().getFullYear());
}

/**
 * Satış faturası açılırken ayrılmış numara.
 * Numara başka bir satışta kullanıldıysa boş döner; çağıran sonraki numarayı üretir.
 */
export async function findReservedSaleFiche(input: {
  appointmentId?: string | null;
  saleGroupId?: string | null;
}): Promise<string> {
  const index = await loadReservationFicheIndex();
  const held = lookupHeldFiche(index, input.appointmentId, input.saleGroupId);
  if (!isSaleSeriesFiche(held)) return '';
  const used = new Set((await listSaleSeriesCodes()).map((code) => code.toUpperCase()));
  if (used.has(held.toUpperCase())) return '';
  return held;
}

function collectionDisplayFiche(
  index: ReservationFicheIndex,
  row: {
    ficheNo?: string | null;
    notes?: string | null;
    id?: string | null;
    cashLineId?: string | null;
    appointmentId?: string | null;
    saleGroupId?: string | null;
    linkedSaleFiche?: string | null;
  },
): string {
  const display = resolveReservationDisplayFiche({
    id: row.id,
    ficheNo: row.ficheNo,
    notes: row.notes,
    description: row.notes,
    cashLineId: row.cashLineId || row.id,
    appointmentId: row.appointmentId,
    saleGroupId: row.saleGroupId,
    linkedSaleFiche: row.linkedSaleFiche,
    reservationCollection: true,
  }, index);
  if (!display || isInternalReservationFiche(display)) return '';
  return display;
}

/** Ekstre satırına bağlı satış fişini yazar. fiche_no ve tutar aynı kalır. */
export async function stampStatementReservationFiches<T extends Record<string, unknown>>(
  rows: T[],
): Promise<T[]> {
  try {
    const index = await loadReservationFicheIndex();
    return rows.map((row) => {
      const notes = String(row.notes ?? '');
      const code = String(row.special_code ?? '').toUpperCase();
      const reservation = code === 'REZERVASYON'
        || code === 'AVANS'
        || isReservationCollectionText(notes);
      if (!reservation) return row;
      const linked = collectionDisplayFiche(index, {
        ficheNo: String(row.fiche_no ?? ''),
        notes,
        id: row.id != null ? String(row.id) : '',
        cashLineId: row.cash_line_id != null ? String(row.cash_line_id) : '',
      });
      if (!linked) return row;
      return { ...row, linked_sale_fiche: linked };
    });
  } catch (error) {
    console.warn(
      '[reservationSaleFiche] ekstre fiş bağı okunamadı',
      error instanceof Error ? error.message : error,
    );
    return rows;
  }
}

/** Günlük avans satırına satış fişini ekler. Not, tarih ve tutar değişmez. */
export async function attachAvansLinkedSaleFiche<T extends Record<string, unknown>>(
  rows: T[],
): Promise<T[]> {
  try {
    const index = await loadReservationFicheIndex();
    return rows.map((row) => {
      const notes = String(row.notes ?? '');
      const linked = collectionDisplayFiche(index, {
        ficheNo: String(row.reference_no ?? ''),
        notes,
        id: row.id != null ? String(row.id) : '',
        cashLineId: row.cash_line_id != null ? String(row.cash_line_id) : '',
        appointmentId: undefined,
      });
      if (!linked) return row;
      return { ...row, linked_sale_fiche: linked };
    });
  } catch (error) {
    console.warn(
      '[reservationSaleFiche] günlük fiş bağı okunamadı',
      error instanceof Error ? error.message : error,
    );
    return rows;
  }
}

/**
 * Nakit akış fiş kolonu. Birleştirme iç fiş ile yapılır, sonra satış numarası yazılır.
 * Tutar ve işaret değişmez.
 */
export async function stampCashFlowReservationFiches<T extends CashFlowFicheStamp>(
  rows: readonly T[],
): Promise<T[]> {
  try {
    const index = await loadReservationFicheIndex();
    const marked = rows.map((row) => {
      const text = `${row.definition ?? ''} ${row.notes ?? ''}`;
      const reservation = row.reservationCollection === true || isReservationCollectionText(text);
      if (!reservation) return row;
      const linked = collectionDisplayFiche(index, {
        ficheNo: row.ficheNo,
        notes: text,
        id: row.id,
        appointmentId: row.appointmentId,
        saleGroupId: row.saleGroupId,
        linkedSaleFiche: row.linkedSaleFiche,
      });
      return {
        ...row,
        reservationCollection: true,
        linkedSaleFiche: linked || row.linkedSaleFiche || null,
      };
    });
    return presentCashFlowReservationFiches(marked);
  } catch (error) {
    console.warn(
      '[reservationSaleFiche] nakit akış fiş bağı okunamadı',
      error instanceof Error ? error.message : error,
    );
    return foldCashFlowByFiche(rows);
  }
}

/** Kasa satırına bağlı satış fişini yazar. Tutar ve işlem no aynı kalır. */
export async function attachKasaReservationFiches<T extends {
  id?: string;
  islem_no?: string | null;
  islem_aciklamasi?: string | null;
  is_reservation_deposit?: boolean | null;
  ozel_kod?: string | null;
  linked_sale_fiche?: string | null;
}>(rows: T[]): Promise<T[]> {
  try {
    const index = await loadReservationFicheIndex();
    return rows.map((row) => {
      const notes = String(row.islem_aciklamasi ?? '');
      const code = String(row.ozel_kod ?? '').toUpperCase();
      const reservation = row.is_reservation_deposit === true
        || code === 'REZERVASYON'
        || code === 'AVANS'
        || isReservationCollectionText(notes);
      if (!reservation) return row;
      const linked = collectionDisplayFiche(index, {
        ficheNo: row.islem_no,
        notes,
        id: row.id,
        linkedSaleFiche: row.linked_sale_fiche,
      });
      if (!linked) return row;
      return { ...row, linked_sale_fiche: linked };
    });
  } catch (error) {
    console.warn(
      '[reservationSaleFiche] kasa fiş bağı okunamadı',
      error instanceof Error ? error.message : error,
    );
    return rows;
  }
}
