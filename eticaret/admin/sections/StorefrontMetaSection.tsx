import { useEffect, useState } from 'react';
import { Alert, Card, Col, Input, Row, Select, Typography } from 'antd';
import type { EticaretSettings } from '../../core/types';
import { fetchFirmsForTenant, type EticaretFirmOption } from '../../core/eticaretApi';

const { Text } = Typography;

type Props = {
  tenantCode: string;
  form: EticaretSettings;
  onChange: (patch: Partial<EticaretSettings>) => void;
};

export function StorefrontMetaSection({ tenantCode, form, onChange }: Props) {
  const [firms, setFirms] = useState<EticaretFirmOption[]>([]);
  const [primaryFirmNr, setPrimaryFirmNr] = useState('001');
  const [firmsLoading, setFirmsLoading] = useState(false);

  useEffect(() => {
    if (!tenantCode.trim()) {
      setFirms([]);
      return;
    }
    setFirmsLoading(true);
    void fetchFirmsForTenant(tenantCode)
      .then((res) => {
        setFirms(res.firms);
        setPrimaryFirmNr(res.primaryFirmNr);
      })
      .catch(() => setFirms([]))
      .finally(() => setFirmsLoading(false));
  }, [tenantCode]);

  const activeFirms = firms.filter((f) => f.is_active);
  const selectedFirm = form.catalogFirmNr?.trim() || '';

  return (
    <Card title="Mağaza kimliği ve vitrin metinleri" size="small">
      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <Text strong>Online mağaza firması</Text>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            loading={firmsLoading}
            placeholder={`Sistem varsayılanı (${primaryFirmNr})`}
            value={selectedFirm || undefined}
            onChange={(v) => onChange({ catalogFirmNr: v ? String(v) : undefined })}
            style={{ width: '100%', marginTop: 8 }}
            options={activeFirms.map((f) => ({
              value: f.firm_nr,
              label: `${f.firm_nr} — ${f.name}`,
            }))}
          />
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 8 }}
            message="Vitrinde gösterilecek ürünler ve web sipariş fişi bu firmadan alınır. Boş bırakırsanız sistem ayarındaki birincil firma kullanılır."
          />
        </Col>
        <Col xs={24} md={12}>
          <Text strong>Mağaza başlığı</Text>
          <Input
            value={form.storeTitle}
            onChange={(e) => onChange({ storeTitle: e.target.value })}
            style={{ marginTop: 8 }}
          />
        </Col>
        <Col xs={24} md={12}>
          <Text strong>SEO başlığı</Text>
          <Input
            value={form.seoTitle || ''}
            onChange={(e) => onChange({ seoTitle: e.target.value })}
            style={{ marginTop: 8 }}
            placeholder="Tarayıcı sekmesi"
          />
        </Col>
        <Col xs={24} md={12}>
          <Text strong>SEO açıklama</Text>
          <Input.TextArea
            value={form.seoDescription || ''}
            onChange={(e) => onChange({ seoDescription: e.target.value })}
            style={{ marginTop: 8 }}
            rows={2}
            placeholder="Meta description"
          />
        </Col>
        <Col xs={24} md={12}>
          <Text strong>Favicon URL</Text>
          <Input
            value={form.faviconUrl || ''}
            onChange={(e) => onChange({ faviconUrl: e.target.value })}
            style={{ marginTop: 8 }}
            placeholder="https://.../favicon.ico"
          />
        </Col>
        <Col xs={24} md={12}>
          <Text strong>Logo URL</Text>
          <Input
            value={form.logoUrl || ''}
            onChange={(e) => onChange({ logoUrl: e.target.value })}
            style={{ marginTop: 8 }}
            placeholder="https://..."
          />
        </Col>
        <Col xs={24} md={12}>
          <Text strong>Ürün bölümü başlığı</Text>
          <Input
            value={form.productSectionTitle || ''}
            onChange={(e) => onChange({ productSectionTitle: e.target.value })}
            style={{ marginTop: 8 }}
            placeholder="Ürünler"
          />
        </Col>
        <Col xs={24}>
          <Text strong>Duyuru şeridi</Text>
          <Input
            value={form.announcementText}
            onChange={(e) => onChange({ announcementText: e.target.value })}
            style={{ marginTop: 8 }}
          />
        </Col>
        <Col xs={24}>
          <Text strong>Alt bilgi telif</Text>
          <Input
            value={form.footerCopyright || ''}
            onChange={(e) => onChange({ footerCopyright: e.target.value })}
            style={{ marginTop: 8 }}
            placeholder="© 2026 Mağaza Adı"
          />
        </Col>
        <Col xs={24} md={12}>
          <Text strong>Uzmana sor e-posta</Text>
          <Input
            value={form.askExpertEmail || ''}
            onChange={(e) => onChange({ askExpertEmail: e.target.value })}
            style={{ marginTop: 8 }}
            placeholder="destek@magaza.com"
          />
        </Col>
        <Col xs={24} md={12}>
          <Text strong>GDPR / çerez metni</Text>
          <Input.TextArea
            value={form.gdprCookieText || ''}
            onChange={(e) => onChange({ gdprCookieText: e.target.value })}
            style={{ marginTop: 8 }}
            rows={3}
            placeholder="Çerez politikası metni…"
          />
        </Col>
      </Row>
    </Card>
  );
}
