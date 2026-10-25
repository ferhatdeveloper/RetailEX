import { describe, expect, it } from 'vitest';
import {
  beautySalePocketCollected,
  beautySaleRemainingCari,
  dailyPaymentKind,
  extraCustomerCollectionsNotOnSales,
  extraReservationCustomerCollections,
  resolvePosCheckoutSettlement,
  saleCollectedSplit,
  splitPaymentRows,
} from '../../utils/saleCollectedAmounts';

describe('saleCollectedSplit — belge vs tahsilat', () => {
  it('saf veresiye 100: nakit 0, kalan 100', () => {
    const s = saleCollectedSplit({ total: 100, paymentMethod: 'veresiye' });
    expect(s.document).toBe(100);
    expect(s.cash).toBe(0);
    expect(s.collected).toBe(0);
    expect(s.remaining).toBe(100);
  });

  it('açık cari hesap belge tutarını kasaya yazmaz', () => {
    const s = saleCollectedSplit({ total: 100, paymentMethod: 'Açık Cari Hesap' });
    expect(s.cash).toBe(0);
    expect(s.remaining).toBe(100);
  });

  it('peşin nakit 100: cebe 100, kalan 0', () => {
    const s = saleCollectedSplit({ total: 100, paymentMethod: 'cash' });
    expect(s.cash).toBe(100);
    expect(s.collected).toBe(100);
    expect(s.remaining).toBe(0);
  });

  it('karma 40 nakit + 60 veresiye: cebe 40, kalan 60', () => {
    const s = splitPaymentRows(100, [
      { method: 'cash', amount: 40 },
      { method: 'veresiye', amount: 60 },
    ]);
    expect(s.cash).toBe(40);
    expect(s.credit).toBe(60);
    expect(s.collected).toBe(40);
    expect(s.remaining).toBe(60);
  });

  it('bucket credit belge tutarını kasaya yazmaz', () => {
    const s = saleCollectedSplit({ total: 100, paymentMethod: 'credit' });
    expect(s.cash).toBe(0);
    expect(s.collected).toBe(0);
    expect(s.remaining).toBe(100);
  });

  it('veresiye + payments nakit 40: cebe 40, kalan 60', () => {
    const s = splitPaymentRows(100, [{ method: 'cash', amount: 40 }], 'veresiye');
    expect(s.cash).toBe(40);
    expect(s.collected).toBe(40);
    expect(s.remaining).toBe(60);
  });

  it('veresiye etiket + payments tam nakit: hayalet kasa yok', () => {
    const s = saleCollectedSplit({
      total: 100,
      paymentMethod: 'veresiye',
      payments: [{ method: 'cash', amount: 100 }],
    });
    expect(s.cash).toBe(0);
    expect(s.collected).toBe(0);
    expect(s.remaining).toBe(100);
  });

  it('boş ödeme yöntemi nakit sayılmaz (ödenmemiş cari)', () => {
    const s = saleCollectedSplit({ total: 80, paymentMethod: '' });
    expect(s.cash).toBe(0);
    expect(s.remaining).toBe(80);
  });

  // Bug fix 2026-10-13 (aqua güzellik): iskonto cari borç DEĞİLDİR.
  // 50.000 brüt + 40.000 ödenen + 10.000 iskonto → remaining=0 (veresiye YOK).
  it('aqua bug: 50k brüt + 40k ödenen + 10k iskonto → remaining=0 (veresiye yok)', () => {
    const s = saleCollectedSplit({
      total: 50000,
      paymentMethod: 'cash',
      payments: [{ method: 'cash', amount: 40000 }],
      discount: 10000,
    });
    expect(s.cash).toBe(40000);
    expect(s.collected).toBe(40000);
    expect(s.remaining).toBe(0); // iskonto cari borç değil
    expect(s.credit).toBe(0);
  });

  it('aqua bug: 120k brüt + 85k ödenen + 35k iskonto → remaining=0', () => {
    const s = saleCollectedSplit({
      total: 120000,
      paymentMethod: 'cash',
      payments: [{ method: 'cash', amount: 85000 }],
      discount: 35000,
    });
    expect(s.remaining).toBe(0);
    expect(s.collected).toBe(85000);
  });

  it('iskonto + kısmi veresiye: 100k brüt + 50k nakit + 10k iskonto + 40k veresiye satırı', () => {
    // 100.000 brüt, ödenen 50.000 nakit + 10.000 iskonto, kalan 40.000 gerçek veresiye
    const s = saleCollectedSplit({
      total: 100000,
      paymentMethod: 'veresiye',
      payments: [
        { method: 'cash', amount: 50000 },
        { method: 'veresiye', amount: 40000 },
      ],
      discount: 10000,
    });
    expect(s.cash).toBe(50000);
    expect(s.collected).toBe(50000);
    expect(s.remaining).toBe(40000); // sadece gerçek cari
    expect(s.credit).toBe(40000);
  });

  it('50.000 nakit satırı varken 10.000 avans ikinci kez eklenmez', () => {
    const full = saleCollectedSplit(
      {
        total: 50_000,
        paymentMethod: 'nakit',
        payments: [{ method: 'NAKIT', amount: 50_000 }],
        discount: 0,
      },
      10_000,
    );
    expect(full.cash).toBe(50_000);
    expect(full.collected).toBe(50_000);
    expect(full.remaining).toBe(0);
    expect(full.credit).toBe(0);

    const gap = saleCollectedSplit(
      {
        total: 50_000,
        paymentMethod: 'nakit',
        payments: [{ method: 'NAKIT', amount: 40_000 }],
        discount: 0,
      },
      10_000,
    );
    expect(gap.cash).toBe(50_000);
    expect(gap.collected).toBe(50_000);
    expect(gap.remaining).toBe(0);
  });

  it('veresiye etiket + tam nakit ödeme + iskonto: kasa şişmez', () => {
    // 50.000 brüt, nakit 40.000, iskonto 10.000 → ödeme tamam, kasa 40.000
    const s = saleCollectedSplit({
      total: 50000,
      paymentMethod: 'veresiye',
      payments: [{ method: 'cash', amount: 40000 }],
      discount: 10000,
    });
    expect(s.cash).toBe(40000);
    expect(s.collected).toBe(40000);
    expect(s.remaining).toBe(0); // iskonto cari değil
  });

  it('ACIK_CARI satırındaki 1.500 iskonto kalan cariye yazılmaz, nakit düşülmez', () => {
    const s = saleCollectedSplit({
      total: 130_000,
      discount: 1_500,
      paymentMethod: 'nakit',
      payments: [
        { method: 'NAKIT', amount: 128_500 },
        { method: 'ACIK_CARI', amount: 1_500 },
      ],
    });
    expect(s.cash).toBe(128_500);
    expect(s.collected).toBe(128_500);
    expect(s.remaining).toBe(0);
    expect(s.credit).toBe(0);
  });

  it('saf veresiye (payments yok) + iskonto: kalan = brüt − iskonto', () => {
    // 50.000 brüt veresiye, 10.000 iskonto → kalan 40.000 (cari borç)
    const s = saleCollectedSplit({
      total: 50000,
      paymentMethod: 'veresiye',
      discount: 10000,
    });
    expect(s.cash).toBe(0);
    expect(s.credit).toBe(40000);
    expect(s.remaining).toBe(40000);
    expect(s.collected).toBe(0);
  });
});

