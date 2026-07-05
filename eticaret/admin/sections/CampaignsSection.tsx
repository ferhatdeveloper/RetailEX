import { useState } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { EticaretCampaign } from '../../core/contentTypes';
import { createContentId } from '../../core/contentTypes';

const { Text } = Typography;

type Props = {
  items: EticaretCampaign[];
  onChange: (items: EticaretCampaign[]) => void;
  productOptions: Array<{ value: string; label: string }>;
};

const emptyCampaign = (): EticaretCampaign => ({
  id: createContentId('cmp'),
  name: '',
  badge: '',
  discountPercent: undefined,
  startDate: undefined,
  endDate: undefined,
  enabled: true,
  productCodes: [],
  bannerImageUrl: '',
  linkUrl: '',
  description: '',
});

export function CampaignsSection({ items, onChange, productOptions }: Props) {
  const [editing, setEditing] = useState<EticaretCampaign | null>(null);

  const save = (campaign: EticaretCampaign) => {
    const exists = items.some((c) => c.id === campaign.id);
    onChange(exists ? items.map((c) => (c.id === campaign.id ? campaign : c)) : [...items, campaign]);
    setEditing(null);
  };

  const isActive = (c: EticaretCampaign) => {
    if (!c.enabled) return false;
    const now = dayjs();
    if (c.startDate && dayjs(c.startDate).isAfter(now)) return false;
    if (c.endDate && dayjs(c.endDate).isBefore(now, 'day')) return false;
    return true;
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Text strong>Kampanya yönetimi</Text>
          <br />
          <Text type="secondary">İndirim rozeti ve tarih aralığı ile ürün kampanyaları.</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing(emptyCampaign())}>
          Yeni kampanya
        </Button>
      </div>

      <Table
        rowKey="id"
        size="small"
        dataSource={items}
        pagination={false}
        columns={[
          { title: 'Ad', dataIndex: 'name', key: 'name' },
          {
            title: 'Rozet',
            dataIndex: 'badge',
            key: 'badge',
            render: (v: string, r: EticaretCampaign) =>
              v || r.discountPercent ? <Tag color="red">{v || `%${r.discountPercent}`}</Tag> : '—',
          },
          {
            title: 'Ürün',
            key: 'products',
            render: (_: unknown, r: EticaretCampaign) =>
              r.productCodes.length ? `${r.productCodes.length} ürün` : 'Tümü',
          },
          {
            title: 'Durum',
            key: 'status',
            render: (_: unknown, r: EticaretCampaign) => (
              <Tag color={isActive(r) ? 'green' : 'default'}>{isActive(r) ? 'Yayında' : 'Pasif'}</Tag>
            ),
          },
          {
            title: '',
            key: 'actions',
            width: 100,
            render: (_: unknown, r: EticaretCampaign) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r)} />
                <Popconfirm title="Silinsin mi?" onConfirm={() => onChange(items.filter((c) => c.id !== r.id))}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      {editing ? (
        <Card title="Kampanya düzenle" size="small">
          <Form layout="vertical" onFinish={() => save(editing)}>
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item label="Kampanya adı" required>
                  <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item label="Rozet metni">
                  <Input value={editing.badge} onChange={(e) => setEditing({ ...editing, badge: e.target.value })} placeholder="%20" />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item label="İndirim %">
                  <InputNumber
                    style={{ width: '100%' }}
                    min={0}
                    max={100}
                    value={editing.discountPercent}
                    onChange={(v) => setEditing({ ...editing, discountPercent: v ?? undefined })}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="Ürün kodları (boş = tümü)">
                  <Select
                    mode="multiple"
                    allowClear
                    showSearch
                    style={{ width: '100%' }}
                    value={editing.productCodes}
                    onChange={(v) => setEditing({ ...editing, productCodes: v })}
                    options={productOptions}
                    placeholder="Ürün seçin"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item label="Başlangıç">
                  <DatePicker
                    style={{ width: '100%' }}
                    value={editing.startDate ? dayjs(editing.startDate) : null}
                    onChange={(d) => setEditing({ ...editing, startDate: d ? d.format('YYYY-MM-DD') : undefined })}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item label="Bitiş">
                  <DatePicker
                    style={{ width: '100%' }}
                    value={editing.endDate ? dayjs(editing.endDate) : null}
                    onChange={(d) => setEditing({ ...editing, endDate: d ? d.format('YYYY-MM-DD') : undefined })}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="Banner görsel URL">
                  <Input
                    value={editing.bannerImageUrl}
                    onChange={(e) => setEditing({ ...editing, bannerImageUrl: e.target.value })}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="Link URL">
                  <Input value={editing.linkUrl} onChange={(e) => setEditing({ ...editing, linkUrl: e.target.value })} />
                </Form.Item>
              </Col>
              <Col xs={24}>
                <Form.Item label="Açıklama">
                  <Input.TextArea
                    rows={2}
                    value={editing.description}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} md={4}>
                <Form.Item label="Aktif">
                  <Switch checked={editing.enabled} onChange={(v) => setEditing({ ...editing, enabled: v })} />
                </Form.Item>
              </Col>
            </Row>
            <Space>
              <Button type="primary" htmlType="submit">
                Kaydet
              </Button>
              <Button onClick={() => setEditing(null)}>İptal</Button>
            </Space>
          </Form>
        </Card>
      ) : null}
    </Space>
  );
}
