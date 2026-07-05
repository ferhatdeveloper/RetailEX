import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  Layout,
  Menu,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  AppstoreOutlined,
  CheckOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  EyeOutlined,
  FileTextOutlined,
  GlobalOutlined,
  LinkOutlined,
  MenuOutlined,
  PictureOutlined,
  ReadOutlined,
  SaveOutlined,
  SettingOutlined,
  ShoppingOutlined,
  SlidersOutlined,
  StarOutlined,
  ThunderboltOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import {
  DEFAULT_ETICARET_SETTINGS,
} from '../core/settings';
import {
  listRetailTenantsForEticaret,
} from '../core/tenantRegistryApi';
import {
  loadTenantEticaretSettingsFull,
  saveTenantEticaretSettingsFull,
  listWebOrdersForTenant,
} from '../core/eticaretApi';
import { fetchTenantCatalog } from '../core/catalogApi';
import { listAllThemeVariants } from '../themes/registry';
import { buildStorefrontUrl } from '../core/tenantResolver';
import { PAYMENT_PROVIDER_CATALOG } from '../core/payments/types';
import type { EticaretSettings, EticaretWebOrder } from '../core/types';
import type { PaymentProviderConfig } from '../core/payments/types';
import { DashboardSection } from './sections/DashboardSection';
import { BannersSection } from './sections/BannersSection';
import { SlidersSection } from './sections/SlidersSection';
import { CampaignsSection } from './sections/CampaignsSection';
import { FeaturedSection } from './sections/FeaturedSection';
import { NavigationSection } from './sections/NavigationSection';
import { FooterSection } from './sections/FooterSection';
import { PagesSection } from './sections/PagesSection';
import { StorefrontMetaSection } from './sections/StorefrontMetaSection';
import { StorefrontFeaturesSection } from './sections/StorefrontFeaturesSection';
import { ContactSocialSection } from './sections/ContactSocialSection';
import { PopupsSection } from './sections/PopupsSection';
import { HomepageSection } from './sections/HomepageSection';
import { LayoutBrandingSection } from './sections/LayoutBrandingSection';
import { LookbookSection } from './sections/LookbookSection';

const { Header, Sider, Content } = Layout;
const { Title, Text, Paragraph } = Typography;

type AdminSection =
  | 'dashboard'
  | 'storefront'
  | 'navigation'
  | 'footer'
  | 'pages'
  | 'contact'
  | 'popups'
  | 'homepage'
  | 'layout'
  | 'lookbook'
  | 'banners'
  | 'sliders'
  | 'campaigns'
  | 'featured'
  | 'features'
  | 'theme'
  | 'payments'
  | 'orders'
  | 'settings';

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

const MENU_ITEMS: MenuProps['items'] = [
  { key: 'dashboard', icon: <DashboardOutlined />, label: 'Özet' },
  { type: 'divider' },
  { key: 'content', label: 'Vitrin İçeriği', type: 'group' },
  { key: 'storefront', icon: <GlobalOutlined />, label: 'Mağaza kimliği' },
  { key: 'navigation', icon: <MenuOutlined />, label: 'Menü' },
  { key: 'footer', icon: <LinkOutlined />, label: 'Footer' },
  { key: 'pages', icon: <FileTextOutlined />, label: 'Sayfalar' },
  { key: 'contact', icon: <GlobalOutlined />, label: 'İletişim & sosyal' },
  { key: 'popups', icon: <ThunderboltOutlined />, label: 'Popup\'lar' },
  { key: 'homepage', icon: <AppstoreOutlined />, label: 'Ana sayfa düzeni' },
  { key: 'layout', icon: <ToolOutlined />, label: 'Layout & marka' },
  { key: 'lookbook', icon: <ReadOutlined />, label: 'Lookbook' },
  { key: 'banners', icon: <PictureOutlined />, label: 'Bannerlar' },
  { key: 'sliders', icon: <SlidersOutlined />, label: 'Slider' },
  { key: 'campaigns', icon: <ThunderboltOutlined />, label: 'Kampanyalar' },
  { key: 'featured', icon: <StarOutlined />, label: 'Öne Çıkanlar' },
  { type: 'divider' },
  { key: 'shop', label: 'Mağaza', type: 'group' },
  { key: 'features', icon: <ToolOutlined />, label: 'Tema özellikleri' },
  { key: 'theme', icon: <AppstoreOutlined />, label: 'Tema' },
  { key: 'payments', icon: <CreditCardOutlined />, label: 'Ödeme' },
  { key: 'orders', icon: <ShoppingOutlined />, label: 'Siparişler' },
  { key: 'settings', icon: <SettingOutlined />, label: 'Ayarlar' },
];

