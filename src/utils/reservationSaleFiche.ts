/**
 * Rezervasyon tahsilatının kullanıcıya görünen fiş numarası,
 * bağlı satış faturasının fiş numarasıdır.
 *
 * Numara satış fiş serisinden ayrılır (BEA-yıl-00001).
 * Fatura henüz yokken ayrılan numara, o randevunun satışında yeniden üretilmez.
 * Eşleme randevu, satış grubu veya fiş bağındandır. Tutar karşılaştırması yoktur.
 * Aynı numara satırları birleştirilmez. Borç, alacak ve kasa tutarı değişmez.
 */

import { foldCashFlowByFiche, type CashFlowFicheMovement } from './cashFlowByFiche';
import {
  beautyInvoicePrefix,
  nextPrefixedInvoiceNumber,
} from './invoiceCodeFormat';
import type { SavedCashInvoiceOpen } from './cashDocumentInvoiceLaunch';

export const RESERVED_SALE_FICHE_TAG = 'reserved_sale_fiche:';

const RESERVED_RE = /reserved_sale_fiche:\s*(BEA-\d{4}-\d+)/i;
const REX_APPT_RE = /rex_appt:\s*([0-9a-f-]{8,})/i;
const RANDEVU_NO_RE = /randevu\s+no\s+([0-9a-f-]{8,})/i;
const SALE_GROUP_RE = /sale_group:\s*([^|\s]+)/i;
const AVANS_REF_RE = /\bAVANS-[0-9a-z]+\b/i;
const INTERNAL_FICHE_RE = /^(?:KL|AVANS)-/i;
const SALE_SERIES_RE = /^BEA-\d{4}-\d+$/i;

export function isInternalReservationFiche(value: unknown): boolean {
  return INTERNAL_FICHE_RE.test(String(value ?? '').trim());
}

/** Satış fiş serisi: BEA-2026-00001. Rastgele ek ve kasa özeti bu seri değildir. */
export function isSaleSeriesFiche(value: unknown): boolean {
  const text = String(value ?? '').trim();
  if (!text || /CHK/i.test(text)) return false;
  return SALE_SERIES_RE.test(text);
}

export function saleSeriesSequence(fiche: string): string {
  const match = String(fiche ?? '').trim().match(/^BEA-\d{4}-(\d+)$/i);
  return match ? match[1] : '';
}

export function reserveSaleSeriesFiche(existing: readonly string[], year: number): string {
  return nextPrefixedInvoiceNumber(existing, beautyInvoicePrefix(year, 'sale'));
}

/**
 * Ayrılmış numara varsa satış faturası onu kullanır.
 * Yoksa seri bir sonraki numarayı verir. Ayrılmış numara ikinci kez üretilmez.
 */
export function saleFicheForNewInvoice(
  reserved: string | null | undefined,
  existing: readonly string[],
  year: number,
): string {
  const held = String(reserved ?? '').trim();
  if (isSaleSeriesFiche(held)) return held;
  return reserveSaleSeriesFiche(existing, year);
}

export function readReservedSaleFiche(text: unknown): string {
  const match = String(text ?? '').match(RESERVED_RE);
  if (!match?.[1] || !isSaleSeriesFiche(match[1])) return '';
  return match[1].toUpperCase();
}

/** Açıklamadaki satış fişi. Tire, fiş numarasının içindedir. */
export function saleSeriesFromDescription(description: string): string {
  const parts = String(description ?? '').split(/[—–]| - /).map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    if (isSaleSeriesFiche(part)) return part.toUpperCase();
  }
  const match = String(description ?? '').match(/\b(BEA-\d{4}-\d+)\b/i);
  return match?.[1] ? match[1].toUpperCase() : '';
}

