/**
 * Kasalar arası virman.
 *
 * Kaynak kasadan −tutar çıkar, hedef kasaya +tutar girer.
 * Şirket nakdi değişmez: 10 USD, 4 USD virman → 6 ve 4, toplam 10.
 * Virman gider değildir. Rezervasyon bu hesaba eklenmez.
 * Para birimleri ayrıdır; USD virmanı IQD toplama yazılmaz.
 *
 * Hedef kasada giriş satırı yoksa raporlar hedefe +tutar yazar.
 * Kaynak çıkış bir kez sayılır. Aynı fişin ikinci hedef satırı yok sayılır.
 */

export interface CashVirmanLine {
  id?: string | null;
  kasa_id?: string | null;
  register_id?: string | null;
  registerId?: string | null;
  target_register_id?: string | null;
  targetRegisterId?: string | null;
  islem_tipi?: string | null;
  transaction_type?: string | null;
  transactionType?: string | null;
  tutar?: number | null;
  amount?: number | null;
  sign?: number | null;
  islem_no?: string | null;
  fiche_no?: string | null;
  ficheNo?: string | null;
  doviz_kodu?: string | null;
  currency?: string | null;
  currency_code?: string | null;
  islem_tarihi?: string | null;
  date?: string | null;
  payment_method?: string | null;
  virmanSynthetic?: boolean;
}

