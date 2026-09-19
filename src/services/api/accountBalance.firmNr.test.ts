import { describe, expect, it } from 'vitest';
import {
  cardFirmNrMatches,
  sqlCustomerAccountBalancesCte,
  sqlFirmScopedCardMatch,
} from './accountBalance';

describe('cardFirmNrMatches', () => {
  it('1 ve 001 aynı firma kabul edilir', () => {
    expect(cardFirmNrMatches('1', '001')).toBe(true);
    expect(cardFirmNrMatches('001', '1')).toBe(true);
    expect(cardFirmNrMatches('', '001')).toBe(true);
    expect(cardFirmNrMatches(null, '001')).toBe(true);
  });

  it('farklı firma numarası eşleşmez', () => {
    expect(cardFirmNrMatches('010', '001')).toBe(false);
  });
});

describe('sqlFirmScopedCardMatch', () => {
  it('müşteri CTE adı eşlemesinde lpad kullanır (tam firm_nr eşitliği yok)', () => {
    const cte = sqlCustomerAccountBalancesCte('rex_001_customers', '$1::text');
    expect(cte).toContain('lpad');
    expect(cte).not.toMatch(/INNER JOIN rex_001_customers c ON c\.firm_nr = \$1::text/);
  });

  it('SQL ifadesi alias ve bind içerir', () => {
    const sql = sqlFirmScopedCardMatch('c', '$1');
    expect(sql).toContain('c.firm_nr');
    expect(sql).toContain('$1');
  });

  it('rakamsız firm_nr satırlarını hariç tutmaz (JS cardFirmNrMatches ile uyumlu)', () => {
    const sql = sqlFirmScopedCardMatch('c', '$1');
    expect(sql).toMatch(/length\(.*\) = 0 THEN NULL/s);
  });
});
