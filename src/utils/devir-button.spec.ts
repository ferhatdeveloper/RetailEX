import { describe, expect, it } from 'vitest';
import { buildEkstreRows } from './cariAccountStatement';
import { mergeDevExDefaultColumnVisibility } from '../components/shared/DevExDataGrid';
import type { ColumnDef } from '@tanstack/react-table';

describe('opening_balance — id mapping (Sil butonu için invoiceId gerekir)', () => {
  it('opening_balance satırı: row.id invoiceId olarak taşınır', () => {
    const rows = buildEkstreRows(
      [
        {
          id: '11111111-1111-1111-1111-111111111111',
          date: '2026-01-01',
          fiche_no: 'DEV-1',
          fiche_type: 'opening_balance',
          trcode: 99,
          total_amount: 100000,
          is_cancelled: false,
        },
      ],
      'customer',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].fiche_type).toBe('opening_balance');
    expect(rows[0].invoiceId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('opening_balance satırı (alacak yönünde -100000): invoiceId yine dolu', () => {
    const rows = buildEkstreRows(
      [
        {
          id: 'abcd1234-5678-90ab-cdef-1234567890ab',
          date: '2026-01-01',
          fiche_no: 'DEV-2',
          fiche_type: 'opening_balance',
          trcode: 99,
          total_amount: -100000,
          is_cancelled: false,
        },
      ],
      'customer',
    );
    expect(rows[0].invoiceId).toBe('abcd1234-5678-90ab-cdef-1234567890ab');
    expect(rows[0].borcAmount).toBe(0);
    expect(rows[0].alacakAmount).toBe(100000);
  });

  it('id OLMADAN opening_balance satırı: invoiceId undefined olur → buton gizlenir', () => {
    const rows = buildEkstreRows(
      [
        {
          date: '2026-01-01',
          fiche_no: 'DEV-3',
          fiche_type: 'opening_balance',
          trcode: 99,
          total_amount: 50000,
          is_cancelled: false,
        },
      ],
      'customer',
    );
    expect(rows[0].invoiceId).toBeUndefined();
  });
});

describe('Cari Ekstresi actions kolonu — 10.10.2026 kök neden: defaultVisible=true zorunlu', () => {
  it('actions kolonu meta.defaultVisible=true olmadan varsayılan gizli kalır (mevcut bug)', () => {
    const cols: ColumnDef<any, any>[] = [
      { id: 'date', accessorKey: 'date' },
      { id: 'fiche_no', accessorKey: 'fiche_no' },
      { id: 'actions', accessorKey: 'actions', meta: { align: 'right' } },
    ];
    // Storage boş — ilk oturum simülasyonu
    const merged = mergeDevExDefaultColumnVisibility(cols, null);
    // actions defaultHidden set'te → otomatik false (gizli)
    expect(merged.actions).toBe(false);
  });

  it('actions kolonu meta.defaultVisible=true ile her oturumda görünür kalır (düzeltme)', () => {
    const cols: ColumnDef<any, any>[] = [
      { id: 'date', accessorKey: 'date' },
      { id: 'fiche_no', accessorKey: 'fiche_no' },
      {
        id: 'actions',
        accessorKey: 'actions',
        meta: { align: 'right', defaultVisible: true, defaultHidden: false },
      },
    ];
    // Storage boş
    const merged = mergeDevExDefaultColumnVisibility(cols, null);
    // Düzeltme sonrası: actions zorla görünür (true)
    expect(merged.actions).toBe(true);
  });

  it('kullanıcı storage\'da actions=false kaydetmişse de defaultVisible=true onu ezer', () => {
    const cols: ColumnDef<any, any>[] = [
      {
        id: 'actions',
        accessorKey: 'actions',
        meta: { defaultVisible: true },
      },
    ];
    // Önceki oturumdan gizli kalmış
    const merged = mergeDevExDefaultColumnVisibility(cols, { actions: false });
    expect(merged.actions).toBe(true);
  });
});
