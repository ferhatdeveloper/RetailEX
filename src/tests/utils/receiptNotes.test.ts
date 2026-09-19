import { describe, expect, it } from 'vitest';
import { receiptNotesForDisplay } from '../../utils/receiptNotes';

describe('receiptNotesForDisplay', () => {
  it('GüzellikPOS + beauty_sale_id + insan metni → önek ve metin', () => {
    expect(
      receiptNotesForDisplay(
        'GüzellikPOS|beauty_sale_id:7d9c4bca-c4be-41a4-9f9c-954845a0b62b|Güzellik satışı',
      ),
    ).toBe('GüzellikPOS — Güzellik satışı');
  });

  it('beauty_sale_id + rex_appt (insan metni yok) → yalnızca önek', () => {
    expect(
      receiptNotesForDisplay(
        'GüzellikPOS|beauty_sale_id:dde6bcab-5e3b-4f99-bde5-68d3e6a2f8c2|rex_appt:3f333642-c733-4135-88ed-ffa9979871a9',
      ),
    ).toBe('GüzellikPOS');
  });

  it('boşluklu pipe + rex_appt eki gizlenir', () => {
    expect(
      receiptNotesForDisplay(
        'GüzellikPOS|beauty_sale_id:0e49ad8a-a25d-40be-af56-8a739678f600|Güzellik satışı | rex_appt:78ba8fba-9983-426c-a0e3-168838cbf99b',
      ),
    ).toBe('GüzellikPOS — Güzellik satışı');
  });

  it('RestoranPOS rest_order_id gizlenir', () => {
    expect(
      receiptNotesForDisplay(
        'RestoranPOS|rest_order_id:00000000-0000-0000-0000-000000000001',
      ),
    ).toBe('RestoranPOS');
  });

  it('serbest açıklama (pipe/uuid yok) olduğu gibi kalır', () => {
    const free =
      'Kaynak: Malzeme listesinden seçilen ürünler. Alış kaydı stoğu artırır.';
    expect(receiptNotesForDisplay(free)).toBe(free);
  });

  it('boş / null → boş string', () => {
    expect(receiptNotesForDisplay(null)).toBe('');
    expect(receiptNotesForDisplay(undefined)).toBe('');
    expect(receiptNotesForDisplay('   ')).toBe('');
  });

  it('yapışık önek + boşluklu beauty_sale_id / res_appt UUID gizlenir', () => {
    expect(
      receiptNotesForDisplay(
        'GüzellikPOSbeauty_sale_id cda5bcac-5a3b-4f99-bde5-68c3e3a3f2c2|res_appt 3f333b42-c733-4135-82ed-ffe9279671e3',
      ),
    ).toBe('GüzellikPOS');
  });

  it('pipe yok, boşluklu teknik id gizlenir', () => {
    expect(
      receiptNotesForDisplay(
        'GüzellikPOSbeauty_sale_id cda5bcac-5a3b-4f99-bde5-68c3e3a3f2c2 res_appt 3f333b42-c733-4135-82ed-ffe9279671e3',
      ),
    ).toBe('GüzellikPOS');
  });
});
