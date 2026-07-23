import type { MobilePrinterSettings, ReceiptLangCode } from '../../types/printerSettings';
import {
  cat,
  CUT_PARTIAL,
  ESC_ALIGN_CENTER,
  ESC_ALIGN_LEFT,
  ESC_BOLD_OFF,
  ESC_BOLD_ON,
  ESC_DOUBLE_OFF,
  ESC_DOUBLE_ON,
  ESC_INIT,
  lineWidthForPaper,
  NL,
  padEnd,
  txt,
  wrapText,
} from './escposBytes';

type ReceiptLine = {
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

const LABELS: Record<
  ReceiptLangCode,
  { testTitle: string; thanks: string; total: string; date: string; saleRef: string }
> = {
  tr: { testTitle: 'TEST FİŞİ', thanks: 'Teşekkürler', total: 'TOPLAM', date: 'Tarih', saleRef: 'Fiş' },
  en: { testTitle: 'TEST RECEIPT', thanks: 'Thank you', total: 'TOTAL', date: 'Date', saleRef: 'Receipt' },
  ar: { testTitle: 'إيصال تجريبي', thanks: 'شكراً', total: 'المجموع', date: 'التاريخ', saleRef: 'إيصال' },
  ku: { testTitle: 'TEST FÎŞ', thanks: 'Spas', total: 'KOMÎ', date: 'Dîrok', saleRef: 'Fîş' },
  uz: { testTitle: 'TEST CHEK', thanks: 'Rahmat', total: 'JAMI', date: 'Sana', saleRef: 'Chek' },
};

function formatMoney(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dashLine(width: number): Uint8Array {
  return txt(`${'-'.repeat(width)}\n`);
}

export function buildTestReceiptEscPos(settings: MobilePrinterSettings): Uint8Array {
  const lineW = lineWidthForPaper(settings.paperSize);
  const L = LABELS[settings.defaultLanguage] ?? LABELS.tr;
  const now = new Date().toLocaleString('tr-TR');
  const company = settings.companyName?.trim() || 'RetailEX';

  const sampleLines: ReceiptLine[] = [
    { name: 'Ürün A', qty: 1, unitPrice: 10, lineTotal: 10 },
    { name: 'Ürün B', qty: 2, unitPrice: 5.5, lineTotal: 11 },
  ];

  return buildReceiptEscPosBuffer({
    settings,
    title: L.testTitle,
    printedAt: now,
    lines: sampleLines,
    total: 21,
    footer: L.thanks,
    labels: L,
    lineW,
    company,
  });
}

export function buildSaleReceiptEscPos(
  settings: MobilePrinterSettings,
  saleId: string,
  lines: ReceiptLine[],
  total: number,
): Uint8Array {
  const lineW = lineWidthForPaper(settings.paperSize);
  const L = LABELS[settings.defaultLanguage] ?? LABELS.tr;
  const now = new Date().toLocaleString('tr-TR');
  const company = settings.companyName?.trim() || 'RetailEX';
  const shortId = saleId.length > 12 ? `${saleId.slice(0, 8)}…` : saleId;

  return buildReceiptEscPosBuffer({
    settings,
    title: L.saleRef,
    subtitle: shortId,
    printedAt: now,
    lines,
    total,
    footer: L.thanks,
    labels: L,
    lineW,
    company,
  });
}

function buildReceiptEscPosBuffer(input: {
  settings: MobilePrinterSettings;
  title: string;
  subtitle?: string;
  printedAt: string;
  lines: ReceiptLine[];
  total: number;
  footer: string;
  labels: (typeof LABELS)['tr'];
  lineW: number;
  company: string;
}): Uint8Array {
  const parts: Uint8Array[] = [];
  const dash = dashLine(input.lineW);

  parts.push(ESC_INIT);
  parts.push(ESC_ALIGN_CENTER, ESC_DOUBLE_ON, ESC_BOLD_ON, txt(`${input.company}\n`), ESC_BOLD_OFF, ESC_DOUBLE_OFF);
  if (input.settings.companyPhone?.trim()) {
    parts.push(txt(`Tel: ${input.settings.companyPhone.trim()}\n`));
  }
  parts.push(NL);
  parts.push(ESC_ALIGN_LEFT, dash);
  parts.push(ESC_ALIGN_CENTER, ESC_BOLD_ON, txt(`${input.title}\n`), ESC_BOLD_OFF);
  if (input.subtitle) parts.push(txt(`${input.subtitle}\n`));
  parts.push(ESC_ALIGN_LEFT, dash);
  parts.push(txt(`${input.labels.date}: ${input.printedAt}\n`));
  parts.push(txt(`Kağıt: ${input.settings.paperSize}\n`));
  parts.push(dash);

  for (const row of input.lines) {
    const qtyStr = `${row.qty} x ${formatMoney(row.unitPrice)}`;
    const totalStr = formatMoney(row.lineTotal);
    const nameLines = wrapText(row.name, input.lineW - totalStr.length - 1);
    const first = nameLines[0] ?? '';
    parts.push(
      txt(
        `${padEnd(first, input.lineW - totalStr.length)}${totalStr}\n`,
      ),
    );
    for (let i = 1; i < nameLines.length; i++) {
      parts.push(txt(`${nameLines[i]}\n`));
    }
    if (nameLines.length <= 1 && qtyStr.length > 0) {
      parts.push(txt(`  ${qtyStr}\n`));
    }
  }

  parts.push(dash);
  parts.push(ESC_BOLD_ON, txt(`${padEnd(input.labels.total, input.lineW - 10)}${formatMoney(input.total)} TL\n`), ESC_BOLD_OFF);
  parts.push(dash);
  parts.push(ESC_ALIGN_CENTER, txt(`${input.footer}\n`));
  parts.push(NL, NL, NL, CUT_PARTIAL);

  return cat(...parts);
}
