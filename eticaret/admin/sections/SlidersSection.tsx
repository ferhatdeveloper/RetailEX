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
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { EticaretSliderSlide } from '../../core/contentTypes';
import { createContentId, sortByOrder } from '../../core/contentTypes';

const { Text } = Typography;

type Props = {
  items: EticaretSliderSlide[];
  onChange: (items: EticaretSliderSlide[]) => void;
};

const emptySlide = (sortOrder: number): EticaretSliderSlide => ({
  id: createContentId('sld'),
  title: '',
  subtitle: '',
  imageUrl: '',
  mobileImageUrl: '',
  linkUrl: '',
  buttonText: 'Keşfet',
  enabled: true,
  sortOrder,
});

export function SlidersSection({ items, onChange }: Props) {
  const [editing, setEditing] = useState<EticaretSliderSlide | null>(null);
  const sorted = sortByOrder(items);

  const save = (slide: EticaretSliderSlide) => {
    const exists = items.some((s) => s.id === slide.id);
    onChange(exists ? items.map((s) => (s.id === slide.id ? slide : s)) : [...items, slide]);
    setEditing(null);
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Text strong>Slider / Carousel</Text>
          <br />
          <Text type="secondary">Ana sayfada otomatik geçişli slayt gösterimi.</Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setEditing(emptySlide(items.length))}
        >
          Yeni slayt
        </Button>
      </div>

      <Table
        rowKey="id"
        size="small"
        dataSource={sorted}
        pagination={false}
        columns={[
          {
            title: 'Görsel',
            key: 'img',
            width: 100,
            render: (_: unknown, r: EticaretSliderSlide) =>
              r.imageUrl ? (
                <img src={r.imageUrl} alt="" style={{ width: 80, height: 48, objectFit: 'cover', borderRadius: 4 }} />
              ) : (
                '—'
              ),
          },
          { title: 'Başlık', dataIndex: 'title', key: 'title' },
          { title: 'Alt başlık', dataIndex: 'subtitle', key: 'subtitle', ellipsis: true },
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
            render: (_: unknown, r: EticaretSliderSlide) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r)} />
                <Popconfirm title="Silinsin mi?" onConfirm={() => onChange(items.filter((s) => s.id !== r.id))}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      {editing ? (
        <Card title="Slayt düzenle" size="small">
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
                <Form.Item label="Link">
                  <Input value={editing.linkUrl} onChange={(e) => setEditing({ ...editing, linkUrl: e.target.value })} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Buton">
                  <Input value={editing.buttonText} onChange={(e) => setEditing({ ...editing, buttonText: e.target.value })} />
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
