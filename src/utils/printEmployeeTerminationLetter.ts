/**
 * İngilizce işten çıkış / employment termination letter (A4 print).
 */
import { ERP_SETTINGS, PostgresConnection } from '../services/postgres';
import { getReceiptSettings } from '../services/receiptSettingsService';
import { printReportHtml } from './reportHtmlPrint';

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDateEn(d?: string | null): string {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  if (!y || !m || !day) return s;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const mi = Math.max(0, Math.min(11, parseInt(m, 10) - 1));
  return `${months[mi]} ${parseInt(day, 10)}, ${y}`;
}

function fmtMoney(n: number, currency = 'IQD'): string {
  const v = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0));
  return `${v} ${currency}`;
}

async function firmHeader(): Promise<{ name: string; address: string; phone: string }> {
  const postgres = PostgresConnection.getInstance();
  let firm: Record<string, unknown> | null = null;
  try {
    firm = (await postgres.getFirmDetails(ERP_SETTINGS.firmNr)) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  let receipt: Awaited<ReturnType<typeof getReceiptSettings>> = {};
  try {
    receipt = await getReceiptSettings();
  } catch {
    /* ignore */
  }
  return {
    name: String(receipt.companyName || firm?.title || firm?.name || 'RetailEX'),
    address: String(receipt.companyAddress || firm?.address || ''),
    phone: String(receipt.companyPhone || firm?.phone || ''),
  };
}

export interface EmployeeTerminationLetterOpts {
  employeeName: string;
  employeeCode?: string | null;
  department?: string | null;
  position?: string | null;
  hireDate?: string | null;
  terminationDate: string;
  /** Pro-rated final month accrual (optional) */
  finalAccrualAmount?: number | null;
  currencyCode?: string | null;
  reason?: string | null;
  issueDate?: string | null;
}

export async function printEmployeeTerminationLetterEn(
  opts: EmployeeTerminationLetterOpts,
): Promise<void> {
  const firm = await firmHeader();
  const issue = opts.issueDate || new Date().toISOString().slice(0, 10);
  const currency = opts.currencyCode || 'IQD';
  const reason =
    opts.reason?.trim() ||
    'Voluntary resignation / end of employment as recorded by the employer.';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Employment Termination Letter — ${esc(opts.employeeName)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: "Times New Roman", Times, serif; color: #0f172a; margin: 0; line-height: 1.45; font-size: 12.5pt; }
    h1 { font-size: 18pt; letter-spacing: 0.06em; text-align: center; margin: 0 0 6px; text-transform: uppercase; }
    .sub { text-align: center; color: #475569; font-size: 11pt; margin-bottom: 22px; }
    .firm { font-weight: 700; font-size: 14pt; }
    .muted { color: #64748b; font-size: 10.5pt; }
    p { margin: 0 0 12px; text-align: justify; }
    .meta { margin: 18px 0; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px 14px; }
    .meta table { width: 100%; border-collapse: collapse; }
    .meta td { padding: 5px 0; vertical-align: top; font-size: 11.5pt; }
    .meta td.k { width: 38%; color: #475569; }
    .meta td.v { font-weight: 700; }
    .sign { display: flex; justify-content: space-between; gap: 24px; margin-top: 48px; }
    .sign .box { width: 46%; }
    .line { margin-top: 48px; border-top: 1px solid #0f172a; padding-top: 6px; font-size: 10.5pt; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="firm">${esc(firm.name)}</div>
  <div class="muted">${esc(firm.address)}${firm.phone ? ` · ${esc(firm.phone)}` : ''}</div>
  <p class="muted" style="margin-top:14px">Date: <strong>${esc(fmtDateEn(issue))}</strong></p>

  <h1>Employment Termination Letter</h1>
  <div class="sub">Certificate of End of Employment</div>

  <p>
    This letter confirms that the employment relationship between
    <strong>${esc(firm.name)}</strong> (the “Employer”) and
    <strong>${esc(opts.employeeName)}</strong> (the “Employee”)
    ${opts.employeeCode ? `(Employee Code: <strong>${esc(opts.employeeCode)}</strong>)` : ''}
    has ended.
  </p>

  <div class="meta">
    <table>
      <tr><td class="k">Employee full name</td><td class="v">${esc(opts.employeeName)}</td></tr>
      <tr><td class="k">Employee code</td><td class="v">${esc(opts.employeeCode || '—')}</td></tr>
      <tr><td class="k">Department</td><td class="v">${esc(opts.department || '—')}</td></tr>
      <tr><td class="k">Position</td><td class="v">${esc(opts.position || '—')}</td></tr>
      <tr><td class="k">Date of hire</td><td class="v">${esc(fmtDateEn(opts.hireDate))}</td></tr>
      <tr><td class="k">Last working day / termination date</td><td class="v">${esc(fmtDateEn(opts.terminationDate))}</td></tr>
      <tr><td class="k">Reason (summary)</td><td class="v">${esc(reason)}</td></tr>
      ${
        opts.finalAccrualAmount != null && Number.isFinite(Number(opts.finalAccrualAmount))
          ? `<tr><td class="k">Final month salary accrual (pro-rated)</td><td class="v">${esc(
              fmtMoney(Number(opts.finalAccrualAmount), currency),
            )}</td></tr>`
          : ''
      }
    </table>
  </div>

  <p>
    As of the termination date stated above, the Employee is no longer employed by the Employer.
    Salary accruals for periods after the termination date shall not be posted.
    Any final settlement of wages, advances, or other amounts due shall be handled in accordance
    with the Employer’s payroll records and applicable law.
  </p>

  <p>
    This letter is issued for employment / administrative purposes. It does not replace any
    government form that may be required under local labour regulations.
  </p>

  <div class="sign">
    <div class="box">
      <div class="line">Employer authorized signature<br/>Name / Title</div>
    </div>
    <div class="box">
      <div class="line">Employee acknowledgment (optional)<br/>${esc(opts.employeeName)}</div>
    </div>
  </div>

  <p class="muted" style="margin-top:28px">Generated by RetailEX · ${esc(firm.name)}</p>
</body>
</html>`;

  await printReportHtml(html, { preferMainDocument: true });
}

/** HTML string for artifact / download without opening print dialog */
export function buildEmployeeTerminationLetterEnHtml(
  opts: EmployeeTerminationLetterOpts & { companyName: string; companyAddress?: string; companyPhone?: string },
): string {
  const issue = opts.issueDate || new Date().toISOString().slice(0, 10);
  const currency = opts.currencyCode || 'IQD';
  const reason =
    opts.reason?.trim() ||
    'Voluntary resignation / end of employment as recorded by the employer.';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Employment Termination — ${esc(opts.employeeName)}</title></head>
<body style="font-family:Times New Roman,serif;max-width:720px;margin:24px auto;line-height:1.45">
<h2 style="text-align:center;letter-spacing:0.06em">EMPLOYMENT TERMINATION LETTER</h2>
<p><strong>${esc(opts.companyName)}</strong><br/>${esc(opts.companyAddress || '')}${opts.companyPhone ? `<br/>${esc(opts.companyPhone)}` : ''}</p>
<p>Date: ${esc(fmtDateEn(issue))}</p>
<p>This confirms that employment of <strong>${esc(opts.employeeName)}</strong>${
    opts.employeeCode ? ` (Code ${esc(opts.employeeCode)})` : ''
  } with the Employer ended on <strong>${esc(fmtDateEn(opts.terminationDate))}</strong>.</p>
<ul>
<li>Hire date: ${esc(fmtDateEn(opts.hireDate))}</li>
<li>Last working day: ${esc(fmtDateEn(opts.terminationDate))}</li>
<li>Department / Position: ${esc(opts.department || '—')} / ${esc(opts.position || '—')}</li>
<li>Reason: ${esc(reason)}</li>
${
  opts.finalAccrualAmount != null
    ? `<li>Final month pro-rated accrual: ${esc(fmtMoney(Number(opts.finalAccrualAmount), currency))}</li>`
    : ''
}
</ul>
<p>No salary accrual shall be posted for periods after the termination date. Final settlement follows payroll records and applicable law.</p>
<p style="margin-top:48px">_______________________________<br/>Employer authorized signature</p>
</body></html>`;
}