function cleanId(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function readAppointmentId(text: unknown): string {
  const raw = String(text ?? '');
  const rex = raw.match(REX_APPT_RE);
  if (rex?.[1]) return cleanId(rex[1]);
  const named = raw.match(RANDEVU_NO_RE);
  return named?.[1] ? cleanId(named[1]) : '';
}

export function readSaleGroupId(text: unknown): string {
  const match = String(text ?? '').match(SALE_GROUP_RE);
  return match?.[1] ? String(match[1]).trim() : '';
}

export function readAvansReference(text: unknown): string {
  const match = String(text ?? '').match(AVANS_REF_RE);
  return match ? match[0].toUpperCase() : '';
}

export function isReservationCollectionText(text: unknown): boolean {
  return /rezervasyon\s*tahsilat/i.test(String(text ?? ''));
}

/** Etiketler başta durur; fiş bağı kesilmeden notun geri kalanı kalır. */
export function withReservedSaleFicheNote(
  notes: string | null | undefined,
  fiche: string,
  appointmentId?: string | null,
  saleGroupId?: string | null,
): string {
  const ficheClean = String(fiche ?? '').trim();
  const appt = String(appointmentId ?? '').trim();
  const group = String(saleGroupId ?? '').trim();
  const base = String(notes ?? '')
    .replace(RESERVED_RE, '')
    .replace(REX_APPT_RE, '')
    .replace(SALE_GROUP_RE, '')
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/^\s*\|\s*|\s*\|\s*$/g, '')
    .trim();
  const tags: string[] = [];
  if (isSaleSeriesFiche(ficheClean)) tags.push(`${RESERVED_SALE_FICHE_TAG}${ficheClean}`);
  if (appt) tags.push(`rex_appt:${appt}`);
  if (group) tags.push(`sale_group:${group}`);
  const merged = [...tags, base].filter(Boolean).join(' | ');
  return merged.slice(0, 500);
}

export function reservationCollectionDescription(saleFiche: string): string {
  const fiche = String(saleFiche ?? '').trim();
  if (!fiche) return 'Rezervasyon tahsilatı';
  return `Rezervasyon tahsilatı — ${fiche}`;
}

export interface ReservationFicheLink {
  ficheNo: string;
  appointmentId?: string | null;
  saleGroupId?: string | null;
  saleId?: string | null;
  cashLineId?: string | null;
  avansReference?: string | null;
}

export interface ReservationFicheIndex {
  byAppointmentId: Map<string, string>;
  bySaleGroupId: Map<string, string>;
  bySaleId: Map<string, string>;
  byCashLineId: Map<string, string>;
  byAvansReference: Map<string, string>;
}

export function emptyReservationFicheIndex(): ReservationFicheIndex {
  return {
    byAppointmentId: new Map(),
    bySaleGroupId: new Map(),
    bySaleId: new Map(),
    byCashLineId: new Map(),
    byAvansReference: new Map(),
  };
}

function remember(map: Map<string, string>, key: unknown, fiche: string) {
  const id = String(key ?? '').trim();
  const code = String(fiche ?? '').trim();
  if (!id || !code || isInternalReservationFiche(code)) return;
  const folded = id.toLowerCase();
  if (!map.has(folded)) map.set(folded, code);
}

/** Satış fişi duruyorsa o numara geçerlidir. Yoksa ayrılmış seri numarası. */
export function preferredLinkedFiche(saleFiche: unknown, reservedFiche: unknown): string {
  const sale = String(saleFiche ?? '').trim();
  if (sale && !isInternalReservationFiche(sale)) return sale;
  const reserved = String(reservedFiche ?? '').trim();
  if (isSaleSeriesFiche(reserved)) return reserved;
  return '';
}

export interface ReservationFicheSourceRow {
  id?: string | null;
  ficheNo?: string | null;
  notes?: string | null;
  referenceNo?: string | null;
  cashLineId?: string | null;
  appliedSaleId?: string | null;
  kind: 'sale' | 'advance';
}

/**
 * Satış fişi önce yazılır. Rezervasyon kaydı yalnızca boş bağa ayrılmış numarayı koyar.
 * Tutar bu eşlemeye girmez.
 */
export function buildReservationFicheIndexFromSources(
  rows: readonly ReservationFicheSourceRow[],
): ReservationFicheIndex {
  const links: ReservationFicheLink[] = [];
  for (const sale of rows) {
    if (sale.kind !== 'sale') continue;
    const fiche = String(sale.ficheNo ?? '').trim();
    if (!isSaleSeriesFiche(fiche)) continue;
    links.push({
      ficheNo: fiche,
      appointmentId: readAppointmentId(sale.notes),
      saleGroupId: readSaleGroupId(sale.notes),
      saleId: sale.id,
    });
  }
  const saleIndex = indexReservationFicheLinks(links);
  for (const advance of rows) {
    if (advance.kind !== 'advance') continue;
    const appointmentId = readAppointmentId(advance.notes);
    const saleGroupId = readSaleGroupId(advance.notes);
    const appliedId = cleanId(advance.appliedSaleId);
    const saleFiche =
      (appointmentId && saleIndex.byAppointmentId.get(appointmentId))
      || (saleGroupId && saleIndex.bySaleGroupId.get(saleGroupId.toLowerCase()))
      || (appliedId && saleIndex.bySaleId.get(appliedId))
      || '';
    const fiche = preferredLinkedFiche(saleFiche, readReservedSaleFiche(advance.notes));
    if (!fiche || isInternalReservationFiche(fiche)) continue;
    links.push({
      ficheNo: fiche,
      appointmentId,
      saleGroupId,
      saleId: advance.appliedSaleId,
      cashLineId: advance.cashLineId,
      avansReference: advance.referenceNo || readAvansReference(advance.notes),
    });
  }
  return indexReservationFicheLinks(links);
}

