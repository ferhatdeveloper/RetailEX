/**
 * Dilim yüzdesi = dilim tutarı / grafikteki dilimlerin toplamı.
 * Tam sayılar en büyük kalana göre dağıtılır; toplam 100 olur.
 * Sıfır ve negatif pay yüzde almaz.
 */
export function integerSharePercents(amounts: readonly number[]): number[] {
  const safe = amounts.map((value) => {
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  });
  const total = safe.reduce((sum, amount) => sum + amount, 0);
  if (total <= 0) return safe.map(() => 0);

  const raw = safe.map((amount) => (amount / total) * 100);
  const floors = raw.map((value) => Math.floor(value + 1e-9));
  let left = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({
      index,
      frac: value - Math.floor(value + 1e-9),
      amount: safe[index],
    }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.frac - a.frac || b.amount - a.amount || a.index - b.index);

  const out = [...floors];
  if (left < 0) {
    const donors = out
      .map((value, index) => ({ index, value }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value);
    for (const donor of donors) {
      if (left >= 0) break;
      const take = Math.min(donor.value, -left);
      out[donor.index] -= take;
      left += take;
    }
  }

  let cursor = 0;
  let guard = 0;
  while (left > 0 && order.length > 0 && guard < 1000) {
    const index = order[cursor % order.length].index;
    out[index] += 1;
    left -= 1;
    cursor += 1;
    guard += 1;
  }
  return out;
}
