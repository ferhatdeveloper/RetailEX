import { describe, expect, it } from 'vitest';
import {
  formatInvoiceMasterLabel,
  isHardcodedDemoSalespersonRow,
  isHardcodedDemoWarehouseRow,
  isHardcodedDemoWorkplaceRow,
} from './invoiceDetailMasters';

describe('invoiceDetailMasters demo satır filtresi', () => {
  it('SAT001 Ahmed Yılmaz mock satış elemanını gizler', () => {
    expect(
      isHardcodedDemoSalespersonRow({
        code: 'SAT001',
        name: 'Ahmed Yılmaz',
        email: 'ahmed@example.com',
      }),
    ).toBe(true);
    expect(
      isHardcodedDemoSalespersonRow({
        code: 'SAT002',
        name: 'Mohammed Ali',
      }),
    ).toBe(true);
  });

  it('kiracının oluşturduğu satış elemanını bırakır', () => {
    expect(
      isHardcodedDemoSalespersonRow({
        code: 'SE-12',
        name: 'Leyla Kaya',
        email: 'leyla@firma.iq',
      }),
    ).toBe(false);
  });

  it('mock Depo 1 / Şube 1 çiftlerini gizler, MERKEZ AMBAR / ST_01 bırakır', () => {
    expect(isHardcodedDemoWarehouseRow({ code: '001', name: 'Depo 1' })).toBe(true);
    expect(isHardcodedDemoWarehouseRow({ code: 'ST_01', name: 'Merkez Depo' })).toBe(false);
    expect(isHardcodedDemoWarehouseRow({ code: 'AMB01', name: 'MERKEZ AMBAR' })).toBe(false);
    expect(isHardcodedDemoWorkplaceRow({ code: '001', name: 'Şube 1' })).toBe(true);
    expect(isHardcodedDemoWorkplaceRow({ code: '001', name: 'Şube A' })).toBe(false);
  });
});

describe('formatInvoiceMasterLabel', () => {
  it('kod ve adı modal ile aynı formatta birleştirir', () => {
    expect(formatInvoiceMasterLabel('AMB01', 'MERKEZ AMBAR')).toBe('AMB01, MERKEZ AMBAR');
  });

  it('eksik kod veya ad için boş döner', () => {
    expect(formatInvoiceMasterLabel('', 'Merkez')).toBe('');
    expect(formatInvoiceMasterLabel('001', '')).toBe('');
  });
});
