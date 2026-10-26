import type { ColumnDef } from '@tanstack/react-table';
import { describe, expect, it } from 'vitest';
import { buildGroupDashboardExportAoa } from '../../utils/groupDashboardExcelExport';
import { buildDataGridExportAoa, buildGridExportWorksheet } from '../../utils/gridExcelExport';

type HistoryRow = {
  date_ymd: string;
  specialist_id: string;
  name: string;
  service_commission: number;
  product_commission: number;
  total_commission: number;
  __devexRowKind?: string;
};

const HEADERS = ['Tarih', 'Uzman', 'Hizmet primi', 'Ürün primi', 'Toplam prim'] as const;

const historyColumns: ColumnDef<HistoryRow, unknown>[] = [
  { id: 'date_ymd', accessorKey: 'date_ymd', header: 'Tarih', meta: { type: 'date', filterKind: 'date' } },
  { id: 'name', accessorKey: 'name', header: 'Uzman' },
  { id: 'service_commission', accessorKey: 'service_commission', header: 'Hizmet primi', meta: { type: 'number' } },
  { id: 'product_commission', accessorKey: 'product_commission', header: 'Ürün primi', meta: { type: 'number' } },
  { id: 'total_commission', accessorKey: 'total_commission', header: 'Toplam prim', meta: { type: 'number' } },
];

const historyRows: HistoryRow[] = [
  {
    date_ymd: '2026-10-26',
    specialist_id: 'sa-1',
    name: 'System Administrator',
    service_commission: 22500,
    product_commission: 0,
    total_commission: 22500,
  },
  {
    date_ymd: '2026-10-26',
    specialist_id: 'dunya',
    name: 'DUNYA',
    service_commission: 11250,
    product_commission: 0,
    total_commission: 11250,
  },
  {
    date_ymd: '2026-10-26',
    specialist_id: 'zahra',
    name: 'ZAHRA',
    service_commission: 7500,
    product_commission: 0,
    total_commission: 7500,
  },
  {
    date_ymd: '2026-10-25',
    specialist_id: 'sa-1',
    name: 'System Administrator',
    service_commission: 0,
    product_commission: 0,
    total_commission: 0,
  },
];

function historyAoa(extra: HistoryRow[] = []) {
  return buildDataGridExportAoa([...extra, ...historyRows], historyColumns, {
    footerLabel: 'TOPLAM',
    footerSumColumns: [
      { columnId: 'service_commission', getValue: (row) => row.service_commission },
      { columnId: 'product_commission', getValue: (row) => row.product_commission },
      { columnId: 'total_commission', getValue: (row) => row.total_commission },
    ],
  });
}

describe('prim dökümü Excel', () => {
  it('beş kolon başlığı, dört veri satırı, toplam ve 22.500 satırı durur', () => {
    const { headers, aoa } = historyAoa([
      {
        ...historyRows[0]!,
        __devexRowKind: 'group',
        service_commission: 999999,
        total_commission: 999999,
      },
    ]);

    expect(headers).toEqual([...HEADERS]);
    expect(aoa[0]).toEqual([...HEADERS]);
    expect(headers.every((h) => h.trim().length > 0)).toBe(true);

    const dataRows = aoa.slice(1, -1);
    expect(dataRows).toHaveLength(4);
    expect(dataRows[0]).toEqual(['26.10.2026', 'System Administrator', '22.500', '0', '22.500']);
    expect(dataRows[1]).toEqual(['26.10.2026', 'DUNYA', '11.250', '0', '11.250']);
    expect(dataRows[2]).toEqual(['26.10.2026', 'ZAHRA', '7.500', '0', '7.500']);
    expect(dataRows[3]).toEqual(['25.10.2026', 'System Administrator', '0', '0', '0']);
    expect(dataRows.filter((row) => row[1] === 'System Administrator' && row[2] === '22.500')).toHaveLength(1);

    expect(aoa[aoa.length - 1]).toEqual(['TOPLAM (4)', '', '41.250', '0', '41.250']);

    const ws = buildGridExportWorksheet(aoa, headers);
    const merges = ws['!merges'] ?? [];
    const rowMerged = (row: number) =>
      merges.some((m) => m.s.r === row && m.e.r === row && m.e.c > m.s.c);
    expect(rowMerged(0)).toBe(false);
    expect(rowMerged(1)).toBe(false);
    expect(ws['A1']?.v).toBe('Tarih');
    expect(ws['B1']?.v).toBe('Uzman');
    expect(ws['C1']?.v).toBe('Hizmet primi');
    expect(ws['D1']?.v).toBe('Ürün primi');
    expect(ws['E1']?.v).toBe('Toplam prim');
    expect(ws['B2']?.v).toBe('System Administrator');
    expect(ws['C2']?.v).toBe('22.500');
  });
});

describe('grup dashboard Excel', () => {
  const rows = [
    {
      key: 'DUNYA',
      label: 'DUNYA',
      count: 1,
      values: { service_commission: 11250, product_commission: 0, total_commission: 11250 },
    },
    {
      key: 'System Administrator',
      label: 'System Administrator',
      count: 2,
      values: { service_commission: 22500, product_commission: 0, total_commission: 22500 },
    },
    {
      key: 'ZAHRA',
      label: 'ZAHRA',
      count: 1,
      values: { service_commission: 7500, product_commission: 0, total_commission: 7500 },
    },
  ];
  const metrics = [
    { id: 'service_commission', label: 'Hizmet primi' },
    { id: 'product_commission', label: 'Ürün primi' },
    { id: 'total_commission', label: 'Toplam prim' },
  ];

  it('pivot başlıkları ekranla aynı ve satırlar eksiksiz', () => {
    const aoa = buildGroupDashboardExportAoa({
      groupColumnLabel: 'UZMAN',
      countLabel: 'Kayıt adedi',
      metrics,
      rows,
      chartKind: 'pivot',
    });
    expect(aoa[0]).toEqual(['UZMAN', 'Kayıt adedi', 'Hizmet primi', 'Ürün primi', 'Toplam prim']);
    expect(aoa[0].every((h) => String(h).trim().length > 0)).toBe(true);
    expect(aoa.slice(1)).toEqual([
      ['DUNYA', '1', '11.250', '0', '11.250'],
      ['System Administrator', '2', '22.500', '0', '22.500'],
      ['ZAHRA', '1', '7.500', '0', '7.500'],
    ]);
  });

  it('seçili grafik yalnız görünen serileri yazar', () => {
    const aoa = buildGroupDashboardExportAoa({
      groupColumnLabel: 'UZMAN',
      countLabel: 'Kayıt adedi',
      metrics,
      rows,
      chartKind: 'bar',
      selectedMetricIds: ['service_commission', 'total_commission'],
    });
    expect(aoa[0]).toEqual(['UZMAN', 'Hizmet primi', 'Toplam prim']);
    expect(aoa).toHaveLength(4);
    expect(aoa[2]).toEqual(['System Administrator', '22.500', '22.500']);
  });
});
