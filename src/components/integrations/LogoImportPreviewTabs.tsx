import { useCallback, useMemo, useState } from 'react';
import { Alert, Button, Space, Spin, Table, Tabs, Typography } from 'antd';
import { CloudDownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  loadLogoRestConfig,
  logoListResource,
  resolveLogoContext,
  type LogoResourceName,
} from '../../services/logoRestApi';
import { logoField, numVal, unwrapLogoRecord } from '../../services/logoRestSync';

const { Text } = Typography;

type PreviewRow = Record<string, string | number | null>;

type PreviewTabDef = {
  key: string;
  label: string;
  resource: LogoResourceName;
  mapRow: (raw: unknown, index: number) => PreviewRow | null;
  columns: ColumnsType<PreviewRow>;
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
    label: 'Malzemeler',
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

type Props = {
  connected: boolean;
};

export function LogoImportPreviewTabs({ connected }: Props) {
  const [activeKey, setActiveKey] = useState(PREVIEW_TABS[0].key);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const [error, setError] = useState('');
  const [rowsByTab, setRowsByTab] = useState<Record<string, PreviewRow[]>>({});
  const [countsByTab, setCountsByTab] = useState<Record<string, number | null>>({});

  const ctx = useMemo(() => resolveLogoContext(loadLogoRestConfig()), []);

  const loadTab = useCallback(async (tabKey: string) => {
    const def = PREVIEW_TABS.find((t) => t.key === tabKey);
    if (!def) return;
    setLoadingKey(tabKey);
    setError('');
    try {
      const cfg = loadLogoRestConfig();
      const result = await logoListResource(cfg, def.resource, { limit: 50, withCount: true });
      const rows = result.items
        .map((item, index) => def.mapRow(item, index))
        .filter((r): r is PreviewRow => r != null);
      setRowsByTab((prev) => ({ ...prev, [tabKey]: rows }));
      setCountsByTab((prev) => ({ ...prev, [tabKey]: result.count }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setRowsByTab((prev) => ({ ...prev, [tabKey]: [] }));
    } finally {
      setLoadingKey(null);
    }
  }, []);

  const loadAllTabs = useCallback(async () => {
    setLoadingAll(true);
    setError('');
    try {
      for (const def of PREVIEW_TABS) {
        await loadTab(def.key);
      }
    } finally {
      setLoadingAll(false);
    }
  }, [loadTab]);

  const activeDef = PREVIEW_TABS.find((t) => t.key === activeKey) ?? PREVIEW_TABS[0];
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
            loading={isLoading}
            onClick={() => void loadTab(activeKey)}
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

      {error ? <Alert type="error" showIcon message={error} /> : null}

      <Tabs
        activeKey={activeKey}
        onChange={(key) => {
          setActiveKey(key);
          if (!rowsByTab[key]?.length) void loadTab(key);
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
                  ({countsByTab[def.key]})
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
                dataSource={activeKey === def.key ? activeRows : rowsByTab[def.key] ?? []}
                pagination={{ pageSize: 15, showSizeChanger: false, showTotal: (t) => `${t} kayıt` }}
                locale={{ emptyText: 'Veri yok — "Bu sekmeyi yenile" veya "Tüm verileri listele" kullanın' }}
                scroll={{ x: 640 }}
              />
              {activeKey === def.key && activeCount != null && activeRows.length < activeCount ? (
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
                  Logo REST en fazla 50 kayıt gösterir; toplam {activeCount.toLocaleString('tr-TR')} kayıt.
                  İçe aktarımda tümü çekilir.
                </Text>
              ) : null}
            </Spin>
          ),
        }))}
      />
    </Space>
  );
}
