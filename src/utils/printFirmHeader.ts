/**
 * Yazdırma başlığı: firma logosu ve hemen altında ortalı firma adı.
 * Ürün satırı (EXFIN) firma adı değildir. Eski yer tutucular da firma adı sayılmaz.
 */
import { isGenericFirmName } from '../services/firmNamePreserve';
import { RECEIPT_80MM_LOGO_IMG_INLINE_STYLE } from './receipt80mmDocumentCss';

export type PrintFirmNameSource = {
  receiptCompanyName?: string | null;
  firmaAdi?: string | null;
  title?: string | null;
  name?: string | null;
};

const PRODUCT_PRINT_LINES = new Set([
  'EXFIN',
  'EXFIN POS Z Raporu',
  'EXFIN - Professional POS System',
  'EXFIN - Professional Retail Management System',
  'EXFIN - Fiyat Değişim Fişi',
  'EXFIN - Mağaza Yönetim Sistemi',
  'RetailOS Mağaza Sistemi',
  'RetailOS Store System',
  'نظام متجر RetailOS',
  'سیستەمی فرۆشگای RetailOS',
  'RetailOS',
  'RetailOS POS Z Raporu',
  'RetailOS v1.0',
  'RetailOS v1.0.0',
  'RetailEX',
  'RetailEX ERP',
  'RetailEX Mobile',
  'ExRetailOS',
]);

export function isProductPrintLine(value: string | null | undefined): boolean {
  const n = String(value ?? '').trim();
  if (!n) return false;
  return PRODUCT_PRINT_LINES.has(n);
}

/** Kullanıcının yazdığı firma adı. Yer tutucu ve ürün alt satırı seçilmez. */
export function resolvePrintFirmName(source: PrintFirmNameSource | null | undefined): string {
  const ordered = [
    source?.receiptCompanyName,
    source?.firmaAdi,
    source?.title,
    source?.name,
  ];
  for (const raw of ordered) {
    const n = String(raw ?? '').trim();
    if (!n || isGenericFirmName(n) || isProductPrintLine(n)) continue;
    return n;
  }
  for (const raw of ordered) {
    const n = String(raw ?? '').trim();
    if (n && !isProductPrintLine(n)) return n;
  }
  return '';
}

export function escapePrintHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** data:image veya http(s) logo. Sahte logo üretilmez. */
export function printableLogoSrc(logoDataUrl: string | null | undefined): string {
  const raw = String(logoDataUrl ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:image/')) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  return '';
}

export function buildCenteredFirmHeaderHtml(input: {
  firmName?: string | null;
  logoDataUrl?: string | null;
  nameStyle?: string;
}): string {
  const name = String(input.firmName ?? '').trim();
  const logo = printableLogoSrc(input.logoDataUrl);
  const logoHtml = logo
    ? `<div data-print-firm-logo="1" class="rx-firm-logo" style="display:block;width:100%;max-width:100%;text-align:center;float:none;direction:ltr"><img src=${JSON.stringify(logo)} alt="" style="${RECEIPT_80MM_LOGO_IMG_INLINE_STYLE}" /></div>`
    : '';
  const nameStyle = input.nameStyle?.trim() || 'display:block;width:100%;float:none;text-align:center;font-weight:600;color:#000;line-height:1.15';
  const nameHtml = name
    ? `<div data-print-firm-name="1" class="center rx-firm-name" style="${nameStyle}">${escapePrintHtml(name)}</div>`
    : '';
  if (!logoHtml && !nameHtml) return '';
  return `<div data-print-firm-header="1" class="center rx-firm-header" style="display:block;width:100%;max-width:100%;text-align:center;float:none">${logoHtml}${nameHtml}</div>`;
}

export async function loadCenteredFirmHeader(opts?: {
  firmNr?: string;
  firm?: PrintFirmNameSource;
  nameStyle?: string;
}): Promise<{ firmName: string; logoDataUrl: string; html: string }> {
  const { getReceiptSettings } = await import('../services/receiptSettingsService');
  let receiptCompanyName = '';
  let logoDataUrl = '';
  try {
    const rs = await getReceiptSettings(opts?.firmNr);
    receiptCompanyName = String(rs.companyName || '');
    logoDataUrl = String(rs.logoDataUrl || '');
  } catch {
    /* fiş ayarı yok */
  }

  const fromContext = resolvePrintFirmName({
    receiptCompanyName,
    firmaAdi: opts?.firm?.firmaAdi,
    title: opts?.firm?.title,
    name: opts?.firm?.name,
  });

  let firmName = fromContext;
  if (!firmName || isGenericFirmName(firmName)) {
    try {
      const { PostgresConnection, ERP_SETTINGS } = await import('../services/postgres');
      const details = await PostgresConnection.getInstance().getFirmDetails(
        opts?.firmNr || ERP_SETTINGS.firmNr,
      );
      const row = (details || {}) as {
        firma_adi?: string;
        title?: string;
        name?: string;
      };
      const fromDb = resolvePrintFirmName({
        receiptCompanyName,
        firmaAdi: opts?.firm?.firmaAdi || row.firma_adi,
        title: opts?.firm?.title || row.title,
        name: opts?.firm?.name || row.name,
      });
      if (fromDb && !isGenericFirmName(fromDb)) firmName = fromDb;
      else if (!firmName) firmName = fromDb;
    } catch {
      /* firma satırı yok */
    }
  }

  return {
    firmName,
    logoDataUrl,
    html: buildCenteredFirmHeaderHtml({
      firmName,
      logoDataUrl,
      nameStyle: opts?.nameStyle,
    }),
  };
}
