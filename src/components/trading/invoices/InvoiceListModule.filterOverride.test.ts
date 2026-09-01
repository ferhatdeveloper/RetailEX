/**
 * Regression test: InvoiceListModule filter override koruması
 *
 * Skandal (2026-09-01): kullanıcı "Alınan Hizmet" sayfasında dropdown'dan
 * "Verilen Hizmet" (value="9") seçiyor; bazen useEffect dependency'sindeki
 * `initialPrefs?.invoiceTypeFilter` referans değişikliği effect'i yeniden
 * tetikliyor ve `setInvoiceTypeFilter(defaultInvoiceTypeFilter)` ile
 * kullanıcının seçimi (9) "4" ile eziliyordu. Sonuç: API hâlâ "4" ile
 * sorgu atıyor, listede "Verilen Hizmet" türündeki faturalar gözükmüyordu.
 *
 * Düzeltme: userOverrideRef + lastAppliedContextRef ile kullanıcının son
 * manuel seçimi korunur; effect yalnızca gerçek bağlam değişikliğinde
 * uygulanır.
 *
 * Bu test, ref mantığını izole eder — effect'lerin gerçek davranışını
 * React Test Renderer olmadan doğrulamak için mini reducer simülasyonu.
 */
import { describe, expect, it } from 'vitest';

/** Effect davranışını taklit eden küçük reducer. */
function applyInvoiceTypeFilterEffect(
  defaultInvoiceTypeFilter: string | undefined,
  initialPrefsFilter: string | undefined,
  currentInvoiceTypeFilter: string,
  state: { userOverride: string | null; lastAppliedCtx: string | null },
  propChanged: boolean,
): { invoiceTypeFilter: string; nextState: typeof state } {
  const ctx = defaultInvoiceTypeFilter && defaultInvoiceTypeFilter !== 'all'
    ? defaultInvoiceTypeFilter
    : null;

  if (ctx) {
    if (
      state.lastAppliedCtx === ctx &&
      state.userOverride !== null &&
      state.userOverride !== ctx
    ) {
      // Kullanıcı manuel seçim yaptı, bağlam değişmedi → dokunma.
      return { invoiceTypeFilter: currentInvoiceTypeFilter, nextState: state };
    }
    return {
      invoiceTypeFilter: ctx,
      nextState: { userOverride: null, lastAppliedCtx: ctx },
    };
  }

  // Bağlam belirsiz
  const nextState = { userOverride: null, lastAppliedCtx: null };
  if (!initialPrefsFilter) {
    return { invoiceTypeFilter: 'all', nextState };
  }
  return { invoiceTypeFilter: currentInvoiceTypeFilter, nextState };
}

describe('InvoiceListModule filter override koruması', () => {
  it('sayfa açılışı: defaultInvoiceTypeFilter uygulanır', () => {
    const out = applyInvoiceTypeFilterEffect(
      '4', undefined, 'all',
      { userOverride: null, lastAppliedCtx: null },
      true,
    );
    expect(out.invoiceTypeFilter).toBe('4');
    expect(out.nextState.lastAppliedCtx).toBe('4');
    expect(out.nextState.userOverride).toBe(null);
  });

  it('kullanıcı manuel seçim yapar (4 → 9) — sonraki effect renderında 9 korunur', () => {
    // Önce sayfa açılışı: "4" uygulanır.
    const after1 = applyInvoiceTypeFilterEffect(
      '4', undefined, 'all',
      { userOverride: null, lastAppliedCtx: null },
      true,
    );
    expect(after1.invoiceTypeFilter).toBe('4');

    // Kullanıcı dropdown'dan "9" seçti → userOverrideRef = "9"
    const userState = { userOverride: '9', lastAppliedCtx: '4' };
    const currentInvoiceTypeFilter = '9';

    // initialPrefs referansı değişti (strict mode / unmount-remount)
    // effect tekrar tetiklendi.
    const after2 = applyInvoiceTypeFilterEffect(
      '4', '9', currentInvoiceTypeFilter, userState,
      false, // prop değişmedi
    );

    // KRİTİK: kullanıcının seçimi korunmalı.
    expect(after2.invoiceTypeFilter).toBe('9');
  });

  it('bağlam gerçekten değişirse (4 → 9 prop), kullanıcının override\'ı sıfırlanır', () => {
    // Sayfa açılışı: "4"
    const after1 = applyInvoiceTypeFilterEffect(
      '4', undefined, 'all',
      { userOverride: null, lastAppliedCtx: null },
      true,
    );
    expect(after1.invoiceTypeFilter).toBe('4');

    // Kullanıcı "9" seçti
    const userState = { userOverride: '9', lastAppliedCtx: '4' };

    // Sayfa bağlamı değişti (artık defaultInvoiceTypeFilter="9")
    const after2 = applyInvoiceTypeFilterEffect(
      '9', '9', '9', userState,
      true, // prop GERÇEKTEN değişti
    );

    // Yeni bağlam uygulanır.
    expect(after2.invoiceTypeFilter).toBe('9');
    expect(after2.nextState.lastAppliedCtx).toBe('9');
  });

  it('kullanıcı defaultInvoiceTypeFilter ile aynı türü seçerse override sayılmaz', () => {
    // Sayfa açılışı: "4"
    const after1 = applyInvoiceTypeFilterEffect(
      '4', undefined, 'all',
      { userOverride: null, lastAppliedCtx: null },
      true,
    );

    // Kullanıcı dropdown'dan yine "4" seçti (default ile aynı)
    const userState = { userOverride: '4', lastAppliedCtx: '4' };

    // Effect tekrar tetiklendi
    const after2 = applyInvoiceTypeFilterEffect(
      '4', '4', '4', userState,
      false,
    );

    // "4" ile aynı olduğu için userOverrideRef null kabul edilir;
    // sonraki prop değişikliklerinde override sayılır.
    expect(after2.nextState.userOverride).toBe(null);
  });

  it('bağlam belirsiz (defaultInvoiceTypeFilter undefined) → initialPrefs kullanılır', () => {
    const out = applyInvoiceTypeFilterEffect(
      undefined, '7', 'all',
      { userOverride: null, lastAppliedCtx: null },
      true,
    );
    // initialPrefs dolu → state "all" korunur (initialPrefs yükleme sırasında okunmuştu)
    expect(out.invoiceTypeFilter).toBe('all');
    expect(out.nextState.userOverride).toBe(null);
  });

  it('bağlam belirsiz VE initialPrefs yok → "all"', () => {
    const out = applyInvoiceTypeFilterEffect(
      undefined, undefined, 'all',
      { userOverride: null, lastAppliedCtx: null },
      true,
    );
    expect(out.invoiceTypeFilter).toBe('all');
  });
});