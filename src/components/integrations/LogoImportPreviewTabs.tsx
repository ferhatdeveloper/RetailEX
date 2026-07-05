import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Progress, Space, Spin, Table, Tabs, Typography } from 'antd';
import { CloudDownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  loadLogoRestConfig,
  logoEnsureSession,
  logoFetchArpBalanceMap,
  logoFetchItemStockMap,
  logoListResource,
  resolveLogoContext,
  type LogoArpBalanceRow,
  type LogoResourceName,
} from '../../services/logoRestApi';
import { logoField, numVal, unwrapLogoRecord } from '../../services/logoRestSync';

const { Text } = Typography;

const LIST_LIMIT = 25;
const FETCH_CONCURRENCY = 4;

async function runPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await fn(items[index], index);
    }
  });
  await Promise.all(workers);
}

type PreviewRow = Record<string, string | number | null>;

type PreviewTabDef = {
  key: string;
  label: string;
  resource: LogoResourceName;
  mapRow: (raw: unknown, index: number) => PreviewRow | null;
  columns: ColumnsType<PreviewRow>;
};

type ResourceCacheEntry = {
  items: unknown[];
  count: number | null;
  fetchedAt: number;
};

function str(rec: Record<string, unknown>, ...keys: string[]): string {
  const v = logoField(rec, ...keys);
  return v == null ? '' : String(v);
}

function fmtDate(rec: Record<string, unknown>): string {
  const raw = logoField(rec, 'DATE', 'date', 'DOC_DATE', 'docDate');
  if (raw == null || raw === '') return '';
  const s = String(raw);
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(6, 8)}.${s.slice(4, 6)}.${s.slice(0, 4)}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('tr-TR');
}

