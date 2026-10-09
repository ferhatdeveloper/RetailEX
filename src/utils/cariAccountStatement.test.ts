import { describe, expect, it, vi } from 'vitest';
import {
  buildEkstreRows,
  expandReservationDepositRows,
  ficheTypeToInfo,
  resolveEkstreDescription,
} from './cariAccountStatement';

/**
 * Kök neden (09.10.2026 düzeltmesi): cash_lines CH_TAHSILAT +
 * special_code='REZERVASYON' müşteriden tahsil edilen rezervasyon avansıdır.
 * Klasik ekstre hesabında bu satır müşteri bakiyesini -amt yapıyor, hizmet
 * tamamlanınca da +veresiye yazılınca bakiye yanlış (60) çıkıyordu —
 * kullanıcı beklentisi 75.
 *
 * Düzeltme: avans tek satırda borç=alacak=amt (nötr, bakiye artmaz);
 * hizmet tamamlanınca bakiye yalnızca hizmet tutarı olur (avans hariç).
 */
describe('buildEkstreRows — 09.10.2026 avans tek satır formatı', () => {
  it('müşteri CH_TAHSILAT + REZERVASYON 15 → tek satır: borç 15, alacak 15, bakiye 0', () => {
    const built = buildEkstreRows(
      [
        {
          date: '2026-10-09',
          fiche_no: 'AVN-1',
          fiche_type: 'CH_TAHSILAT',
          total_amount: 15,
          special_code: 'REZERVASYON',
        },
      ],
      'customer',
    );
    // 09.10.2026 düzeltmesi: avans tek satırda her iki kolon eşit
    // (nötr), bakiye değişmez → sonraki hizmet satırı bakiyeyi düzgün
    // artırır (avans hariç).
    expect(built).toHaveLength(1);
    expect(built[0].isReservationDeposit).toBe(true);
    expect(built[0].reservationDeposit).toBe(15);
    expect(built[0].borcAmount).toBe(15);
    expect(built[0].alacakAmount).toBe(15);
    expect(built[0].balance).toBe(0);
  });

  it('avans 15 + hizmet 75 → bakiye 0, 75 (avans nötr, hizmet bakiyeyi 75 yapar)', () => {
    const built = buildEkstreRows(
      [
        {
          date: '2026-10-09',
          fiche_no: 'AVN-1',
          fiche_type: 'CH_TAHSILAT',
          total_amount: 15,
          special_code: 'REZERVASYON',
        },
        {
          date: '2026-10-09',
          fiche_no: 'BEA-1',
          fiche_type: 'service',
          total_amount: 75,
          payment_method: 'veresiye',
          trcode: 9,
        },
      ],
      'customer',
    );
    // 09.10.2026 düzeltmesi: avans tek satır (15/15/0), hizmet tek satır
    // (borç 75, bakiye 75). Eski kodda avans bakiyeyi -15'e çekiyor,
    // hizmet +75 eklenince yanlış 60 çıkıyordu.
    expect(built).toHaveLength(2);
    expect(built[0].borcAmount).toBe(15);
    expect(built[0].alacakAmount).toBe(15);
    expect(built[0].balance).toBe(0);
    expect(built[1].borcAmount).toBe(75);
    expect(built[1].balance).toBe(75);
  });

  it('tedarikçi tarafı — avans nötr mantığı uygulanmaz (mevcut muhasebe kuralı korunur)', () => {
    // Tedarikçi tarafı müşteriyle simetrik değil; avans bayrağı
    // yalnızca müşteri tarafında cari bakiyeyi kirletmez. Tedarikçi
    // tarafında standart CH_TAHSILAT davranışı korunur.
    const built = buildEkstreRows(
      [
        {
          date: '2026-10-09',
          fiche_no: 'AVN-1',
          fiche_type: 'CH_TAHSILAT',
          total_amount: 15,
          special_code: 'REZERVASYON',
        },
      ],
      'supplier',
    );
    expect(built).toHaveLength(1);
    // Tedarikçi tarafında avans flag'i false (yalnız müşteri tarafı)
    expect(built[0].isReservationDeposit).toBe(false);
  });

  it('avans olmayan satırlar etkilenmez', () => {
    const built = buildEkstreRows(
      [
        {
          date: '2026-10-09',
          fiche_no: 'SF-1',
          fiche_type: 'sales_invoice',
          total_amount: 100,
          payment_method: 'veresiye',
        },
      ],
      'customer',
    );
    expect(built).toHaveLength(1);
    expect(built[0].borcAmount).toBe(100);
  });
});

