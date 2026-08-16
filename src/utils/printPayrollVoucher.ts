import { ERP_SETTINGS, PostgresConnection } from '../services/postgres';
import { getReceiptSettings } from '../services/receiptSettingsService';
import { printReportHtml } from './reportHtmlPrint';
import type { PartyStatement, PartyStatementLine } from '../services/api/partyStatements';

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(n || 0);
}

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  if (y && m && day) return `${day}.${m}.${y}`;
  return s;
}

async function firmHeader(): Promise<{ name: string; address: string; phone: string; tax: string }> {
  const postgres = PostgresConnection.getInstance();
  let firm: any = null;
  try {
    firm = await postgres.getFirmDetails(ERP_SETTINGS.firmNr);
  } catch {
    /* ignore */
  }
  let receipt: Awaited<ReturnType<typeof getReceiptSettings>> = {};
  try {
    receipt = await getReceiptSettings();
  } catch {
    /* ignore */
  }
  const taxOffice = receipt.companyTaxOffice || firm?.tax_office || '';
  const taxNr = receipt.companyTaxNumber || firm?.tax_nr || '';
  return {
    name: receipt.companyName || firm?.title || firm?.name || 'RetailEX',
    address: receipt.companyAddress || firm?.address || '',
    phone: receipt.companyPhone || firm?.phone || '',
    tax: [taxOffice, taxNr].filter(Boolean).join(' / '),
  };
}

export type PayrollVoucherKind = 'salary' | 'advance' | 'reconcile' | 'accrual';

export async function printPayrollVoucher(opts: {
  kind: PayrollVoucherKind;
  title: string;
  employeeName: string;
  employeeCode?: string | null;
  amount: number;
  ficheNo?: string | null;
  date?: string | null;
  definition?: string | null;
  balanceAfter?: number | null;
  balanceLabel?: string;
}): Promise<void> {
  const firm = await firmHeader();
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(opts.title)} — ${esc(opts.ficheNo || '')}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; margin: 0; }
    h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: 0.04em; }
    .muted { color: #64748b; font-size: 12px; }
    .box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin-top: 20px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    td { padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
    td.k { color: #64748b; width: 40%; }
    td.v { font-weight: 700; text-align: right; }
    .amount { font-size: 28px; font-weight: 800; margin-top: 16px; }
    .sign { margin-top: 48px; display: flex; justify-content: space-between; }
    .sign div { width: 40%; text-align: center; border-top: 1px solid #94a3b8; padding-top: 8px; font-size: 12px; color: #475569; }
  </style>
</head>
<body>
  <h1>${esc(firm.name)}</h1>
  <div class="muted">${esc(firm.address)}</div>
  <div class="muted">${esc([firm.phone, firm.tax].filter(Boolean).join(' · '))}</div>
  <div class="box">
    <h1>${esc(opts.title)}</h1>
    <div class="muted">${esc(fmtDate(opts.date))} · ${esc(opts.ficheNo || '—')}</div>
    <table>
      <tr><td class="k">Personel</td><td class="v">${esc(opts.employeeName)}</td></tr>
      ${opts.employeeCode ? `<tr><td class="k">Kod</td><td class="v">${esc(opts.employeeCode)}</td></tr>` : ''}
      <tr><td class="k">Fiş No</td><td class="v">${esc(opts.ficheNo || '—')}</td></tr>
      <tr><td class="k">Tarih</td><td class="v">${esc(fmtDate(opts.date))}</td></tr>
      ${opts.definition ? `<tr><td class="k">Açıklama</td><td class="v">${esc(opts.definition)}</td></tr>` : ''}
      <tr><td class="k">Tutar</td><td class="v">${esc(fmtMoney(opts.amount))}</td></tr>
      ${opts.balanceAfter != null ? `<tr><td class="k">${esc(opts.balanceLabel || 'Bakiye')}</td><td class="v">${esc(fmtMoney(opts.balanceAfter))}</td></tr>` : ''}
    </table>
    <div class="amount">${esc(fmtMoney(opts.amount))}</div>
  </div>
  <div class="sign">
    <div>Teslim Eden</div>
    <div>Teslim Alan</div>
  </div>
</body>
</html>`;
  await printReportHtml(html);
}

function txLabel(type: string): string {
  const u = String(type || '').toUpperCase();
  if (u === 'MAAS_HAKKEDIS') return 'Hakkediş';
  if (u === 'MAAS_ODEME') return 'Maaş';
  if (u === 'AVANS_ODEME') return 'Avans';
  if (u === 'AVANS_MAHSUP') return 'Mahsup';
  if (u === 'ORTAK_DAGITIM_KAR') return 'Kâr Dağıtım';
  if (u === 'ORTAK_DAGITIM_ZARAR') return 'Zarar Dağıtım';
  return type || '—';
}

export async function printPartyStatementDoc(opts: {
  title: string;
  partyName: string;
  partyCode?: string | null;
  cardTypeLabel: string;
  start?: string;
  end?: string;
  statement: PartyStatement;
  openingLabel: string;
  closingLabel: string;
  cardBalanceLabel: string;
}): Promise<void> {
  const firm = await firmHeader();
  const rows = opts.statement.rows || [];
  const body = rows.map((r: PartyStatementLine) => `
    <tr>
      <td>${esc(fmtDate(r.date))}</td>
      <td>${esc(r.fiche_no || '—')}</td>
      <td>${esc(txLabel(r.transaction_type))}</td>
      <td>${esc(r.definition || '')}</td>
      <td class="num">${r.debit ? esc(fmtMoney(r.debit)) : ''}</td>
      <td class="num">${r.credit ? esc(fmtMoney(r.credit)) : ''}</td>
      <td class="num">${esc(fmtMoney(r.balance_after))}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(opts.title)} — ${esc(opts.partyName)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; margin: 0; font-size: 12px; }
    h1 { font-size: 18px; margin: 0 0 2px; }
    .muted { color: #64748b; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
    th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #475569; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    .sum { display: flex; gap: 16px; margin-top: 12px; font-weight: 700; }
  </style>
</head>
<body>
  <h1>${esc(firm.name)}</h1>
  <div class="muted">${esc(firm.address)}</div>
  <h1 style="margin-top:12px">${esc(opts.title)}</h1>
  <div class="muted">${esc(opts.partyName)}${opts.partyCode ? ` · ${esc(opts.partyCode)}` : ''} · ${esc(opts.cardTypeLabel)}</div>
  <div class="muted">${esc(fmtDate(opts.start))} — ${esc(fmtDate(opts.end))}</div>
  <table>
    <thead>
      <tr>
        <th>Tarih</th><th>Fiş No</th><th>Tür</th><th>Açıklama</th>
        <th class="num">Borç</th><th class="num">Alacak</th><th class="num">Bakiye</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
  <div class="sum">
    <span>${esc(opts.openingLabel)}: ${esc(fmtMoney(opts.statement.opening_balance))}</span>
    <span>${esc(opts.closingLabel)}: ${esc(fmtMoney(opts.statement.closing_balance))}</span>
    <span>${esc(opts.cardBalanceLabel)}: ${esc(fmtMoney(opts.statement.card_balance))}</span>
  </div>
</body>
</html>`;
  await printReportHtml(html);
}
