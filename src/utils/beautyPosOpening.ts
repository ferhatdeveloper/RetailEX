/**
 * Güzellik POS açılış sepeti.
 *
 * Aynı müşteri, aynı gün ve aynı personel sepet birleştirmez.
 * Fiş, satış no veya fatura no ile açılır. Bu kimliği paylaşan satırlar
 * sepette kalır. Kimliği boş olan kayıt yalnız kendi randevusudur;
 * günün diğer randevusu gelmez.
 * Peşinat fiş no sepet anahtarı değildir. Peşinat ciro değildir;
 * toplama ikinci kez eklenmez. Kalan = bu fişin toplamı − bu fişin ön ödemesi.
 */
import {
    AppointmentStatus,
    appointmentStatusMatches,
    type BeautyAppointment,
} from '../types/beauty';
import { beautyAppointmentDateKey } from './dateLocal';
import {
    appointmentFormTotal,
    appointmentRemainingAfterDeposit,
    isAppointmentDepositCartLine,
    resolveVisitReservationAmount,
} from './appointmentFormReservation';

const KEY_SEP = '\u001f';

export interface BeautyPosOpeningAdvance {
    notes?: string | null;
    amount?: number | null;
}

/** Fiş / fatura kalemi. Depozito satırı hizmet değildir. */
export interface BeautyPosReceiptSaleLine {
    saleId?: string | null;
    ficheNo?: string | null;
    linkedAppointmentId?: string | null;
    isDepositSale?: boolean | null;
    itemType?: string | null;
    itemId?: string | null;
    name?: string | null;
    unitPrice?: number | null;
    qty?: number | null;
}

export interface BeautyPosOpeningCartLine {
    appointmentId: string;
    serviceName: string;
    itemId: string;
    unitPrice: number;
    qty: number;
    staffId: string;
    time: string;
    ficheNo: string;
}

export interface BeautyPosOpeningCart {
    key: string;
    ficheNo: string;
    time: string;
    appointmentId: string;
    customerId: string;
    staffId: string;
    dateKey: string;
    status: string;
    lines: BeautyPosOpeningCartLine[];
    /** Bu fişe yazılmış peşinat. Kardeş fişe taşınmaz, toplama eklenmez. */
    reservationAmount: number;
    subtotal: number;
    total: number;
    /** Bu fişte önceden ödenen. Diğer fişin peşinatı dahil değildir. */
    prepaid: number;
    /** Bu fişin toplamı − bu fişin ödemesi. */
    remaining: number | null;
}

export interface BeautyPosCatalogItem {
    id?: string | null;
    name?: string | null;
}

function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

function foldName(value: string | null | undefined): string {
    return String(value ?? '').trim().toLocaleLowerCase('tr');
}

/** Hizmet fişi. Peşinat fiş no sepet anahtarı değildir. */
export function beautyPosServiceFicheNo(apt: {
    remainder_sale_fiche_no?: string | null;
    invoice_number?: string | null;
    fiche_no?: string | null;
}): string {
    const candidates = [apt.remainder_sale_fiche_no, apt.invoice_number, apt.fiche_no];
    for (const raw of candidates) {
        const text = String(raw ?? '').trim();
        if (text) return text;
    }
    return '';
}

