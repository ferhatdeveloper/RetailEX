import { describe, expect, it } from 'vitest';
import {
  filterForRevenue,
  filterForCash,
  isCiroyaDahilSale,
  isKasaTahsilatiSale,
  isDepositSale,
  isPendingPaymentStatus,
  isCancelledPaymentStatus,
  isRemovedSaleStatusLite,
} from '../../utils/reportDepositFilter';
import type { Sale } from '../../core/types';

/**
 * Bug 24 — Günlük Rapor + Müşteri Satış Analizi peşinat filtresi.
 *
 * Senaryo (kullanıcı bildirimi):
 *  - ROZA için 2 hizmet (HIGH LIGHT 25.000 + STRONG POLISH 30.000) planlı
 *    randevu + 20.000 peşinat alınmış. Randevu henüz tamamlanmamış.
 *  - DB'de 1 rezervasyon fişi var: total=60.000, payment_status='paid',
 *    is_deposit=true.
 *  - Beklenen:
 *      Günlük Rapor   → Toplam Satış=0, Toplam Ciro=0, Veresiye=0,
 *                       Net Brüt=0, Kasa=20.000, Tahsil Edilen=20.000
 *      Müşteri Analiz → ROZA satış=0, ciro=0
 */

function makeSale(overrides: Partial<Sale> & Record<string, unknown>): Sale {
  return {
    id: overrides.id ?? 'sale-1',
    receiptNumber: overrides.receiptNumber ?? 'R-1',
    date: overrides.date ?? '2026-10-03T12:00:00.000Z',
    items: overrides.items ?? [],
    subtotal: overrides.subtotal ?? 0,
    discount: overrides.discount ?? 0,
    total: overrides.total ?? 0,
    paymentMethod: overrides.paymentMethod ?? 'cash',
    cashier: overrides.cashier ?? 'admin',
    status: (overrides.status as string | undefined) ?? 'completed',
    ...overrides,
  } as Sale;
}