describe('extraCustomerCollectionsNotOnSales — çift sayım yok', () => {
  it('sonradan CH_TAHSILAT 40 fişsiz satışa eklenir', () => {
    const extra = extraCustomerCollectionsNotOnSales(
      [{ islem_tipi: 'CH_TAHSILAT', tutar: 40, islem_no: 'THS-1' }],
      [{ total: 100, paymentMethod: 'veresiye', receiptNumber: 'SAT-1' }],
    );
    expect(extra).toBe(40);
  });

  it('peşin nakit satışın KASA_GIRIS fişine hayalet tahsilat eklemez', () => {
    const extra = extraCustomerCollectionsNotOnSales(
      [{ islem_tipi: 'CH_TAHSILAT', tutar: 100, islem_no: 'SAT-CASH' }],
      [{
        total: 100,
        paymentMethod: 'cash',
        receiptNumber: 'SAT-CASH',
        payments: [{ method: 'cash', amount: 100 }],
      }],
    );
    expect(extra).toBe(0);
  });

  it('güzellik paid_amount 40 / remaining 60: cebe 40', () => {
    expect(beautySalePocketCollected({
      total: 100,
      payment_method: 'veresiye',
      paid_amount: 40,
      remaining_amount: 60,
    })).toBe(40);
    expect(beautySaleRemainingCari({
      total: 100,
      payment_method: 'veresiye',
      paid_amount: 40,
      remaining_amount: 60,
    })).toBe(60);
  });

  it('eski karma (payments yok) veresiye fişindeki CH_TAHSILAT 40 sayılır', () => {
    const extra = extraCustomerCollectionsNotOnSales(
      [{ islem_tipi: 'CH_TAHSILAT', tutar: 40, islem_no: 'SAT-MIX' }],
      [{ total: 100, paymentMethod: 'veresiye', receiptNumber: 'SAT-MIX' }],
    );
    expect(extra).toBe(40);
  });

  it('güzellik paid_amount + aynı fiş CH_TAHSILAT: çift sayım yok (55→110 bug)', () => {
    const sales = [
      {
        total: 35000,
        paymentMethod: 'veresiye',
        receiptNumber: 'BEA-2026-MUB3Q6X7',
        paid_amount: 30000,
        remaining_amount: 5000,
      },
      {
        total: 30000,
        paymentMethod: 'veresiye',
        receiptNumber: 'BEA-2026-MUB3Y46W',
        paid_amount: 25000,
        remaining_amount: 5000,
      },
    ];
    const pocket = sales.reduce((s, row) => s + beautySalePocketCollected({
      total: row.total,
      payment_method: row.paymentMethod,
      paid_amount: row.paid_amount,
      remaining_amount: row.remaining_amount,
    }), 0);
    expect(pocket).toBe(55000);
    const extra = extraCustomerCollectionsNotOnSales(
      [
        { islem_tipi: 'CH_TAHSILAT', tutar: 30000, islem_no: 'BEA-2026-MUB3Q6X7' },
        { islem_tipi: 'CH_TAHSILAT', tutar: 25000, islem_no: 'BEA-2026-MUB3Y46W' },
      ],
      sales,
    );
    expect(extra).toBe(0);
    expect(pocket + extra).toBe(55000);
  });

  it('güzellik KPI: paid 0 + rem 0 + veresiye → belge kalanı (eski bozuk kayıt)', () => {
    expect(beautySalePocketCollected({
      total: 45000,
      payment_method: 'veresiye',
      paid_amount: 0,
      remaining_amount: 0,
    })).toBe(0);
    expect(beautySaleRemainingCari({
      total: 45000,
      payment_method: 'veresiye',
      paid_amount: 0,
      remaining_amount: 0,
    })).toBe(45000);
  });
});