const PREVIEW_TABS: PreviewTabDef[] = [
  {
    key: 'items',
    label: 'Malzeme bilgileri',
    resource: 'items',
    mapRow: (raw, i) => {
      const rec = unwrapLogoRecord(raw);
      const code = str(rec, 'CODE', 'code');
      if (!code) return null;
      return {
        key: i,
        code,
        name: str(rec, 'NAME', 'name', 'DESCRIPTION', 'description') || '—',
        barcode: str(rec, 'BARCODE', 'barcode'),
        unit: str(rec, 'UNIT', 'unit') || 'Adet',
        price: numVal(logoField(rec, 'PRICE', 'SELLPRICE', 'price'), 0),
        vat: numVal(logoField(rec, 'VAT', 'SELLVAT', 'vat'), 0),
      };
    },
    columns: [
      { title: 'Kod', dataIndex: 'code', width: 110 },
      { title: 'Malzeme adı', dataIndex: 'name', ellipsis: true },
      { title: 'Barkod', dataIndex: 'barcode', width: 120 },
      { title: 'Birim', dataIndex: 'unit', width: 70 },
      { title: 'Fiyat', dataIndex: 'price', width: 90, align: 'right' },
      { title: 'KDV %', dataIndex: 'vat', width: 70, align: 'right' },
    ],
  },
  {
    key: 'stock',
    label: 'Stok bilgileri',
    resource: 'items',
    mapRow: (raw, i) => {
      const rec = unwrapLogoRecord(raw);
      const code = str(rec, 'CODE', 'code');
      if (!code) return null;
      return {
        key: i,
        code,
        name: str(rec, 'NAME', 'name', 'DESCRIPTION') || '—',
        onhand: numVal(logoField(rec, 'ONHAND', 'onHand', 'STOCK', 'stock'), 0),
        unit: str(rec, 'UNIT', 'unit') || 'Adet',
        warehouse: str(rec, 'WAREHOUSE', 'warehouse', 'INVENNO'),
      };
    },
    columns: [
      { title: 'Kod', dataIndex: 'code', width: 110 },
      { title: 'Malzeme', dataIndex: 'name', ellipsis: true },
      { title: 'Eldeki miktar', dataIndex: 'onhand', width: 110, align: 'right' },
      { title: 'Birim', dataIndex: 'unit', width: 70 },
      { title: 'Ambar', dataIndex: 'warehouse', width: 90 },
    ],
  },
  {
    key: 'arps',
    label: 'Cari hesaplar',
    resource: 'Arps',
    mapRow: (raw, i) => {
      const rec = unwrapLogoRecord(raw);
      const code = str(rec, 'CODE', 'code');
      if (!code) return null;
      return {
        key: i,
        code,
        name: str(rec, 'TITLE', 'DEFINITION_', 'NAME', 'title', 'definition') || '—',
        phone: str(rec, 'TELNRS', 'TELNRS2', 'PHONE', 'phone'),
        city: str(rec, 'CITY', 'city'),
        tax_nr: str(rec, 'TAXNR', 'TAX_ID', 'taxnr'),
        tax_office: str(rec, 'TAXOFFICE', 'taxoffice'),
      };
    },
    columns: [
      { title: 'Cari kodu', dataIndex: 'code', width: 100 },
      { title: 'Ünvan', dataIndex: 'name', ellipsis: true },
      { title: 'Telefon', dataIndex: 'phone', width: 110 },
      { title: 'Şehir', dataIndex: 'city', width: 90 },
      { title: 'Vergi no', dataIndex: 'tax_nr', width: 100 },
      { title: 'Vergi dairesi', dataIndex: 'tax_office', width: 110, ellipsis: true },
    ],
  },
  {
    key: 'balances',
    label: 'Cari bakiyeler',
    resource: 'Arps',
    mapRow: (raw, i) => {
      const rec = unwrapLogoRecord(raw);
      const code = str(rec, 'CODE', 'code');
      if (!code) return null;
      return {
        key: i,
        code,
        name: str(rec, 'TITLE', 'DEFINITION_', 'NAME', 'title') || '—',
        balance: numVal(logoField(rec, 'BALANCE', 'balance'), 0),
        debit: numVal(logoField(rec, 'DEBIT', 'debit', 'TOTAL_DEBIT'), 0),
        credit: numVal(logoField(rec, 'CREDIT', 'credit', 'TOTAL_CREDIT'), 0),
      };
    },
    columns: [
      { title: 'Cari kodu', dataIndex: 'code', width: 100 },
      { title: 'Ünvan', dataIndex: 'name', ellipsis: true },
      { title: 'Bakiye', dataIndex: 'balance', width: 110, align: 'right' },
      { title: 'Borç', dataIndex: 'debit', width: 100, align: 'right' },
      { title: 'Alacak', dataIndex: 'credit', width: 100, align: 'right' },
    ],
  },
  {
    key: 'salesInvoices',
    label: 'Satış faturaları',
    resource: 'salesInvoices',
    mapRow: (raw, i) => {
      const rec = unwrapLogoRecord(raw);
      const no = str(rec, 'NUMBER', 'FICHENO', 'number');
      if (!no) return null;
      const net = numVal(logoField(rec, 'TOTAL_NET', 'totalNet', 'NETTOTAL'), 0);
      const vat = numVal(logoField(rec, 'TOTAL_VAT', 'totalVat', 'VATAMOUNT'), 0);
      return {
        key: i,
        fiche_no: no,
        date: fmtDate(rec),
        arp_code: str(rec, 'ARP_CODE', 'arpCode', 'CLIENT_CODE'),
        net,
        gross: numVal(logoField(rec, 'TOTAL_GROSS', 'totalGross', 'GROSSTOTAL'), net + vat),
      };
    },
    columns: [
      { title: 'Fiş no', dataIndex: 'fiche_no', width: 100 },
      { title: 'Tarih', dataIndex: 'date', width: 95 },
      { title: 'Cari', dataIndex: 'arp_code', width: 100 },
      { title: 'Net', dataIndex: 'net', width: 95, align: 'right' },
      { title: 'Brüt', dataIndex: 'gross', width: 95, align: 'right' },
    ],
  },
  {
    key: 'purchaseInvoices',
    label: 'Alış faturaları',
    resource: 'purchaseInvoices',
    mapRow: (raw, i) => {
      const rec = unwrapLogoRecord(raw);
      const no = str(rec, 'NUMBER', 'FICHENO', 'number');
      if (!no) return null;
      const net = numVal(logoField(rec, 'TOTAL_NET', 'totalNet'), 0);
      const vat = numVal(logoField(rec, 'TOTAL_VAT', 'totalVat'), 0);
      return {
        key: i,
        fiche_no: no,
        date: fmtDate(rec),
        arp_code: str(rec, 'ARP_CODE', 'arpCode'),
        net,
        gross: numVal(logoField(rec, 'TOTAL_GROSS', 'totalGross'), net + vat),
      };
    },
    columns: [
      { title: 'Fiş no', dataIndex: 'fiche_no', width: 100 },
      { title: 'Tarih', dataIndex: 'date', width: 95 },
      { title: 'Cari', dataIndex: 'arp_code', width: 100 },
      { title: 'Net', dataIndex: 'net', width: 95, align: 'right' },
      { title: 'Brüt', dataIndex: 'gross', width: 95, align: 'right' },
    ],
  },
  {
    key: 'itemSlips',
    label: 'Malzeme fişleri',
    resource: 'itemSlips',
    mapRow: (raw, i) => {
      const rec = unwrapLogoRecord(raw);
      const no = str(rec, 'NUMBER', 'FICHENO', 'number');
      if (!no) return null;
      return {
        key: i,
        fiche_no: no,
        date: fmtDate(rec),
        io_type: numVal(logoField(rec, 'TYPE', 'IOCODE', 'type'), 0),
        notes: str(rec, 'NOTES1', 'LINEEXP', 'notes'),
      };
    },
    columns: [
      { title: 'Fiş no', dataIndex: 'fiche_no', width: 100 },
      { title: 'Tarih', dataIndex: 'date', width: 95 },
      { title: 'Tip', dataIndex: 'io_type', width: 60, align: 'center' },
      { title: 'Açıklama', dataIndex: 'notes', ellipsis: true },
    ],
  },
  {
    key: 'salesOrders',
    label: 'Satış siparişleri',
    resource: 'salesOrders',
    mapRow: (raw, i) => {
      const rec = unwrapLogoRecord(raw);
      const no = str(rec, 'NUMBER', 'FICHENO', 'number');
      if (!no) return null;
      return {
        key: i,
        order_no: no,
        date: fmtDate(rec),
        arp_code: str(rec, 'ARP_CODE', 'arpCode'),
        total: numVal(logoField(rec, 'TOTAL_NET', 'TOTAL_GROSS', 'totalNet'), 0),
      };
    },
    columns: [
      { title: 'Sipariş no', dataIndex: 'order_no', width: 100 },
      { title: 'Tarih', dataIndex: 'date', width: 95 },
      { title: 'Cari', dataIndex: 'arp_code', width: 100 },
      { title: 'Tutar', dataIndex: 'total', width: 100, align: 'right' },
    ],
  },
  {
    key: 'purchaseOrders',
    label: 'Alış siparişleri',
    resource: 'purchaseOrders',
    mapRow: (raw, i) => {
      const rec = unwrapLogoRecord(raw);
      const no = str(rec, 'NUMBER', 'FICHENO', 'number');
      if (!no) return null;
      return {
        key: i,
        order_no: no,
        date: fmtDate(rec),
        arp_code: str(rec, 'ARP_CODE', 'arpCode'),
        total: numVal(logoField(rec, 'TOTAL_NET', 'TOTAL_GROSS'), 0),
      };
    },
    columns: [
      { title: 'Sipariş no', dataIndex: 'order_no', width: 100 },
      { title: 'Tarih', dataIndex: 'date', width: 95 },
      { title: 'Cari', dataIndex: 'arp_code', width: 100 },
      { title: 'Tutar', dataIndex: 'total', width: 100, align: 'right' },
    ],
  },
  {
    key: 'banks',
    label: 'Kasa / banka',
    resource: 'banks',
    mapRow: (raw, i) => {
      const rec = unwrapLogoRecord(raw);
      const code = str(rec, 'CODE', 'code');
      if (!code) return null;
      return {
        key: i,
        code,
        name: str(rec, 'DEFINITION_', 'NAME', 'TITLE', 'name') || code,
        balance: numVal(logoField(rec, 'BALANCE', 'balance'), 0),
      };
    },
    columns: [
      { title: 'Kod', dataIndex: 'code', width: 100 },
      { title: 'Ad', dataIndex: 'name', ellipsis: true },
      { title: 'Bakiye', dataIndex: 'balance', width: 110, align: 'right' },
    ],
  },
];

