import { describe, expect, it } from 'vitest';
import {
  birthDatePrintParts,
  expandTwoDigitYear,
  parseIsoToPartialDate,
  partialDatePartsToIso,
} from '../../utils/partialDateInput';

describe('partialDateInput', () => {
  it('expands two-digit year with pivot', () => {
    expect(expandTwoDigitYear(92)).toBe(1992);
    expect(expandTwoDigitYear(5)).toBe(2005);
    expect(expandTwoDigitYear(30)).toBe(2030);
    expect(expandTwoDigitYear(31)).toBe(1931);
  });

  it('builds ISO from day/month/2-digit year', () => {
    expect(partialDatePartsToIso({ day: '12', month: '3', year: '92' })).toBe('1992-03-12');
    expect(partialDatePartsToIso({ day: '1', month: '01', year: '2001' })).toBe('2001-01-01');
  });

  it('rejects invalid calendar dates', () => {
    expect(partialDatePartsToIso({ day: '31', month: '02', year: '2000' })).toBeNull();
  });

  it('parses ISO to parts and print tokens', () => {
    expect(parseIsoToPartialDate('1992-03-12')).toEqual({
      day: '12',
      month: '03',
      year: '1992',
    });
    expect(birthDatePrintParts('1992-03-12')).toEqual({
      customerBirthDay: '12',
      customerBirthMonth: '03',
      customerBirthYear: '1992',
      customerBirthYear2: '92',
    });
  });
});
