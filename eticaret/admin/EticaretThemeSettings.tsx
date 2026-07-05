import { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Input, Row, Select, Space, Switch, Typography, message } from 'antd';
import { CheckOutlined, CloudUploadOutlined, EyeOutlined, SaveOutlined } from '@ant-design/icons';
import {
  DEFAULT_ETICARET_SETTINGS,
  loadEticaretSettingsFromDb,
  saveEticaretSettingsToDb,
} from '../core/settings';
import {
  listRetailTenantsForEticaret,
  loadTenantEticaretSettingsFromRegistry,
  saveTenantEticaretSettings,
  type TenantRegistryListItem,
} from '../core/tenantRegistryApi';
import { listAllThemeVariants } from '../themes/registry';
import { buildStorefrontUrl } from '../core/tenantResolver';
import type { EticaretSettings } from '../core/types';

const { Title, Text, Paragraph } = Typography;

export function EticaretThemeSettings() {
  const [form, setForm] = useState<EticaretSettings>({ ...DEFAULT_ETICARET_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenants, setTenants] = useState<TenantRegistryListItem[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>('');
  const [tenantSaving, setTenantSaving] = useState(false);

  useEffect(() => {
    void Promise.all([loadEticaretSettingsFromDb(), listRetailTenantsForEticaret()]).then(
      ([s, list]) => {
        setForm(s);
        setTenants(list);
        if (s.demoTenantCode.trim()) {
          setSelectedTenant(s.demoTenantCode.trim().toLowerCase());
        } else if (list[0]?.code) {
          setSelectedTenant(list[0].code);
        }
        setLoading(false);
      },
    );
  }, []);

  const variants = listAllThemeVariants();
  const previewTenant = form.demoMode && form.demoTenantCode.trim()
    ? form.demoTenantCode.trim()
    : selectedTenant || 'demo';

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

  const handleTenantSelect = async (code: string) => {
    setSelectedTenant(code);
    const fromRegistry = await loadTenantEticaretSettingsFromRegistry(code);
    if (fromRegistry && Object.keys(fromRegistry).length > 0) {
      setForm((prev) => ({ ...prev, ...fromRegistry }));
    }
  };

  const handleApplyToTenant = async () => {
    if (!selectedTenant.trim()) {
      message.warning('Önce bir kiracı seçin');
      return;
    }
    setTenantSaving(true);
    try {
      const payload: Partial<EticaretSettings> = {
        activeThemeId: form.activeThemeId,
        activeVariantId: form.activeVariantId,
        enabled: form.enabled,
        storeTitle: form.storeTitle,
        announcementText: form.announcementText,
      };
      await saveTenantEticaretSettings(selectedTenant, payload);
      message.success(`${selectedTenant} kiracısına tema ayarları uygulandı`);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setTenantSaving(false);
    }
  };

  const patch = (p: Partial<EticaretSettings>) => setForm((prev) => ({ ...prev, ...p }));

  if (loading) return <div style={{ padding: 24 }}>Yükleniyor…</div>;

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Online Satış — Tema ve Demo
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Ella HTML teması tabanlı vitrin. Kiracı kodu site adresinden veya demo modunda sistem ayarından alınır.
          </Paragraph>
        </div>

        <Card bordered title="Kiracı vitrin ayarları">
          <Row gutter={[16, 16]} align="middle">
            <Col xs={24} md={12}>
              <Text strong>Perakende kiracı</Text>
              <Select
                showSearch
                optionFilterProp="label"
                style={{ width: '100%', marginTop: 8 }}
                placeholder="Kiracı seçin"
                value={selectedTenant || undefined}
                onChange={(v) => void handleTenantSelect(v)}
                options={tenants.map((t) => ({
                  value: t.code,
                  label: `${t.display_name} (${t.code})`,
                }))}
              />
            </Col>
            <Col xs={24} md={12}>
              <Space wrap style={{ marginTop: 28 }}>
                <Button
                  type="default"
                  icon={<CloudUploadOutlined />}
                  loading={tenantSaving}
                  onClick={() => void handleApplyToTenant()}
                >
                  Seçili kiracıya uygula
                </Button>
                <Button
                  icon={<EyeOutlined />}
                  href={buildStorefrontUrl(selectedTenant || previewTenant)}
                  target="_blank"
                  rel="noreferrer"
                  disabled={!selectedTenant}
                >
                  Kiracı vitrinini aç
                </Button>
              </Space>
            </Col>
          </Row>
          <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            Tema ve mağaza metinleri merkez <code>tenant_registry.eticaret_settings</code> alanına yazılır.
            Ürünler kiracının PostgREST API&apos;si üzerinden <code>rex_*_products</code> tablosundan gelir.
          </Paragraph>
        </Card>

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
              <Text strong>Duyuru metni</Text>
              <Input
                value={form.announcementText}
                onChange={(e) => patch({ announcementText: e.target.value })}
                style={{ marginTop: 8 }}
              />
            </Col>
            <Col xs={24} md={8}>
              <Text strong>Online mağaza aktif</Text>
              <div style={{ marginTop: 8 }}>
                <Switch checked={form.enabled} onChange={(v) => patch({ enabled: v })} />
              </div>
            </Col>
            <Col xs={24} md={8}>
              <Text strong>Demo önizleme modu</Text>
              <div style={{ marginTop: 8 }}>
                <Switch checked={form.demoMode} onChange={(v) => patch({ demoMode: v })} />
              </div>
            </Col>
            <Col xs={24} md={8}>
              <Text strong>Demo kiracı kodu</Text>
              <Input
                placeholder="örn. lovan, kasap, jiber"
                value={form.demoTenantCode}
                disabled={!form.demoMode}
                onChange={(e) => patch({ demoTenantCode: e.target.value.trim().toLowerCase() })}
                style={{ marginTop: 8 }}
              />
            </Col>
          </Row>
        </Card>

        {form.demoMode && !form.demoTenantCode.trim() ? (
          <Alert
            type="warning"
            showIcon
            message="Demo modu açık — kiracı kodu girin; ürünler o kiracının veritabanından listelenir."
          />
        ) : null}

        <div>
          <Title level={5}>Tema seçimi</Title>
          <Row gutter={[16, 16]}>
            {variants.map(({ theme, variant }) => {
              const selected = form.activeVariantId === variant.id;
              return (
                <Col xs={24} sm={12} md={8} lg={6} key={variant.id}>
                  <Card
                    hoverable
                    bordered
                    onClick={() => patch({ activeThemeId: theme.id, activeVariantId: variant.id })}
                    style={{
                      borderColor: selected ? '#1677ff' : '#d9d9d9',
                      boxShadow: selected ? '0 0 0 2px rgba(22,119,255,0.2)' : undefined,
                    }}
                    cover={
                      <div style={{ height: 140, overflow: 'hidden', background: '#f5f5f5' }}>
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
                      description={`${theme.name} · ${variant.description}`}
                    />
                  </Card>
                </Col>
              );
            })}
          </Row>
        </div>

        <Space wrap>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave()}>
            Sistem ayarlarını kaydet
          </Button>
          <Button
            icon={<EyeOutlined />}
            href={buildStorefrontUrl(previewTenant)}
            target="_blank"
            rel="noreferrer"
          >
            Mağazayı önizle
          </Button>
        </Space>

        <Alert
          type="info"
          showIcon
          message="Adres yapısı"
          description={
            <>
              Yol tabanlı: <code>/magaza/kiracı-kodu</code> · Alt alan adı:{' '}
              <code>kiracı.magaza.retailex.app</code> · Demo modunda ürünler{' '}
              <strong>{form.demoTenantCode || '—'}</strong> kiracısından gelir.
            </>
          }
        />
      </Space>
    </div>
  );
}