export interface CashCurrencyPosition {
  currency: string;
  total: number;
  registers: Array<{ registerId: string; balance: number }>;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function cashVirmanType(line: CashVirmanLine | null | undefined): string {
  return String(line?.islem_tipi || line?.transaction_type || line?.transactionType || '')
    .trim()
    .toUpperCase();
}

export function isCashVirmanType(tip: string | null | undefined): boolean {
  const t = String(tip || '').trim().toUpperCase();
  return t === 'VIRMAN' || t === 'VIRMAN_TARGET' || t === 'VIRMAN_GIRIS' || t === 'VIRMAN_CIKIS';
}

export function cashVirmanRegisterId(line: CashVirmanLine | null | undefined): string {
  return String(line?.kasa_id || line?.register_id || line?.registerId || '').trim();
}

export function cashVirmanTargetId(line: CashVirmanLine | null | undefined): string {
  return String(line?.target_register_id || line?.targetRegisterId || '').trim();
}

export function cashVirmanFiche(line: CashVirmanLine | null | undefined): string {
  return String(line?.islem_no || line?.fiche_no || line?.ficheNo || '').trim();
}

export function cashVirmanBaseFiche(fiche: string): string {
  return String(fiche || '').trim().replace(/-VRM$/i, '');
}

export function cashVirmanCurrency(line: CashVirmanLine | null | undefined): string {
  return String(line?.doviz_kodu || line?.currency_code || line?.currency || '')
    .trim()
    .toUpperCase();
}

export function cashVirmanAmount(line: CashVirmanLine | null | undefined): number {
  const raw = line?.tutar != null ? line.tutar : line?.amount;
  return round2(Math.abs(num(raw)));
}

/**
 * Virman satırının yönü.
 * +1 hedef giriş, −1 kaynak çıkış, 0 virman değil.
 * `VIRMAN` tipi tek başına çıkış sayılmaz: `-VRM` fişi ve artı işaret girişdir.
 */
export function cashVirmanDirection(line: CashVirmanLine | null | undefined): 1 | -1 | 0 {
  if (!line || !isCashVirmanType(cashVirmanType(line))) return 0;
  const tip = cashVirmanType(line);
  if (tip === 'VIRMAN_TARGET' || tip === 'VIRMAN_GIRIS') return 1;
  if (tip === 'VIRMAN_CIKIS') return -1;
  const fiche = cashVirmanFiche(line).toUpperCase();
  if (fiche.endsWith('-VRM')) return 1;
  const sign = num(line.sign);
  if (sign > 0) return 1;
  if (sign < 0) return -1;
  return -1;
}

function pairStamp(line: CashVirmanLine, registerId: string): string {
  const fiche = cashVirmanBaseFiche(cashVirmanFiche(line));
  const identity = fiche || String(line.id || '').trim() || 'fis-yok';
  return [
    cashVirmanCurrency(line),
    identity,
    cashVirmanAmount(line).toFixed(2),
    registerId,
  ].join('|');
}

function withDirection<T extends CashVirmanLine>(line: T, direction: 1 | -1): T {
  return { ...line, sign: direction };
}

function syntheticInflow<T extends CashVirmanLine>(source: T, targetId: string): T {
  const amount = cashVirmanAmount(source);
  const currency = cashVirmanCurrency(source);
  const base = cashVirmanBaseFiche(cashVirmanFiche(source)) || String(source.id || 'virman');
  const fiche = `${base}-VRM`;
  const when = source.islem_tarihi || source.date || '';
  const targetName = String(
    (source as { target_register_name?: string; targetRegisterName?: string }).target_register_name
    || (source as { targetRegisterName?: string }).targetRegisterName
    || '',
  ).trim();
  return {
    ...source,
    id: `virman-giris-${base}-${targetId}`,
    kasa_id: targetId,
    register_id: targetId,
    registerId: targetId,
    target_register_id: cashVirmanRegisterId(source),
    targetRegisterId: cashVirmanRegisterId(source),
    islem_tipi: 'VIRMAN_TARGET',
    transaction_type: 'VIRMAN_TARGET',
    transactionType: 'VIRMAN_TARGET',
    tutar: amount,
    amount,
    sign: 1,
    islem_no: fiche,
    fiche_no: fiche,
    ficheNo: fiche,
    doviz_kodu: currency || source.doviz_kodu,
    currency_code: currency || source.currency_code,
    currency: currency || source.currency,
    islem_tarihi: when,
    date: source.date || when,
    payment_method: source.payment_method || 'cash',
    virmanSynthetic: true,
    registerName: targetName,
    registerCode: '',
    target_register_name: targetName,
    targetRegisterName: targetName,
  } as T;
}

export interface CashVirmanNormalizeOptions {
  /** Hedef satır yoksa +tutar yaz. Tek kasa filtresinde kapatılır. */
  imputeMissing?: boolean;
}

/**
 * Virman satırlarını çift taraflı hale getirir.
 * Kaynak çıkış bir kez, hedef giriş bir kez. Eksik hedef satırı eklenir.
 * Virman dışı satırlar olduğu gibi kalır.
 */
export function withCashVirmanLines<T extends CashVirmanLine>(
  lines: readonly T[] | null | undefined,
  options?: CashVirmanNormalizeOptions,
): T[] {
  const imputeMissing = options?.imputeMissing !== false;
  const passthrough: T[] = [];
  const inflows = new Map<string, T>();
  const outflows = new Map<string, T>();

  for (const line of lines || []) {
    if (!line) continue;
    const direction = cashVirmanDirection(line);
    if (!direction) {
      passthrough.push(line);
      continue;
    }
    const registerId = cashVirmanRegisterId(line);
    const key = pairStamp(line, registerId);
    if (direction > 0) {
      if (!inflows.has(key)) inflows.set(key, withDirection(line, 1));
      continue;
    }
    if (!outflows.has(key)) outflows.set(key, withDirection(line, -1));
  }

  if (imputeMissing) {
    for (const source of outflows.values()) {
      const targetId = cashVirmanTargetId(source);
      const sourceId = cashVirmanRegisterId(source);
      if (!targetId || targetId === sourceId) continue;
      const inKey = pairStamp(source, targetId);
      if (inflows.has(inKey)) continue;
      inflows.set(inKey, syntheticInflow(source, targetId));
    }
  }

  return [...passthrough, ...outflows.values(), ...inflows.values()];
}

/** Virman satırında rapor işareti; virman değilse 0. */
export function cashVirmanSignedAmount(line: CashVirmanLine | null | undefined): number {
  const direction = cashVirmanDirection(line);
  if (!direction) return 0;
  return round2(cashVirmanAmount(line) * direction);
}

export interface CashFlowVirmanColumns {
  inflow: number;
  outflow: number;
  net: number;
}

/**
 * Nakit akış kolonları. Hedef giriş, kaynak çıkış.
 * Aynı virman iki çıkış gibi toplanmaz. Net, çiftte sıfırdır.
 */
export function cashFlowVirmanColumns(line: CashVirmanLine | null | undefined): CashFlowVirmanColumns | null {
  const direction = cashVirmanDirection(line);
  if (!direction) return null;
  const amount = cashVirmanAmount(line);
  if (direction > 0) return { inflow: amount, outflow: 0, net: amount };
  return { inflow: 0, outflow: amount, net: round2(-amount) };
}

/**
 * Şirket nakdi, para birimi bazında.
 * Virman aynı para biriminde birbirini götürür. USD, IQD toplama yazılmaz.
 */
export function cashTotalsByCurrency(
  lines: readonly CashVirmanLine[] | null | undefined,
  nonVirmanSign: (line: CashVirmanLine) => number,
): CashCurrencyPosition[] {
  const prepared = withCashVirmanLines(lines);
  const totals = new Map<string, Map<string, number>>();
  for (const line of prepared) {
    const amount = cashVirmanAmount(line);
    if (!(amount > 0)) continue;
    const direction = cashVirmanDirection(line);
    const sign = direction || nonVirmanSign(line);
    if (!sign) continue;
    const currency = cashVirmanCurrency(line) || 'YEREL';
    const registerId = cashVirmanRegisterId(line) || '__unassigned__';
    const bucket = totals.get(currency) || new Map<string, number>();
    bucket.set(registerId, round2((bucket.get(registerId) || 0) + amount * sign));
    totals.set(currency, bucket);
  }

  return Array.from(totals.entries())
    .map(([currency, registers]) => {
      const rows = Array.from(registers.entries())
        .map(([registerId, balance]) => ({ registerId, balance: round2(balance) }))
        .filter((row) => Math.abs(row.balance) > 0.004)
        .sort((a, b) => a.registerId.localeCompare(b.registerId, 'tr'));
      const total = round2(rows.reduce((sum, row) => sum + row.balance, 0));
      return { currency, total, registers: rows };
    })
    .sort((a, b) => a.currency.localeCompare(b.currency, 'tr'));
}