describe('ficheTypeToInfo — i18n', () => {
  it('t verilmezse hardcoded Türkçe korunur (geriye uyumluluk)', () => {
    expect(ficheTypeToInfo('purchase_invoice', 0, false).label).toBe('Alış faturası');
    expect(ficheTypeToInfo('return_invoice', 0, false).label).toBe('İade');
    expect(ficheTypeToInfo('waybill', 0, false).label).toBe('İrsaliye');
    expect(ficheTypeToInfo('order', 0, false).label).toBe('Sipariş');
    expect(ficheTypeToInfo('CH_ODEME', 0, false).label).toBe('Ödeme');
    expect(ficheTypeToInfo('CH_TAHSILAT', 0, false).label).toBe('Tahsilat');
    expect(ficheTypeToInfo('', 9, false).label).toBe('Hizmet');
    expect(ficheTypeToInfo('sales_invoice', 0, false).label).toBe('Satış faturası');
    expect(ficheTypeToInfo('opening_balance', 0, false).label).toBe('Devir');
    expect(ficheTypeToInfo('X', 0, true).label).toBe('Silindi');
  });

  it('t verilirse çevrilmiş etiket döner (İngilizce)', () => {
    const t = (key: string) => {
      const map: Record<string, string> = {
        ficheTypePurchaseInvoice: 'Purchase invoice',
        ficheTypeReturnInvoice: 'Return',
        ficheTypeWaybill: 'Waybill',
        ficheTypeOrder: 'Order',
        ficheTypePaymentOut: 'Payment',
        ficheTypePaymentIn: 'Collection',
        ficheTypeService: 'Service',
        ficheTypeSalesInvoice: 'Sales invoice',
        ficheTypeOpeningBalance: 'Opening Balance',
        ficheTypeCancelled: 'Cancelled',
      };
      return map[key] || key;
    };
    expect(ficheTypeToInfo('purchase_invoice', 0, false, t).label).toBe('Purchase invoice');
    expect(ficheTypeToInfo('sales_invoice', 0, false, t).label).toBe('Sales invoice');
  });

  it('t hata fırlatırsa hardcoded Türkçe fallback olur (güvenli)', () => {
    const t = vi.fn(() => {
      throw new Error('translation missing');
    });
    expect(ficheTypeToInfo('purchase_invoice', 0, false, t).label).toBe('Alış faturası');
  });

  it('büyük/küçük harf duyarsız: CH_odeme ve ch_TAHSILAT aynı sonucu verir', () => {
    expect(ficheTypeToInfo('CH_odeme', 0, false).label).toBe('Ödeme');
    expect(ficheTypeToInfo('ch_TAHSILAT', 0, false).label).toBe('Tahsilat');
  });
});

describe('resolveEkstreDescription', () => {
  it('ham purchase_invoice notes yerine Alış faturası yazar', () => {
    expect(resolveEkstreDescription('purchase_invoice', 'purchase_invoice', 1)).toBe('Alış faturası');
    expect(resolveEkstreDescription('', 'purchase_invoice', 1)).toBe('Alış faturası');
  });

  it('gerçek açıklama metnini korur', () => {
    expect(resolveEkstreDescription('Mal alımı', 'purchase_invoice', 1)).toBe('Mal alımı');
  });

  it('GüzellikPOS teknik UUID’leri gizler', () => {
    expect(
      resolveEkstreDescription(
        'GüzellikPOSbeauty_sale_id cda5bcac-5a3b-4f99-bde5-68c3e3a3f2c2|res_appt 3f333b42-c733-4135-82ed-ffe9279671e3',
        'sales_invoice',
        8,
      ),
    ).toBe('GüzellikPOS');
  });
});