const UNIQUE_RESOURCES = [...new Set(PREVIEW_TABS.map((t) => t.resource))];

function mapResourceToTabs(
  resource: LogoResourceName,
  items: unknown[],
  count: number | null,
  enrich?: {
    stockByCode?: Map<string, number>;
    balanceByCode?: Map<string, LogoArpBalanceRow>;
  }
): { rowsByTab: Record<string, PreviewRow[]>; countsByTab: Record<string, number | null> } {
  const rowsByTab: Record<string, PreviewRow[]> = {};
  const countsByTab: Record<string, number | null> = {};
  for (const def of PREVIEW_TABS.filter((t) => t.resource === resource)) {
    rowsByTab[def.key] = items
      .map((item, index) => {
        const row = def.mapRow(item, index);
        if (row == null) return null;
        const rec = unwrapLogoRecord(item);
        const code = str(rec, 'CODE', 'code');
        if (code && enrich?.stockByCode?.has(code) && 'onhand' in row) {
          row.onhand = enrich.stockByCode.get(code) ?? row.onhand;
        }
        if (code && enrich?.balanceByCode?.has(code)) {
          const bal = enrich.balanceByCode.get(code)!;
          if ('balance' in row) row.balance = bal.balance;
          if ('debit' in row) row.debit = bal.debit;
          if ('credit' in row) row.credit = bal.credit;
        }
        return row;
      })
      .filter((r): r is PreviewRow => r != null);
    countsByTab[def.key] = count;
  }
  return { rowsByTab, countsByTab };
}