export function indexReservationFicheLinks(links: readonly ReservationFicheLink[]): ReservationFicheIndex {
  const index = emptyReservationFicheIndex();
  for (const link of links) {
    const fiche = String(link.ficheNo ?? '').trim();
    if (!fiche || isInternalReservationFiche(fiche)) continue;
    remember(index.byAppointmentId, link.appointmentId, fiche);
    remember(index.bySaleGroupId, link.saleGroupId, fiche);
    remember(index.bySaleId, link.saleId, fiche);
    remember(index.byCashLineId, link.cashLineId, fiche);
    remember(index.byAvansReference, String(link.avansReference ?? '').toUpperCase(), fiche);
  }
  return index;
}

export interface ReservationFicheRow {
  id?: string | null;
  role?: 'sale' | 'reservation' | string | null;
  ficheNo?: string | null;
  amount?: number | null;
  debit?: number | null;
  credit?: number | null;
  appointmentId?: string | null;
  saleGroupId?: string | null;
  saleId?: string | null;
  cashLineId?: string | null;
  notes?: string | null;
  description?: string | null;
  linkedSaleFiche?: string | null;
  reservationCollection?: boolean | null;
}

function rowBlob(row: ReservationFicheRow): string {
  return `${row.notes ?? ''} ${row.description ?? ''} ${row.ficheNo ?? ''}`;
}

export function rowIsReservationCollection(row: ReservationFicheRow): boolean {
  if (row.reservationCollection === true || row.role === 'reservation') return true;
  if (row.role === 'sale') return false;
  const blob = rowBlob(row);
  if (isReservationCollectionText(blob)) return true;
  return isInternalReservationFiche(row.ficheNo) && /rezervasyon|avans/i.test(blob);
}

/**
 * Görünen fiş. Tutar alanına bakılmaz.
 * Bağ yoksa iç referans (KL- / AVANS-) fiş numarası diye üretilmez; satırın kendi fişi kalır.
 */
export function resolveReservationDisplayFiche(
  row: ReservationFicheRow,
  index: ReservationFicheIndex,
): string {
  const own = String(row.ficheNo ?? '').trim();
  if (!rowIsReservationCollection(row)) return own;

  const blob = rowBlob(row);
  const direct = preferredLinkedFiche(
    row.linkedSaleFiche,
    readReservedSaleFiche(blob) || saleSeriesFromDescription(blob),
  );
  if (direct) return direct;

  const appointmentId = cleanId(row.appointmentId) || readAppointmentId(blob);
  const saleGroupId = String(row.saleGroupId ?? '').trim() || readSaleGroupId(blob);
  const saleId = cleanId(row.saleId);
  const cashLineId = cleanId(row.cashLineId || row.id);
  const avansRef = readAvansReference(blob);

  const linked =
    (appointmentId && index.byAppointmentId.get(appointmentId))
    || (saleGroupId && index.bySaleGroupId.get(saleGroupId.toLowerCase()))
    || (saleId && index.bySaleId.get(saleId))
    || (cashLineId && index.byCashLineId.get(cashLineId))
    || (avansRef && index.byAvansReference.get(avansRef.toLowerCase()))
    || '';
  return linked || own;
}

export interface ProjectedFicheRow extends ReservationFicheRow {
  displayFiche: string;
  displayDescription: string;
}