describe('buildEkstreRows — müşteri peşin satış', () => {
  it('nakit satış: borç 0, alacak 0, bakiye 0 (Bug 13 kök neden düzeltmesi)', () => {
    // Önceki davranışta borç=50k/alacak=50k yazılıyordu → "borç 50.000" görünüyordu.
    // Yeni kural: peşin müşteri satışı zaten tahsil edildi → 0/0, "borç" hiç görünmez.
    const rows = buildEkstreRows(
      [
        {
          date: '2026-09-18',
          fiche_no: 'SF-1',
          fiche_type: 'sales_invoice',
          total_amount: 150000,
          payment_method: 'cash',
        },
      ],
      'customer',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].borcAmount).toBe(0);
    expect(rows[0].alacakAmount).toBe(0);
    expect(rows[0].balance).toBe(0);
  });

  it('veresiye satış müşteri borcunu artırır', () => {
    const rows = buildEkstreRows(
      [
        {
          date: '2026-09-18',
          fiche_no: 'SF-2',
          fiche_type: 'sales_invoice',
          total_amount: 150000,
          payment_method: 'veresiye',
        },
      ],
      'customer',
    );
    expect(rows[0].borcAmount).toBe(150000);
    expect(rows[0].alacakAmount).toBe(0);
    expect(rows[0].balance).toBe(150000);
  });

  it('boş ödeme yöntemi belge tutarını nakit tahsilat yazmaz', () => {
    const rows = buildEkstreRows(
      [
        {
          date: '2026-09-18',
          fiche_no: 'SF-3',
          fiche_type: 'sales_invoice',
          total_amount: 100,
          payment_method: '',
        },
      ],
      'customer',
    );
    expect(rows[0].borcAmount).toBe(100);
    expect(rows[0].alacakAmount).toBe(0);
    expect(rows[0].balance).toBe(100);
  });

  it('veresiye 100 + CH_TAHSILAT 40: cebe 40, kalan cari 60', () => {
    const rows = buildEkstreRows(
      [
        {
          date: '2026-09-18',
          fiche_no: 'SF-4',
          fiche_type: 'sales_invoice',
          total_amount: 100,
          payment_method: 'veresiye',
        },
        {
          date: '2026-09-18',
          fiche_no: 'THS-4',
          fiche_type: 'CH_TAHSILAT',
          total_amount: 40,
        },
      ],
      'customer',
    );
    expect(rows[0].borcAmount).toBe(100);
    expect(rows[0].alacakAmount).toBe(0);
    expect(rows[1].alacakAmount).toBe(40);
    expect(rows[1].borcAmount).toBe(0);
    expect(rows[1].balance).toBe(60);
  });
});

