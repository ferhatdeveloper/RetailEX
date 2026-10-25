import { describe, expect, it } from 'vitest';
import { buildEkstreRows } from '../../utils/cariAccountStatement';
import {
  invoiceDescriptionForDisplay,
  invoiceNotesToPersist,
} from '../../utils/receiptNotes';
import {
  invoiceHeaderBalanceForDisplay,
  sumReservationDepositAmounts,
} from '../../utils/invoiceHeaderBalance';
import { receivableAfterDiscount } from '../../utils/saleCollectedAmounts';

const DUNYA_NOTES =
  'GüzellikPOS|beauty_sale_id:ebfe533b-888e-482a-ba85-1aa073288045|rex_appt:fdad46b6-8e13-4e14-a467-f2d8f43a49ea';

describe('fatura açıklaması — teknik dizi görünmez', () => {
  it('beauty_sale_id, rex_appt ve GüzellikPOS| dizisi fatura metninde yok', () => {
    const shown = invoiceDescriptionForDisplay(DUNYA_NOTES);
    expect(shown).toBe('');
    expect(shown).not.toContain('beauty_sale_id');
    expect(shown).not.toContain('rex_appt');
    expect(shown).not.toContain('GüzellikPOS|');
  });

  it('iş notu varsa yalnız o kalır', () => {
    const shown = invoiceDescriptionForDisplay(
      `${DUNYA_NOTES}|Öğleden sonra gelmesin`,
    );
    expect(shown).toBe('Öğleden sonra gelmesin');
    expect(shown).not.toContain('beauty_sale_id');
    expect(shown).not.toContain('rex_appt');
  });

  it('kutu değişmeden kaydedilirse saklanan not aynen kalır', () => {
    const persisted = invoiceNotesToPersist(
      DUNYA_NOTES,
      invoiceDescriptionForDisplay(DUNYA_NOTES),
      false,
    );
    expect(persisted).toBe(DUNYA_NOTES);
  });
});

describe('fatura başlığı bakiyesi — rezervasyon alacak görünmez', () => {
  it('DUNYA: defter -20.000 ve peşinat 20.000 ekranda 0', () => {
    expect(invoiceHeaderBalanceForDisplay(-20000, 20000)).toBe(0);
  });

  it('açık borç peşinat kadar şişmez', () => {
    expect(invoiceHeaderBalanceForDisplay(55000, 20000)).toBe(55000);
  });

  it('peşinat dışı gerçek alacak durur', () => {
    expect(invoiceHeaderBalanceForDisplay(-30000, 20000)).toBe(-10000);
  });

  it('rezervasyon satırları toplanır, normal tahsilat karışmaz', () => {
    expect(sumReservationDepositAmounts([
      { amount: 20000, special_code: 'REZERVASYON', transaction_type: 'CH_TAHSILAT' },
      { amount: 5000, special_code: 'AVANS', transaction_type: 'CH_TAHSILAT' },
      { amount: 75000, special_code: '', transaction_type: 'CH_TAHSILAT' },
    ])).toBe(25000);
  });
});

describe('cari ekstre — rezervasyon bakiyeye alacak yazılmaz', () => {
  it('nakit satış satırı bakiyesi 0, dip 0; peşinat eksi bakiye bırakmaz', () => {
    const rows = buildEkstreRows(
      [
        {
          date: '2026-10-25',
          fiche_no: 'KL-DUNYA-20',
          fiche_type: 'CH_TAHSILAT',
          total_amount: 20000,
          special_code: 'REZERVASYON',
          notes: 'Rezervasyon tahsilatı - AVANS-20000',
        },
        {
          date: '2026-10-25',
          fiche_no: 'BEA-2026-00001',
          fiche_type: 'sales_invoice',
          total_amount: 75000,
          payment_method: 'Nakit',
          notes: DUNYA_NOTES,
        },
      ],
      'customer',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].borcAmount).toBe(20000);
    expect(rows[0].alacakAmount).toBe(20000);
    expect(rows[0].balance).toBe(0);
    expect(rows[0].balance).not.toBe(-20000);
    expect(rows[1].borcAmount).toBe(75000);
    expect(rows[1].alacakAmount).toBe(75000);
    expect(rows[1].balance).toBe(0);
    const borc = rows.reduce((s, r) => s + r.borcAmount, 0);
    const alacak = rows.reduce((s, r) => s + r.alacakAmount, 0);
    expect(borc - alacak).toBe(0);
    expect(rows[rows.length - 1].balance).toBe(0);
  });

  it('özel kodu olmasa da rezervasyon tahsilatı bakiyeyi eksiye çekmez', () => {
    const rows = buildEkstreRows(
      [
        {
          date: '2026-10-25',
          fiche_no: 'KL-MVNRGVHC-7DBMIB',
          fiche_type: 'CH_TAHSILAT',
          total_amount: 15000,
          notes: 'Rezervasyon tahsilatı - AVANS-33105061',
        },
        {
          date: '2026-10-25',
          fiche_no: 'BEA-2026-00003',
          fiche_type: 'sales_invoice',
          total_amount: 60000,
          payment_method: 'cash',
          notes: 'GüzellikPOS',
        },
        {
          date: '2026-10-25',
          fiche_no: 'BEA-2026-00004',
          fiche_type: 'sales_invoice',
          total_amount: 25000,
          payment_method: 'cash',
          notes: 'GüzellikPOS',
        },
        {
          date: '2026-10-25',
          fiche_no: 'BEA-2026-00005',
          fiche_type: 'sales_invoice',
          total_amount: 10000,
          payment_method: 'cash',
          notes: 'GüzellikPOS — Güzellik satışı',
        },
        {
          date: '2026-10-25',
          fiche_no: 'BEA-2026-00006',
          fiche_type: 'sales_invoice',
          total_amount: 15000,
          payment_method: 'cash',
          notes: 'GüzellikPOS — Güzellik satışı',
        },
      ],
      'customer',
    );
    expect(rows[0].balance).toBe(0);
    expect(rows[0].alacakAmount - rows[0].borcAmount).toBe(0);
    for (const row of rows.slice(1)) {
      expect(row.borcAmount).toBe(row.alacakAmount);
      expect(row.balance).toBe(0);
    }
    const borc = rows.reduce((s, r) => s + r.borcAmount, 0);
    const alacak = rows.reduce((s, r) => s + r.alacakAmount, 0);
    expect(borc).toBe(125000);
    expect(alacak).toBe(125000);
    expect(borc - alacak).toBe(0);
    expect(rows[rows.length - 1].balance).toBe(0);
  });

  it('indirim açık cari değildir', () => {
    expect(receivableAfterDiscount(75000, 55000, 20000)).toBe(0);
    expect(receivableAfterDiscount(75000, 75000, 0)).toBe(0);
  });
});
