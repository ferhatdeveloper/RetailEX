import { describe, expect, it } from 'vitest';
import {
  firmNameArgForProvision,
  resolveFirmNameForProvision,
} from '../../services/firmNamePreserve';

describe('resolveFirmNameForProvision', () => {
  it('does not replace an existing firm name with Firma 001', () => {
    expect(
      resolveFirmNameForProvision(
        { name: 'Ameerat House', title: 'Ameerat House' },
        'Firma 001',
        '001',
      ),
    ).toBe('Ameerat House');
    expect(
      resolveFirmNameForProvision({ name: 'Ameerat House', title: 'Ameerat House' }, null, '001'),
    ).toBe('Ameerat House');
    expect(firmNameArgForProvision({ name: 'Ameerat House' }, 'Firma 001', '001')).toBe(
      'Ameerat House',
    );
  });

  it('does not replace an existing firm name with RetailEx OS', () => {
    expect(resolveFirmNameForProvision({ name: 'Ameerat House' }, 'RetailEx OS', '001')).toBe(
      'Ameerat House',
    );
  });

  it('keeps a custom title when the name column was reset to the placeholder', () => {
    expect(
      resolveFirmNameForProvision({ name: 'Firma 001', title: 'Ameerat House' }, null, '001'),
    ).toBe('Ameerat House');
    expect(
      firmNameArgForProvision({ name: 'Firma 001', title: 'Ameerat House' }, null, '1'),
    ).toBe('Ameerat House');
  });

  it('uses Firma 001 only when the row is new or the stored name is still the placeholder', () => {
    expect(resolveFirmNameForProvision(null, null, '001')).toBe('Firma 001');
    expect(resolveFirmNameForProvision({ name: '', title: '' }, '', '001')).toBe('Firma 001');
    expect(resolveFirmNameForProvision({ name: 'Firma 001', title: null }, null, '001')).toBe(
      'Firma 001',
    );
    expect(firmNameArgForProvision({ name: 'Firma 001', title: null }, null, '001')).toBeNull();
    expect(firmNameArgForProvision(null, null, '001')).toBeNull();
  });

  it('accepts an explicit custom rename', () => {
    expect(
      resolveFirmNameForProvision({ name: 'Firma 001', title: 'Eski Unvan' }, 'Yeni Marka', '001'),
    ).toBe('Yeni Marka');
  });
});
