import { describe, expect, it } from 'vitest';
import {
  gridColumnFilterFn,
  parseFilterNumber,
  parseRangeBoundMs,
} from '../../components/shared/DevExDataGrid';

function mockRow(value: unknown) {
  return {
    getValue: (_columnId: string) => value,
  };
}

describe('parseRangeBoundMs', () => {
  it('non-string payload does not throw', () => {
    expect(parseRangeBoundMs(undefined as unknown as string, 'start', false)).toBeNull();
    expect(parseRangeBoundMs(null, 'end', false)).toBeNull();
    expect(parseRangeBoundMs({}, 'start', false)).toBeNull();
    expect(parseRangeBoundMs(20240115, 'start', false)).toBe(20240115);
    const d = new Date(2024, 0, 15, 12, 0, 0);
    expect(parseRangeBoundMs(d, 'start', true)).toBe(d.getTime());
  });

  it('YYYY-MM-DD day bounds', () => {
    const start = parseRangeBoundMs('2024-01-15', 'start', false);
    const end = parseRangeBoundMs('2024-01-15', 'end', false);
    expect(start).not.toBeNull();
    expect(end).not.toBeNull();
    expect(end!).toBeGreaterThan(start!);
  });
});

describe('parseFilterNumber', () => {
  it('rejects objects and empty', () => {
    expect(parseFilterNumber(null)).toBeNull();
    expect(parseFilterNumber({})).toBeNull();
    expect(parseFilterNumber('')).toBeNull();
    expect(parseFilterNumber('abc')).toBeNull();
  });

  it('parses locale numbers', () => {
    expect(parseFilterNumber(12.5)).toBe(12.5);
    expect(parseFilterNumber('1.250,5')).toBe(1250.5);
    expect(parseFilterNumber('100')).toBe(100);
  });
});

describe('gridColumnFilterFn', () => {
  it('date range with numeric from/to does not throw (prod crash repro)', () => {
    const row = mockRow('2024-06-10');
    expect(() =>
      gridColumnFilterFn(row as never, 'date', {
        kind: 'date',
        mode: 'range',
        from: 20240601 as unknown as string,
        to: 20240630 as unknown as string,
      }),
    ).not.toThrow();
  });

  it('date range filters ISO cell', () => {
    const row = mockRow('2024-06-10');
    expect(
      gridColumnFilterFn(row as never, 'date', {
        kind: 'date',
        mode: 'range',
        from: '2024-06-01',
        to: '2024-06-30',
      }),
    ).toBe(true);
    expect(
      gridColumnFilterFn(row as never, 'date', {
        kind: 'date',
        mode: 'range',
        from: '2024-07-01',
        to: '2024-07-31',
      }),
    ).toBe(false);
  });

  it('date before/after with Date cell', () => {
    const row = mockRow(new Date(2024, 5, 15));
    expect(
      gridColumnFilterFn(row as never, 'invoiceDate', {
        kind: 'date',
        mode: 'before',
        value: '2024-06-20',
      }),
    ).toBe(true);
    expect(
      gridColumnFilterFn(row as never, 'invoiceDate', {
        kind: 'date',
        mode: 'after',
        value: '2024-06-20',
      }),
    ).toBe(false);
  });

  it('numeric between / gt', () => {
    const row = mockRow(150);
    expect(
      gridColumnFilterFn(row as never, 'amount', {
        mode: 'between',
        from: '100',
        to: '200',
      }),
    ).toBe(true);
    expect(
      gridColumnFilterFn(row as never, 'amount', {
        mode: 'gt',
        value: '200',
      }),
    ).toBe(false);
    expect(
      gridColumnFilterFn(row as never, 'amount', {
        mode: 'gte',
        value: '150',
      }),
    ).toBe(true);
  });

  it('number between does not treat as date range', () => {
    // mode between → sayısal; kind date yok
    const row = mockRow(50);
    expect(
      gridColumnFilterFn(row as never, 'qty', {
        mode: 'between',
        from: '10',
        to: '100',
      }),
    ).toBe(true);
  });

  it('multiselect with non-array values does not throw', () => {
    const row = mockRow('A');
    expect(() =>
      gridColumnFilterFn(row as never, 'name', {
        mode: 'multiselect',
        values: 'A' as unknown as string[],
      }),
    ).not.toThrow();
    // non-array → boş liste → false
    expect(
      gridColumnFilterFn(row as never, 'name', {
        mode: 'multiselect',
        values: 'A' as unknown as string[],
      }),
    ).toBe(false);
  });

  it('object cell with date filter returns false (no throw)', () => {
    const row = mockRow({ nested: true });
    expect(
      gridColumnFilterFn(row as never, 'date', {
        kind: 'date',
        mode: 'range',
        from: '2024-01-01',
        to: '2024-12-31',
      }),
    ).toBe(false);
  });

  it('invalid / empty filter keeps row', () => {
    const row = mockRow('x');
    expect(gridColumnFilterFn(row as never, 'c', null)).toBe(true);
    expect(gridColumnFilterFn(row as never, 'c', undefined)).toBe(true);
    expect(gridColumnFilterFn(row as never, 'c', '')).toBe(true);
  });
});
