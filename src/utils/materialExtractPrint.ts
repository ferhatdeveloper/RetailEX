/**
 * Malzeme ekstresi yazdırma: yerleşik A4 HTML + Dizayn Merkezi context.
 */
import type { Template, TemplateType, TemplateUsageScope } from '../core/types/templates';
import { DEFAULT_TEMPLATES } from '../core/types/templates';
import type { PrintDesignKind } from '../core/types/printDesignBindings';
import type { ReceiptSettings } from '../services/receiptSettingsService';
import { formatNumber } from './formatNumber';
import { displayItemCode } from './lastPurchaseCostSql';
import { isInboundMovement, isOutboundMovement } from './materialExtractLabels';

export const MATERIAL_EXTRACT_PRINT_SCOPE = 'material_extract' as const;
export const MATERIAL_EXTRACT_PRINT_LS_KEY = 'retailex_material_extract_print_design';
export const MATERIAL_EXTRACT_BUILTIN_ID = 'builtin-material-extract';

const PAPER_FORMATS = new Set(['A4', 'A5', 'Letter']);

export type MaterialExtractPrintRow = {
  date: string;
  trcode: number;
  movement_type: string;
  source_type: string;
  fiche_type: string;
  document_no: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  running_balance: number;
  warehouse_name?: string;
};

export type MaterialExtractPrintLabels = {
  reportTitle: string;
  date: string;
  ficheType: string;
  ficheNo: string;
  description: string;
  inQty: string;
  inAmt: string;
  outQty: string;
  outAmt: string;
  runningBalance: string;
  total: string;
  dateRange: string;
  empty: string;
};

export type MaterialExtractPrintInput = {
  reportTitle: string;
  productCode: string;
  productName: string;
  dateFrom: string;
  dateTo: string;
  currency: string;
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyTaxNumber?: string;
  companyTaxOffice?: string;
  logoDataUrl?: string;
  rows: MaterialExtractPrintRow[];
  totals: {
    totalInQty: number;
    totalInAmount: number;
    totalOutQty: number;
    totalOutAmount: number;
  };
  labels: MaterialExtractPrintLabels;
  labelFiche: (row: MaterialExtractPrintRow) => string;
};

export type ExtractPrintSelection = {
  kind: PrintDesignKind;
  id: string | null;
  name: string | null;
};

export function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatExtractDate(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      const [y, m, day] = raw.slice(0, 10).split('-');
      return `${day}.${m}.${y}`;
    }
    return raw;
  }
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export function companyHeaderFromReceiptSettings(
  settings: ReceiptSettings | null | undefined,
  fallbackName: string,
): Pick<
  MaterialExtractPrintInput,
  | 'companyName'
  | 'companyAddress'
  | 'companyPhone'
  | 'companyTaxNumber'
  | 'companyTaxOffice'
  | 'logoDataUrl'
> {
  const s = settings || {};
  return {
    companyName: String(s.companyName || fallbackName || 'RetailEX').trim() || 'RetailEX',
    companyAddress: s.companyAddress || '',
    companyPhone: s.companyPhone || '',
    companyTaxNumber: s.companyTaxNumber || '',
    companyTaxOffice: s.companyTaxOffice || '',
    logoDataUrl: s.logoDataUrl || '',
  };
}

export function collectMaterialExtractDesignTemplates(
  getTemplatesForScope: (type: TemplateType, scope?: TemplateUsageScope) => Template[],
  getTemplatesByType: (type: TemplateType) => Template[],
): Template[] {
  const scoped = getTemplatesForScope('invoice', 'material_extract');
  const paper = getTemplatesByType('invoice').filter((t) => PAPER_FORMATS.has(t.format));
  const seeded = DEFAULT_TEMPLATES.filter(
    (t) =>
      t.type === 'invoice' &&
      ((t.usageScopes ?? []).includes('material_extract') || PAPER_FORMATS.has(t.format)),
  );
  const map = new Map<string, Template>();
  for (const t of [...seeded, ...scoped, ...paper]) {
    if (t?.id) map.set(t.id, t);
  }
  return Array.from(map.values());
}

