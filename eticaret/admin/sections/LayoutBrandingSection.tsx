import { Card, Col, Input, InputNumber, Row, Select, Typography } from 'antd';
import type { EticaretSettings } from '../../core/types';

const { Text, Paragraph } = Typography;

type Props = {
  form: EticaretSettings;
  onChange: (patch: Partial<EticaretSettings>) => void;
};

const CATEGORY_LAYOUTS = [
  { value: 'category-right-sidebar', label: 'Kategori — sağ sidebar' },
  { value: 'category-default', label: 'Kategori — varsayılan' },
  { value: 'category-full-width', label: 'Kategori — tam genişlik' },
  { value: 'category-mansory', label: 'Kategori — masonry' },
];

const PRODUCT_LAYOUTS = [
  { value: 'product-layout-default', label: 'Ürün — varsayılan' },
  { value: 'product-layout-left-sidebar', label: 'Ürün — sol sidebar' },
  { value: 'product-layout-right-sidebar', label: 'Ürün — sağ sidebar' },
  { value: 'product-layout-full-width', label: 'Ürün — tam genişlik' },
  { value: 'product-layout-image-gallery', label: 'Ürün — galeri' },
];

export function LayoutBrandingSection({ form, onChange }: Props) {
  const layout = form.layout || {};
  const branding = form.themeBranding || {};

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <Card title="Katalog ve ızgara" size="small">
          <Row gutter={[12, 12]}>
            <Col xs={24} md={12}>
              <Text strong>Ürün limiti</Text>
              <InputNumber
                min={4}
                max={100}
                style={{ width: '100%', marginTop: 8 }}
                value={layout.catalogLimit ?? 24}
                onChange={(v) => onChange({ layout: { ...layout, catalogLimit: Number(v || 24) } })}
              />
            </Col>
            <Col xs={24} md={12}>
              <Text strong>Izgara sütun (masaüstü)</Text>
              <Select
                style={{ width: '100%', marginTop: 8 }}
                value={layout.productGridColumns ?? 4}
                onChange={(v) => onChange({ layout: { ...layout, productGridColumns: v } })}
                options={[
                  { value: 2, label: '2 sütun' },
                  { value: 3, label: '3 sütun' },
                  { value: 4, label: '4 sütun' },
                ]}
              />
            </Col>
            <Col xs={24}>
              <Text strong>Kategori sayfa şablonu</Text>
              <Select
                style={{ width: '100%', marginTop: 8 }}
                value={layout.categoryLayoutId || 'category-right-sidebar'}
                onChange={(v) => onChange({ layout: { ...layout, categoryLayoutId: v } })}
                options={CATEGORY_LAYOUTS}
              />
            </Col>
            <Col xs={24}>
              <Text strong>Ürün detay şablonu</Text>
              <Select
                style={{ width: '100%', marginTop: 8 }}
                value={layout.productLayoutId || 'product-layout-default'}
                onChange={(v) => onChange({ layout: { ...layout, productLayoutId: v } })}
                options={PRODUCT_LAYOUTS}
              />
            </Col>
          </Row>
        </Card>
      </Col>

      <Col xs={24} lg={12}>
        <Card title="Marka renkleri ve CSS" size="small">
          <Paragraph type="secondary" style={{ fontSize: 12 }}>
            Tema varyantına ek olarak birincil/aksan renkleri vitrine CSS değişkeni olarak uygulanır.
          </Paragraph>
          <Row gutter={[12, 12]}>
            <Col xs={24} md={12}>
              <Text strong>Birincil renk</Text>
              <Input
                type="color"
                value={branding.primaryColor || '#1677ff'}
                onChange={(e) =>
                  onChange({ themeBranding: { ...branding, primaryColor: e.target.value } })
                }
                style={{ width: '100%', marginTop: 8, height: 36 }}
              />
            </Col>
            <Col xs={24} md={12}>
              <Text strong>Aksan renk</Text>
              <Input
                type="color"
                value={branding.accentColor || '#ff4d4f'}
                onChange={(e) =>
                  onChange({ themeBranding: { ...branding, accentColor: e.target.value } })
                }
                style={{ width: '100%', marginTop: 8, height: 36 }}
              />
            </Col>
            <Col xs={24}>
              <Text strong>Özel CSS</Text>
              <Input.TextArea
                rows={5}
                value={branding.customCss || ''}
                onChange={(e) => onChange({ themeBranding: { ...branding, customCss: e.target.value } })}
                style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12 }}
                placeholder=".btn-primary { ... }"
              />
            </Col>
          </Row>
        </Card>
      </Col>
    </Row>
  );
}
