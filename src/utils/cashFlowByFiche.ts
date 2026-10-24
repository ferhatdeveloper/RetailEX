/**
 * Nakit akış satırı fiş numarasına bağlıdır.
 *
 * Müşteri adı ve gün grup anahtarı değildir. Aynı cari, aynı gün, iki fiş
 * iki satır kalır. Fiş no boşsa satır kimliği kullanılır; adsız satır yutulmaz.
 * Aynı fişin aynı yönündeki kasa satırları toplanır; giriş ve çıkış birbirine
 * karışmaz. Toplam tutar değişmez. Peşinat ve prim bu fonksiyona girmez.
 */

export interface CashFlowFicheMovement {
  id: string;
  source: 'cash' | 'bank' | string;
  ficheNo: string;
  date: string;
  accountName: string;
  transactionType: string;
  amount: number;
  sign: number;
  netAmount: number;
}

export function cashFlowFicheGroupKey(row: CashFlowFicheMovement): string {
  const fiche = String(row.ficheNo ?? '').trim();
  const source = String(row.source || 'cash').trim().toLowerCase() === 'bank' ? 'bank' : 'cash';
  const direction = Number(row.sign) < 0 ? 'out' : 'in';
  const type = String(row.transactionType ?? '').trim().toLocaleUpperCase('tr-TR');
  if (!fiche) return `line:${source}:${String(row.id ?? '').trim() || 'bos'}:${direction}:${type}`;
  return `fiche:${source}:${fiche}:${type}:${direction}`;
}

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Satırları fiş numarasına göre bırakır. Müşteri + gün ile birleştirmez.
 * Aynı satır kimliği ikinci kez gelirse tutar eklenmez.
 */
export function foldCashFlowByFiche<T extends CashFlowFicheMovement>(rows: readonly T[]): T[] {
  const order: string[] = [];
  const map = new Map<string, T>();
  const seenIds = new Set<string>();

  for (const row of rows) {
    const id = String(row.id ?? '').trim();
    if (id && seenIds.has(id)) continue;
    if (id) seenIds.add(id);

    const key = cashFlowFicheGroupKey(row);
    const prev = map.get(key);
    const name = String(row.accountName ?? '').trim();
    if (!prev) {
      order.push(key);
      map.set(key, {
        ...row,
        accountName: name,
        amount: roundMoney(Math.abs(Number(row.amount) || 0)),
        sign: Number(row.sign) < 0 ? -1 : 1,
        netAmount: roundMoney(
          (Number(row.sign) < 0 ? -1 : 1) * Math.abs(Number(row.amount) || 0),
        ),
      });
      continue;
    }

    const amount = roundMoney(Math.abs(Number(prev.amount) || 0) + Math.abs(Number(row.amount) || 0));
    const sign = Number(prev.sign) < 0 ? -1 : 1;
    const accountName = String(prev.accountName ?? '').trim() || name;
    map.set(key, {
      ...prev,
      accountName,
      amount,
      sign,
      netAmount: roundMoney(amount * sign),
    });
  }

  return order.map((key) => map.get(key)!);
}

export function cashFlowMovementTotals(rows: readonly CashFlowFicheMovement[]): {
  inflow: number;
  outflow: number;
  net: number;
} {
  let inflow = 0;
  let outflow = 0;
  for (const row of rows) {
    const amount = Math.abs(Number(row.amount) || 0);
    if (Number(row.sign) < 0) outflow += amount;
    else inflow += amount;
  }
  inflow = roundMoney(inflow);
  outflow = roundMoney(outflow);
  return { inflow, outflow, net: roundMoney(inflow - outflow) };
}