describe('reportDepositFilter — Bug 24 (peşinat Hariç)', () => {
  describe('isDepositSale', () => {
    it('isDeposit=true olan satışı peşinat olarak tanır', () => {
      expect(isDepositSale({ isDeposit: true } as Sale)).toBe(true);
    });
    it('isDeposit=false/null/undefined olan satışı peşinat saymaz', () => {
      expect(isDepositSale({ isDeposit: false } as Sale)).toBe(false);
      expect(isDepositSale({ isDeposit: null } as Sale)).toBe(false);
      expect(isDepositSale({} as Sale)).toBe(false);
    });
  });

  describe('isPendingPaymentStatus', () => {
    it('pending/awaiting_service/partial durumlarını yakalar', () => {
      expect(isPendingPaymentStatus('pending')).toBe(true);
      expect(isPendingPaymentStatus('awaiting_service')).toBe(true);
      expect(isPendingPaymentStatus('partial')).toBe(true);
      expect(isPendingPaymentStatus('PENDING')).toBe(true);
    });
    it('paid ve boş değer Hariç', () => {
      expect(isPendingPaymentStatus('paid')).toBe(false);
      expect(isPendingPaymentStatus('')).toBe(false);
      expect(isPendingPaymentStatus(undefined)).toBe(false);
      expect(isPendingPaymentStatus(null)).toBe(false);
    });
  });

  describe('isCancelledPaymentStatus', () => {
    it('cancelled/refunded/void/iptal durumlarını yakalar', () => {
      expect(isCancelledPaymentStatus('cancelled')).toBe(true);
      expect(isCancelledPaymentStatus('CANCELLED')).toBe(true);
      expect(isCancelledPaymentStatus('refunded')).toBe(true);
      expect(isCancelledPaymentStatus('void')).toBe(true);
    });
    it('boş / paid Hariç', () => {
      expect(isCancelledPaymentStatus('paid')).toBe(false);
      expect(isCancelledPaymentStatus('')).toBe(false);
      expect(isCancelledPaymentStatus(undefined)).toBe(false);
    });
  });

  describe('isRemovedSaleStatusLite', () => {
    it('cancelled/refunded status değerlerini yakalar', () => {
      expect(isRemovedSaleStatusLite('cancelled')).toBe(true);
      expect(isRemovedSaleStatusLite('refunded')).toBe(true);
      expect(isRemovedSaleStatusLite('return')).toBe(false);
    });
    it('boş status geriye dönük uyumlu (false)', () => {
      expect(isRemovedSaleStatusLite('')).toBe(false);
      expect(isRemovedSaleStatusLite(undefined)).toBe(false);
    });
  });

  describe('isCiroyaDahilSale (Ciro/Veresiye/Adet)', () => {
    it('peşinat fişi (paid + is_deposit=true) Hariç', () => {
      const s = makeSale({
        total: 60_000,
        payment_status: 'paid',
        isDeposit: true,
      });
      expect(isCiroyaDahilSale(s)).toBe(false);
    });
    it('peşinat bekleyen fiş (payment_status=pending) Hariç', () => {
      const s = makeSale({
        total: 60_000,
        payment_status: 'pending',
        isDeposit: false,
      });
      expect(isCiroyaDahilSale(s)).toBe(false);
    });
    it('iptal edilmiş satış Hariç', () => {
      const s = makeSale({
        total: 60_000,
        payment_status: 'paid',
        isDeposit: false,
        status: 'cancelled',
      });
      expect(isCiroyaDahilSale(s)).toBe(false);
    });
    it('normal tamamlanmış satış DAHİL', () => {
      const s = makeSale({
        total: 60_000,
        payment_status: 'paid',
        isDeposit: false,
        status: 'completed',
      });
      expect(isCiroyaDahilSale(s)).toBe(true);
    });
    it('kısmi ödeme Hariç (Bug 23)', () => {
      const s = makeSale({
        total: 100_000,
        payment_status: 'partial',
        isDeposit: false,
        status: 'completed',
      });
      expect(isCiroyaDahilSale(s)).toBe(false);
    });
  });

  describe('Bug 26 follow-up: Randevuya bağlı fiş hizmet tamamlanmamışsa Hariç', () => {
    it('linkedAppointmentId var + status boş → Hariç', () => {
      const s = makeSale({
        total: 75_000,
        payment_status: 'paid',
        isDeposit: false,
        linkedAppointmentId: 'apt-1',
        status: '',
      });
      expect(isCiroyaDahilSale(s)).toBe(false);
    });
    it('linkedAppointmentId var + status=scheduled → Hariç', () => {
      const s = makeSale({
        total: 75_000,
        payment_status: 'paid',
        isDeposit: false,
        linkedAppointmentId: 'apt-1',
        status: 'scheduled',
      });
      expect(isCiroyaDahilSale(s)).toBe(false);
    });
    it('linkedAppointmentId var + status=confirmed → Hariç', () => {
      const s = makeSale({
        total: 75_000,
        payment_status: 'paid',
        isDeposit: false,
        linkedAppointmentId: 'apt-1',
        status: 'confirmed',
      });
      expect(isCiroyaDahilSale(s)).toBe(false);
    });
    it('linkedAppointmentId var + status=in_progress → Hariç', () => {
      const s = makeSale({
        total: 75_000,
        payment_status: 'paid',
        isDeposit: false,
        linkedAppointmentId: 'apt-1',
        status: 'in_progress',
      });
      expect(isCiroyaDahilSale(s)).toBe(false);
    });
    it('linkedAppointmentId var + status=completed → DAHİL', () => {
      const s = makeSale({
        total: 75_000,
        payment_status: 'paid',
        isDeposit: false,
        linkedAppointmentId: 'apt-1',
        status: 'completed',
      });
      expect(isCiroyaDahilSale(s)).toBe(true);
    });
    it('linkedAppointmentId var + status=paid → DAHİL', () => {
      const s = makeSale({
        total: 75_000,
        payment_status: 'paid',
        isDeposit: false,
        linkedAppointmentId: 'apt-1',
        status: 'paid',
      });
      expect(isCiroyaDahilSale(s)).toBe(true);
    });
    it('linkedAppointmentId yok + status boş → DAHİL (randevu dışı satış)', () => {
      const s = makeSale({
        total: 50_000,
        payment_status: 'paid',
        isDeposit: false,
        status: '',
      });
      expect(isCiroyaDahilSale(s)).toBe(true);
    });
  });

  describe('isKasaTahsilatiSale (Kasa/Tahsil Edilen)', () => {
    it('peşinat fişi (paid + is_deposit=true) DAHİL (kasaya girmiştir)', () => {
      const s = makeSale({
        total: 60_000,
        payment_status: 'paid',
        isDeposit: true,
      });
      expect(isKasaTahsilatiSale(s)).toBe(true);
    });
    it('iptal Hariç', () => {
      const s = makeSale({
        total: 60_000,
        payment_status: 'paid',
        isDeposit: false,
        status: 'cancelled',
      });
      expect(isKasaTahsilatiSale(s)).toBe(false);
    });
    it('cancelled payment_status Hariç', () => {
      const s = makeSale({
        total: 60_000,
        payment_status: 'cancelled',
        isDeposit: false,
        status: 'completed',
      });
      expect(isKasaTahsilatiSale(s)).toBe(false);
    });
  });

  describe('Kullanıcı senaryosu: ROZA 60.000 peşinatlı, henüz tamamlanmamış', () => {
    const rozaSale = makeSale({
      id: 'BEAUTY-PESINAT-apt-roza-001',
      total: 60_000,
      payment_status: 'paid',
      isDeposit: true,
      linkedAppointmentId: 'apt-roza-001',
      customerId: 'roza-id',
      customerName: 'ROZA',
      paymentMethod: 'cash',
    });

    it('Günlük Rapor Ciro filtresi: rozaSale Hariç (toplam=0)', () => {
      const revenueList = filterForRevenue([rozaSale]);
      expect(revenueList).toHaveLength(0);
      const totalRevenue = revenueList.reduce((s, x) => s + Number(x.total || 0), 0);
      expect(totalRevenue).toBe(0);
    });

    it('Günlük Rapor Kasa filtresi: rozaSale DAHİL (peşinat tahsil edildi)', () => {
      const cashList = filterForCash([rozaSale]);
      expect(cashList).toHaveLength(1);
      expect(cashList[0].id).toBe('BEAUTY-PESINAT-apt-roza-001');
    });

    it('Müşteri Satış Analizi: rozaSale Hariç (satış=0, ciro=0)', () => {
      const counted = filterForRevenue([rozaSale]);
      // Müşteri analizinde filterForRevenue sonucu boş → ROZA hiç
      // görünmez (count=0, totalRevenue=0).
      expect(counted).toHaveLength(0);
    });
  });

  describe('Randevu tamamlandığında: ana satış fişi (is_deposit=false) DAHİL', () => {
    const mainSale = makeSale({
      id: 'BEAUTY-MAIN-apt-roza-001',
      total: 60_000,
      payment_status: 'paid',
      isDeposit: false,
      parentSaleId: 'BEAUTY-PESINAT-apt-roza-001',
      linkedAppointmentId: 'apt-roza-001',
      customerId: 'roza-id',
      customerName: 'ROZA',
      paymentMethod: 'cash',
    });

    it('tamamlanmış ana satış ciroya dahil (60.000)', () => {
      const revenueList = filterForRevenue([mainSale]);
      expect(revenueList).toHaveLength(1);
      expect(revenueList[0].total).toBe(60_000);
    });

    it('tamamlanmış ana satış kasa filtresinde de var (nakit tahsilat)', () => {
      const cashList = filterForCash([mainSale]);
      expect(cashList).toHaveLength(1);
    });
  });

  describe('Bileşik senaryo: peşinat + ana satış + iptal + normal', () => {
    const peşinat = makeSale({
      id: 'A',
      total: 60_000,
      payment_status: 'paid',
      isDeposit: true,
      customerId: 'c1',
    });
    const anaSatış = makeSale({
      id: 'B',
      total: 60_000,
      payment_status: 'paid',
      isDeposit: false,
      customerId: 'c1',
    });
    const iptal = makeSale({
      id: 'C',
      total: 10_000,
      payment_status: 'paid',
      isDeposit: false,
      status: 'cancelled',
      customerId: 'c2',
    });
    const normal = makeSale({
      id: 'D',
      total: 20_000,
      payment_status: 'paid',
      isDeposit: false,
      customerId: 'c3',
    });

    it('Ciro filtresi: yalnız ana satış + normal (peşinat Hariç, iptal Hariç)', () => {
      const result = filterForRevenue([peşinat, anaSatış, iptal, normal]);
      const ids = result.map((s) => s.id);
      expect(ids).toEqual(['B', 'D']);
      const total = result.reduce((s, x) => s + Number(x.total || 0), 0);
      expect(total).toBe(80_000);
    });

    it('Kasa filtresi: peşinat + ana satış + normal (iptal Hariç)', () => {
      const result = filterForCash([peşinat, anaSatış, iptal, normal]);
      const ids = result.map((s) => s.id);
      expect(ids).toEqual(['A', 'B', 'D']);
    });
  });

  describe('Geriye dönük uyum: eski verilerde isDeposit yok', () => {
    it('isDeposit tanımsız eski satış ciroya dahil (paid, status=completed)', () => {
      const legacy = makeSale({
        total: 5_000,
        payment_status: 'paid',
        status: 'completed',
      });
      // isDeposit undefined → false → dahil
      expect(isCiroyaDahilSale(legacy)).toBe(true);
    });
  });

  // ===========================================================
  // BUG 28 — Peşinat / Ana fiş ayrımı (Günlük Rapor kartı)
  // ===========================================================
  describe('Bug 28 — Peşinat / Ana fiş ayrımı', () => {
    it('filterForDeposit: yalnızca isDeposit=true olanları döndürür', async () => {
      const { filterForDeposit, isDepositOnlySale } = await import('../../utils/reportDepositFilter');
      const peşinat = makeSale({ id: 'A', total: 20_000, status: 'completed', isDeposit: true });
      const anaSatış = makeSale({ id: 'B', total: 55_000, status: 'completed', isDeposit: false });
      const legacy = makeSale({ id: 'C', total: 10_000, status: 'completed' }); // undefined isDeposit

      const list = filterForDeposit([peşinat, anaSatış, legacy]);
      const ids = list.map((s) => s.id);
      expect(ids).toEqual(['A']);
      expect(isDepositOnlySale(peşinat)).toBe(true);
      expect(isDepositOnlySale(anaSatış)).toBe(false);
      expect(isDepositOnlySale(legacy)).toBe(false);
    });

    it('filterForMain: isDeposit=false olanları döndürür (peşinat Hariç)', async () => {
      const { filterForMain, isMainFinishedSale } = await import('../../utils/reportDepositFilter');
      const peşinat = makeSale({ id: 'A', total: 20_000, status: 'completed', isDeposit: true });
      const anaSatış = makeSale({ id: 'B', total: 55_000, status: 'completed', isDeposit: false });
      const iptal = makeSale({ id: 'C', total: 5_000, status: 'cancelled' });

      const list = filterForMain([peşinat, anaSatış, iptal]);
      const ids = list.map((s) => s.id);
      expect(ids).toEqual(['B']);
      expect(isMainFinishedSale(peşinat)).toBe(false);
      expect(isMainFinishedSale(anaSatış)).toBe(true);
      expect(isMainFinishedSale(iptal)).toBe(false);
    });

    it('filterForMain: legacy data (eski veri) isDeposit undefined → ana fiş sayılır', async () => {
      const { filterForMain } = await import('../../utils/reportDepositFilter');
      const legacy = makeSale({ id: 'L', total: 5_000, status: 'completed' });
      expect(filterForMain([legacy]).map((s) => s.id)).toEqual(['L']);
    });
  });

  // ===========================================================
  // BUG 26 — Tamamlanmamış randevular raporlara yansımasın
  // ===========================================================
  describe('Bug 26 — Randevu status filtresi (tamamlanmamış Hariç)', () => {
    it('isCompletedAppointmentStatus: completed/done/tamamlandı → true', async () => {
      const { isCompletedAppointmentStatus } = await import('../../utils/reportDepositFilter');
      expect(isCompletedAppointmentStatus('completed')).toBe(true);
      expect(isCompletedAppointmentStatus('COMPLETED')).toBe(true);
      expect(isCompletedAppointmentStatus('done')).toBe(true);
      expect(isCompletedAppointmentStatus('finished')).toBe(true);
      expect(isCompletedAppointmentStatus('tamamlandı')).toBe(true);
      expect(isCompletedAppointmentStatus('tamamlandi')).toBe(true);
    });

    it('isCompletedAppointmentStatus: scheduled/confirmed/pre_paid/in_progress → false', async () => {
      const { isCompletedAppointmentStatus } = await import('../../utils/reportDepositFilter');
      expect(isCompletedAppointmentStatus('scheduled')).toBe(false);
      expect(isCompletedAppointmentStatus('confirmed')).toBe(false);
      expect(isCompletedAppointmentStatus('pre_paid')).toBe(false);
      expect(isCompletedAppointmentStatus('in_progress')).toBe(false);
      expect(isCompletedAppointmentStatus('')).toBe(false);
      expect(isCompletedAppointmentStatus(undefined)).toBe(false);
      expect(isCompletedAppointmentStatus(null)).toBe(false);
    });

    it('appointmentStatusIsCompleted: randevu objesi ile çalışır', async () => {
      const { appointmentStatusIsCompleted } = await import('../../utils/reportDepositFilter');
      expect(appointmentStatusIsCompleted({ status: 'completed' })).toBe(true);
      expect(appointmentStatusIsCompleted({ status: 'scheduled' })).toBe(false);
      expect(appointmentStatusIsCompleted(null)).toBe(false);
      expect(appointmentStatusIsCompleted(undefined)).toBe(false);
    });

    it('isOpenAppointmentStatus: scheduled/confirmed/pre_paid → true (henüz hizmet verilmemiş)', async () => {
      const { isOpenAppointmentStatus } = await import('../../utils/reportDepositFilter');
      expect(isOpenAppointmentStatus('scheduled')).toBe(true);
      expect(isOpenAppointmentStatus('confirmed')).toBe(true);
      expect(isOpenAppointmentStatus('pre_paid')).toBe(true);
      expect(isOpenAppointmentStatus('in_progress')).toBe(true);
      expect(isOpenAppointmentStatus('completed')).toBe(false);
      expect(isOpenAppointmentStatus('')).toBe(true); // boş → tamamlanmamış sayılır
    });
  });
});
