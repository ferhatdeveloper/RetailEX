/**
 * Hesap ekstresi / fatura özeti — HTML → PDF → paylaş.
 */
import { Share, Platform } from 'react-native';
import { formatMoney } from '../api/erpTables';

export type PdfShareRow = {
  date?: string;
  title: string;
  amount?: number;
  meta?: string;
};

export async function shareReportPdf(opts: {
  title: string;
  subtitle?: string;
  rows: PdfShareRow[];
  footerNote?: string;
}): Promise<{ ok: boolean; message: string }> {
  const rowsHtml = opts.rows
    .map((r) => {
      const amt =
        r.amount != null
          ? `<td style="text-align:right;font-weight:700">${escapeHtml(formatMoney(r.amount))}</td>`
          : '<td></td>';
      return `<tr>
        <td>${escapeHtml(r.date || '')}</td>
        <td>${escapeHtml(r.title)}${r.meta ? `<div style="color:#6b7280;font-size:11px">${escapeHtml(r.meta)}</div>` : ''}</td>
        ${amt}
      </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>${escapeHtml(opts.title)}</title>
<style>
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:24px;color:#111}
h1{font-size:18px;margin:0 0 4px} .sub{color:#6b7280;font-size:12px;margin-bottom:16px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border-bottom:1px solid #e5e7eb;padding:8px 4px;text-align:left;vertical-align:top}
th{color:#6b7280;font-size:10px;text-transform:uppercase}
.foot{margin-top:20px;font-size:11px;color:#9ca3af}
</style></head><body>
<h1>${escapeHtml(opts.title)}</h1>
<div class="sub">${escapeHtml(opts.subtitle || '')}</div>
<table>
<thead><tr><th>Tarih</th><th>Açıklama</th><th style="text-align:right">Tutar</th></tr></thead>
<tbody>${rowsHtml || '<tr><td colspan="3">Kayıt yok</td></tr>'}</tbody>
</table>
<div class="foot">${escapeHtml(opts.footerNote || 'RetailEX')}</div>
</body></html>`;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Print = require('expo-print') as {
      printToFileAsync: (o: { html: string }) => Promise<{ uri: string }>;
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sharing = require('expo-sharing') as {
      isAvailableAsync: () => Promise<boolean>;
      shareAsync: (uri: string, opts?: { mimeType?: string; dialogTitle?: string }) => Promise<void>;
    };
    const file = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/pdf',
        dialogTitle: opts.title,
      });
      return { ok: true, message: 'PDF paylaşıldı' };
    }
    await Share.share({
      url: file.uri,
      title: opts.title,
      message: Platform.OS === 'android' ? file.uri : undefined,
    });
    return { ok: true, message: 'Paylaşım açıldı' };
  } catch (e) {
    // Fallback: düz metin paylaş
    try {
      const text = [
        opts.title,
        opts.subtitle || '',
        ...opts.rows.map(
          (r) =>
            `${r.date || ''} ${r.title} ${r.amount != null ? formatMoney(r.amount) : ''}`.trim(),
        ),
      ]
        .filter(Boolean)
        .join('\n');
      await Share.share({ message: text, title: opts.title });
      return {
        ok: true,
        message:
          'PDF paketleri yok — metin olarak paylaşıldı. `npx expo install expo-print expo-sharing` önerilir.',
      };
    } catch (e2) {
      return {
        ok: false,
        message: e2 instanceof Error ? e2.message : String(e2),
      };
    }
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
