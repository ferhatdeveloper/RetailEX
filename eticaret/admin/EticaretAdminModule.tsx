import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CheckOutlined,
  CloudUploadOutlined,
  CreditCardOutlined,
  EyeOutlined,
  GlobalOutlined,
  SaveOutlined,
  ShoppingOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import {
  DEFAULT_ETICARET_SETTINGS,
  loadEticaretSettingsFromDb,
  saveEticaretSettingsToDb,
} from '../core/settings';
import {
  listRetailTenantsForEticaret,
  loadTenantEticaretSettingsFromRegistry,
  saveTenantEticaretSettings,
} from '../core/tenantRegistryApi';
import { listAllThemeVariants } from '../themes/registry';
import { buildStorefrontUrl } from '../core/tenantResolver';
import { listWebOrders } from '../core/orderApi';
import { PAYMENT_PROVIDER_CATALOG } from '../core/payments/types';
import type { EticaretSettings, EticaretWebOrder } from '../core/types';
import type { PaymentProviderConfig } from '../core/payments/types';
import { getPrimarySqlConnectionString } from '../../src/services/postgres';

const { Title, Paragraph, Text } = Typography;

function defaultPaymentProviders(): PaymentProviderConfig[] {
  return PAYMENT_PROVIDER_CATALOG.map((p) => ({
    id: p.id,
    enabled: false,
    label: p.label,
    mode: 'test' as const,
  }));
}

function mergeProviders(saved?: PaymentProviderConfig[]): PaymentProviderConfig[] {
  const base = defaultPaymentProviders();
  if (!saved?.length) return base;
  const map = new Map(saved.map((p) => [p.id, p]));
  return base.map((b) => ({ ...b, ...map.get(b.id) }));
}

/**
 * Gizli online mağaza yönetimi — yalnızca `/mgz` URL'sinden erişilir.
 */
