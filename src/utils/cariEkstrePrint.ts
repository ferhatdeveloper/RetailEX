/**
 * Cari hesap ekstresi — yerleşik kurumsal A4 HTML yazdırma.
 * Borç/alacak/bakiye tutarları olduğu gibi basılır; ledger matematiği değişmez.
 */
import type { Language } from '../locales/module-translations';
import { translate } from '../locales/module-translations';
import { formatNumber } from './formatNumber';
import {
  companyHeaderFromReceiptSettings,
  escapeHtml,
  formatExtractDate,
} from './materialExtractPrint';
import {
  ficheTypeToInfo,
  getCariBalanceDirection,
  preferIntegerAmountDisplay,
  resolveEkstreDescription,
  type EkstreRow,
  type ExtCardType,
  type TFunction,
} from './cariAccountStatement';

export type CariEkstrePrintOrientation = 'landscape' | 'portrait';

export type CariEkstrePrintLabels = {
  reportTitle: string;
  date: string;
  ficheNo: string;
  type: string;
  description: string;
  debit: string;
  credit: string;
  balance: string;
  dateRange: string;
  period: string;
  accountCode: string;
  accountName: string;
  accountAddress: string;
  totalDebit: string;
  totalCredit: string;
  netBalance: string;
  printedAt: string;
  empty: string;
  customer: string;
  supplier: string;
  phone: string;
};

export type CariEkstrePrintInput = {
  reportTitle: string;
  accountCode: string;
  accountName: string;
  accountAddress?: string;
  accountPhone?: string;
  cardType?: ExtCardType;
  cardTypeLabel: string;
  dateFrom: string;
  dateTo: string;
  periodLabel?: string;
  currency: string;
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyTaxNumber?: string;
  companyTaxOffice?: string;
  logoDataUrl?: string;
  rows: EkstreRow[];
  totalDebit: number;
  totalCredit: number;
  netBalance: number;
  labels: CariEkstrePrintLabels;
  /** Yazdırma dili — fiche türü / açıklama çevirisi */
  printLang: Language;
  orientation?: CariEkstrePrintOrientation;
  printedAt?: string;
};

export { companyHeaderFromReceiptSettings, escapeHtml, formatExtractDate };

const PRINT_LANGS: Language[] = ['tr', 'en', 'ar', 'ku'];

export function isCariEkstrePrintLang(v: unknown): v is Language {
  return PRINT_LANGS.includes(v as Language);
}

export function buildCariEkstrePrintLabels(lang: Language): CariEkstrePrintLabels {
  const t = (key: string) => translate(key, lang);
  return {
    reportTitle: t('accCustomerExtract'),
    date: t('dateLabel'),
    ficheNo: t('ficheNo'),
    type: t('type'),
    description: t('description'),
    debit: t('debtor'),
    credit: t('creditor'),
    balance: t('balance'),
    dateRange: t('dateRange'),
    period: t('cariEkstrePrintPeriod'),
    accountCode: t('cariEkstrePrintAccountCode'),
    accountName: t('cariEkstrePrintAccountName'),
    accountAddress: t('cariEkstrePrintAccountAddress'),
    totalDebit: t('cariEkstrePrintTotalDebit'),
    totalCredit: t('cariEkstrePrintTotalCredit'),
    netBalance: t('netAmount'),
    printedAt: t('cariEkstrePrintPrintedAt'),
    empty: t('noRecordFound'),
    customer: t('customer'),
    supplier: t('supplierLabel'),
    phone: t('cariEkstrePrintPhone'),
  };
}

export function formatCariAccountAddress(account: {
  address?: string | null;
  district?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
}): string {
  return [
    account.address,
    account.neighborhood,
    account.district,
    account.city,
    account.postal_code,
    account.country,
  ]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join(', ');
}

function fmtAmt(amount: number, currency: string): string {
  const dec = preferIntegerAmountDisplay(currency) ? 0 : 2;
  const show = !preferIntegerAmountDisplay(currency);
  return `${formatNumber(amount, dec, show)} ${currency}`;
}

function tmForLang(lang: Language): TFunction {
  return (key: string) => translate(key, lang);
}

/**
 * Açıklama: teknik ID (beauty_sale_id, UUID) gizlenir; fiche türü seçilen dilde.
 * Tutar alanlarına dokunulmaz.
 */