describe('resolvePosCheckoutSettlement — kısmi nakit + kalan cari', () => {
  it('15k belge / 5k nakit / 10k veresiye: Alınan=5k, kalan=10k, belge veresiye (CH_TAHSILAT 5k)', () => {
    const s = resolvePosCheckoutSettlement(15000, [
      { method: 'cash', amount: 5000, currency: 'IQD', cash_register_name: 'MERKEZ KASA' },
      { method: 'veresiye', amount: 10000, currency: 'IQD' },
    ]);
    expect(s.paymentMethod).toBe('veresiye');
    expect(s.document).toBe(15000);
    expect(s.collected).toBe(5000);
    expect(s.cash).toBe(5000);
    expect(s.remaining).toBe(10000);
    expect(s.credit).toBe(10000);
    // Peşin kısım kasaya; veresiye satırında kasa adı olmamalı (UI etiketi ayrı)
    expect(s.payments[0]?.cash_register_name).toBe('MERKEZ KASA');
    expect(s.payments[1]?.method).toBe('veresiye');
    expect(s.payments[1]?.cash_register_name).toBeUndefined();
  });

  it('45k belge / 25k nakit / 20k veresiye: method=veresiye, cebe 25k, kalan 20k', () => {
    const s = resolvePosCheckoutSettlement(45000, [
      { method: 'cash', amount: 25000, currency: 'IQD' },
      { method: 'veresiye', amount: 20000, currency: 'IQD' },
    ]);
    expect(s.paymentMethod).toBe('veresiye');
    expect(s.collected).toBe(25000);
    expect(s.cash).toBe(25000);
    expect(s.remaining).toBe(20000);
    expect(s.credit).toBe(20000);
  });

  it('çoğunluk peşin olsa bile kalan cari varsa belge veresiye kalır', () => {
    const s = resolvePosCheckoutSettlement(100, [
      { method: 'cash', amount: 70 },
      { method: 'veresiye', amount: 30 },
    ]);
    expect(s.paymentMethod).toBe('veresiye');
    expect(s.collected).toBe(70);
    expect(s.remaining).toBe(30);
  });

  it('yalnızca nakit: payment_method=cash, kalan 0', () => {
    const s = resolvePosCheckoutSettlement(45000, [
      { method: 'cash', amount: 45000, currency: 'IQD' },
    ]);
    expect(s.paymentMethod).toBe('cash');
    expect(s.collected).toBe(45000);
    expect(s.remaining).toBe(0);
  });

  it('veresiye etiket + kısmi nakit payments (kredi satırı yok): cebe korunur', () => {
    const s = splitPaymentRows(45000, [{ method: 'cash', amount: 25000 }], 'veresiye');
    expect(s.collected).toBe(25000);
    expect(s.remaining).toBe(20000);
  });

  it('güzellik KPI: settlement skalerleri 25k/20k', () => {
    expect(beautySalePocketCollected({
      total: 45000,
      payment_method: 'veresiye',
      paid_amount: 25000,
      remaining_amount: 20000,
    })).toBe(25000);
    expect(beautySaleRemainingCari({
      total: 45000,
      payment_method: 'veresiye',
      paid_amount: 25000,
      remaining_amount: 20000,
    })).toBe(20000);
  });
});

