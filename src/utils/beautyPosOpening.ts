/**
 * Güzellik POS açılış sepeti.
 *
 * Aynı müşteri, aynı gün ve aynı personel sepet birleştirmez.
 * Kayıt anahtarı fatura/fiş no + saat + randevu id'dir.
 * Peşinat ciro değildir; yazıldığı randevuda kalır, diğer fişe kopyalanmaz
 * ve ikiye bölünmez. Kalan = bu fişin toplamı − bu fişin ödemesi.
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
    resolveVisitReservationAmount,
} from './appointmentFormReservation';

const KEY_SEP = '\u001f';

export interface BeautyPosOpeningAdvance {
    notes?: string | null;
    amount?: number | null;
}

export interface BeautyPosOpeningCartLine {
    appointmentId: string;
    serviceName: string;
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
    /** Bu randevuya yazılmış peşinat. Kardeş fişe taşınmaz. */
    reservationAmount: number;
    subtotal: number;
    total: number;
    /** Bu fişte önceden ödenen. Diğer fişin peşinatı dahil değildir. */
    prepaid: number;
    /** Bu fişin toplamı − bu fişin ödemesi. Birleşik kalan yayılmaz. */
    remaining: number | null;
}

function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
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

/** Fatura/fiş no + saat + randevu id. Müşteri, gün ve personel anahtar değildir. */
export function beautyPosOpeningKey(apt: BeautyAppointment): string {
    const fiche = beautyPosServiceFicheNo(apt);
    const time = beautyPosOpeningTime(apt);
    const id = String(apt.id ?? '').trim();
    return `fiche:${fiche}${KEY_SEP}time:${time}${KEY_SEP}apt:${id}`;
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

function cartFromAppointment(
    apt: BeautyAppointment,
    advanceAmount: number,
): BeautyPosOpeningCart {
    const appointmentId = String(apt.id ?? '').trim();
    const ficheNo = beautyPosServiceFicheNo(apt);
    const time = beautyPosOpeningTime(apt);
    const unitPrice = round2(Math.max(0, Number(apt.total_price) || 0));
    const deposit = round2(Math.max(0, Number(apt.deposit_amount) || 0));
    const remainderPaid = round2(Math.max(0, Number(apt.remainder_paid_amount) || 0));
    const reservationAmount = resolveVisitReservationAmount({
        storedDeposits: [deposit],
        sourceAmount: advanceAmount > 0.004 ? advanceAmount : null,
    });
    const prepaid = reservationAmount;
    const subtotal = unitPrice;
    const total = appointmentFormTotal(subtotal, 0);
    const paid = round2(prepaid + remainderPaid);
    const completed = appointmentStatusMatches(apt.status, AppointmentStatus.COMPLETED);
    const remaining = paid > 0.004
        ? round2(Math.max(0, total - paid))
        : appointmentRemainingAfterDeposit({
            serviceGross: subtotal,
            discountPercent: 0,
            reservation: 0,
            completed,
        });
    const serviceName = String(apt.service_name ?? '').trim();
    const staffId = String(apt.staff_id ?? apt.specialist_id ?? '').trim();
    const line: BeautyPosOpeningCartLine = {
        appointmentId,
        serviceName,
        unitPrice,
        qty: 1,
        staffId,
        time,
        ficheNo,
    };
    return {
        key: beautyPosOpeningKey(apt),
        ficheNo,
        time,
        appointmentId,
        customerId: String(apt.customer_id ?? apt.client_id ?? '').trim(),
        staffId,
        dateKey: beautyAppointmentDateKey(apt),
        status: String(apt.status ?? ''),
        lines: serviceName || unitPrice > 0 ? [line] : [],
        reservationAmount,
        subtotal,
        total,
        prepaid,
        remaining,
    };
}

/**
 * Günün randevularını POS açılış sepetlerine böler.
 * Her fiş kendi saatinde ve kendi tutarında kalır.
 */
export function buildBeautyPosOpeningCarts(
    appointments: BeautyAppointment[],
    opts?: { advances?: BeautyPosOpeningAdvance[] },
): BeautyPosOpeningCart[] {
    const active = (appointments || []).filter((apt) => apt?.id && !isClosedOut(apt));
    const advances = beautyPosAdvanceByAppointment(active, opts?.advances);
    const carts = active.map((apt) => {
        const id = String(apt.id ?? '').trim();
        return cartFromAppointment(apt, advances.get(id) ?? 0);
    });
    carts.sort((a, b) => {
        const byTime = timeMinutes(a.time) - timeMinutes(b.time);
        if (byTime !== 0) return byTime;
        return a.appointmentId.localeCompare(b.appointmentId);
    });
    return carts;
}

/**
 * POS'ta açılan randevunun sepeti. Kardeş saat ve fiş bu sepete girmez.
 */
export function openBeautyPosCart(
    primary: BeautyAppointment,
    pool: BeautyAppointment[],
    opts?: { advances?: BeautyPosOpeningAdvance[] },
): BeautyPosOpeningCart | null {
    const source = pool.length > 0 ? pool : [primary];
    const key = beautyPosOpeningKey(primary);
    const carts = buildBeautyPosOpeningCarts(source, opts);
    return carts.find((cart) => cart.key === key) ?? null;
}

/**
 * Hidrasyon satırları. Kuyruk grubu (müşteri + gün + personel) kullanılmaz.
 * Aynı anahtarı taşıyan kayıt döner; randevu id anahtarda olduğu için
 * diğer saat ve fiş gelmez.
 */
export function beautyPosOpeningAppointments(
    primary: BeautyAppointment,
    candidates: BeautyAppointment[],
): BeautyAppointment[] {
    const key = beautyPosOpeningKey(primary);
    const pool = candidates.length > 0 ? candidates : [primary];
    const matched = pool.filter((row) => beautyPosOpeningKey(row) === key);
    if (matched.length === 0) return [primary];
    return [...matched].sort((a, b) => {
        const byTime = timeMinutes(beautyPosOpeningTime(a)) - timeMinutes(beautyPosOpeningTime(b));
        if (byTime !== 0) return byTime;
        return String(a.id).localeCompare(String(b.id));
    });
}