export function mapCariEkstrePrintRows(
  rows: EkstreRow[],
  lang: Language,
  currency: string,
  cardType?: ExtCardType,
): Array<{
  date: string;
  ficheNo: string;
  typeLabel: string;
  description: string;
  debit: string;
  credit: string;
  balance: string;
  balanceSide: string;
}> {
  const tm = tmForLang(lang);
  return rows.map((row) => {
    const typeInfo = ficheTypeToInfo(
      String(row.fiche_type ?? ''),
      Number(row.trcode) || 0,
      row.is_cancelled === true,
      tm,
    );
    const desc = resolveEkstreDescription(
      row.notes,
      row.fiche_type,
      Number(row.trcode) || 0,
      row.is_cancelled === true,
      tm,
    );
    const balDir = getCariBalanceDirection(cardType, row.balance, tm);
    return {
      date: formatExtractDate(String(row.date ?? '')) || '—',
      ficheNo: String(row.fiche_no || '').trim() || '—',
      typeLabel: typeInfo.label,
      description: desc,
      debit: row.borcAmount > 0 ? fmtAmt(row.borcAmount, currency) : '',
      credit: row.alacakAmount > 0 ? fmtAmt(row.alacakAmount, currency) : '',
      balance: fmtAmt(Math.abs(row.balance), currency),
      balanceSide: balDir.sideLabel || '',
    };
  });
}

