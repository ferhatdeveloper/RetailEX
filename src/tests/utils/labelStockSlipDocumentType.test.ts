import { describe, expect, it } from 'vitest';
import {
  labelStockSlipDocumentType,
  STOCK_SLIP_TRCODES,
} from '../../services/stockMovementAPI';

const tm = (key: string) =>
  (
    {
      purchaseInvoice: 'Alış Faturası',
      salesInvoice: 'Satış Faturası',
      slipConsumption: 'Sarf Fişi',
      in: 'Giriş',
      out: 'Çıkış',
    } as Record<string, string>
  )[key] || key;

describe('labelStockSlipDocumentType', () => {
  it('fatura source_kind=invoice iken Logo trcode=1 alış faturasıdır (sarf değil)', () => {
    expect(
      labelStockSlipDocumentType(tm, STOCK_SLIP_TRCODES.CONSUMPTION, 'in', 'invoice'),
    ).toBe('Alış Faturası');
  });

  it('fatura çıkışı satış faturasıdır', () => {
    expect(labelStockSlipDocumentType(tm, 7, 'out', 'invoice')).toBe('Satış Faturası');
  });

  it('gerçek ambar sarf fişi (source slip) Sarf kalır', () => {
    expect(
      labelStockSlipDocumentType(tm, STOCK_SLIP_TRCODES.CONSUMPTION, 'out', 'slip'),
    ).toBe('Sarf Fişi');
  });

  it('source_kind yoksa eski trcode eşlemesi geçerli', () => {
    expect(labelStockSlipDocumentType(tm, STOCK_SLIP_TRCODES.CONSUMPTION, 'out')).toBe(
      'Sarf Fişi',
    );
  });
});