export function projectLinkedFicheRows(rows: readonly ReservationFicheRow[]): ProjectedFicheRow[] {
  const index = indexReservationFicheLinks(rows.filter((row) => !rowIsReservationCollection(row)).map((row) => ({
    ficheNo: String(row.ficheNo ?? ''),
    appointmentId: row.appointmentId || readAppointmentId(rowBlob(row)),
    saleGroupId: row.saleGroupId || readSaleGroupId(rowBlob(row)),
    saleId: row.saleId || row.id,
  })));
  for (const row of rows) {
    if (!rowIsReservationCollection(row)) continue;
    const reserved = readReservedSaleFiche(rowBlob(row));
    const fiche = preferredLinkedFiche(row.linkedSaleFiche, reserved);
    if (!fiche) continue;
    const blob = rowBlob(row);
    const extra = indexReservationFicheLinks([{
      ficheNo: fiche,
      appointmentId: row.appointmentId || readAppointmentId(blob),
      saleGroupId: row.saleGroupId || readSaleGroupId(blob),
      saleId: row.saleId,
      cashLineId: row.cashLineId || row.id,
      avansReference: readAvansReference(blob),
    }]);
    extra.byAppointmentId.forEach((value, key) => {
      if (!index.byAppointmentId.has(key)) index.byAppointmentId.set(key, value);
    });
    extra.bySaleGroupId.forEach((value, key) => {
      if (!index.bySaleGroupId.has(key)) index.bySaleGroupId.set(key, value);
    });
    extra.bySaleId.forEach((value, key) => {
      if (!index.bySaleId.has(key)) index.bySaleId.set(key, value);
    });
    extra.byCashLineId.forEach((value, key) => {
      if (!index.byCashLineId.has(key)) index.byCashLineId.set(key, value);
    });
    extra.byAvansReference.forEach((value, key) => {
      if (!index.byAvansReference.has(key)) index.byAvansReference.set(key, value);
    });
  }
  return rows.map((row) => {
    const displayFiche = resolveReservationDisplayFiche(row, index);
    const reservation = rowIsReservationCollection(row);
    const displayDescription = reservation && displayFiche && !isInternalReservationFiche(displayFiche)
      ? reservationCollectionDescription(displayFiche)
      : String(row.description ?? row.notes ?? '');
    return {
      ...row,
      amount: row.amount,
      debit: row.debit,
      credit: row.credit,
      displayFiche,
      displayDescription,
    };
  });
}

export function visibleStatementFiche(row: {
  fiche_no?: string | null;
  notes?: string | null;
  special_code?: string | null;
  linked_sale_fiche?: string | null;
  isReservationDeposit?: boolean | null;
}): string {
  const own = String(row.fiche_no ?? '').trim();
  const linked = String(row.linked_sale_fiche ?? '').trim();
  const notes = String(row.notes ?? '');
  const reservation = row.isReservationDeposit === true
    || String(row.special_code ?? '').toUpperCase() === 'REZERVASYON'
    || String(row.special_code ?? '').toUpperCase() === 'AVANS'
    || isReservationCollectionText(notes);
  if (!reservation) return own;
  const picked = preferredLinkedFiche(
    linked,
    readReservedSaleFiche(notes) || saleSeriesFromDescription(notes),
  );
  return picked || own;
}

export function visibleStatementDescription(row: {
  notes?: string | null;
  fiche_no?: string | null;
  special_code?: string | null;
  linked_sale_fiche?: string | null;
  isReservationDeposit?: boolean | null;
}): string {
  const fiche = visibleStatementFiche(row);
  const reservation = fiche !== String(row.fiche_no ?? '').trim()
    || isReservationCollectionText(row.notes);
  if (reservation && fiche && !isInternalReservationFiche(fiche) && isReservationCollectionText(row.notes ?? '')) {
    return reservationCollectionDescription(fiche);
  }
  return String(row.notes ?? '');
}

export interface DailyFicheSource {
  key?: string | null;
  receiptNumber?: string | null;
  isAvans?: boolean | null;
  linkedAppointmentId?: string | null;
  notes?: string | null;
  erpSale?: { id?: string | null; notes?: string | null; receiptNumber?: string | null } | null;
  linkedSaleFiche?: string | null;
  total?: number | null;
  collected?: number | null;
}

export function dailyReservationFicheLabel(
  row: DailyFicheSource,
  peers: readonly DailyFicheSource[],
): string {
  const projected = projectLinkedFicheRows(peers.map((peer) => {
    const notes = `${peer.notes ?? ''} ${peer.erpSale?.notes ?? ''}`;
    const avans = peer.isAvans === true;
    return {
      id: String(peer.key ?? peer.erpSale?.id ?? ''),
      role: avans ? 'reservation' : 'sale',
      ficheNo: String(peer.receiptNumber ?? peer.erpSale?.receiptNumber ?? ''),
      appointmentId: peer.linkedAppointmentId
        || (peer.erpSale as { linkedAppointmentId?: string | null } | null | undefined)?.linkedAppointmentId
        || readAppointmentId(notes),
      saleGroupId: readSaleGroupId(notes),
      saleId: avans ? '' : String(peer.erpSale?.id ?? ''),
      notes,
      description: avans ? String(peer.receiptNumber ?? '') : notes,
      linkedSaleFiche: avans
        ? preferredLinkedFiche(peer.linkedSaleFiche, readReservedSaleFiche(notes) || saleSeriesFromDescription(notes))
        : '',
      reservationCollection: avans,
      amount: Number(peer.total ?? peer.collected ?? 0),
    };
  }));
  const id = String(row.key ?? row.erpSale?.id ?? '');
  const hit = projected.find((item) => String(item.id ?? '') === id);
  return hit?.displayFiche || String(row.receiptNumber ?? '');
}

