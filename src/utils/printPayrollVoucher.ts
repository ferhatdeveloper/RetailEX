import { ERP_SETTINGS, PostgresConnection } from '../services/postgres';
import { getReceiptSettings } from '../services/receiptSettingsService';
import { printReportHtml } from './reportHtmlPrint';
import { receiptNotesForDisplay } from './receiptNotes';
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
  if (u === 'ORTAK_DAGITIM_KAR' || u === 'KAR_DAGITIMI') return 'Kâr Dağıtım';
  if (u === 'ORTAK_DAGITIM_ZARAR' || u === 'ZARAR_DAGITIMI') return 'Zarar Dağıtım';
  if (u === 'SERMAYE_TAHSILAT' || u === 'ORTAK_SERMAYE_TAHSILAT' || u === 'ORTAK_PARA_GIRIS') return 'Para girişi';
  if (u === 'SERMAYE_ODEME' || u === 'ORTAK_SERMAYE_ODEME' || u === 'ORTAK_PARA_CIKIS' || u === 'ORTAK_SERMAYE_CIKIS') return 'Para çıkışı';
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
  debitLabel?: string;
  creditLabel?: string;
  balanceLabel?: string;
}): Promise<void> {
  const firm = await firmHeader();
  const rows = opts.statement.rows || [];
  const printedAt = `${fmtDate(new Date().toISOString().slice(0, 10))} ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
  const debitHdr = opts.debitLabel || 'Borç';
  const creditHdr = opts.creditLabel || 'Alacak';
  const balanceHdr = opts.balanceLabel || 'Bakiye';
  const body = rows.map((r: PartyStatementLine) => `
    <tr>
      <td class="mono">${esc(fmtDate(r.date))}</td>
      <td class="mono">${esc(r.fiche_no || '—')}</td>
      <td>${esc(txLabel(r.transaction_type))}</td>
      <td class="desc">${esc(receiptNotesForDisplay(r.definition) || '')}</td>
      <td class="num debit">${r.debit ? esc(fmtMoney(r.debit)) : ''}</td>
      <td class="num credit">${r.credit ? esc(fmtMoney(r.credit)) : ''}</td>
      <td class="num bal">${esc(fmtMoney(r.balance_after))}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>${esc(opts.title)} — ${esc(opts.partyName)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm 10mm 14mm; }
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; font-size: 10.5px; }
    .letterhead { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2.5px solid #1e3a5f; padding-bottom: 10px; margin-bottom: 10px; }
    .co-name { font-size: 17px; font-weight: 800; }
    .muted { color: #64748b; font-size: 10px; line-height: 1.45; }
    .title { text-align: center; font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: #1e3a5f; margin: 8px 0 12px; }
    .party { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px 12px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; vertical-align: top; }
    th { background: #1e3a5f; color: #fff; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.05em; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    td.mono { font-family: ui-monospace, "Courier New", monospace; }
    td.desc { word-break: break-word; }
    td.debit { color: #b91c1c; font-weight: 600; }
    td.credit { color: #047857; font-weight: 600; }
    td.bal { font-weight: 700; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    .totals-wrap { margin-top: 10px; display: flex; justify-content: flex-end; }
    .totals { width: 100%; max-width: 300px; border: 1px solid #94a3b8; border-top: 2.5px solid #1e3a5f; background: #fff; }
    .totals table { width: 100%; border-collapse: collapse; }
    .totals td { border: none; border-bottom: 1px solid #e2e8f0; padding: 6px 10px; font-size: 10.5px; }
    .totals tr:last-child td { border-bottom: none; }
    .totals .lbl { color: #475569; font-weight: 600; text-align: left; width: 52%; }
    .totals .amt { font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .totals .closing td { background: #f1f5f9; border-top: 1.5px solid #1e3a5f; padding-top: 8px; padding-bottom: 8px; }
    .totals .closing .lbl { color: #0f172a; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; font-size: 9.5px; }
    .totals .closing .amt { color: #0f172a; font-weight: 800; font-size: 12px; }
    .doc-footer { margin-top: 14px; padding-top: 8px; border-top: 1px solid #94a3b8; display: flex; justify-content: space-between; color: #64748b; font-size: 9px; }
    @media print { html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } thead { display: table-header-group; } .totals-wrap { break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="letterhead">
    <div>
      <div class="co-name">${esc(firm.name)}</div>
      <div class="muted">${esc(firm.address)}${firm.phone ? `<br/>${esc(firm.phone)}` : ''}${firm.tax ? `<br/>${esc(firm.tax)}` : ''}</div>
    </div>
    <div class="muted" style="text-align:right">
      ${esc(fmtDate(opts.start))} → ${esc(fmtDate(opts.end))}
    </div>
  </div>
  <div class="title">${esc(opts.title)}</div>
  <div class="party">
    <strong>${esc(opts.partyName)}</strong>${opts.partyCode ? ` · ${esc(opts.partyCode)}` : ''}
    <span class="muted"> · ${esc(opts.cardTypeLabel)}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>Tarih</th><th>Fiş No</th><th>Tür</th><th>Açıklama</th>
        <th class="num">${esc(debitHdr)}</th><th class="num">${esc(creditHdr)}</th><th class="num">${esc(balanceHdr)}</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
  <div class="totals-wrap">
    <div class="totals">
      <table>
        <tr>
          <td class="lbl">${esc(opts.openingLabel)}</td>
          <td class="amt">${esc(fmtMoney(opts.statement.opening_balance))}</td>
        </tr>
        <tr class="closing">
          <td class="lbl">${esc(opts.closingLabel)}</td>
          <td class="amt">${esc(fmtMoney(opts.statement.closing_balance))}</td>
        </tr>
        ${
          Math.abs(Number(opts.statement.card_balance) - Number(opts.statement.closing_balance)) > 0.0001
            ? `<tr>
          <td class="lbl">${esc(opts.cardBalanceLabel)}</td>
          <td class="amt">${esc(fmtMoney(opts.statement.card_balance))}</td>
        </tr>`
            : ''
        }
      </table>
    </div>
  </div>
  <div class="doc-footer">
    <span>Yazdırma tarihi: ${esc(printedAt)}</span>
    <span>${esc(firm.name)}</span>
  </div>
</body>
</html>`;
  await printReportHtml(html);
}
