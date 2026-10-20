/**
 * Müşteri Bazlı Satış Raporu — net ciro.
 *
 * Ekran: brüt 130.000, iade 10.000, net 140.000.
 * İade fişi artı yazıldığı için brüte eklenmişti (20.000 + 10.000 = 30.000).
 * Doğru net: 20.000 − 10.000 = 10.000; hizmet 110.000 ile genel 120.000.
 * Miktar: hizmet 2 kalır, ürün 2 − 1 = 1, toplam 3.
 */
import { describe, expect, it } from 'vitest';
import {
  mapPartySalesPeriodAmounts,
  settlePartySalesPeriodNet,
} from '../../utils/partySalesPeriodNet';
import {
  buildPartySalesByPeriodSql,
  normalizePartySalesPartyIds,
} from '../../utils/partySalesPeriodQuery';

describe('Müşteri Bazlı Satış — net ciro', () => {
  it('brüt 20.000 ve iade 10.000 → müşteri neti 10.000, miktar 1', () => {
    const row = mapPartySalesPeriodAmounts({
      grossAmount: 20_000,
      returnAmount: 10_000,
      grossQuantity: 2,
      returnQuantity: 1,
    });

    expect(row.grossAmount).toBe(20_000);
    expect(row.returnAmount).toBe(10_000);
    expect(row.netAmount).toBe(10_000);
    expect(row.totalQuantity).toBe(1);
    expect(row.netAmount).not.toBe(30_000);
  });

  it('hizmet 110.000 ile genel net 120.000, toplam miktar 3', () => {
    const service = mapPartySalesPeriodAmounts({
      grossAmount: 110_000,
      returnAmount: 0,
      grossQuantity: 2,
      returnQuantity: 0,
    });
    const product = mapPartySalesPeriodAmounts({
      grossAmount: 20_000,
      returnAmount: 10_000,
      grossQuantity: 2,
      returnQuantity: 1,
    });

    expect(service.netAmount).toBe(110_000);
    expect(service.totalQuantity).toBe(2);
    expect(service.returnAmount).toBe(0);
    expect(product.netAmount).toBe(10_000);
    expect(product.returnAmount).toBe(10_000);

    const net = service.netAmount + product.netAmount;
    const qty = service.totalQuantity + product.totalQuantity;
    expect(net).toBe(120_000);
    expect(qty).toBe(3);
    expect(net).not.toBe(140_000);
    expect(qty).not.toBe(5);
  });

  it('iade gelire eklenmez ve bilgi kolonu 10.000 kalır', () => {
    const row = settlePartySalesPeriodNet({
      grossAmount: 20_000,
      returnAmount: 10_000,
      grossQuantity: 2,
      returnQuantity: 1,
    });
    expect(row.netAmount).toBe(row.grossAmount - row.returnAmount);
    expect(row.returnAmount).toBe(10_000);
    expect(row.netAmount).not.toBe(row.grossAmount + row.returnAmount);
  });

  it('eksi yazılmış iade bir kez düşülür, net sıfırlanmaz', () => {
    const row = settlePartySalesPeriodNet({
      grossAmount: 20_000,
      returnAmount: -10_000,
      grossQuantity: 2,
      returnQuantity: -1,
    });
    expect(row.returnAmount).toBe(10_000);
    expect(row.returnQuantity).toBe(1);
    expect(row.netAmount).toBe(10_000);
    expect(row.netQuantity).toBe(1);
    expect(row.netAmount).not.toBe(0);
    expect(row.netAmount).not.toBe(30_000);
  });

  it('aynı satır ikinci kez işlense de net 10.000 kalır', () => {
    const once = settlePartySalesPeriodNet({
      grossAmount: 20_000,
      returnAmount: 10_000,
      grossQuantity: 2,
      returnQuantity: 1,
    });
    const twice = settlePartySalesPeriodNet(once);
    expect(twice.netAmount).toBe(10_000);
    expect(twice.netQuantity).toBe(1);
    expect(twice.returnAmount).toBe(10_000);
    expect(twice.grossAmount).toBe(20_000);
  });

  it('iade yoksa hizmet neti brüte eşittir', () => {
    const row = mapPartySalesPeriodAmounts({
      grossAmount: 110_000,
      returnAmount: 0,
      grossQuantity: 2,
      returnQuantity: 0,
    });
    expect(row.netAmount).toBe(110_000);
    expect(row.totalQuantity).toBe(2);
  });
});

describe('Müşteri Bazlı Satış — sorgu kimlik eşlemesi', () => {
  it('uuid dönüşümü yok; fiş ve cari kimliği metinle eşlenir', () => {
    const sql = buildPartySalesByPeriodSql({ cardType: 'customer' });
    expect(sql).not.toMatch(/::uuid/);
    expect(sql).toContain('si.invoice_id');
    expect(sql).toContain('::text');
    expect(sql).not.toContain('gross_amount, 0) + COALESCE(pt.return_amount');
    expect(sql).toContain('gross_quantity');
    expect(sql).toContain('return_quantity');
  });

  it('cari filtresi bitiş tarihini uuid sanmaz, $3 metin dizisidir', () => {
    const ids = normalizePartySalesPartyIds([
      'BEA-MV02ZFP',
      '  11111111-2222-3333-4444-555555555555  ',
      'BEA-MV02ZFP',
    ]);
    expect(ids).toEqual([
      'bea-mv02zfp',
      '11111111-2222-3333-4444-555555555555',
    ]);
    const sql = buildPartySalesByPeriodSql({
      cardType: 'customer',
      partyIds: ids,
    });
    expect(sql).toContain('BETWEEN $1 AND $2');
    expect(sql).toContain('$3::text[]');
    expect(sql).not.toContain('$2::uuid[]');
    expect(sql).not.toMatch(/::uuid/);
    expect(sql.match(/\$3::text\[\]/g)?.length).toBe(2);
  });

  it('tedarikçi sorgusu da uuid dizisine bağlamaz', () => {
    const sql = buildPartySalesByPeriodSql({
      cardType: 'supplier',
      partyIds: ['not-a-valid-uuid'],
    });
    expect(sql).toContain('suppliers');
    expect(sql).toContain('$3::text[]');
    expect(sql).not.toMatch(/::uuid/);
  });
});
