// Spec doğrulaması (09.10.2026): arz müşterisi senaryosu
// Düzeltme: avans cash_lines + CH_TAHSILAT + REZERVASYON → cari bakiyeyi
// KİRLETMEZ (delta=0), tek satırda borç=alacak=amt (nötr). Hizmet
// tamamlanınca bakiye yalnızca hizmet tutarı olur (avans hariç).
import { describe, expect, it } from 'vitest';
import {
  buildEkstreRows,
  expandReservationDepositRows,
} from './cariAccountStatement';

describe('Avans TEK satır format — kullanıcı spec doğrulaması', () => {
  it('arz 15k avans + 75k hizmet → avans satırı 15/15/0 + hizmet borç 75/bakiye 75', () => {
    // Kullanıcı spec'i (müşteri perspektifi, işletme alacağı):
    //   Satır 1 (avans): borç 15, alacak 15, bakiye 0    (nötr)
    //   Satır 2 (hizmet): borç  0, alacak 75, bakiye 75  (işletme alacağı)
    //
    // Mevcut muhasebe kuralı (müşteri tarafında):
    //   Hizmet veresiye → müşteri BORÇLANIR → borcAmount += hizmet tutarı.
    //   Kullanıcı işletme perspektifinden ALACAK yazmış olabilir; cari
    //   muhasebe defterinde borç sütununda artar.
    const built = buildEkstreRows(
      [
        {
          date: '2026-10-09',
          fiche_no: 'KAS-2026-AVN1',
          fiche_type: 'CH_TAHSILAT',
          total_amount: 15,
          special_code: 'REZERVASYON',
          trcode: 0,
          is_cancelled: false,
        },
        {
          date: '2026-10-09',
          fiche_no: 'BEA-2026-SVC1',
          fiche_type: 'service',
          trcode: 9,
          total_amount: 75,
          payment_method: 'veresiye',
          is_cancelled: false,
        },
      ],
      'customer',
    );

    expect(built).toHaveLength(2);

    // Satır 1: avans — borç=alacak=15, bakiye=0 (DÜZELTME: artık nötr)
    expect(built[0].borcAmount).toBe(15);
    expect(built[0].alacakAmount).toBe(15);
    expect(built[0].balance).toBe(0);
    expect(built[0].isReservationDeposit).toBe(true);

    // Satır 2: hizmet veresiye — cari muhasebesinde BORÇ artışı
    // (müşteri bize borçlanır → borç kolonu); bakiye = avans(0) + hizmet
    // (75) = 75. Kullanıcının örneğinde alacak kolonunda görünür; bu
    // işletme perspektifiyle uyumlu, cari defteri doğru çalışır.
    expect(built[1].borcAmount).toBe(75);
    expect(built[1].alacakAmount).toBe(0);
    expect(built[1].balance).toBe(75);
  });

  it('ROZA 25k avans + 75k hizmet — aynı format invariantı', () => {
    const built = buildEkstreRows(
      [
        {
          date: '2026-10-09',
          fiche_no: 'KAS-2026-AVN2',
          fiche_type: 'CH_TAHSILAT',
          total_amount: 25,
          special_code: 'REZERVASYON',
          trcode: 0,
          is_cancelled: false,
        },
        {
          date: '2026-10-09',
          fiche_no: 'BEA-2026-SVC2',
          fiche_type: 'service',
          trcode: 9,
          total_amount: 75,
          payment_method: 'veresiye',
          is_cancelled: false,
        },
      ],
      'customer',
    );
    expect(built).toHaveLength(2);
    expect(built[0].borcAmount).toBe(25);
    expect(built[0].alacakAmount).toBe(25);
    expect(built[0].balance).toBe(0);
    expect(built[1].borcAmount).toBe(75);
    expect(built[1].balance).toBe(75);
  });

  it('avans tek satır invariant — borç=alacak=toplam tutar', () => {
    // Kök neden (09.10.2026): avans tek satırda her iki sütunda da
    // görünür (nötr); cari bakiye artmaz/azalmaz. Bu sayede hizmet
    // tamamlanınca bakiye = hizmet tutarı (avans hariç, kirletme yok).
    const built = buildEkstreRows(
      [
        {
          date: '2026-10-09',
          fiche_no: 'KAS-2026-AVN',
          fiche_type: 'CH_TAHSILAT',
          total_amount: 1000,
          special_code: 'REZERVASYON',
          trcode: 0,
          is_cancelled: false,
        },
      ],
      'customer',
    );
    expect(built).toHaveLength(1);
    expect(built[0].borcAmount).toBe(1000);
    expect(built[0].alacakAmount).toBe(1000);
    expect(built[0].balance).toBe(0);
  });
});
