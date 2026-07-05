import { Card, Col, Input, InputNumber, Row, Switch, Typography } from 'antd';
import type { EticaretSettings } from '../../core/types';
import type { EticaretStorefrontFeatures } from '../../core/contentTypes';
import { DEFAULT_STOREFRONT_FEATURES } from '../../core/contentTypes';

const { Text, Paragraph } = Typography;

type Props = {
  form: EticaretSettings;
  onChange: (patch: Partial<EticaretSettings>) => void;
};

const FEATURE_ROWS: Array<{
  key: keyof EticaretStorefrontFeatures;
  label: string;
  hint: string;
}> = [
  { key: 'megaMenu', label: 'Mega menü', hint: 'Çok sütunlu açılır navigasyon (Ella)' },
  { key: 'quickShop', label: 'Quick Shop', hint: 'Ürün kartından hızlı sepete ekleme popup' },
  { key: 'instantSearch', label: 'Anlık arama', hint: 'Header arama — DB katalog sorgusu' },
  { key: 'sideCart', label: 'Yan sepet (Side Cart)', hint: 'Sağdan açılan sepet çekmecesi' },
  { key: 'mobileToolbar', label: 'Mobil alt araç çubuğu', hint: 'Sticky bottom toolbar' },
  { key: 'shippingThreshold', label: 'Kargo eşiği', hint: 'Ücretsiz kargo ilerleme çubuğu' },
  { key: 'quickView', label: 'Hızlı önizleme', hint: 'Quick View popup' },
  { key: 'stickyHeader', label: 'Yapışkan header', hint: 'Kaydırınca sabit üst çubuk' },
  { key: 'gdprCookie', label: 'GDPR / çerez', hint: 'Çerez onay bandı' },
  { key: 'askExpert', label: 'Uzmana sor', hint: 'Ask an Expert popup' },
  { key: 'recentSalesPopup', label: 'Son satışlar', hint: 'Sosyal kanıt bildirimi' },
  { key: 'newsletterPopup', label: 'Bülten popup', hint: 'Newsletter açılış penceresi' },
  { key: 'beforeYouLeave', label: 'Ayrılırken', hint: 'Before you leave popup' },
  { key: 'lookbook', label: 'Lookbook', hint: 'Lookbook sayfa linkleri' },
];

export function StorefrontFeaturesSection({ form, onChange }: Props) {
  const features = { ...DEFAULT_STOREFRONT_FEATURES, ...form.storefrontFeatures };

  const patchFeature = (key: keyof EticaretStorefrontFeatures, value: boolean) => {
    onChange({ storefrontFeatures: { ...features, [key]: value } });
  };

  return (
    <Card title="Ella tema özellikleri" size="small">
      <Paragraph type="secondary">
        Vitrinde Ella temasının sunduğu bileşenleri kiracı bazında açıp kapatabilirsiniz. Sepet ve arama RetailEX
        veritabanına bağlıdır.
      </Paragraph>
      <Row gutter={[16, 12]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={12}>
          <Text strong>Ücretsiz kargo eşiği</Text>
          <InputNumber
            style={{ width: '100%', marginTop: 8 }}
            min={0}
            value={form.freeShippingThreshold ?? 500}
            onChange={(v) => onChange({ freeShippingThreshold: Number(v || 0) })}
            addonAfter="TRY"
          />
        </Col>
        <Col xs={24} md={12}>
          <Text strong>Arama önerileri (virgülle)</Text>
          <Input
            style={{ marginTop: 8 }}
            value={(form.searchSuggestions || []).join(', ')}
            onChange={(e) =>
              onChange({
                searchSuggestions: e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="elbise, ayakkabı, çanta"
          />
        </Col>
      </Row>
      <Row gutter={[16, 16]}>
        {FEATURE_ROWS.map((row) => (
          <Col xs={24} sm={12} md={8} key={row.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <Text strong>{row.label}</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {row.hint}
                </Text>
              </div>
              <Switch checked={features[row.key]} onChange={(v) => patchFeature(row.key, v)} />
            </div>
          </Col>
        ))}
      </Row>
    </Card>
  );
}
