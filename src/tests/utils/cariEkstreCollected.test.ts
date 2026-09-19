import { describe, expect, it } from 'vitest';
import { buildEkstreRows } from '../../utils/cariAccountStatement';

describe('cari ekstre — belge vs tahsilat', () => {
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
