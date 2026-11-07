import { describe, expect, it } from 'vitest';
import { filterStructuresByBusinessType } from '../../../mobile/src/config/businessStructureFilter';
import { isStructureOperationAllowed } from '../../../mobile/src/config/structureNavGuard';
import { isCariCreditorsReportRow, isCariDebtorsReportRow } from '../../utils/cariAccountStatement';
import {
  isCreditorsReportRow,
  isDebtorsReportRow,
} from '../../../mobile/src/config/cariReportSides';
import { MENU_SECTIONS } from '../../../mobile/src/config/menuConfig';

const FOREIGN_FOR_BEAUTY = [
  'restaurant',
  'restaurant-kitchen',
  'restaurant-recipes',
  'wms-hub',
  'wms-receiving',
  'wms-dispatch',
  'stockcounting',
];

const FOREIGN_FOR_RESTAURANT = [
  'beauty',
  'beauty-sales',
  'beauty-packages',
  'appointment',
  'wms-hub',
  'wms-receiving',
];

describe('isStructureOperationAllowed', () => {
  it('güzellik restoran ve WMS işlemlerini açmaz', () => {
    expect(isStructureOperationAllowed('beauty', 'beauty')).toBe(true);
    expect(isStructureOperationAllowed('beauty-packages', 'beauty')).toBe(true);
    expect(isStructureOperationAllowed('beauty-sales', 'clinic')).toBe(true);
    for (const id of FOREIGN_FOR_BEAUTY) {
      expect(isStructureOperationAllowed(id, 'beauty')).toBe(false);
      expect(isStructureOperationAllowed(id, 'clinic')).toBe(false);
    }
    expect(isStructureOperationAllowed('suppliers', 'beauty')).toBe(true);
  });

  it('restoran güzellik ve WMS işlemlerini açmaz', () => {
    expect(isStructureOperationAllowed('restaurant', 'restaurant')).toBe(true);
    expect(isStructureOperationAllowed('restaurant-kitchen', 'restoran')).toBe(true);
    for (const id of FOREIGN_FOR_RESTAURANT) {
      expect(isStructureOperationAllowed(id, 'restaurant')).toBe(false);
    }
  });

  it('WMS güzellik randevusunu ve restoran mutfağını açmaz', () => {
    expect(isStructureOperationAllowed('wms-hub', 'wms')).toBe(true);
    expect(isStructureOperationAllowed('wms-receiving', 'depo')).toBe(true);
    expect(isStructureOperationAllowed('appointment', 'wms')).toBe(false);
    expect(isStructureOperationAllowed('beauty-sales', 'wms')).toBe(false);
    expect(isStructureOperationAllowed('restaurant-kitchen', 'wms')).toBe(false);
    expect(isStructureOperationAllowed('pos', 'wms')).toBe(false);
  });

  it('market yalnızca market dikeyini açar', () => {
    expect(isStructureOperationAllowed('pos', 'market')).toBe(true);
    expect(isStructureOperationAllowed('cashier-scale', 'perakende')).toBe(true);
    expect(isStructureOperationAllowed('beauty', 'market')).toBe(false);
    expect(isStructureOperationAllowed('restaurant', 'market')).toBe(false);
    expect(isStructureOperationAllowed('wms-hub', 'market')).toBe(false);
  });

  it('tip seçilmeden dikey işlem açılmaz', () => {
    expect(isStructureOperationAllowed('beauty', '')).toBe(false);
    expect(isStructureOperationAllowed('restaurant', 'general')).toBe(false);
    expect(isStructureOperationAllowed('wms-hub', null)).toBe(false);
    expect(isStructureOperationAllowed('suppliers', null)).toBe(true);
  });
});

describe('menü süzgeci gezinme koruması', () => {
  function leafIds(profile: string): string[] {
    const ids: string[] = [];
    const walk = (node: { id: string; items?: typeof node[]; children?: typeof node[] }) => {
      ids.push(node.id);
      node.items?.forEach(walk);
      node.children?.forEach(walk);
    };
    filterStructuresByBusinessType(MENU_SECTIONS, profile).forEach(walk);
    return ids;
  }

  it('güzellik menüsünde restoran ve WMS yapısı yok', () => {
    const ids = leafIds('beauty');
    expect(ids).toContain('beauty');
    expect(ids).toContain('beauty-packages');
    expect(ids).not.toContain('restaurant');
    expect(ids).not.toContain('wms');
    expect(ids).not.toContain('wms-hub');
    expect(ids).not.toContain('wms-receiving');
    expect(ids).not.toContain('rest-kitchen');
  });

  it('restoran menüsünde güzellik ve WMS yok', () => {
    const ids = leafIds('restaurant');
    expect(ids).toContain('restaurant');
    expect(ids).toContain('restaurant-recipes');
    expect(ids).not.toContain('beauty');
    expect(ids).not.toContain('beauty-sales');
    expect(ids).not.toContain('wms');
  });

  it('WMS menüsünde güzellik randevusu ve restoran yok', () => {
    const ids = leafIds('wms');
    expect(ids).toContain('wms');
    expect(ids).toContain('wms-receiving');
    expect(ids).not.toContain('beauty');
    expect(ids).not.toContain('appointment');
    expect(ids).not.toContain('restaurant');
  });
});

describe('cari borçlu / alacaklı işareti web ile aynı', () => {
  it('müşteri artı borçlu, tedarikçi artı alacaklı', () => {
    expect(isDebtorsReportRow('customer', 10)).toBe(isCariDebtorsReportRow('customer', 10));
    expect(isDebtorsReportRow('supplier', 10)).toBe(isCariDebtorsReportRow('supplier', 10));
    expect(isDebtorsReportRow('customer', -4)).toBe(isCariDebtorsReportRow('customer', -4));
    expect(isCreditorsReportRow('supplier', 10)).toBe(isCariCreditorsReportRow('supplier', 10));
    expect(isCreditorsReportRow('supplier', -3)).toBe(isCariCreditorsReportRow('supplier', -3));
    expect(isCreditorsReportRow('customer', 10)).toBe(isCariCreditorsReportRow('customer', 10));
  });
});
