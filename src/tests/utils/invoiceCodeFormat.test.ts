import { describe, expect, it } from 'vitest';
import {
  buildInvoiceCodePattern,
  compileInvoiceCodePattern,
  DEFAULT_ENTITY_CODE_PATTERN,
  DEFAULT_INVOICE_CODE_PATTERN,
  extractInvoiceCodeSequence,
  formatDefaultNumericEntityCode,
  formatFirstInvoiceSequence,
  formatInvoiceCode,
  generateDefaultInvoiceStamp,
  isInvoiceCodePatternDefined,
  nextInvoiceSequenceFromCodes,
  nextPrefixedInvoiceNumber,
  previewInvoiceCode,
  resolveInvoiceCodePattern,
  resolveSequenceWidth,
} from '../../utils/invoiceCodeFormat';

describe('invoiceCodeFormat', () => {
  it('boş şablon tanımsızdır; ürün 7 hane, fatura 5 hane 00001', () => {
    expect(isInvoiceCodePatternDefined('')).toBe(false);
    expect(isInvoiceCodePatternDefined('  ')).toBe(false);
    expect(isInvoiceCodePatternDefined('FTR-{YYYY}-{SEQ:6}')).toBe(true);
    expect(DEFAULT_ENTITY_CODE_PATTERN).toBe('{SEQ:7}');
    expect(DEFAULT_INVOICE_CODE_PATTERN).toBe('{SEQ:5}');
    expect(formatDefaultNumericEntityCode(1n)).toBe('0000001');
    expect(formatDefaultNumericEntityCode(12)).toBe('0000012');
    expect(formatFirstInvoiceSequence(1n)).toBe('00001');
    expect(generateDefaultInvoiceStamp(new Date('2026-09-17T18:48:36.000Z'))).toBe('00001');
  });

  it('boş sayaçta ilk fatura 00001, sonraki 00002', () => {
    expect(nextPrefixedInvoiceNumber([], '')).toBe('00001');
    expect(nextPrefixedInvoiceNumber(['00001'], '')).toBe('00002');
    const compiled = compileInvoiceCodePattern(DEFAULT_INVOICE_CODE_PATTERN)!;
    expect(resolveSequenceWidth(compiled, [])).toBe(5);
    expect(nextInvoiceSequenceFromCodes(compiled, [])).toBe(1n);
    expect(formatInvoiceCode(compiled, 1n)).toBe('00001');
    expect(formatInvoiceCode(compiled, 2n)).toBe('00002');
  });

  it('BEA yılı korunur; rastgele ek sıraya girmez; kayıtlı 00001 sonrası 00002', () => {
    expect(nextPrefixedInvoiceNumber([], 'BEA-2026-')).toBe('BEA-2026-00001');
    expect(nextPrefixedInvoiceNumber(['BEA-2026-HVM0DFHN', 'BEA-2026-HVM0D5ZK'], 'BEA-2026-')).toBe(
      'BEA-2026-00001',
    );
    expect(nextPrefixedInvoiceNumber(['BEA-2026-00001', 'BEA-2026-HVM0DFHN'], 'BEA-2026-')).toBe(
      'BEA-2026-00002',
    );
    expect(nextPrefixedInvoiceNumber(['BEA-2026-CHK-00001'], 'BEA-2026-CHK-')).toBe('BEA-2026-CHK-00002');
  });

  it('daha uzun kayıtlı sayısal sıra hanesini korur', () => {
    expect(nextPrefixedInvoiceNumber(['0000007'], '')).toBe('0000008');
    const compiled = compileInvoiceCodePattern('{SEQ:5}')!;
    expect(resolveSequenceWidth(compiled, ['0000007'])).toBe(7);
  });

  it('{SEQ:7} ilk kodu 0000001 üretir', () => {
    const compiled = compileInvoiceCodePattern('{SEQ:7}');
    expect(compiled).not.toBeNull();
    expect(compiled!.prefix).toBe('');
    expect(compiled!.seqWidth).toBe(7);
    expect(formatInvoiceCode(compiled!, 1n)).toBe('0000001');
    expect(nextInvoiceSequenceFromCodes(compiled!, [])).toBe(1n);
    expect(nextInvoiceSequenceFromCodes(compiled!, ['0000001', '0000003'])).toBe(4n);
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

  it('önizleme ve wizard şablonu FTR-2026-0000001 üretir (7 hane)', () => {
    const pattern = buildInvoiceCodePattern({ prefix: 'FTR', includeYear: true, seqDigits: 7 });
    expect(pattern).toBe('FTR-{YYYY}-{SEQ:7}');
    expect(previewInvoiceCode(pattern, 1n, new Date(2026, 8, 18))).toBe('FTR-2026-0000001');
  });
});