describe('iptal edilen randevu — Bug 12 (dashboard günlük satış)', () => {
  it('iptal payment_status=cancelled: ciro 0, kalan cari 0', () => {
    expect(beautySalePocketCollected({
      total: 75000,
      payment_method: 'veresiye',
      paid_amount: 20000,
      remaining_amount: 55000,
      payment_status: 'cancelled',
    })).toBe(0);
    expect(beautySaleRemainingCari({
      total: 75000,
      payment_method: 'veresiye',
      paid_amount: 20000,
      remaining_amount: 55000,
      payment_status: 'cancelled',
    })).toBe(0);
  });

  it('iptal payment_status=CANCELLED (büyük harf) ve TR iptal etiketleri de filtrelenir', () => {
    for (const ps of ['CANCELLED', 'Canceled', 'refunded', 'void', 'iptal', 'silindi', 'deleted']) {
      expect(beautySalePocketCollected({
        total: 75000,
        payment_method: 'veresiye',
        paid_amount: 20000,
        remaining_amount: 55000,
        payment_status: ps,
      })).toBe(0);
      expect(beautySaleRemainingCari({
        total: 75000,
        payment_method: 'veresiye',
        paid_amount: 20000,
        remaining_amount: 55000,
        payment_status: ps,
      })).toBe(0);
    }
  });

  it('iptal edilmiş satışın payments[] olsa bile ciro 0 (defence-in-depth)', () => {
    expect(beautySalePocketCollected({
      total: 75000,
      payment_method: 'veresiye',
      payments: [
        { method: 'cash', amount: 20000 },
        { method: 'veresiye', amount: 55000 },
      ],
      payment_status: 'cancelled',
    })).toBe(0);
  });

  it('aktif satış iptal filtresinden etkilenmez (regresyon)', () => {
    expect(beautySalePocketCollected({
      total: 75000,
      payment_method: 'veresiye',
      paid_amount: 20000,
      remaining_amount: 55000,
      payment_status: 'paid',
    })).toBe(20000);
    expect(beautySaleRemainingCari({
      total: 75000,
      payment_method: 'veresiye',
      paid_amount: 20000,
      remaining_amount: 55000,
      payment_status: 'paid',
    })).toBe(55000);
  });

  it('payment_status boş olan (eski kayıt) iptal sayılmaz — geriye dönük uyum', () => {
    expect(beautySalePocketCollected({
      total: 75000,
      payment_method: 'veresiye',
      paid_amount: 20000,
      remaining_amount: 55000,
      payment_status: '',
    })).toBe(20000);
  });
});

