import { Card, Col, Row, Statistic, Tag, Typography } from 'antd';
import {
  FundOutlined,
  PictureOutlined,
  ShoppingCartOutlined,
  StarOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { EticaretSettings, EticaretWebOrder } from '../../core/types';

const { Text } = Typography;

type Props = {
  form: EticaretSettings;
  orders: EticaretWebOrder[];
  previewTenant: string;
};

export function DashboardSection({ form, orders, previewTenant }: Props) {
  const activeBanners = (form.banners || []).filter((b) => b.enabled).length;
  const activeSliders = (form.sliders || []).filter((s) => s.enabled).length;
  const activeCampaigns = (form.campaigns || []).filter((c) => c.enabled).length;
  const featuredCount = (form.featuredProducts || []).filter((f) => f.enabled).length;
  const convertedOrders = orders.filter((o) => o.status === 'converted').length;
  const revenue = orders.reduce((s, o) => s + Number(o.total || 0), 0);
  const currency = orders[0]?.currency || 'TRY';

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small">
            <Statistic title="Sipariş" value={orders.length} prefix={<ShoppingCartOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small">
            <Statistic title="Fişe dönüşen" value={convertedOrders} valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small">
            <Statistic
              title="Ciro"
              value={revenue}
              precision={0}
              prefix={<FundOutlined />}
              suffix={currency}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small">
            <Statistic title="Banner" value={activeBanners} prefix={<PictureOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small">
            <Statistic title="Slider" value={activeSliders} prefix={<ThunderboltOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small">
            <Statistic title="Kampanya" value={activeCampaigns} prefix={<ThunderboltOutlined />} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Mağaza durumu" size="small">
            <p>
              <Text strong>Vitrin kiracısı:</Text> <Tag>{previewTenant}</Tag>
            </p>
            <p>
              <Text strong>Mağaza:</Text>{' '}
              <Tag color={form.enabled ? 'green' : 'red'}>{form.enabled ? 'Açık' : 'Kapalı'}</Tag>
              <Tag color={form.demoMode ? 'gold' : 'blue'}>{form.demoMode ? 'Demo' : 'Canlı'}</Tag>
            </p>
            <p>
              <Text strong>Tema:</Text> {form.activeVariantId}
            </p>
            <p style={{ marginBottom: 0 }}>
              <Text strong>Öne çıkan ürün:</Text> {featuredCount}
            </p>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Son siparişler" size="small">
            {orders.length === 0 ? (
              <Text type="secondary">Henüz sipariş yok — Siparişler sekmesinden yenileyin.</Text>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {orders.slice(0, 5).map((o) => (
                  <li key={o.id}>
                    <Text code>{o.order_no}</Text> — {o.customer_name || '—'} —{' '}
                    {Number(o.total).toLocaleString('tr-TR')} {o.currency}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Col>
      </Row>

      <Card title="Hızlı ipuçları" size="small" style={{ marginTop: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} md={6}>
            <StarOutlined /> Öne çıkanları vitrinde en üstte gösterin
          </Col>
          <Col xs={24} sm={12} md={6}>
            <PictureOutlined /> Hero banner ana sayfa üst görselidir
          </Col>
          <Col xs={24} sm={12} md={6}>
            <ThunderboltOutlined /> Slider otomatik geçişli carousel oluşturur
          </Col>
          <Col xs={24} sm={12} md={6}>
            <ShoppingCartOutlined /> Demo kapalıyken sipariş → trcode 20 fiş
          </Col>
        </Row>
      </Card>
    </div>
  );
}
