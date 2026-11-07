import { describe, expect, it } from 'vitest';
import {
  filterFirmsByBusinessType,
  filterStructuresByBusinessType,
  type StructureNode,
} from '../../../mobile/src/config/businessStructureFilter';

const catalog: StructureNode[] = [
  {
    id: 'beauty',
    items: [
      { id: 'beauty', screen: 'beauty' },
      { id: 'beauty-sales', screen: 'beauty-sales' },
    ],
  },
  {
    id: 'restaurant',
    items: [
      { id: 'restaurant', screen: 'restaurant' },
      { id: 'rest-kitchen', screen: 'restaurant-kitchen' },
    ],
  },
  {
    id: 'wms',
    items: [{ id: 'wms-hub', screen: 'wms-hub' }],
  },
  {
    id: 'retail-pos',
    items: [{ id: 'pos', screen: 'pos' }],
  },
  {
    id: 'finance-management',
    items: [{ id: 'suppliers', screen: 'suppliers' }],
  },
  {
    id: 'reports-analysis',
    items: [
      { id: 'customreports', screen: 'customreports' },
      { id: 'rest-reports', screen: 'restaurant-reports' },
    ],
  },
];

function idsOf(nodes: StructureNode[]): string[] {
  const out: string[] = [];
  const walk = (node: StructureNode) => {
    out.push(node.id);
    node.items?.forEach(walk);
    node.children?.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

describe('filterStructuresByBusinessType', () => {
  it('güzellik tipi restoran ve WMS yapılarını dışlar', () => {
    const ids = idsOf(filterStructuresByBusinessType(catalog, 'beauty'));
    expect(ids).toContain('beauty');
    expect(ids).toContain('beauty-sales');
    expect(ids).not.toContain('restaurant');
    expect(ids).not.toContain('wms');
    expect(ids).not.toContain('wms-hub');
    expect(ids).not.toContain('rest-reports');
    expect(ids).not.toContain('retail-pos');
  });

  it('klinik tipi de güzellik yapılarını gösterir, restoran ve WMS gelmez', () => {
    const ids = idsOf(filterStructuresByBusinessType(catalog, 'clinic'));
    expect(ids).toContain('beauty');
    expect(ids).not.toContain('restaurant');
    expect(ids).not.toContain('wms');
  });

  it('restoran tipi güzellik yapılarını dışlar', () => {
    const ids = idsOf(filterStructuresByBusinessType(catalog, 'restaurant'));
    expect(ids).toContain('restaurant');
    expect(ids).toContain('rest-reports');
    expect(ids).not.toContain('beauty');
    expect(ids).not.toContain('beauty-sales');
    expect(ids).not.toContain('wms');
  });

  it('market yalnızca market yapılarını, WMS yalnızca depo yapılarını bırakır', () => {
    const market = idsOf(filterStructuresByBusinessType(catalog, 'market'));
    expect(market).toContain('retail-pos');
    expect(market).not.toContain('beauty');
    expect(market).not.toContain('restaurant');
    expect(market).not.toContain('wms');

    const wms = idsOf(filterStructuresByBusinessType(catalog, 'wms'));
    expect(wms).toContain('wms');
    expect(wms).not.toContain('beauty');
    expect(wms).not.toContain('restaurant');
    expect(wms).not.toContain('retail-pos');
  });

  it('boş seçim tüm dikey yapıları dökmez', () => {
    const ids = idsOf(filterStructuresByBusinessType(catalog, ''));
    expect(ids).toContain('suppliers');
    expect(ids).not.toContain('beauty');
    expect(ids).not.toContain('restaurant');
    expect(ids).not.toContain('wms');
    expect(ids).not.toContain('retail-pos');
    expect(idsOf(filterStructuresByBusinessType(catalog, 'general'))).toEqual(ids);
  });
});

describe('filterFirmsByBusinessType', () => {
  const firms = [
    { id: 'b', enabled_modules: ['beauty', 'management'] },
    { id: 'r', enabled_modules: ['restaurant', 'pos', 'management'] },
    { id: 'w', enabled_modules: ['wms', 'management'] },
    { id: 'm', enabled_modules: ['pos', 'management'] },
  ];

  it('güzellik restoran ve WMS firmalarını dışlar', () => {
    expect(filterFirmsByBusinessType(firms, 'beauty').map((f) => f.id)).toEqual(['b']);
  });

  it('restoran güzellik firmasını dışlar', () => {
    expect(filterFirmsByBusinessType(firms, 'restaurant').map((f) => f.id)).toEqual(['r']);
  });

  it('tip seçilmeden etiketli firmaların tamamını dökmez', () => {
    expect(filterFirmsByBusinessType(firms, null)).toEqual([]);
  });
});