describe('dailyPaymentKind — Bug 14 (Günlük Rapor Ödeme kolonu karma)', () => {
  it('ARAM senaryosu: 50k brüt + 5k peşin + 45k kalan → kind=mixed', () => {
    const k = dailyPaymentKind({
      total: 50000,
      paymentMethod: 'veresiye',
      payments: [{ method: 'cash', amount: 5000 }],
    });
    expect(k.kind).toBe('mixed');
    expect(k.collected).toBe(5000);
    expect(k.remaining).toBe(45000);
    expect(k.total).toBe(50000);
  });

  it('ROZA senaryosu: 25k brüt + payments yok → kind=credit (saf veresiye)', () => {
    const k = dailyPaymentKind({
      total: 25000,
      paymentMethod: 'veresiye',
    });
    expect(k.kind).toBe('credit');
    expect(k.collected).toBe(0);
    expect(k.remaining).toBe(25000);
  });

  it('tamamen peşin nakit 30k → kind=cash', () => {
    const k = dailyPaymentKind({
      total: 30000,
      paymentMethod: 'cash',
      payments: [{ method: 'cash', amount: 30000 }],
    });
    expect(k.kind).toBe('cash');
    expect(k.collected).toBe(30000);
    expect(k.remaining).toBe(0);
  });

  it('header veresiye + payments tam nakit: split credit kontrolü ile kind=credit (header korunur)', () => {
    const k = dailyPaymentKind({
      total: 100,
      paymentMethod: 'veresiye',
      payments: [{ method: 'cash', amount: 100 }],
    });
    expect(k.kind).toBe('credit');
    expect(k.collected).toBe(0);
    expect(k.remaining).toBe(100);
  });

  it('toplam = tahsilat + kalan (muhasebe çift yönü simetrisi)', () => {
    const samples = [
      { total: 50000, payments: [{ method: 'cash', amount: 5000 }] },
      { total: 100000, payments: [{ method: 'card', amount: 60000 }, { method: 'cash', amount: 40000 }] },
      { total: 75000, payments: [{ method: 'cash', amount: 25000 }, { method: 'veresiye', amount: 50000 }] },
      { total: 40000 },
    ];
    for (const s of samples) {
      const k = dailyPaymentKind({ total: s.total, paymentMethod: 'veresiye', payments: s.payments });
      expect(k.collected + k.remaining).toBeCloseTo(k.total, 6);
    }
  });
});

