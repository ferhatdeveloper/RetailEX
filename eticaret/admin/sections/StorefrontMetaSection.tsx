import { Card, Col, Input, Row, Typography } from 'antd';
import type { EticaretSettings } from '../../core/types';

const { Text } = Typography;

type Props = {
  form: EticaretSettings;
  onChange: (patch: Partial<EticaretSettings>) => void;
};

export function StorefrontMetaSection({ form, onChange }: Props) {
  return (
    <Card title="Mağaza kimliği ve vitrin metinleri" size="small">
      <Row gutter={[16, 16]}>
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
