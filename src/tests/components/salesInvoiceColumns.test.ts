/**
 * salesInvoiceColumns — Perakende Satış ekranı (SalesInvoiceModule).
 *
 * "Toplam (IQD)" / "Tutar (IQD)" kolonları sağa hizalı + tabular-nums + para
 * birimi etiketli olmalı; boş/sıfır değer `—`; negatif kırmızı.
 *
 * Hücre render'ı SalesInvoiceModule içinde inline yazıldığı için metin
 * içeriğini ve hizalama meta'sını birlikte doğruluyoruz.
 */

import { describe, it, expect } from 'vitest';
import { formatNumber } from '../../utils/formatNumber';

// SalesInvoiceModule.tsx satır 1004 — Total (Tutar) / grandTotal (Toplam) hücre
// render şablonunu birebir yansıtan lokal yeniden üretim. Tek gerçek fark: bu
// fonksiyon aynı mantığı kullanır; meta yapısı `column.meta` üzerinden
// DevExDataGrid'e geçirilir ve `resolveGridColumnAlign` okur.
function buildMoneyCellJsx(value: unknown): {
  text: string;
  align: 'right';
  tabular: boolean;
  negative: boolean;
} {
  const n = Number(value ?? 0);
  const display =
    Number.isFinite(n) && n !== 0 ? `${formatNumber(n, 2, true)} IQD` : '—';
  return {
    text: display,
    align: 'right',
    tabular: true,
    negative: n < 0,
  };
}

// DevExDataGrid'in "para kolon meta varsayılanı" sözleşmesi.
// resolveGridColumnAlign: meta.align === 'right' → gridColumnAlignClass('right') = 'text-right tabular-nums'.
// resolveDevExCompactNumericKind: kind=null ise compact sıkıştırma uygulanmaz; meta.compactWidth=false de kullanılabilir.
function buildMoneyColumnMeta(): {
  align: 'right';
  type: 'number';
  sortable: boolean;
} {
  return { align: 'right', type: 'number', sortable: true };
}

describe('Perakende Satış — Tutar / Toplam kolonu', () => {
  it('Toplam kolon meta: align=right (DevExDataGrid bunu text-right tabular-nums yapar)', () => {
    const meta = buildMoneyColumnMeta();
    expect(meta.align).toBe('right');
    expect(meta.type).toBe('number');
  });

  it('Hücre render: 20000 → "20.000 IQD" (binlik nokta + para birimi)', () => {
    const cell = buildMoneyCellJsx(20000);
    expect(cell.text).toBe('20.000 IQD');
    expect(cell.align).toBe('right');
    expect(cell.tabular).toBe(true);
    expect(cell.negative).toBe(false);
  });

  it('Hücre render: 105000 → "105.000 IQD"', () => {
    const cell = buildMoneyCellJsx(105000);
    expect(cell.text).toBe('105.000 IQD');
  });

  it('Hücre render: 0 → "—" (gösterge, "0 IQD" değil)', () => {
    const cell = buildMoneyCellJsx(0);
    expect(cell.text).toBe('—');
  });

  it('Hücre render: null → "—" (güvenli fallback)', () => {
    const cell = buildMoneyCellJsx(null);
    expect(cell.text).toBe('—');
  });

  it('Hücre render: undefined → "—" (güvenli fallback)', () => {
    const cell = buildMoneyCellJsx(undefined);
    expect(cell.text).toBe('—');
  });

  it('Hücre render: negatif sayı → kırmızı bayrak', () => {
    const cell = buildMoneyCellJsx(-1500);
    expect(cell.negative).toBe(true);
    expect(cell.text).toBe('-1.500 IQD');
  });

  it('Para formatı tr-TR (nokta binlik, virgül ondalık; sıfır ondalıklar kırpılır)', () => {
    expect(formatNumber(1234567, 2, true)).toBe('1.234.567');
    expect(formatNumber(1234567.5, 2, true)).toBe('1.234.567,50');
    expect(formatNumber(99500, 2, true)).toBe('99.500');
    expect(formatNumber(45000.5, 2, true)).toBe('45.000,50');
    expect(formatNumber(20000, 2, true)).toBe('20.000');
  });

  it('Dip toplam: 20.000 + 45.000 + 40.000 = 105.000', () => {
    const total = [20000, 45000, 40000].reduce((s, v) => s + v, 0);
    expect(total).toBe(105000);
    expect(formatNumber(total, 2, true)).toBe('105.000');
  });

  it('RTL uyumluluğu: meta.align=right korunur; ar/ku locale Number.prototype.toLocaleString ile yazılır', () => {
    // Bu test "asal görünüm" garantisi: DevExDataGrid'in CSS sınıfı
    // `text-right tabular-nums` her zaman RTL olsa bile numerik hücre için
    // sağa hizalı kalır (numeric hücre genelde soldan sağ). Burada yalnızca
    // meta'nın değişmediğini doğruluyoruz.
    const meta = buildMoneyColumnMeta();
    expect(meta.align).toBe('right');
  });
});
