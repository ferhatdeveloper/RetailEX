import { useState } from 'react';
import {
  Button,
  Card,
  Col,
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
import type { EticaretBanner } from '../../core/contentTypes';
import { createContentId, sortByOrder } from '../../core/contentTypes';

const { Text } = Typography;

type Props = {
  items: EticaretBanner[];
  onChange: (items: EticaretBanner[]) => void;
};

const emptyBanner = (): EticaretBanner => ({
  id: createContentId('bnr'),
  title: '',
  subtitle: '',
  imageUrl: '',
  mobileImageUrl: '',
  linkUrl: '',
  buttonText: 'İncele',
  placement: 'strip',
  enabled: true,
  sortOrder: 0,
  textColor: '#ffffff',
});

export function BannersSection({ items, onChange }: Props) {
  const [editing, setEditing] = useState<EticaretBanner | null>(null);

  const sorted = sortByOrder(items);

  const save = (banner: EticaretBanner) => {
    const exists = items.some((b) => b.id === banner.id);
    onChange(
      exists ? items.map((b) => (b.id === banner.id ? banner : b)) : [...items, banner],
    );
    setEditing(null);
  };

  const remove = (id: string) => onChange(items.filter((b) => b.id !== id));

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Text strong>Banner yönetimi</Text>
          <br />
          <Text type="secondary">Hero (tam genişlik) ve şerit bannerları vitrinde gösterilir.</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing(emptyBanner())}>
          Yeni banner
        </Button>
      </div>

      <Table
        rowKey="id"
        size="small"
        dataSource={sorted}
        pagination={false}
        columns={[
          {
            title: 'Önizleme',
            key: 'img',
            width: 100,
            render: (_: unknown, r: EticaretBanner) =>
              r.imageUrl ? (
                <img src={r.imageUrl} alt="" style={{ width: 80, height: 48, objectFit: 'cover', borderRadius: 4 }} />
              ) : (
                '—'
              ),
          },
          { title: 'Başlık', dataIndex: 'title', key: 'title' },
          {
            title: 'Konum',
            dataIndex: 'placement',
            key: 'placement',
            render: (v: string) => <Tag color={v === 'hero' ? 'blue' : 'purple'}>{v === 'hero' ? 'Hero' : 'Şerit'}</Tag>,
          },
          {
            title: 'Durum',
            dataIndex: 'enabled',
            key: 'enabled',
            render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Aktif' : 'Pasif'}</Tag>,
          },
          { title: 'Sıra', dataIndex: 'sortOrder', key: 'sortOrder', width: 60 },
          {
            title: '',
            key: 'actions',
            width: 100,
            render: (_: unknown, r: EticaretBanner) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r)} />
                <Popconfirm title="Silinsin mi?" onConfirm={() => remove(r.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      {editing ? (
        <Card title={items.some((b) => b.id === editing.id) ? 'Banner düzenle' : 'Yeni banner'} size="small">
          <Form layout="vertical" onFinish={() => save(editing)}>
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item label="Başlık">
                  <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="Alt başlık">
                  <Input value={editing.subtitle} onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="Görsel URL" required>
                  <Input value={editing.imageUrl} onChange={(e) => setEditing({ ...editing, imageUrl: e.target.value })} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="Mobil görsel URL">
                  <Input
                    value={editing.mobileImageUrl}
                    onChange={(e) => setEditing({ ...editing, mobileImageUrl: e.target.value })}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Konum">
                  <Select
                    value={editing.placement}
                    onChange={(v) => setEditing({ ...editing, placement: v })}
                    options={[
                      { value: 'hero', label: 'Hero (üst tam genişlik)' },
                      { value: 'strip', label: 'Şerit (3’lü kart)' },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Link URL">
                  <Input value={editing.linkUrl} onChange={(e) => setEditing({ ...editing, linkUrl: e.target.value })} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Buton metni">
                  <Input value={editing.buttonText} onChange={(e) => setEditing({ ...editing, buttonText: e.target.value })} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Metin rengi (şerit)">
                  <Input
                    type="color"
                    value={editing.textColor || '#ffffff'}
                    onChange={(e) => setEditing({ ...editing, textColor: e.target.value })}
                    style={{ width: '100%', height: 36 }}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} md={4}>
                <Form.Item label="Sıra">
                  <InputNumber
                    style={{ width: '100%' }}
                    value={editing.sortOrder}
                    onChange={(v) => setEditing({ ...editing, sortOrder: Number(v || 0) })}
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