describe('dailyPaymentKind — Bug 2026-10-13 aqua (iskonto veresiye yazılıyordu)', () => {
  it('BEA-2026-MV6POWBD: 100k brüt + 50k iskonto + 50k nakit → kind=cash, remaining=0', () => {
    const k = dailyPaymentKind({
      total: 100000,
      paymentMethod: 'cash',
      payments: [{ method: 'cash', amount: 50000 }],
      discount: 50000,
    });
    // İskonto cari borç DEĞİL; tahsilat 50k + iskonto 50k = 100k brüt eşit.
    expect(k.kind).toBe('cash');
    expect(k.collected).toBe(50000);
    expect(k.remaining).toBe(0);
  });

  it('BEA-2026-MV6P3O6X: 60k brüt + 40k iskonto + 20k nakit → kind=cash', () => {
    const k = dailyPaymentKind({
      total: 60000,
      paymentMethod: 'cash',
      payments: [{ method: 'cash', amount: 20000 }],
      discount: 40000,
    });
    expect(k.kind).toBe('cash');
    expect(k.collected).toBe(20000);
    expect(k.remaining).toBe(0);
  });

  it('BEA-2026-MV6NOBCS: 180k brüt + 15k iskonto + 165k nakit → kind=cash', () => {
    const k = dailyPaymentKind({
      total: 180000,
      paymentMethod: 'cash',
      payments: [{ method: 'cash', amount: 165000 }],
      discount: 15000,
    });
    expect(k.kind).toBe('cash');
    expect(k.collected).toBe(165000);
    expect(k.remaining).toBe(0);
  });

  it('iskonto + kısmi tahsilat: 100k brüt + 30k iskonto + 50k nakit + 20k veresiye', () => {
    const k = dailyPaymentKind({
      total: 100000,
      paymentMethod: 'cash',
      payments: [
        { method: 'cash', amount: 50000 },
        { method: 'veresiye', amount: 20000 },
      ],
      discount: 30000,
    });
    // 100k = 50k nakit + 20k veresiye + 30k iskonto
    expect(k.kind).toBe('mixed');
    expect(k.collected).toBe(50000);
    expect(k.remaining).toBe(20000);
  });

  it('iskonto default 0: eski davranış (geriye uyumlu)', () => {
    const k = dailyPaymentKind({
      total: 100000,
      paymentMethod: 'cash',
      payments: [{ method: 'cash', amount: 50000 }],
    });
    // discount=0 → remaining = 50.000 (eski davranış; iskonto veresiye yazılırdı)
    // Bu test yalnızca uyumluluk amaçlıdır; aqua verisinde artık discount aktarılıyor.
    expect(k.kind).toBe('mixed');
    expect(k.collected).toBe(50000);
    expect(k.remaining).toBe(50000);
  });
});

/**
 * 16.10.2026 — Uygulanan avansın kasa hareketi Nakit'te mükerrer
 * sayılmamalı (DUBLE senaryosu: 10k avans uygulandı → satış cash=50k
 * + avans CH_TAHSILAT 10k çift sayım → Nakit 60k yerine 50k).
 * extraCustomerCollectionsNotOnSales'a `appliedAvansCashLineIds`
 * Set'i geçirilir; Set'teki `id`'ler ekstra'ya katılmaz.
 */