/**
 * Gizli e-ticaret yönetim paneli — yalnızca `/mgz` URL'sinden erişilir.
 */
export function EticaretAdminModule() {
  const [section, setSection] = useState<AdminSection>('dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const [form, setForm] = useState<EticaretSettings>({
    ...DEFAULT_ETICARET_SETTINGS,
    paymentProviders: defaultPaymentProviders(),
    banners: [],
    sliders: [],
    campaigns: [],
    featuredProducts: [],
    menuItems: DEFAULT_ETICARET_SETTINGS.menuItems,
    footerLinks: DEFAULT_ETICARET_SETTINGS.footerLinks,
    staticPages: DEFAULT_ETICARET_SETTINGS.staticPages,
    lookbookScenes: DEFAULT_ETICARET_SETTINGS.lookbookScenes || [],
    socialLinks: DEFAULT_ETICARET_SETTINGS.socialLinks || [],
    contactInfo: DEFAULT_ETICARET_SETTINGS.contactInfo || {},
    newsletter: DEFAULT_ETICARET_SETTINGS.newsletter || {},
    beforeYouLeave: DEFAULT_ETICARET_SETTINGS.beforeYouLeave || {},
    recentSales: DEFAULT_ETICARET_SETTINGS.recentSales,
    themeBranding: DEFAULT_ETICARET_SETTINGS.themeBranding || {},
    layout: DEFAULT_ETICARET_SETTINGS.layout,
    homepageSections: DEFAULT_ETICARET_SETTINGS.homepageSections,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenants, setTenants] = useState<Awaited<ReturnType<typeof listRetailTenantsForEticaret>>>([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [orders, setOrders] = useState<EticaretWebOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [productOptions, setProductOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);

  const loadTenantSettings = useCallback(async (tenantCode: string) => {
    if (!tenantCode.trim()) return;
    setLoading(true);
    try {
      const merged = await loadTenantEticaretSettingsFull(tenantCode);
      setForm({
        ...merged,
        paymentProviders: mergeProviders(merged.paymentProviders),
        banners: merged.banners || [],
        sliders: merged.sliders || [],
        campaigns: merged.campaigns || [],
        featuredProducts: merged.featuredProducts || [],
        menuItems: merged.menuItems || DEFAULT_ETICARET_SETTINGS.menuItems,
        footerLinks: merged.footerLinks || DEFAULT_ETICARET_SETTINGS.footerLinks,
        staticPages: merged.staticPages || DEFAULT_ETICARET_SETTINGS.staticPages,
        lookbookScenes: merged.lookbookScenes || [],
        socialLinks: merged.socialLinks || [],
        contactInfo: merged.contactInfo || {},
        newsletter: merged.newsletter || {},
        beforeYouLeave: merged.beforeYouLeave || {},
        recentSales: merged.recentSales,
        themeBranding: merged.themeBranding || {},
        layout: merged.layout,
        homepageSections: merged.homepageSections,
      });
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void listRetailTenantsForEticaret().then((list) => {
      setTenants(list);
      let initial = list[0]?.code || '';
      if (!initial && typeof window !== 'undefined') {
        try {
          const raw = window.localStorage.getItem('retailex_eticaret_settings');
          const demo = raw ? String(JSON.parse(raw).demoTenantCode || '').trim().toLowerCase() : '';
          if (demo) initial = demo;
        } catch {
          /* ignore */
        }
      }
      if (initial) {
        setSelectedTenant(initial);
        void loadTenantSettings(initial);
      } else {
        setLoading(false);
      }
    });
  }, [loadTenantSettings]);

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

  const searchProducts = useCallback(
    async (term: string) => {
      const tenant = previewTenant;
      if (!tenant) return;
      setProductSearchLoading(true);
      try {
        const { products } = await fetchTenantCatalog(tenant, {
          limit: 50,
          search: term,
          demoMode: form.demoMode,
          catalogFirmNr: form.catalogFirmNr,
        });
        setProductOptions(
          products.map((p) => ({
            value: p.code,
            label: `${p.name} · ${p.code}`,
          })),
        );
      } catch {
        message.error('Ürün listesi alınamadı');
      } finally {
        setProductSearchLoading(false);
      }
    },
    [previewTenant, form.demoMode, form.catalogFirmNr],
  );

  useEffect(() => {
    if (section === 'featured' || section === 'campaigns') {
      void searchProducts('');
    }
  }, [section, searchProducts]);

  const handleSave = async () => {
    if (!selectedTenant.trim()) {
      message.warning('Kiracı seçin');
      return;
    }
    setSaving(true);
    try {
      await saveTenantEticaretSettingsFull(selectedTenant, form);
      message.success('Ayarlar kiracı veritabanına ve merkeze kaydedildi');
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const loadOrders = async () => {
    if (!selectedTenant.trim()) return;
    setOrdersLoading(true);
    try {
      const rows = await listWebOrdersForTenant(selectedTenant);
      setOrders(rows);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setOrdersLoading(false);
    }
  };

  useEffect(() => {
    if (section === 'dashboard' || section === 'orders') {
      void loadOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, selectedTenant]);

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

  const renderContent = () => {
    switch (section) {
      case 'dashboard':
        return <DashboardSection form={form} orders={orders} previewTenant={previewTenant} />;
      case 'storefront':
        return <StorefrontMetaSection tenantCode={selectedTenant} form={form} onChange={patch} />;
      case 'navigation':
        return (
          <NavigationSection
            items={form.menuItems || []}
            onChange={(menuItems) => patch({ menuItems })}
          />
        );
      case 'footer':
        return (
          <FooterSection
            items={form.footerLinks || []}
            onChange={(footerLinks) => patch({ footerLinks })}
          />
        );
      case 'pages':
        return (
          <PagesSection
            pages={form.staticPages || []}
            onChange={(staticPages) => patch({ staticPages })}
          />
        );
      case 'contact':
        return <ContactSocialSection form={form} onChange={patch} />;
      case 'popups':
        return <PopupsSection form={form} onChange={patch} />;
      case 'homepage':
        return <HomepageSection form={form} onChange={patch} />;
      case 'layout':
        return <LayoutBrandingSection form={form} onChange={patch} />;
      case 'lookbook':
        return (
          <LookbookSection
            items={form.lookbookScenes || []}
            onChange={(lookbookScenes) => patch({ lookbookScenes })}
          />
        );
      case 'banners':
        return (
          <BannersSection items={form.banners || []} onChange={(banners) => patch({ banners })} />
        );
      case 'sliders':
        return (
          <SlidersSection items={form.sliders || []} onChange={(sliders) => patch({ sliders })} />
        );
      case 'campaigns':
        return (
          <CampaignsSection
            items={form.campaigns || []}
            onChange={(campaigns) => patch({ campaigns })}
            productOptions={productOptions}
          />
        );
      case 'featured':
        return (
          <FeaturedSection
            items={form.featuredProducts || []}
            onChange={(featuredProducts) => patch({ featuredProducts })}
            productOptions={productOptions}
            onSearchProducts={searchProducts}
            searchLoading={productSearchLoading}
          />
        );
      case 'features':
        return <StorefrontFeaturesSection form={form} onChange={patch} />;
      case 'theme':
        return (
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
                        <img
                          alt={variant.name}
                          src={variant.previewImage}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
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
        );
      case 'payments':
        return (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {(form.paymentProviders || []).map((p) => {
              const meta = PAYMENT_PROVIDER_CATALOG.find((x) => x.id === p.id);
              return (
                <Card key={p.id} size="small" title={`${p.label} · ${meta?.region || ''}`}>
                  <Row gutter={[12, 12]} align="middle">
                    <Col xs={24} md={4}>
                      <Switch checked={p.enabled} onChange={(v) => patchProvider(p.id, { enabled: v })} />
                      <Text type="secondary" style={{ marginLeft: 8 }}>
                        Aktif
                      </Text>
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
                        onChange={(e) =>
                          patchProvider(p.id, { apiKey: e.target.value, merchantId: e.target.value })
                        }
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
        );
      case 'orders':
        return (
          <Card bordered>
            <Space style={{ marginBottom: 16 }}>
              <Button onClick={() => void loadOrders()} loading={ordersLoading}>
                Yenile
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
        );
      case 'settings':
        return (
          <Card bordered>
            <Row gutter={[16, 16]}>
              <Col xs={24} md={12}>
                <Text strong>Mağaza başlığı</Text>
                <Input
                  value={form.storeTitle}
                  onChange={(e) => patch({ storeTitle: e.target.value })}
                  style={{ marginTop: 8 }}
                />
              </Col>
              <Col xs={24} md={12}>
                <Text strong>Duyuru şeridi</Text>
                <Input
                  value={form.announcementText}
                  onChange={(e) => patch({ announcementText: e.target.value })}
                  style={{ marginTop: 8 }}
                />
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
                  placeholder={
                    (form.paymentProviders || []).some((p) => p.enabled)
                      ? 'Ödeme yöntemi seçin'
                      : 'Önce Ödeme sekmesinden sağlayıcıyı aktifleştirin'
                  }
                  value={form.defaultPaymentProvider}
                  onChange={(v) => patch({ defaultPaymentProvider: v })}
                  options={(form.paymentProviders || []).map((p) => ({
                    value: p.id,
                    label: p.enabled ? p.label : `${p.label} (kapalı)`,
                    disabled: !p.enabled,
                  }))}
                />
              </Col>
            </Row>
            <Alert
              type="info"
              showIcon
              style={{ marginTop: 16 }}
              message="Demo modu kapalıyken gelen siparişler otomatik sipariş fişine (trcode 20) dönüştürülür."
            />
          </Card>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="rex-eticaret-admin-root rex-eticaret-admin-loading">
        <Text>Yükleniyor…</Text>
      </div>
    );
  }

  return (
    <div className="rex-eticaret-admin-root">
    <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
        width={240}
        style={{ position: 'sticky', top: 0, height: '100vh' }}
      >
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? 0 : '0 16px',
            color: '#fff',
            fontWeight: 700,
            fontSize: collapsed ? 18 : 15,
            gap: 8,
          }}
        >
          <GlobalOutlined />
          {!collapsed ? 'Mağaza Yönetimi' : null}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[section]}
          items={MENU_ITEMS}
          onClick={({ key }) => setSection(key as AdminSection)}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f0f0f0',
            height: 56,
          }}
        >
          <div>
            <Title level={5} style={{ margin: 0 }}>
              E-Ticaret Kontrol Paneli
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Gizli erişim · <Text code>/mgz</Text>
            </Text>
          </div>
          <Space wrap>
            <Select
              mode="tags"
              maxCount={1}
              showSearch
              allowClear
              style={{ minWidth: 240 }}
              placeholder="Kiracı kodu — yazın veya listeden seçin"
              value={selectedTenant ? [selectedTenant] : []}
              onChange={(vals) => {
                const code = String(vals[vals.length - 1] || '')
                  .trim()
                  .toLowerCase();
                setSelectedTenant(code);
                if (code) void loadTenantSettings(code);
              }}
              tokenSeparators={[',', ' ']}
              options={tenants.map((t) => ({
                value: t.code,
                label: t.display_name && t.display_name !== t.code
                  ? `${t.display_name} (${t.code})`
                  : t.code,
              }))}
              notFoundContent={
                <div style={{ padding: '8px 12px' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Kodu yazıp Enter — örn. <Text code>lovan</Text>
                  </Text>
                </div>
              }
            />
            <Button icon={<EyeOutlined />} href={buildStorefrontUrl(previewTenant)} target="_blank">
              Vitrin
            </Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave()}>
              Kaydet (DB)
            </Button>
          </Space>
        </Header>

        <Content style={{ margin: 24 }}>
          {renderContent()}
        </Content>
      </Layout>
    </Layout>
    </div>
  );
}
