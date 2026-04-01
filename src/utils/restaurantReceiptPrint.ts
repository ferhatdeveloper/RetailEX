import type { Sale } from '../core/types/models';

/** Restoran ödeme modalı taslak yazdırma bağlamı (POS modal ile uyumlu) */
export type RestaurantDraftPaymentCtx = {
  payments: Array<{ method: string; amount: number; currency: string }>;
  totalPaid: number;
  change: number;
  remaining: number;
  finalTotal: number;
  discount: number;
};

export type RestaurantAdisyonPrintInput = {
  sale: Sale;
  ctx: RestaurantDraftPaymentCtx;
  companyName: string;
  logoDataUrl?: string | null;
  companyAddress?: string;
  companyPhone?: string;
  companyTaxOffice?: string;
  companyTaxNumber?: string;
  /** Fiş üstü etiket (örn. ÖN HESAP) */
  draftLabel?: string;
};

/**
 * 80mm adisyon / ön fiş HTML — önizleme yok, doğrudan yazıcıya gönderim için.
 */
export function buildRestaurantAdisyonHtml(input: RestaurantAdisyonPrintInput): string {
  const {
    sale,
    ctx,
    companyName,
    logoDataUrl,
    companyAddress,
    companyPhone,
    companyTaxOffice,
    companyTaxNumber,
    draftLabel = 'ÖN HESAP',
  } = input;

  const logoTrim = logoDataUrl && String(logoDataUrl).trim();
  const logoSafe =
    logoTrim && logoTrim.startsWith('data:image/')
      ? logoTrim
      : undefined;
  const logoHtml = logoSafe
    ? `<img src=${JSON.stringify(logoSafe)} alt="" style="max-height:14mm;max-width:72mm;width:auto;height:auto;display:block;margin:0 auto 5px;object-fit:contain" />`
    : '';
  const subLine = [companyAddress, companyPhone].filter(Boolean).join(' | ');
  const taxLines: string[] = [];
  if (companyTaxNumber) taxLines.push(`VKN: ${companyTaxNumber}`);
  if (companyTaxOffice) taxLines.push(`VD: ${companyTaxOffice}`);
  const taxBlock = taxLines.map((line) => `<p class="sub" style="margin:0">${escapeHtml(line)}</p>`).join('');

  const itemRows = (sale.items || []).map((it: { productName?: string; quantity?: number; total?: number; price?: number }) => {
    const name = (it.productName || '').slice(0, 22);
    const lineTotal = it.total ?? (it.price ?? 0) * (it.quantity ?? 0);
    return `<tr><td style="text-align:left;padding:1px 2px;font-size:9px;word-break:break-word;width:45%">${escapeHtml(name)}</td><td style="text-align:center;padding:1px 2px;font-size:9px;width:15%">${it.quantity ?? 0}x</td><td style="text-align:right;padding:1px 2px;font-size:9px;font-weight:bold;white-space:nowrap;width:40%;min-width:0">${lineTotal.toLocaleString('tr-TR')} IQD</td></tr>`;
  }).join('');

  const payRows = (ctx.payments || []).map((p) => {
    const label =
      p.method === 'cash' ? 'NAKIT' : p.method === 'card' ? 'KART' : p.method === 'veresiye' ? 'VERESIYE' : 'QR';
    const cur = p.currency || 'IQD';
    const amt = (p.amount ?? 0).toLocaleString('tr-TR');
    return `<tr><td>${label}</td><td style="text-align:right;font-weight:bold">${amt} ${cur}</td></tr>`;
  }).join('');

  const tableRow = sale.table
    ? `<tr><td>MASA:</td><td style="text-align:right;font-weight:bold">${escapeHtml(String(sale.table))}</td></tr>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fiş - ${escapeHtml(sale.receiptNumber)}</title>
<style>
  /* auto: içerik kadar yükseklik — altta boş kağıt bırakmaz; kesim çizgisine yakın biter */
  @page{size:80mm auto;margin:0}
  html,body{height:auto!important;min-height:0!important;margin:0;padding:0}
  body{font-family:'Courier New',Courier,monospace;padding:2mm 2mm 0 2mm;font-size:10.5px;line-height:1.28;width:80mm;max-width:80mm;box-sizing:border-box;color:#000;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact;overflow-x:hidden;page-break-after:avoid;text-rendering:optimizeLegibility}
  *{color:#000 !important;box-sizing:border-box}
  h2{text-align:center;margin:2px 0;font-size:13px;font-weight:800;color:#000}
  .sub{text-align:center;font-size:8.5px;color:#000;margin:1px 0;font-weight:700}
  .banner{text-align:center;font-size:11px;font-weight:800;margin:4px 0;padding:4px;border:1.3px dashed #000}
  hr{border:0;border-top:1.2px solid #000;margin:3px 0}
  table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9.5px}
  td{padding:1px 2px;font-size:9.5px;color:#000;font-weight:700}
  .total{font-size:11.5px;font-weight:800;text-align:right;color:#000}
  .center{text-align:center}
  p{color:#000;margin:2px 0}
  .foot{margin:0;padding:0 0 1mm 0}
</style>
</head><body>
${logoHtml}
<h2>${escapeHtml(companyName)}</h2>
${subLine ? `<p class="sub">${escapeHtml(subLine)}</p>` : ''}
${taxBlock}
<div class="banner">${escapeHtml(draftLabel)}</div>
<hr/>
<table>
  <tr><td>FİŞ NO:</td><td style="text-align:right;font-weight:bold">${escapeHtml(sale.receiptNumber)}</td></tr>
  <tr><td>TARİH:</td><td style="text-align:right">${escapeHtml(new Date(sale.date).toLocaleString('tr-TR'))}</td></tr>
  ${sale.cashier ? `<tr><td>KASİYER:</td><td style="text-align:right">${escapeHtml(sale.cashier)}</td></tr>` : ''}
  ${tableRow}
</table>
<hr/>
<table style="table-layout:fixed"><thead><tr><td style="text-align:left;font-size:8px">Ürün</td><td style="text-align:center;font-size:8px">Adet</td><td style="text-align:right;font-size:8px">Tutar</td></tr></thead><tbody>${itemRows}</tbody></table>
<hr/>
<table style="width:100%">
  <tr><td>ARA TOPLAM:</td><td style="text-align:right;white-space:nowrap">${(sale.subtotal ?? 0).toLocaleString('tr-TR')} IQD</td></tr>
  ${sale.discount > 0 ? `<tr><td>İNDİRİM:</td><td style="text-align:right;color:red">-${(sale.discount ?? 0).toLocaleString('tr-TR')} IQD</td></tr>` : ''}
</table>
<hr/>
<p class="total" style="white-space:nowrap">TOPLAM: ${(sale.total ?? 0).toLocaleString('tr-TR')} IQD</p>
<hr/>
<p style="font-weight:800;margin:4px 0">ÖDEME:</p>
<table>${payRows}</table>
<p style="text-align:right;margin:4px 0">ÖDENEN: ${(ctx.totalPaid ?? 0).toLocaleString('tr-TR')} IQD</p>
${ctx.remaining > 0.01 ? `<p style="text-align:right;font-weight:bold">KALAN: ${ctx.remaining.toLocaleString('tr-TR')} IQD</p>` : ''}
${ctx.change > 0 ? `<p style="text-align:right">PARA ÜSTÜ: ${ctx.change.toLocaleString('tr-TR')} IQD</p>` : ''}
<div class="foot">
<p class="center" style="font-size:10px;color:#000;font-weight:600;margin:2px 0 0 0">*** Bizi Tercih Ettiğiniz İçin Teşekkürler ***</p>
</div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Önizleme penceresi açmadan yazdır: Tauri → print_html_silent; aksi gizli iframe + print().
 * Gecikmeler minimum tutulur (iframe yolu tarayıcı yazdırma iletişim kutusu için).
 */
export async function printRestaurantHtmlNoPreview(html: string): Promise<void> {
  const isTauri = typeof window !== 'undefined' && ((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ || (window as unknown as { __TAURI__?: unknown }).__TAURI__);
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('print_html_silent', { html, printerName: null });
      return;
    } catch (e) {
      console.warn('[restaurantReceiptPrint] print_html_silent:', e);
    }
  }

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    throw new Error('iframe document');
  }
  doc.open();
  doc.write(html);
  doc.close();
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      try {
        document.body.removeChild(iframe);
      } catch {
        /* ignore */
      }
      resolve();
    };
    requestAnimationFrame(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        try {
          document.body.removeChild(iframe);
        } catch {
          /* ignore */
        }
        reject(err);
        return;
      }
      setTimeout(cleanup, 120);
    });
  });
}
