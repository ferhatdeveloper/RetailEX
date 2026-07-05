import { Card, Col, Input, InputNumber, Row, Typography } from 'antd';
import type { EticaretSettings } from '../../core/types';

const { Text, Paragraph } = Typography;

type Props = {
  form: EticaretSettings;
  onChange: (patch: Partial<EticaretSettings>) => void;
};

export function PopupsSection({ form, onChange }: Props) {
  const nl = form.newsletter || {};
  const byl = form.beforeYouLeave || {};
  const rs = form.recentSales || {};

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <Card title="Bülten popup" size="small">
          <Paragraph type="secondary" style={{ fontSize: 12 }}>
            Aç/kapa: Tema özellikleri → Bülten popup. Buradan metin ve gecikme ayarlanır.
          </Paragraph>
          <Row gutter={[12, 12]}>
            <Col xs={24}>
              <Text strong>Başlık</Text>
              <Input
                value={nl.title || ''}
                onChange={(e) => onChange({ newsletter: { ...nl, title: e.target.value } })}
                style={{ marginTop: 8 }}
              />
            </Col>
            <Col xs={24}>
              <Text strong>Alt metin</Text>
              <Input.TextArea
                rows={2}
                value={nl.subtitle || ''}
                onChange={(e) => onChange({ newsletter: { ...nl, subtitle: e.target.value } })}
                style={{ marginTop: 8 }}
              />
            </Col>
            <Col xs={24} md={12}>
              <Text strong>Görsel URL</Text>
              <Input
                value={nl.imageUrl || ''}
                onChange={(e) => onChange({ newsletter: { ...nl, imageUrl: e.target.value } })}
                style={{ marginTop: 8 }}
              />
            </Col>
            <Col xs={24} md={6}>
              <Text strong>Gecikme (ms)</Text>
              <InputNumber
                min={0}
                style={{ width: '100%', marginTop: 8 }}
                value={nl.delayMs ?? 6000}
                onChange={(v) => onChange({ newsletter: { ...nl, delayMs: Number(v || 0) } })}
              />
            </Col>
            <Col xs={24} md={6}>
              <Text strong>Buton metni</Text>
              <Input
                value={nl.buttonText || ''}
                onChange={(e) => onChange({ newsletter: { ...nl, buttonText: e.target.value } })}
                style={{ marginTop: 8 }}
                placeholder="Abone ol"
              />
            </Col>
          </Row>
        </Card>
      </Col>

      <Col xs={24} lg={12}>
        <Card title="Ayrılırken popup" size="small">
          <Row gutter={[12, 12]}>
            <Col xs={24}>
              <Text strong>Başlık</Text>
              <Input
                value={byl.title || ''}
                onChange={(e) => onChange({ beforeYouLeave: { ...byl, title: e.target.value } })}
                style={{ marginTop: 8 }}
              />
            </Col>
            <Col xs={24}>
              <Text strong>Metin</Text>
              <Input.TextArea
                rows={2}
                value={byl.body || ''}
                onChange={(e) => onChange({ beforeYouLeave: { ...byl, body: e.target.value } })}
                style={{ marginTop: 8 }}
              />
            </Col>
            <Col xs={24} md={8}>
              <Text strong>Kupon kodu</Text>
              <Input
                value={byl.couponCode || ''}
                onChange={(e) => onChange({ beforeYouLeave: { ...byl, couponCode: e.target.value } })}
                style={{ marginTop: 8 }}
              />
            </Col>
            <Col xs={24} md={8}>
              <Text strong>Buton</Text>
              <Input
                value={byl.buttonText || ''}
                onChange={(e) => onChange({ beforeYouLeave: { ...byl, buttonText: e.target.value } })}
                style={{ marginTop: 8 }}
              />
            </Col>
            <Col xs={24} md={8}>
              <Text strong>Görsel URL</Text>
              <Input
                value={byl.imageUrl || ''}
                onChange={(e) => onChange({ beforeYouLeave: { ...byl, imageUrl: e.target.value } })}
                style={{ marginTop: 8 }}
              />
            </Col>
          </Row>
        </Card>
      </Col>

      <Col xs={24}>
        <Card title="Son satışlar bildirimi" size="small">
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Text strong>Gecikme (ms)</Text>
              <InputNumber
                min={1000}
                style={{ width: '100%', marginTop: 8 }}
                value={rs.delayMs ?? 8000}
                onChange={(v) => onChange({ recentSales: { ...rs, delayMs: Number(v || 8000) } })}
              />
            </Col>
            <Col xs={24} md={16}>
              <Text strong>Mesaj şablonu</Text>
              <Input
                value={rs.messageTemplate || ''}
                onChange={(e) => onChange({ recentSales: { ...rs, messageTemplate: e.target.value } })}
                style={{ marginTop: 8 }}
                placeholder="{customer} {city} — az önce satın aldı"
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Değişkenler: {'{customer}'}, {'{city}'}, {'{product}'}
              </Text>
            </Col>
          </Row>
        </Card>
      </Col>
    </Row>
  );
}
