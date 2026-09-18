import { describe, expect, it } from 'vitest';
import {
  buildInvoiceCodePattern,
  compileInvoiceCodePattern,
  extractInvoiceCodeSequence,
  formatInvoiceCode,
  generateDefaultInvoiceStamp,
  isInvoiceCodePatternDefined,
  nextInvoiceSequenceFromCodes,
  previewInvoiceCode,
  resolveInvoiceCodePattern,
} from '../../utils/invoiceCodeFormat';

describe('invoiceCodeFormat', () => {
  it('boş şablon tanımsızdır; format yoksa damga YYYYMMDD + rastgele', () => {
    expect(isInvoiceCodePatternDefined('')).toBe(false);
    expect(isInvoiceCodePatternDefined('  ')).toBe(false);
    expect(isInvoiceCodePatternDefined('FTR-{YYYY}-{SEQ:6}')).toBe(true);

    const stamp = generateDefaultInvoiceStamp(new Date('2026-09-17T18:48:36.000Z'));
    expect(stamp.startsWith('20260917')).toBe(true);
    expect(stamp.length).toBeGreaterThanOrEqual(8);
    expect(stamp.length).toBeLessThanOrEqual(14);
    expect(/^\d+$/.test(stamp)).toBe(true);
  });

  it('FTR-{YYYY}-{SEQ:6} bir sonraki numarayı üretir', () => {
    const date = new Date(2026, 8, 17);
    const compiled = compileInvoiceCodePattern('FTR-{YYYY}-{SEQ:6}', date);
    expect(compiled).not.toBeNull();
    expect(compiled!.prefix).toBe('FTR-2026-');
    expect(compiled!.seqWidth).toBe(6);
    expect(formatInvoiceCode(compiled!, 1n)).toBe('FTR-2026-000001');
    expect(formatInvoiceCode(compiled!, 12n)).toBe('FTR-2026-000012');

    const next = nextInvoiceSequenceFromCodes(compiled!, [
      'FTR-2026-000007',
      '20260917512868',
      'FTR-2026-000003',
    ]);
    expect(next).toBe(8n);
    expect(formatInvoiceCode(compiled!, next)).toBe('FTR-2026-000008');
  });

  it('tür bazlı format varsayılanın üzerine yazar; boş tür varsayılana düşer', () => {
    const settings = {
      default: { pattern: 'FTR-{YYYY}-{SEQ:6}' },
      byType: { '7': { pattern: 'PS-{YYYY}-{SEQ:4}' } },
    };
    expect(resolveInvoiceCodePattern(settings, 7)).toBe('PS-{YYYY}-{SEQ:4}');
    expect(resolveInvoiceCodePattern(settings, 8)).toBe('FTR-{YYYY}-{SEQ:6}');
    expect(resolveInvoiceCodePattern({ default: { pattern: '' } }, 8)).toBe('');
  });

  it('eşleşmeyen kodlardan sıra çıkarmaz; posted numarayı atlamadan max+1', () => {
    const compiled = compileInvoiceCodePattern('SAT-{YY}-{SEQ:5}', new Date(2026, 0, 1))!;
    expect(extractInvoiceCodeSequence(compiled, 'SAT-26-00042')).toBe(42n);
    expect(extractInvoiceCodeSequence(compiled, 'FTR-26-00042')).toBeNull();
    expect(nextInvoiceSequenceFromCodes(compiled, [])).toBe(1n);
  });

  it('önizleme ve wizard şablonu FTR-2026-000001 üretir', () => {
    const pattern = buildInvoiceCodePattern({ prefix: 'FTR', includeYear: true, seqDigits: 6 });
    expect(pattern).toBe('FTR-{YYYY}-{SEQ:6}');
    expect(previewInvoiceCode(pattern, 1n, new Date(2026, 8, 18))).toBe('FTR-2026-000001');
  });
});