export function readStoredExtractPrintDesign(): ExtractPrintSelection | null {
  try {
    const raw = localStorage.getItem(MATERIAL_EXTRACT_PRINT_LS_KEY);
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed) as ExtractPrintSelection;
      if (parsed?.kind === 'builtin' || parsed?.kind === 'design_center' || parsed?.kind === 'fastreport_frx') {
        return {
          kind: parsed.kind,
          id: parsed.id ?? null,
          name: parsed.name ?? null,
        };
      }
      return null;
    }
    const [kindRaw, ...rest] = trimmed.split('::');
    const kind = (kindRaw === 'fastreport_frx' || kindRaw === 'design_center' || kindRaw === 'builtin'
      ? kindRaw
      : null) as PrintDesignKind | null;
    if (!kind) return null;
    return { kind, id: rest.join('::') || null, name: null };
  } catch {
    return null;
  }
}

export function writeStoredExtractPrintDesign(sel: ExtractPrintSelection): void {
  try {
    localStorage.setItem(MATERIAL_EXTRACT_PRINT_LS_KEY, JSON.stringify(sel));
  } catch {
    /* ignore quota / private mode */
  }
}

export function selectionKey(sel: Pick<ExtractPrintSelection, 'kind' | 'id'>): string {
  return `${sel.kind}::${sel.id ?? ''}`;
}

type MappedExtractItem = {
  dateLabel: string;
  typeLabel: string;
  documentNo: string;
  document_no: string;
  description: string;
  inQty: number | '';
  inAmt: number | '';
  outQty: number | '';
  outAmt: number | '';
  runningBalance: number;
  running_balance: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  unit_price: number;
  total: number;
  name: string;
  date: string;
  ficheType: string;
};

function mapPrintRows(input: MaterialExtractPrintInput): MappedExtractItem[] {
  return input.rows.map((row) => {
    const inbound = isInboundMovement(row.movement_type);
    const outbound = isOutboundMovement(row.movement_type);
    const typeLabel = input.labelFiche(row);
    const desc = row.description || row.warehouse_name || '';
    const dateLabel = formatExtractDate(row.date);
    return {
      dateLabel,
      typeLabel,
      documentNo: row.document_no || '',
      document_no: row.document_no || '',
      description: desc,
      inQty: inbound ? row.quantity : '',
      inAmt: inbound ? row.amount : '',
      outQty: outbound ? row.quantity : '',
      outAmt: outbound ? row.amount : '',
      runningBalance: row.running_balance,
      running_balance: row.running_balance,
      productName: desc || typeLabel,
      quantity: row.quantity,
      unitPrice: row.unit_price,
      unit_price: row.unit_price,
      total: row.amount,
      name: desc || typeLabel,
      date: dateLabel,
      ficheType: typeLabel,
    };
  });
}

function cellNum(value: number | ''): string {
  if (value === '' || value == null) return '';
  return formatNumber(Number(value) || 0, 2);
}

