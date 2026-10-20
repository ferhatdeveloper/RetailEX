/**
 * Güzellik hizmet satır raporu — Toplam Tutar.
 *
 * Ciro hizmet bedelidir. Rezervasyon payı (peşinat) kazanç değildir;
 * bilgi kolonunda durur, toplam tutara eklenmez.
 *
 * Eski formül hizmet ile rezervasyon payını topluyordu:
 *   50.000 + 9.000 = 59.000, 60.000 + 11.000 = 71.000, genel 130.000.
 * Yeni formül: toplam tutar = hizmet tutarı → 50.000 + 60.000 = 110.000.
 */

export interface BeautyServiceReportMoney {
  /** Hizmet tutarı (Tutar kolonu). */
  amount: number;
  /** Rezervasyon payı. Bilgi kolonudur; toplama eklenmez. */
  depositAmount: number;
  /** Toplam tutar = hizmet tutarı. */
  lineTotal: number;
}

function money(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

/** Satır: tutar ve toplam tutar hizmet bedeli, rezervasyon payı ayrı kalır. */
export function beautyServiceReportLineMoney(
  serviceAmount: unknown,
  depositShare: unknown,
): BeautyServiceReportMoney {
  const amount = money(serviceAmount);
  const depositAmount = money(depositShare);
  return {
    amount,
    depositAmount,
    lineTotal: amount,
  };
}

/** Genel toplam: footer ile aynı kolon toplamları. */
export function beautyServiceReportGrandMoney(
  rows: ReadonlyArray<Pick<BeautyServiceReportMoney, 'amount' | 'depositAmount' | 'lineTotal'>>,
): BeautyServiceReportMoney {
  return rows.reduce<BeautyServiceReportMoney>(
    (acc, row) => ({
      amount: acc.amount + money(row.amount),
      depositAmount: acc.depositAmount + money(row.depositAmount),
      lineTotal: acc.lineTotal + money(row.lineTotal),
    }),
    { amount: 0, depositAmount: 0, lineTotal: 0 },
  );
}