describe('buildEkstreRows — Bug 13: peşin + ayrı CH_TAHSILAT bakiyeyi şişirmez', () => {
  it('peşin 50.000 + aynı tutarda CH_TAHSILAT 50.000: borç=0, alacak=0, bakiye=0', () => {
    // Senaryo: hizmet verildi (50.000 peşin), aynı gün ayrıca CH_TAHSILAT yazılmış.
    // Eski kod: borç 50k + alacak 50k + bakiye 0 AMA ayrıca yazılan CH_TAHSILAT
    // yüzünden bakiye −50k'e gidiyordu. Yeni kod: her ikisi de 0/0.
    const rows = buildEkstreRows(
      [
        {
          date: '2026-09-18',
          fiche_no: 'SF-100',
          fiche_type: 'sales_invoice',
          total_amount: 50000,
          payment_method: 'cash',
        },
        {
          date: '2026-09-18',
          fiche_no: 'SF-100',
          fiche_type: 'CH_TAHSILAT',
          total_amount: 50000,
        },
      ],
      'customer',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].borcAmount).toBe(0);
    expect(rows[0].alacakAmount).toBe(0);
    expect(rows[0].balance).toBe(0);
    expect(rows[1].borcAmount).toBe(0);
    expect(rows[1].alacakAmount).toBe(0);
    expect(rows[1].balance).toBe(0);
  });

  it('kısmi ödeme: 50k hizmet + 5k peşin + 45k veresiye: borç 45k, alacak 5k, bakiye 45k', () => {
    // 50k belge, 5k peşin → kalan 45k veresiye. Çıktı:
    //   Satış  : borç 45k (kalan), alacak 0, bakiye 45k
    //   Tahsilat: borç 0, alacak 5k (eşleşmedi → gerçek tahsilat), bakiye 40k... ???
    // BUG 13 BEKLENTİ: hizmet borç 50k + tahsilat alacak 5k + bakiye 45k.
    // Yeni kod: veresiye kalan=45k → borç=45k (kalan yazılır), tahsilat eşleşmediği için
    // alacak 5k, bakiye = 40k. Bu yanlış! Kullanıcı hizmeti tam 50k borç olarak görmek istiyor.
    // ÇÖZÜM: kalan tutar yalnızca payment_method='veresiye' ise (üst bilgi) kullanılır;
    // aksi halde (ör. cash+remaining=0 → peşin senaryosu yukarıda), belge tam borç yazılır.
    // Bu test aşağıda ayrıca ele alınacak; burada kısmi peşin + veresiye örneği yer
    // almaktadır — payment_method='veresiye' verilmiş ve 50k tamamen borç.
    const rows = buildEkstreRows(
      [
        {
          date: '2026-09-18',
          fiche_no: 'SF-200',
          fiche_type: 'sales_invoice',
          total_amount: 50000,
          payment_method: 'veresiye',
        },
        {
          date: '2026-09-18',
          fiche_no: 'SF-200',
          fiche_type: 'CH_TAHSILAT',
          total_amount: 5000,
        },
      ],
      'customer',
    );
    // payment_method='veresiye' → satış tüm 50k borç yazılır, kalan 45k.
    // CH_TAHSILAT 5k: 50k ile eşleşmiyor (5k ≠ 50k) → gerçek tahsilat alacak 5k.
    // Bakiye: 50k - 5k = 45k.
    expect(rows[0].borcAmount).toBe(50000);
    expect(rows[0].alacakAmount).toBe(0);
    expect(rows[0].balance).toBe(50000);
    expect(rows[1].borcAmount).toBe(0);
    expect(rows[1].alacakAmount).toBe(5000);
    expect(rows[1].balance).toBe(45000);
  });

  it('iptal edilen satış: borç=0, alacak=0, bakiye değişmez', () => {
    const rows = buildEkstreRows(
      [
        {
          date: '2026-09-18',
          fiche_no: 'SF-300',
          fiche_type: 'sales_invoice',
          total_amount: 50000,
          payment_method: 'cash',
          is_cancelled: true,
        },
      ],
      'customer',
    );
    expect(rows[0].borcAmount).toBe(0);
    expect(rows[0].alacakAmount).toBe(0);
    expect(rows[0].balance).toBe(0);
  });

  it('payment_status=cancelled olan satış 0/0 yazılır (iç savunma)', () => {
    const rows = buildEkstreRows(
      [
        {
          date: '2026-09-18',
          fiche_no: 'SF-400',
          fiche_type: 'sales_invoice',
          total_amount: 50000,
          payment_method: 'cash',
          payment_status: 'cancelled',
        },
      ],
      'customer',
    );
    expect(rows[0].borcAmount).toBe(0);
    expect(rows[0].alacakAmount).toBe(0);
    expect(rows[0].balance).toBe(0);
  });

  it('veresiye satış + kalan payments[] 45k: borç yalnızca kalan (45k) yazılır', () => {
    // Kısmi peşin + kalan veresiye: 5k nakit peşin + 45k veresiye payments[] içinde.
    // splitPaymentRows remaining=45k → borcAmount=45k.
    const rows = buildEkstreRows(
      [
        {
          date: '2026-09-18',
          fiche_no: 'SF-500',
          fiche_type: 'sales_invoice',
          total_amount: 50000,
          payment_method: 'veresiye',
          payments: [
            { method: 'cash', amount: 5000 },
            { method: 'credit', amount: 45000 },
          ],
        },
      ],
      'customer',
    );
    expect(rows[0].borcAmount).toBe(45000);
    expect(rows[0].alacakAmount).toBe(0);
    expect(rows[0].balance).toBe(45000);
  });
});
