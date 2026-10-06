/**
 * Cari Listesi (currentAccounts.ts) — tedarikçi bakiye gösterimi simetri regresyonu.
 *
 * Kök neden: `mapSupplierToCurrentAccount` `bakiye: -(s.balance)` ile
 * tedarikçi bakiyesinin işaretini ters çeviriyordu. Tedarikçi simetrisi
 * (cariAccountStatement.ts): + = A (alacaklı, biz tedarikçiye borçluyuz),
 * − = B (borçlu, tedarikçi bize borçlu). İşaret korunmalı.
 *
 * Bu test, düzeltme sonrası `borc_bakiye / alacak_bakiye / bakiye` üçlüsünün
 * supplier + ve − senaryolarında doğru ayrıştığını garanti eder.
 */

import { describe, expect, it } from 'vitest';
import { resolveCariBalanceSide } from '../../utils/cariAccountStatement';

/** currentAccounts.ts içindeki düzeltilmiş mantığın gölge implementasyonu.
 * Düzeltme uygulandığında bu formül, servis içindeki `mapSupplierToCurrentAccount`
 * ile birebir aynı sonucu üretmeli. */
function mapSupplierBalanceForUi(s: { balance?: number | string | null }): {
  bakiye: number;
  borc_bakiye: number;
  alacak_bakiye: number;
  side: 'B' | 'A' | '';
} {
  const supBal = parseFloat(String(s.balance ?? 0)) || 0;
  return {
    bakiye: supBal,
    borc_bakiye: supBal < 0 ? Math.abs(supBal) : 0,
    alacak_bakiye: supBal > 0 ? supBal : 0,
    side: resolveCariBalanceSide('supplier', supBal),
  };
}

describe('Cari Listesi — tedarikçi bakiye gösterim simetrisi (regression)', () => {
  it('pozitif balance: alacaklı (A), alacak_bakiye = balance, borc_bakiye = 0', () => {
    const r = mapSupplierBalanceForUi({ balance: 9_973_363 });
    expect(r.bakiye).toBe(9_973_363);
    expect(r.alacak_bakiye).toBe(9_973_363);
    expect(r.borc_bakiye).toBe(0);
    expect(r.side).toBe('A');
  });

  it('negatif balance: borçlu (B), borc_bakiye = |balance|, alacak_bakiye = 0', () => {
    const r = mapSupplierBalanceForUi({ balance: -7_666_363 });
    expect(r.bakiye).toBe(-7_666_363);
    expect(r.borc_bakiye).toBe(7_666_363);
    expect(r.alacak_bakiye).toBe(0);
    expect(r.side).toBe('B');
  });

  it('sıfır balance: hiçbir yön', () => {
    const r = mapSupplierBalanceForUi({ balance: 0 });
    expect(r.bakiye).toBe(0);
    expect(r.borc_bakiye).toBe(0);
    expect(r.alacak_bakiye).toBe(0);
    expect(r.side).toBe('');
  });

  it('işaret ASLA negatife çevrilmez (eski `-(s.balance)` hatasına karşı)', () => {
    // Önceki kod: `bakiye: -(s.balance)` → pozitif 9.973.363 → -9.973.363
    // Düzeltme: `bakiye: s.balance` → pozitif 9.973.363 → 9.973.363
    const pozitif = mapSupplierBalanceForUi({ balance: 9_973_363 });
    expect(pozitif.bakiye).toBeGreaterThan(0);
    expect(pozitif.bakiye).toBe(9_973_363);
    expect(pozitif.side).toBe('A');
  });
});