export function beautyPosOpeningTime(apt: {
    appointment_time?: string | null;
    time?: string | null;
}): string {
    const raw = String(apt.appointment_time ?? apt.time ?? '').trim().split('.')[0];
    const match = raw.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return '';
    const hh = Math.min(23, Math.max(0, parseInt(match[1], 10)));
    const mm = Math.min(59, Math.max(0, parseInt(match[2], 10)));
    if (Number.isNaN(hh) || Number.isNaN(mm)) return '';
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function saleIdOf(apt: BeautyAppointment): string {
    return String(apt.remainder_sale_id ?? '').trim();
}

/**
 * Tek kayıt için fiş kimliği.
 * Satış no, yoksa hizmet fiş no, o da yoksa randevu id.
 * Saat, müşteri, gün ve personel anahtar değildir.
 */
export function beautyPosOpeningKey(apt: BeautyAppointment): string {
    const saleId = saleIdOf(apt);
    if (saleId) return `sale:${saleId}`;
    const fiche = beautyPosServiceFicheNo(apt);
    if (fiche) return `fiche:${fiche}`;
    return `apt:${String(apt.id ?? '').trim()}`;
}

function isClosedOut(apt: BeautyAppointment): boolean {
    return (
        appointmentStatusMatches(apt.status, AppointmentStatus.CANCELLED) ||
        appointmentStatusMatches(apt.status, AppointmentStatus.NO_SHOW)
    );
}

function timeMinutes(time: string): number {
    const match = time.match(/^(\d{2}):(\d{2})$/);
    if (!match) return 24 * 60;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function onceOrSum(values: number[]): number {
    const list = values.map((n) => round2(Math.max(0, Number(n) || 0))).filter((n) => n > 0.004);
    if (list.length === 0) return 0;
    const keys = [...new Set(list.map((n) => n.toFixed(2)))];
    if (keys.length === 1) return Number(keys[0]);
    return round2(list.reduce((sum, n) => sum + n, 0));
}

/**
 * Avans notu tek bir randevu id'si taşıyorsa o fişe yazılır.
 * Not birden fazla randevuyu sayıyorsa tutar kopyalanmaz ve bölünmez.
 */
export function beautyPosAdvanceByAppointment(
    appointments: Array<{ id?: string | null }>,
    advances: BeautyPosOpeningAdvance[] | undefined,
): Map<string, number> {
    const ids = appointments
        .map((row) => String(row.id ?? '').trim())
        .filter((id) => id.length >= 8);
    const best = new Map<string, number>();
    for (const advance of advances ?? []) {
        const notes = String(advance.notes ?? '');
        const amount = Math.max(0, Number(advance.amount) || 0);
        if (!notes || amount <= 0.004) continue;
        const hits = ids.filter((id) => notes.includes(id));
        if (hits.length !== 1) continue;
        const owner = hits[0];
        best.set(owner, Math.max(best.get(owner) ?? 0, amount));
    }
    return best;
}

/**
 * Aynı satış no veya aynı hizmet fiş no bir fiştir.
 * İkisi de boşsa randevular birleşmez.
 */
export function groupBeautyPosReceiptAppointments(rows: BeautyAppointment[]): BeautyAppointment[][] {
    const list = (rows || []).filter((apt) => String(apt?.id ?? '').trim());
    if (list.length === 0) return [];
    const parent = list.map((_, index) => index);
    const find = (index: number): number => {
        let cursor = index;
        while (parent[cursor] !== cursor) {
            parent[cursor] = parent[parent[cursor]];
            cursor = parent[cursor];
        }
        return cursor;
    };
    const union = (left: number, right: number) => {
        const a = find(left);
        const b = find(right);
        if (a !== b) parent[b] = a;
    };
    const bySale = new Map<string, number>();
    const byFiche = new Map<string, number>();
    list.forEach((apt, index) => {
        const saleId = saleIdOf(apt);
        const fiche = beautyPosServiceFicheNo(apt);
        if (saleId) {
            const prev = bySale.get(saleId);
            if (prev == null) bySale.set(saleId, index);
            else union(prev, index);
        }
        if (fiche) {
            const prev = byFiche.get(fiche);
            if (prev == null) byFiche.set(fiche, index);
            else union(prev, index);
        }
    });
    const buckets = new Map<number, BeautyAppointment[]>();
    list.forEach((apt, index) => {
        const root = find(index);
        const bucket = buckets.get(root) ?? [];
        bucket.push(apt);
        buckets.set(root, bucket);
    });
    return [...buckets.values()].map((group) =>
        [...group].sort((a, b) => {
            const byTime = timeMinutes(beautyPosOpeningTime(a)) - timeMinutes(beautyPosOpeningTime(b));
            if (byTime !== 0) return byTime;
            return String(a.id).localeCompare(String(b.id));
        }),
    );
}

function groupKey(group: BeautyAppointment[]): string {
    const saleId = group.map(saleIdOf).find((id) => id.length > 0) ?? '';
    if (saleId) return `sale:${saleId}`;
    const fiche = group.map(beautyPosServiceFicheNo).find((no) => no.length > 0) ?? '';
    if (fiche) return `fiche:${fiche}`;
    return `apt:${String(group[0]?.id ?? '').trim()}`;
}

function lineFromAppointment(apt: BeautyAppointment): BeautyPosOpeningCartLine | null {
    const serviceName = String(apt.service_name ?? '').trim();
    const unitPrice = round2(Math.max(0, Number(apt.total_price) || 0));
    if (!serviceName && unitPrice <= 0) return null;
    if (isAppointmentDepositCartLine({ name: serviceName, itemId: apt.service_id })) return null;
    return {
        appointmentId: String(apt.id ?? '').trim(),
        serviceName,
        itemId: String(apt.service_id ?? '').trim(),
        unitPrice,
        qty: 1,
        staffId: String(apt.staff_id ?? apt.specialist_id ?? '').trim(),
        time: beautyPosOpeningTime(apt),
        ficheNo: beautyPosServiceFicheNo(apt),
    };
}

function saleLineOnReceipt(line: BeautyPosReceiptSaleLine, group: BeautyAppointment[]): boolean {
    if (line.isDepositSale === true) return false;
    const name = String(line.name ?? '').trim();
    const itemId = String(line.itemId ?? '').trim();
    if (isAppointmentDepositCartLine({ type: line.itemType, name, itemId })) return false;
    const price = Math.max(0, Number(line.unitPrice) || 0);
    if (!name && price <= 0) return false;
    const saleIds = new Set(group.map(saleIdOf).filter((id) => id.length > 0));
    const fiches = new Set(group.map(beautyPosServiceFicheNo).filter((no) => no.length > 0));
    const aptIds = new Set(group.map((apt) => String(apt.id ?? '').trim()).filter((id) => id.length > 0));
    const saleId = String(line.saleId ?? '').trim();
    const fiche = String(line.ficheNo ?? '').trim();
    const aptId = String(line.linkedAppointmentId ?? '').trim();
    if (saleId && saleIds.has(saleId)) return true;
    if (fiche && fiches.has(fiche)) return true;
    if (aptId && aptIds.has(aptId)) return true;
    return false;
}

function linesFromSale(group: BeautyAppointment[], saleLines: BeautyPosReceiptSaleLine[]): BeautyPosOpeningCartLine[] {
    const primary = group[0];
    const seen = new Set<string>();
    const out: BeautyPosOpeningCartLine[] = [];
    for (const line of saleLines) {
        if (!saleLineOnReceipt(line, group)) continue;
        const name = String(line.name ?? '').trim();
        const itemId = String(line.itemId ?? '').trim();
        const unitPrice = round2(Math.max(0, Number(line.unitPrice) || 0));
        const qty = Math.max(1, Math.round(Number(line.qty) || 1));
        const signature = `${String(line.saleId ?? '').trim()}${KEY_SEP}${itemId}${KEY_SEP}${foldName(name)}${KEY_SEP}${unitPrice}${KEY_SEP}${qty}`;
        if (seen.has(signature)) continue;
        seen.add(signature);
        const linkedId = String(line.linkedAppointmentId ?? '').trim();
        const owner =
            group.find((apt) => String(apt.id ?? '').trim() === linkedId) ??
            group.find((apt) => itemId && String(apt.service_id ?? '').trim() === itemId) ??
            primary;
        out.push({
            appointmentId: String(owner?.id ?? '').trim(),
            serviceName: name,
            itemId,
            unitPrice,
            qty,
            staffId: String(owner?.staff_id ?? owner?.specialist_id ?? '').trim(),
            time: beautyPosOpeningTime(owner ?? primary),
            ficheNo: String(line.ficheNo ?? '').trim() || beautyPosServiceFicheNo(owner ?? primary),
        });
    }
    return out;
}

function cartFromGroup(
    group: BeautyAppointment[],
    advanceByAppointment: Map<string, number>,
    saleLines: BeautyPosReceiptSaleLine[],
): BeautyPosOpeningCart {
    const fromSale = linesFromSale(group, saleLines);
    const fromAppointments = group
        .map(lineFromAppointment)
        .filter((line): line is BeautyPosOpeningCartLine => line != null);
    // Fiş kalemi fiyatı esastır. Satışta olmayan aynı fiş hizmeti de kalır.
    // Aynı ad ikinci kez yazılmaz. Depozito satırı buraya girmez.
    const lines = fromSale.length === 0
        ? fromAppointments
        : [
            ...fromSale,
            ...fromAppointments.filter((aptLine) => {
                const aptName = foldName(aptLine.serviceName);
                return !fromSale.some((saleLine) => {
                    const saleName = foldName(saleLine.serviceName);
                    if (aptLine.itemId && saleLine.itemId && aptLine.itemId === saleLine.itemId) return true;
                    return aptName.length > 0 && aptName === saleName;
                });
            }),
        ];
    const subtotal = round2(lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0));
    const total = appointmentFormTotal(subtotal, 0);
    const advanceAmounts = group.map((apt) => advanceByAppointment.get(String(apt.id ?? '').trim()) ?? 0);
    const source = Math.max(0, ...advanceAmounts, 0);
    const reservationAmount = resolveVisitReservationAmount({
        storedDeposits: group.map((apt) => Number(apt.deposit_amount) || 0),
        sourceAmount: source > 0.004 ? source : null,
    });
    const prepaid = reservationAmount;
    const remainderPaid = onceOrSum(group.map((apt) => Number(apt.remainder_paid_amount) || 0));
    const paid = round2(prepaid + remainderPaid);
    const completed = group.some((apt) => appointmentStatusMatches(apt.status, AppointmentStatus.COMPLETED));
    const remaining = paid > 0.004
        ? round2(Math.max(0, total - paid))
        : appointmentRemainingAfterDeposit({
            serviceGross: subtotal,
            discountPercent: 0,
            reservation: 0,
            completed,
        });
    const anchor = group[0];
    const ficheNo = group.map(beautyPosServiceFicheNo).find((no) => no.length > 0)
        ?? lines.map((line) => line.ficheNo).find((no) => no.length > 0)
        ?? '';
    return {
        key: groupKey(group),
        ficheNo,
        time: beautyPosOpeningTime(anchor),
        appointmentId: String(anchor.id ?? '').trim(),
        customerId: String(anchor.customer_id ?? anchor.client_id ?? '').trim(),
        staffId: String(anchor.staff_id ?? anchor.specialist_id ?? '').trim(),
        dateKey: beautyAppointmentDateKey(anchor),
        status: String(anchor.status ?? ''),
        lines,
        reservationAmount,
        subtotal,
        total,
        prepaid,
        remaining,
    };
}

/**
 * Günün randevularını fiş sepetlerine böler.
 * Satış no veya fiş no aynıysa satırlar bir sepette kalır.
 */
export function buildBeautyPosOpeningCarts(
    appointments: BeautyAppointment[],
    opts?: { advances?: BeautyPosOpeningAdvance[]; saleLines?: BeautyPosReceiptSaleLine[] },
): BeautyPosOpeningCart[] {
    const active = (appointments || []).filter((apt) => apt?.id && !isClosedOut(apt));
    const advances = beautyPosAdvanceByAppointment(active, opts?.advances);
    const saleLines = opts?.saleLines ?? [];
    const carts = groupBeautyPosReceiptAppointments(active).map((group) =>
        cartFromGroup(group, advances, saleLines),
    );
    carts.sort((a, b) => {
        const byTime = timeMinutes(a.time) - timeMinutes(b.time);
        if (byTime !== 0) return byTime;
        return a.appointmentId.localeCompare(b.appointmentId);
    });
    return carts;
}

/**
 * POS'ta açılan fişin sepeti. Başka fişin satırı girmez.
 * Saat, açılan randevunun saatidir.
 */
export function openBeautyPosCart(
    primary: BeautyAppointment,
    pool: BeautyAppointment[],
    opts?: { advances?: BeautyPosOpeningAdvance[]; saleLines?: BeautyPosReceiptSaleLine[] },
): BeautyPosOpeningCart | null {
    const primaryId = String(primary?.id ?? '').trim();
    if (!primaryId) return null;
    const source = (pool || []).some((row) => String(row?.id ?? '').trim() === primaryId)
        ? pool
        : [primary, ...(pool || [])];
    const carts = buildBeautyPosOpeningCarts(source, opts);
    const cart = carts.find((row) => row.lines.some((line) => line.appointmentId === primaryId) || row.appointmentId === primaryId)
        ?? carts.find((row) => row.key === beautyPosOpeningKey(primary))
        ?? null;
    if (!cart) return null;
    const time = beautyPosOpeningTime(primary) || cart.time;
    return {
        ...cart,
        time,
        appointmentId: primaryId,
        status: String(primary.status ?? cart.status),
        staffId: String(primary.staff_id ?? primary.specialist_id ?? cart.staffId).trim(),
    };
}

/**
 * Açılan fişin randevu satırları.
 * Aynı satış no veya fiş no gelir. Başka fiş gelmez.
 */
export function beautyPosOpeningAppointments(
    primary: BeautyAppointment,
    candidates: BeautyAppointment[],
): BeautyAppointment[] {
    const primaryId = String(primary?.id ?? '').trim();
    const pool = (candidates || []).length > 0 ? candidates : [primary];
    const withPrimary = pool.some((row) => String(row?.id ?? '').trim() === primaryId)
        ? pool
        : [primary, ...pool];
    const groups = groupBeautyPosReceiptAppointments(withPrimary.filter((row) => row?.id && !isClosedOut(row)));
    const matched = groups.find((group) => group.some((row) => String(row.id ?? '').trim() === primaryId));
    if (!matched || matched.length === 0) return [primary];
    return matched;
}

/**
 * Fiş filtresindeki katalog. Fişte olmayan hizmet kalmaz.
 * Fiş satırı yoksa katalog olduğu gibi durur; bütün liste düşmez.
 */
export function filterBeautyPosCatalogForReceipt<T extends BeautyPosCatalogItem>(
    catalog: T[],
    lines: Array<{ itemId?: string | null; serviceName?: string | null }>,
): T[] {
    const ids = new Set(lines.map((line) => String(line.itemId ?? '').trim()).filter((id) => id.length > 0));
    const names = new Set(lines.map((line) => foldName(line.serviceName)).filter((name) => name.length > 0));
    if (ids.size === 0 && names.size === 0) return catalog;
    return catalog.filter((item) => {
        const id = String(item.id ?? '').trim();
        const name = foldName(item.name);
        return (id.length > 0 && ids.has(id)) || (name.length > 0 && names.has(name));
    });
}