describe('extraCustomerCollectionsNotOnSales — applied avans mükerrer sayım önlemi (16.10.2026)', () => {
  it('applied avansın CH_TAHSILAT cash_line_id Set\'teyse ekstra\'ya katılmaz', () => {
    const cashLines = [
      // 10.000 avansın CH_TAHSILAT kasa hareketi (avans status='applied')
      {
        id: 'cashline-avans-1',
        islem_tipi: 'CH_TAHSILAT',
        islem_no: 'AVN-001',
        tutar: 10_000,
        ozel_kod: 'AVANS',
      },
    ];
    // 50.000 satış + 40.000 nakit → veresiye 10.000 (avans uygulandı
    // için aslında 0 olmalı; bu test yalnızca mükerrer sayım önlemi)
    const sales = [
      {
        receiptNumber: 'BEA-2026-ABC',
        total: 50_000,
        payments: [{ method: 'cash', amount: 40_000 }],
      },
    ];
    // appliedAvansCashLineIds boş → eski davranış: 10k ekstra'ya girer
    expect(extraCustomerCollectionsNotOnSales(cashLines, sales)).toBe(0); // ozel_kod='AVANS' → atlanır
  });

  it('applied avansın CH_TAHSILAT satırı (ozel_kod=null) Set\'teyse ekstra\'ya katılmaz', () => {
    // DUBLE senaryosu: avans ozel_kod=null olarak yazılmış, specialCode
    // filter'a takılmıyor → eski davranış 10k eklerdi.
    const cashLines = [
      {
        id: 'cashline-avans-1',
        islem_tipi: 'CH_TAHSILAT',
        islem_no: 'AVN-001',
        tutar: 10_000,
        ozel_kod: null,
      },
    ];
    const sales = [
      {
        receiptNumber: 'BEA-2026-ABC',
        total: 50_000,
        payments: [{ method: 'cash', amount: 40_000 }],
      },
    ];
    // Set boş → eski davranış: 10k eklenir
    expect(extraCustomerCollectionsNotOnSales(cashLines, sales)).toBe(10_000);
    // Set dolu → 10k Hariç (avans zaten saleCollectedSplit(appliedAvans=10k)
    // ile Nakit'e eklendi, burada mükerrer olmasın)
    const appliedIds = new Set(['cashline-avans-1']);
    expect(extraCustomerCollectionsNotOnSales(cashLines, sales, appliedIds)).toBe(0);
  });

  it('applied Set\'te olmayan cash_line_id\'ler etkilenmez (geriye uyumlu)', () => {
    const cashLines = [
      // Avans değil, başka bir cari tahsilat
      {
        id: 'cashline-diger-1',
        islem_tipi: 'CH_TAHSILAT',
        islem_no: 'CH-099',
        tutar: 5_000,
        ozel_kod: null,
      },
    ];
    const sales = [];
    // Set dolu ama bu cash_line Set'te yok → eklenmeli (5k)
    const appliedIds = new Set(['cashline-avans-1']);
    expect(extraCustomerCollectionsNotOnSales(cashLines, sales, appliedIds)).toBe(5_000);
  });
});

/**
 * 16.10.2026 — extraReservationCustomerCollections'a
 * appliedAvansCashLineIds (kara liste) parametresi eklendi. applied
 * avansın kasa hareketi Nakit'te mükerrer sayılmasın. Set sağlandığında
 * Set'teki id'ler **her durumda** atlanır (initial render / henüz
 * yüklenmedi senaryosu dahil).
 */
describe('extraReservationCustomerCollections — applied avans kara liste (16.10.2026)', () => {
  it('applied avansın CH_TAHSILAT satırı (ozel_kod=AVANS) kara listedeyse atlanır', () => {
    const cashLines = [
      {
        id: 'cashline-applied-1',
        islem_tipi: 'CH_TAHSILAT',
        islem_no: 'AVN-001',
        tutar: 10_000,
        ozel_kod: 'AVANS',
      },
    ];
    // Set boş (initial render senaryosu): eski davranış → 10k eklenir
    expect(extraReservationCustomerCollections(cashLines)).toBe(10_000);
    // Kara liste dolu → 10k Hariç (mükerrer önlemi)
    expect(
      extraReservationCustomerCollections(
        cashLines,
        new Set(), // open liste boş
        new Set(['cashline-applied-1']),
      ),
    ).toBe(0);
  });

  it('open avans + applied avans birlikte: open sayılır, applied atlanır', () => {
    const cashLines = [
      // Open avans (status='open') — sayılmalı
      {
        id: 'cashline-open-1',
        islem_tipi: 'CH_TAHSILAT',
        islem_no: 'AVN-OPEN',
        tutar: 5_000,
        ozel_kod: 'AVANS',
      },
      // Applied avans — atlanmalı
      {
        id: 'cashline-applied-1',
        islem_tipi: 'CH_TAHSILAT',
        islem_no: 'AVN-APPLIED',
        tutar: 10_000,
        ozel_kod: 'AVANS',
      },
    ];
    const openIds = new Set(['cashline-open-1']);
    const appliedIds = new Set(['cashline-applied-1']);
    expect(
      extraReservationCustomerCollections(cashLines, openIds, appliedIds),
    ).toBe(5_000);
  });
});