type Props = {
  connected: boolean;
};

export function LogoImportPreviewTabs({ connected }: Props) {
  const [activeKey, setActiveKey] = useState(PREVIEW_TABS[0].key);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const [loadProgress, setLoadProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [rowsByTab, setRowsByTab] = useState<Record<string, PreviewRow[]>>({});
  const [countsByTab, setCountsByTab] = useState<Record<string, number | null>>({});

  const resourceCacheRef = useRef<Map<LogoResourceName, ResourceCacheEntry>>(new Map());
  const inflightRef = useRef<Map<LogoResourceName, Promise<ResourceCacheEntry>>>(new Map());

  const ctx = useMemo(() => resolveLogoContext(loadLogoRestConfig()), []);

  const mergeTabData = useCallback(
    (partialRows: Record<string, PreviewRow[]>, partialCounts: Record<string, number | null>) => {
      setRowsByTab((prev) => ({ ...prev, ...partialRows }));
      setCountsByTab((prev) => ({ ...prev, ...partialCounts }));
    },
    []
  );

  const fetchResource = useCallback(
    async (
      resource: LogoResourceName,
      opts: { limit: number; withCount: boolean; force?: boolean }
    ): Promise<ResourceCacheEntry> => {
      const cached = resourceCacheRef.current.get(resource);
      if (!opts.force && cached && cached.items.length > 0 && opts.limit <= cached.items.length) {
        return cached;
      }

      const inflight = inflightRef.current.get(resource);
      if (inflight && !opts.force) return inflight;

      const task = (async () => {
        const cfg = loadLogoRestConfig();
        const result = await logoListResource(cfg, resource, {
          limit: opts.limit,
          withCount: opts.withCount,
        });
        const entry: ResourceCacheEntry = {
          items: result.items,
          count: result.count,
          fetchedAt: Date.now(),
        };
        resourceCacheRef.current.set(resource, entry);
        return entry;
      })();

      inflightRef.current.set(resource, task);
      try {
        return await task;
      } finally {
        inflightRef.current.delete(resource);
      }
    },
    []
  );

  const applyResource = useCallback(
    async (resource: LogoResourceName, entry: ResourceCacheEntry) => {
      const cfg = loadLogoRestConfig();
      const codes = entry.items
        .map((item) => str(unwrapLogoRecord(item), 'CODE', 'code'))
        .filter(Boolean);

      let enrich: {
        stockByCode?: Map<string, number>;
        balanceByCode?: Map<string, LogoArpBalanceRow>;
      } | undefined;

      if (resource === 'items' && codes.length > 0) {
        enrich = { stockByCode: await logoFetchItemStockMap(cfg, codes) };
      } else if (resource === 'Arps' && codes.length > 0) {
        enrich = { balanceByCode: await logoFetchArpBalanceMap(cfg, codes) };
      }

      const mapped = mapResourceToTabs(resource, entry.items, entry.count, enrich);
      mergeTabData(mapped.rowsByTab, mapped.countsByTab);
    },
    [mergeTabData]
  );

  const loadTab = useCallback(
    async (tabKey: string, force = false) => {
      const def = PREVIEW_TABS.find((t) => t.key === tabKey);
      if (!def) return;

      if (!force && rowsByTab[tabKey]?.length) return;

      setLoadingKey(tabKey);
      setError('');
      try {
        const entry = await fetchResource(def.resource, {
          limit: LIST_LIMIT,
          withCount: true,
          force,
        });
        await applyResource(def.resource, entry);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
        setRowsByTab((prev) => ({ ...prev, [tabKey]: [] }));
      } finally {
        setLoadingKey(null);
      }
    },
    [applyResource, fetchResource, rowsByTab]
  );

  const loadAllTabs = useCallback(async () => {
    setLoadingAll(true);
    setError('');
    setLoadProgress({ done: 0, total: UNIQUE_RESOURCES.length });
    let done = 0;

    try {
      await logoEnsureSession(loadLogoRestConfig());

      await runPool(UNIQUE_RESOURCES, FETCH_CONCURRENCY, async (resource) => {
        try {
          const entry = await fetchResource(resource, {
            limit: LIST_LIMIT,
            withCount: true,
            force: true,
          });
            await applyResource(resource, entry);
        } catch (e: unknown) {
          setError((prev) => prev || (e instanceof Error ? e.message : String(e)));
        } finally {
          done += 1;
          setLoadProgress({ done, total: UNIQUE_RESOURCES.length });
        }
      });
    } finally {
      setLoadingAll(false);
      setLoadProgress(null);
    }
  }, [applyResource, fetchResource]);

  useEffect(() => {
    if (!connected) return;
    const def = PREVIEW_TABS.find((t) => t.key === activeKey);
    if (!def || rowsByTab[activeKey]?.length || loadingAll) return;
    void loadTab(activeKey);
  }, [connected, activeKey, loadTab, loadingAll, rowsByTab]);

  const activeRows = rowsByTab[activeKey] ?? [];
  const activeCount = countsByTab[activeKey];
  const isLoading = loadingKey === activeKey || loadingAll;

  if (!connected) {
    return (
      <Alert
        type="info"
        showIcon
        message="Aktarılacak verileri görmek için önce Genel bölümünden Logo REST bağlantısını kurun."
      />
    );
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Text strong>Aktarılacak veri önizlemesi</Text>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Logo firma {ctx.firmNr} · dönem {ctx.periodNr}
              {ctx.logoDb ? ` · DB ${ctx.logoDb}` : ''}
            </Text>
          </div>
        </div>
        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            loading={loadingKey === activeKey}
            disabled={loadingAll}
            onClick={() => void loadTab(activeKey, true)}
          >
            Bu sekmeyi yenile
          </Button>
          <Button
            type="primary"
            icon={<CloudDownloadOutlined />}
            loading={loadingAll}
            onClick={() => void loadAllTabs()}
          >
            Tüm verileri listele
          </Button>
        </Space>
      </div>

      {loadProgress ? (
        <Progress
          percent={Math.round((loadProgress.done / loadProgress.total) * 100)}
          size="small"
          status="active"
          format={() => `${loadProgress.done}/${loadProgress.total} kaynak`}
        />
      ) : null}

      {error ? <Alert type="error" showIcon message={error} /> : null}

      <Tabs
        activeKey={activeKey}
        onChange={(key) => {
          setActiveKey(key);
          void loadTab(key);
        }}
        type="card"
        size="small"
        items={PREVIEW_TABS.map((def) => ({
          key: def.key,
          label: (
            <span>
              {def.label}
              {countsByTab[def.key] != null ? (
                <Text type="secondary" style={{ marginLeft: 4, fontSize: 11 }}>
                  ({countsByTab[def.key]?.toLocaleString('tr-TR')})
                </Text>
              ) : null}
            </span>
          ),
          children: (
            <Spin spinning={loadingKey === def.key || loadingAll}>
              <Table<PreviewRow>
                size="small"
                rowKey="key"
                columns={def.columns}
                dataSource={rowsByTab[def.key] ?? []}
                pagination={{ pageSize: 15, showSizeChanger: false, showTotal: (t) => `${t} kayıt` }}
                locale={{
                  emptyText: loadingAll
                    ? 'Yükleniyor…'
                    : 'Veri yok — "Bu sekmeyi yenile" veya "Tüm verileri listele" kullanın',
                }}
                scroll={{ x: 640 }}
              />
              {activeKey === def.key && activeCount != null && activeRows.length < activeCount ? (
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
                  Önizleme: ilk {LIST_LIMIT} kayıt · toplam {activeCount.toLocaleString('tr-TR')}. İçe
                  aktarımda tümü çekilir.
                </Text>
              ) : null}
            </Spin>
          ),
        }))}
      />
    </Space>
  );
}