export function EticaretAdminModule() {
  const [form, setForm] = useState<EticaretSettings>({
    ...DEFAULT_ETICARET_SETTINGS,
    paymentProviders: defaultPaymentProviders(),
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenants, setTenants] = useState<Awaited<ReturnType<typeof listRetailTenantsForEticaret>>>([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [orders, setOrders] = useState<EticaretWebOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  useEffect(() => {
    void Promise.all([loadEticaretSettingsFromDb(), listRetailTenantsForEticaret()]).then(
      ([s, list]) => {
        setForm({
          ...s,
          paymentProviders: mergeProviders(s.paymentProviders),
        });
        setTenants(list);
        if (s.demoTenantCode.trim()) setSelectedTenant(s.demoTenantCode.trim().toLowerCase());
        else if (list[0]?.code) setSelectedTenant(list[0].code);
        setLoading(false);
      },
    );
  }, []);

  const variants = listAllThemeVariants();
  const previewTenant =
    form.demoMode && form.demoTenantCode.trim() ? form.demoTenantCode.trim() : selectedTenant || 'demo';

  const patch = (p: Partial<EticaretSettings>) => setForm((prev) => ({ ...prev, ...p }));

  const patchProvider = (id: string, p: Partial<PaymentProviderConfig>) => {
    setForm((prev) => ({
      ...prev,
      paymentProviders: (prev.paymentProviders || []).map((x) => (x.id === id ? { ...x, ...p } : x)),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveEticaretSettingsToDb(form);
      message.success('E-ticaret ayarları kaydedildi');
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleApplyToTenant = async () => {
    if (!selectedTenant.trim()) {
      message.warning('Kiracı seçin');
      return;
    }
    setSaving(true);
    try {
      await saveTenantEticaretSettings(selectedTenant, {
        activeThemeId: form.activeThemeId,
        activeVariantId: form.activeVariantId,
        enabled: form.enabled,
        storeTitle: form.storeTitle,
        announcementText: form.announcementText,
        demoMode: form.demoMode,
        demoTenantCode: form.demoTenantCode,
        paymentProviders: form.paymentProviders,
        defaultPaymentProvider: form.defaultPaymentProvider,
      });
      message.success(`${selectedTenant} kiracısına uygulandı`);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const loadOrders = async () => {
    setOrdersLoading(true);
    try {
      const connStr = getPrimarySqlConnectionString();
      if (!connStr) throw new Error('Veritabanı bağlantısı yok');
      const rows = await listWebOrders(connStr, selectedTenant || undefined);
      setOrders(rows);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setOrdersLoading(false);
    }
  };

  const orderColumns = useMemo(
    () => [
      { title: 'Sipariş No', dataIndex: 'order_no', key: 'order_no' },
      { title: 'Kiracı', dataIndex: 'tenant_code', key: 'tenant_code' },
      {
        title: 'Durum',
        dataIndex: 'status',
        key: 'status',
        render: (v: string, r: EticaretWebOrder) => (
          <Space>
            <Tag color={v === 'converted' ? 'green' : v === 'demo' ? 'gold' : 'blue'}>{v}</Tag>
            {r.demo_mode ? <Tag>demo</Tag> : null}
          </Space>
        ),
      },
      { title: 'Müşteri', dataIndex: 'customer_name', key: 'customer_name' },
      { title: 'Ödeme', dataIndex: 'payment_provider', key: 'payment_provider' },
      {
        title: 'Tutar',
        key: 'total',
        render: (_: unknown, r: EticaretWebOrder) =>
          `${Number(r.total).toLocaleString('tr-TR')} ${r.currency}`,
      },
      { title: 'Fiş', dataIndex: 'sales_fiche_no', key: 'sales_fiche_no' },
      {
        title: 'Tarih',
        dataIndex: 'created_at',
        key: 'created_at',
        render: (v: string) => new Date(v).toLocaleString('tr-TR'),
      },
    ],
    [],
  );

  if (loading) {
    return <div style={{ padding: 24 }}>Yükleniyor…</div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <GlobalOutlined /> Online Mağaza Yönetimi
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Bu panel menüde görünmez — yalnızca <Text code>/mgz</Text> adresinden erişilir. Vitrin:{' '}
            <Text code>/magaza/kiracı-kodu</Text>
          </Paragraph>
        </div>

        <Alert
          type="info"
          showIcon
          message="Demo modu kapalıyken gelen siparişler otomatik sipariş fişine (trcode 20) dönüştürülür."
        />

        <Tabs
          defaultActiveKey="general"
          items={[
            {
              key: 'general',
              label: (
                <span>
                  <ToolOutlined /> Genel
                </span>
              ),
              children: (
                <Card bordered>
                  <Row gutter={[16, 16]}>
                    <Col xs={24} md={8}>
                      <Text strong>Perakende kiracı</Text>
                      <Select
                        showSearch
                        style={{ width: '100%', marginTop: 8 }}
                        value={selectedTenant || undefined}
                        onChange={(v) => void loadTenantEticaretSettingsFromRegistry(v).then((r) => {
                          setSelectedTenant(v);
                          if (r && Object.keys(r).length) setForm((prev) => ({ ...prev, ...r }));
                        })}
                        options={tenants.map((t) => ({
                          value: t.code,
                          label: `${t.display_name} (${t.code})`,
                        }))}
                      />
                    </Col>
                    <Col xs={24} md={16}>
                      <Space wrap style={{ marginTop: 28 }}>
                        <Button icon={<CloudUploadOutlined />} loading={saving} onClick={() => void handleApplyToTenant()}>
                          Kiracıya uygula
                        </Button>
                        <Button icon={<EyeOutlined />} href={buildStorefrontUrl(previewTenant)} target="_blank">
                          Vitrini aç
                        </Button>
                      </Space>
                    </Col>
                    <Col xs={24} md={12}>
                      <Text strong>Mağaza başlığı</Text>
                      <Input value={form.storeTitle} onChange={(e) => patch({ storeTitle: e.target.value })} style={{ marginTop: 8 }} />
                    </Col>
                    <Col xs={24} md={12}>
                      <Text strong>Duyuru</Text>
                      <Input value={form.announcementText} onChange={(e) => patch({ announcementText: e.target.value })} style={{ marginTop: 8 }} />
                    </Col>
                    <Col xs={24} md={6}>
                      <Text strong>Mağaza aktif</Text>
                      <div style={{ marginTop: 8 }}>
                        <Switch checked={form.enabled} onChange={(v) => patch({ enabled: v })} />
                      </div>
                    </Col>
                    <Col xs={24} md={6}>
                      <Text strong>Demo modu</Text>
                      <div style={{ marginTop: 8 }}>
                        <Switch checked={form.demoMode} onChange={(v) => patch({ demoMode: v })} />
                      </div>
                    </Col>
                    <Col xs={24} md={6}>
                      <Text strong>Demo kiracı</Text>
                      <Input
                        disabled={!form.demoMode}
                        value={form.demoTenantCode}
                        onChange={(e) => patch({ demoTenantCode: e.target.value.trim().toLowerCase() })}
                        style={{ marginTop: 8 }}
                      />
                    </Col>
                    <Col xs={24} md={6}>
                      <Text strong>Varsayılan ödeme</Text>
                      <Select
                        style={{ width: '100%', marginTop: 8 }}
                        allowClear
                        value={form.defaultPaymentProvider}
                        onChange={(v) => patch({ defaultPaymentProvider: v })}
                        options={(form.paymentProviders || [])
                          .filter((p) => p.enabled)
                          .map((p) => ({ value: p.id, label: p.label }))}
                      />
                    </Col>
                  </Row>
                </Card>
              ),
            },
            {
              key: 'theme',
              label: (
                <span>
                  <EyeOutlined /> Tema
                </span>
              ),
              children: (
                <Row gutter={[16, 16]}>
                  {variants.map(({ theme, variant }) => {
                    const selected = form.activeVariantId === variant.id;
                    return (
                      <Col xs={24} sm={12} md={8} lg={6} key={variant.id}>
                        <Card
                          hoverable
                          onClick={() => patch({ activeThemeId: theme.id, activeVariantId: variant.id })}
                          style={{
                            borderColor: selected ? '#1677ff' : '#d9d9d9',
                            boxShadow: selected ? '0 0 0 2px rgba(22,119,255,0.2)' : undefined,
                          }}
                          cover={
                            <div style={{ height: 120, overflow: 'hidden', background: '#f5f5f5' }}>
                              <img alt={variant.name} src={variant.previewImage} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                          }
                        >
                          <Card.Meta
                            title={
                              <Space>
                                {variant.name}
                                {selected ? <CheckOutlined style={{ color: '#1677ff' }} /> : null}
                              </Space>
                            }
                            description={variant.description}
                          />
                        </Card>
                      </Col>
                    );
                  })}
                </Row>
              ),
            },
            {
              key: 'payments',
              label: (
                <span>
                  <CreditCardOutlined /> Ödeme
                </span>
              ),
              children: (
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  {(form.paymentProviders || []).map((p) => {
                    const meta = PAYMENT_PROVIDER_CATALOG.find((x) => x.id === p.id);
                    return (
                      <Card key={p.id} size="small" title={`${p.label} · ${meta?.region || ''}`}>
                        <Row gutter={[12, 12]} align="middle">
                          <Col xs={24} md={4}>
                            <Switch checked={p.enabled} onChange={(v) => patchProvider(p.id, { enabled: v })} />
                            <Text type="secondary" style={{ marginLeft: 8 }}>Aktif</Text>
                          </Col>
                          <Col xs={12} md={4}>
                            <Select
                              style={{ width: '100%' }}
                              value={p.mode}
                              onChange={(v) => patchProvider(p.id, { mode: v })}
                              options={[
                                { value: 'test', label: 'Test' },
                                { value: 'live', label: 'Canlı' },
                              ]}
                            />
                          </Col>
                          <Col xs={12} md={8}>
                            <Input
                              placeholder="API Key / Merchant ID"
                              value={p.apiKey || p.merchantId || ''}
                              onChange={(e) => patchProvider(p.id, { apiKey: e.target.value, merchantId: e.target.value })}
                            />
                          </Col>
                          <Col xs={12} md={8}>
                            <Input.Password
                              placeholder="Secret Key"
                              value={p.secretKey || ''}
                              onChange={(e) => patchProvider(p.id, { secretKey: e.target.value })}
                            />
                          </Col>
                        </Row>
                        <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                          {meta?.description}
                        </Paragraph>
                      </Card>
                    );
                  })}
                </Space>
              ),
            },
            {
              key: 'orders',
              label: (
                <span>
                  <ShoppingOutlined /> Siparişler
                </span>
              ),
              children: (
                <Card bordered>
                  <Space style={{ marginBottom: 16 }}>
                    <Button onClick={() => void loadOrders()} loading={ordersLoading}>
                      REST ile yenile
                    </Button>
                  </Space>
                  <Table
                    rowKey="id"
                    size="small"
                    loading={ordersLoading}
                    dataSource={orders}
                    columns={orderColumns}
                    pagination={{ pageSize: 20 }}
                  />
                </Card>
              ),
            },
          ]}
        />

        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave()}>
          Tüm ayarları kaydet
        </Button>
      </Space>
    </div>
  );
}