export function buildMaterialExtractPrintHtml(input: MaterialExtractPrintInput): string {
  const productCode = displayItemCode(input.productCode);
  const productName = String(input.productName || '').trim();
  const L = input.labels;
  const items = mapPrintRows(input);
  const lastBalance = input.rows[input.rows.length - 1]?.running_balance ?? 0;
  const taxLine = [input.companyTaxOffice, input.companyTaxNumber].filter(Boolean).join(' · ');
  const logo = input.logoDataUrl
    ? `<img src="${escapeHtml(input.logoDataUrl)}" alt="" style="max-height:48px;max-width:160px;object-fit:contain" />`
    : '';
  const bodyRows =
    items.length === 0
      ? `<tr><td colspan="9" style="text-align:center;padding:16px;color:#64748b">${escapeHtml(L.empty)}</td></tr>`
      : items
          .map(
            (r) => `<tr>
<td>${escapeHtml(r.dateLabel)}</td>
<td>${escapeHtml(r.typeLabel)}</td>
<td>${escapeHtml(r.documentNo)}</td>
<td>${escapeHtml(r.description)}</td>
<td class="num in">${escapeHtml(cellNum(r.inQty))}</td>
<td class="num in">${escapeHtml(cellNum(r.inAmt))}</td>
<td class="num out">${escapeHtml(cellNum(r.outQty))}</td>
<td class="num out">${escapeHtml(cellNum(r.outAmt))}</td>
<td class="num bal">${escapeHtml(formatNumber(r.runningBalance, 2))}</td>
</tr>`,
          )
          .join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(input.reportTitle)} — ${escapeHtml(productCode)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  html, body { margin: 0; padding: 0; background: #fff; color: #0f172a; font-family: Arial, Helvetica, sans-serif; font-size: 11px; }
  .sheet { width: 100%; }
  .head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; border-bottom: 2px solid #1d4ed8; padding-bottom: 10px; }
  .head-left { display: flex; gap: 12px; align-items: flex-start; }
  .co-name { font-size: 16px; font-weight: 800; letter-spacing: 0.02em; }
  .co-meta { color: #475569; margin-top: 2px; line-height: 1.4; }
  .title { text-align: center; margin: 14px 0 6px; font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; }
  .sub { text-align: center; color: #334155; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 6px; vertical-align: top; }
  th { background: #1d4ed8; color: #fff; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; text-align: left; }
  td.num, th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.in { color: #047857; }
  td.out { color: #b91c1c; }
  td.bal { font-weight: 700; }
  tfoot td { background: #f1f5f9; font-weight: 700; }
</style>
</head>
<body>
<div class="sheet">
  <div class="head">
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
    <div class="co-meta" style="text-align:right">
      ${escapeHtml(L.dateRange)}<br/>
      ${escapeHtml(formatExtractDate(input.dateFrom) || input.dateFrom)} → ${escapeHtml(formatExtractDate(input.dateTo) || input.dateTo)}<br/>
      ${escapeHtml(input.currency)}
    </div>
  </div>
  <div class="title">${escapeHtml(input.reportTitle)}</div>
  <div class="sub"><strong>${escapeHtml(productCode)}</strong>${productName ? ` — ${escapeHtml(productName)}` : ''}</div>
  <table>
    <thead>
      <tr>
        <th>${escapeHtml(L.date)}</th>
        <th>${escapeHtml(L.ficheType)}</th>
        <th>${escapeHtml(L.ficheNo)}</th>
        <th>${escapeHtml(L.description)}</th>
        <th class="num">${escapeHtml(L.inQty)}</th>
        <th class="num">${escapeHtml(L.inAmt)}</th>
        <th class="num">${escapeHtml(L.outQty)}</th>
        <th class="num">${escapeHtml(L.outAmt)}</th>
        <th class="num">${escapeHtml(L.runningBalance)}</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="4">${escapeHtml(L.total)}</td>
        <td class="num in">${escapeHtml(formatNumber(input.totals.totalInQty, 2))}</td>
        <td class="num in">${escapeHtml(formatNumber(input.totals.totalInAmount, 2))}</td>
        <td class="num out">${escapeHtml(formatNumber(input.totals.totalOutQty, 2))}</td>
        <td class="num out">${escapeHtml(formatNumber(input.totals.totalOutAmount, 2))}</td>
        <td class="num bal">${escapeHtml(formatNumber(lastBalance, 2))}</td>
      </tr>
    </tfoot>
  </table>
</div>
</body>
</html>`;
}

/**
 * Dizayn Merkezi / FastReport şablonları için fatura-benzeri context.
 * invoiceNo = ürün kart kodu (UUID değil).
 */
export function buildMaterialExtractPrintContext(input: MaterialExtractPrintInput): Record<string, unknown> {
  const productCode = displayItemCode(input.productCode);
  const productName = String(input.productName || '').trim();
  const items = mapPrintRows(input);
  const lastBalance = input.rows[input.rows.length - 1]?.running_balance ?? 0;
  const dateFromLabel = formatExtractDate(input.dateFrom) || input.dateFrom;
  const dateToLabel = formatExtractDate(input.dateTo) || input.dateTo;
  const dateRange = `${dateFromLabel} → ${dateToLabel}`;

  return {
    storeName: input.companyName,
    storeAddress: input.companyAddress || '',
    storePhone: input.companyPhone || '',
    storeTaxNo: input.companyTaxNumber || '',
    reportTitle: input.reportTitle,
    productCode,
    productName,
    dateFrom: dateFromLabel,
    dateTo: dateToLabel,
    date: dateRange,
    time: '',
    invoiceNo: productCode,
    receiptNumber: productCode,
    ficheNo: productCode,
    customerName: productName,
    items,
    subtotal: formatNumber(input.totals.totalInAmount, 2, true),
    discount: formatNumber(input.totals.totalOutAmount, 2, true),
    tax: formatNumber(0, 2, true),
    total: formatNumber(lastBalance, 2, true),
    currency: input.currency,
    notes: dateRange,
    barcode: productCode === '—' ? '' : productCode,
  };
}