export function buildCariEkstrePrintHtml(input: CariEkstrePrintInput): string {
  const L = input.labels;
  const orientation = input.orientation === 'portrait' ? 'portrait' : 'landscape';
  const rtl = input.printLang === 'ar' || input.printLang === 'ku';
  const taxLine = [input.companyTaxOffice, input.companyTaxNumber].filter(Boolean).join(' · ');
  const logo = input.logoDataUrl
    ? `<img src="${escapeHtml(input.logoDataUrl)}" alt="" class="logo" />`
    : '';
  const printedAt =
    input.printedAt ||
    formatExtractDate(new Date().toISOString().slice(0, 10)) +
      ' ' +
      new Date().toLocaleTimeString(input.printLang === 'en' ? 'en-GB' : 'tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
      });

  const mapped = mapCariEkstrePrintRows(input.rows, input.printLang, input.currency, input.cardType);
  const tm = tmForLang(input.printLang);
  const netDir = getCariBalanceDirection(input.cardType, input.netBalance, tm);

  const bodyRows =
    mapped.length === 0
      ? `<tr><td colspan="7" class="empty">${escapeHtml(L.empty)}</td></tr>`
      : mapped
          .map(
            (r) => `<tr>
<td class="mono">${escapeHtml(r.date)}</td>
<td class="mono">${escapeHtml(r.ficheNo)}</td>
<td>${escapeHtml(r.typeLabel)}</td>
<td class="desc">${escapeHtml(r.description)}</td>
<td class="num debit">${escapeHtml(r.debit)}</td>
<td class="num credit">${escapeHtml(r.credit)}</td>
<td class="num bal">${escapeHtml(r.balance)}${
              r.balanceSide
                ? ` <span class="side">${escapeHtml(r.balanceSide)}</span>`
                : ''
            }</td>
</tr>`,
          )
          .join('');

  const periodBlock = input.periodLabel
    ? `<div><span class="k">${escapeHtml(L.period)}</span> ${escapeHtml(input.periodLabel)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="${escapeHtml(input.printLang)}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(L.reportTitle)} — ${escapeHtml(input.accountName)}</title>
<style>
  @page { size: A4 ${orientation}; margin: 12mm 10mm 14mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; background: #fff; color: #0f172a;
    font-family: "Segoe UI", Arial, Helvetica, sans-serif; font-size: 10.5px;
  }
  .sheet { width: 100%; }
  .letterhead {
    display: flex; justify-content: space-between; gap: 16px; align-items: flex-start;
    border-bottom: 2.5px solid #1e3a5f; padding-bottom: 10px; margin-bottom: 10px;
  }
  .head-left { display: flex; gap: 12px; align-items: flex-start; min-width: 0; }
  .logo { max-height: 52px; max-width: 140px; object-fit: contain; }
  .co-name { font-size: 17px; font-weight: 800; letter-spacing: 0.02em; color: #0f172a; }
  .co-meta { color: #475569; margin-top: 3px; line-height: 1.45; font-size: 10px; }
  .head-right { text-align: ${rtl ? 'left' : 'right'}; color: #334155; font-size: 10px; line-height: 1.5; white-space: nowrap; }
  .head-right .k { color: #64748b; font-weight: 600; }
  .title-block { text-align: center; margin: 8px 0 12px; }
  .title {
    font-size: 15px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 0.14em; color: #1e3a5f; margin: 0;
  }
  .subtitle { margin-top: 4px; color: #475569; font-size: 10px; }
  .party {
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px;
    background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px;
    padding: 8px 12px; margin-bottom: 12px; font-size: 10.5px;
  }
  .party .k { color: #64748b; font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; margin-${rtl ? 'left' : 'right'}: 6px; }
  .party .v { font-weight: 600; color: #0f172a; }
  .badge {
    display: inline-block; padding: 1px 7px; border-radius: 999px;
    font-size: 9px; font-weight: 800; text-transform: uppercase;
    background: #e0e7ff; color: #3730a3;
  }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 6px; vertical-align: top; }
  th {
    background: #1e3a5f; color: #fff; font-size: 8.5px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.05em; text-align: ${rtl ? 'right' : 'left'};
  }
  td.num, th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.mono { font-family: ui-monospace, "Courier New", monospace; font-size: 10px; }
  td.desc { word-break: break-word; }
  td.debit { color: #b91c1c; font-weight: 600; }
  td.credit { color: #047857; font-weight: 600; }
  td.bal { font-weight: 700; }
  td.bal .side { font-size: 8px; font-weight: 800; margin-${rtl ? 'right' : 'left'}: 3px; color: #64748b; }
  td.empty { text-align: center; padding: 18px; color: #64748b; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  tfoot td { background: #eef2f7; font-weight: 700; border-top: 2px solid #1e3a5f; }
  .sums {
    display: flex; flex-wrap: wrap; gap: 14px 22px; margin-top: 10px;
    font-size: 11px; font-weight: 700;
  }
  .sums .debit { color: #b91c1c; }
  .sums .credit { color: #047857; }
  .doc-footer {
    margin-top: 14px; padding-top: 8px; border-top: 1px solid #94a3b8;
    display: flex; justify-content: space-between; gap: 12px;
    color: #64748b; font-size: 9px;
  }
  @media print {
    html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr { break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="sheet">
  <div class="letterhead">
    <div class="head-left">
      ${logo}
      <div>
        <div class="co-name">${escapeHtml(input.companyName)}</div>
        <div class="co-meta">
          ${input.companyAddress ? `${escapeHtml(input.companyAddress)}<br/>` : ''}
          ${input.companyPhone ? `${escapeHtml(input.companyPhone)}<br/>` : ''}
          ${taxLine ? escapeHtml(taxLine) : ''}
        </div>
      </div>
    </div>
    <div class="head-right">
      ${periodBlock}
      <div><span class="k">${escapeHtml(L.dateRange)}</span><br/>
        ${escapeHtml(formatExtractDate(input.dateFrom) || input.dateFrom)}
        → ${escapeHtml(formatExtractDate(input.dateTo) || input.dateTo)}
      </div>
      <div style="margin-top:4px">${escapeHtml(input.currency)}</div>
    </div>
  </div>

  <div class="title-block">
    <h1 class="title">${escapeHtml(input.reportTitle || L.reportTitle)}</h1>
    <div class="subtitle"><span class="badge">${escapeHtml(input.cardTypeLabel)}</span></div>
  </div>

  <div class="party">
    <div><span class="k">${escapeHtml(L.accountCode)}</span><span class="v">${escapeHtml(input.accountCode || '—')}</span></div>
    <div><span class="k">${escapeHtml(L.accountName)}</span><span class="v">${escapeHtml(input.accountName)}</span></div>
    ${
      input.accountAddress
        ? `<div style="grid-column:1/-1"><span class="k">${escapeHtml(L.accountAddress)}</span><span class="v">${escapeHtml(input.accountAddress)}</span></div>`
        : ''
    }
    ${
      input.accountPhone
        ? `<div><span class="k">${escapeHtml(L.phone)}</span><span class="v">${escapeHtml(input.accountPhone)}</span></div>`
        : ''
    }
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:9%">${escapeHtml(L.date)}</th>
        <th style="width:11%">${escapeHtml(L.ficheNo)}</th>
        <th style="width:12%">${escapeHtml(L.type)}</th>
        <th style="width:32%">${escapeHtml(L.description)}</th>
        <th class="num" style="width:12%">${escapeHtml(L.debit)}</th>
        <th class="num" style="width:12%">${escapeHtml(L.credit)}</th>
        <th class="num" style="width:12%">${escapeHtml(L.balance)}</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="4">${escapeHtml(L.totalDebit)} / ${escapeHtml(L.totalCredit)}</td>
        <td class="num debit">${escapeHtml(fmtAmt(input.totalDebit, input.currency))}</td>
        <td class="num credit">${escapeHtml(fmtAmt(input.totalCredit, input.currency))}</td>
        <td class="num bal">${escapeHtml(fmtAmt(Math.abs(input.netBalance), input.currency))}${
          netDir.sideLabel
            ? ` <span class="side">${escapeHtml(netDir.sideLabel)}</span>`
            : ''
        }</td>
      </tr>
    </tfoot>
  </table>

  <div class="sums">
    <span class="debit">${escapeHtml(L.totalDebit)}: ${escapeHtml(fmtAmt(input.totalDebit, input.currency))}</span>
    <span class="credit">${escapeHtml(L.totalCredit)}: ${escapeHtml(fmtAmt(input.totalCredit, input.currency))}</span>
    <span>${escapeHtml(L.netBalance)}: ${escapeHtml(fmtAmt(Math.abs(input.netBalance), input.currency))}${
      netDir.sideLabel ? ` · ${escapeHtml(netDir.sideLabel)}` : ''
    }</span>
  </div>

  <div class="doc-footer">
    <span>${escapeHtml(L.printedAt)}: ${escapeHtml(printedAt)}</span>
    <span>${escapeHtml(input.companyName)}</span>
  </div>
</div>
</body>
</html>`;
}