export interface CashFlowFicheStamp extends CashFlowFicheMovement {
  linkedSaleFiche?: string | null;
  reservationCollection?: boolean | null;
  appointmentId?: string | null;
  saleGroupId?: string | null;
  notes?: string | null;
}

/**
 * Fiş no görünen satış numarasıdır. Birleştirme iç fiş (KL-) ile yapılır,
 * böylece aynı satış numarası satırları toplanmaz.
 */
export function presentCashFlowReservationFiches<T extends CashFlowFicheStamp>(rows: readonly T[]): T[] {
  const folded = foldCashFlowByFiche(rows);
  const index = indexReservationFicheLinks(rows.map((row) => ({
    ficheNo: String(row.linkedSaleFiche || (!row.reservationCollection ? row.ficheNo : '')),
    appointmentId: row.appointmentId,
    saleGroupId: row.saleGroupId,
    cashLineId: row.id,
    avansReference: readAvansReference(`${row.definition ?? ''} ${row.notes ?? ''}`),
  })));
  return folded.map((row) => {
    const reservation = row.reservationCollection === true || isReservationCollectionText(row.definition);
    if (!reservation) return row;
    const display = resolveReservationDisplayFiche({
      id: row.id,
      ficheNo: row.ficheNo,
      description: row.definition,
      notes: row.notes,
      appointmentId: row.appointmentId,
      saleGroupId: row.saleGroupId,
      linkedSaleFiche: row.linkedSaleFiche,
      reservationCollection: true,
      amount: row.amount,
    }, index);
    if (!display || isInternalReservationFiche(display) || display === row.ficheNo) return row;
    return {
      ...row,
      ficheNo: display,
      definition: reservationCollectionDescription(display),
    };
  });
}

export function kasaReservationFicheLabel(row: {
  islem_no?: string | null;
  islem_aciklamasi?: string | null;
  linked_sale_fiche?: string | null;
  is_reservation_deposit?: boolean | null;
  ozel_kod?: string | null;
}): string {
  return visibleStatementFiche({
    fiche_no: row.islem_no,
    notes: row.islem_aciklamasi,
    linked_sale_fiche: row.linked_sale_fiche,
    special_code: row.ozel_kod,
    isReservationDeposit: row.is_reservation_deposit === true,
  });
}

export function kasaReservationDescription(row: {
  islem_no?: string | null;
  islem_aciklamasi?: string | null;
  linked_sale_fiche?: string | null;
  is_reservation_deposit?: boolean | null;
  ozel_kod?: string | null;
}): string {
  const raw = String(row.islem_aciklamasi ?? '');
  const fiche = kasaReservationFicheLabel(row);
  if (!isReservationCollectionText(raw)) return raw;
  if (!fiche || isInternalReservationFiche(fiche)) return raw;
  return reservationCollectionDescription(fiche);
}

/**
 * Kasa satırından fatura. Açıklama veya bağlı fiş satış numarasını taşıyorsa
 * kayıtlı satış faturası açılır. Yeni taslak üretilmez.
 * Satış faturası kasa satırının kendi açılışı bu fonksiyona girmez.
 */
export function resolveReservationCollectionInvoiceOpen(input: {
  transactionType?: string | null;
  description?: string | null;
  ficheNo?: string | null;
  isReservationDeposit?: boolean | null;
  linkedSaleFiche?: string | null;
}): SavedCashInvoiceOpen | null {
  const description = String(input.description ?? '');
  const reservation = input.isReservationDeposit === true || isReservationCollectionText(description);
  if (!reservation || !isReservationCollectionText(description)) return null;
  const tip = String(input.transactionType ?? '').trim().toUpperCase();
  if (tip && tip !== 'CH_TAHSILAT' && tip !== 'KASA_GIRIS') return null;
  const fiche = preferredLinkedFiche(
    input.linkedSaleFiche,
    readReservedSaleFiche(description) || saleSeriesFromDescription(description),
  );
  if (!fiche || isInternalReservationFiche(fiche)) return null;
  return {
    kind: 'sale',
    ficheNo: fiche,
    screen: 'salesinvoice',
    trcode: 8,
    category: 'Satis',
  };
}
