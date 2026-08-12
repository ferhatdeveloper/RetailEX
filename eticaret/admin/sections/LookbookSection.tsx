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
import type { EticaretLookbookHotspot, EticaretLookbookScene } from '../../core/contentTypes';
import { createContentId, sortByOrder } from '../../core/contentTypes';

const { Text } = Typography;

type Props = {
  items: EticaretLookbookScene[];
  onChange: (items: EticaretLookbookScene[]) => void;
};

const emptyScene = (sortOrder: number): EticaretLookbookScene => ({
  id: createContentId('lb'),
  title: '',
  imageUrl: '',
  mobileImageUrl: '',
  hotspots: [],
  enabled: true,
  sortOrder,
});

function parseHotspots(text: string): EticaretLookbookHotspot[] {
  return text
    .split('\n')
    .map((line, idx) => {
      const parts = line.split('|').map((s) => s.trim());
      if (parts.length < 3) return null;
      const [code, top, left] = parts;
      if (!code) return null;
      return {
        id: createContentId('hs'),
        productCode: code,
        topPercent: Number(top) || 50,
        leftPercent: Number(left) || 50,
        enabled: true,
      };
    })
    .filter((x): x is EticaretLookbookHotspot => x != null);
}

export function LookbookSection({ items, onChange }: Props) {
  const [editing, setEditing] = useState<EticaretLookbookScene | null>(null);
  const sorted = sortByOrder(items);

  const save = (row: EticaretLookbookScene) => {
    const exists = items.some((i) => i.id === row.id);
    onChange(exists ? items.map((i) => (i.id === row.id ? row : i)) : [...items, row]);
    setEditing(null);
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Text strong>Lookbook sahneleri</Text>
          <br />
          <Text type="secondary">
            Görsel URL + hotspot satırları: <Text code>ürünKodu|top%|left%</Text>
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing(emptyScene(items.length))}>
          Sahne ekle
        </Button>
      </div>

      <Table
        rowKey="id"
        size="small"
        dataSource={sorted}
        pagination={false}
        columns={[
          { title: 'Başlık', dataIndex: 'title', key: 'title', render: (v: string) => v || '—' },
          { title: 'Görsel', dataIndex: 'imageUrl', key: 'imageUrl', ellipsis: true },
          {
            title: 'Hotspot',
            key: 'hs',
            render: (_: unknown, r: EticaretLookbookScene) => (r.hotspots || []).length,
          },
          {
            title: 'Aktif',
            dataIndex: 'enabled',
            key: 'enabled',
            render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Evet' : 'Hayır'}</Tag>,
          },
          { title: 'Sıra', dataIndex: 'sortOrder', key: 'sortOrder', width: 60 },
          {
            title: '',
            key: 'actions',
            width: 100,
            render: (_: unknown, r: EticaretLookbookScene) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r)} />
                <Popconfirm title="Silinsin mi?" onConfirm={() => onChange(items.filter((i) => i.id !== r.id))}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      {editing ? (
        <Card title="Lookbook sahnesi" size="small">
          <Form layout="vertical" onFinish={() => save(editing)}>
            <Row gutter={12}>
              <Col xs={24} md={8}>
                <Form.Item label="Başlık">
                  <Input value={editing.title || ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Masaüstü görsel URL" required>
                  <Input value={editing.imageUrl} onChange={(e) => setEditing({ ...editing, imageUrl: e.target.value })} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Mobil görsel URL">
                  <Input
                    value={editing.mobileImageUrl || ''}
                    onChange={(e) => setEditing({ ...editing, mobileImageUrl: e.target.value })}
                  />
                </Form.Item>
              </Col>
              <Col xs={24}>
                <Form.Item label="Hotspotlar (ürünKodu|top%|left%)">
                  <Input.TextArea
                    rows={5}
                    value={(editing.hotspots || [])
                      .map((h) => `${h.productCode}|${h.topPercent}|${h.leftPercent}`)
                      .join('\n')}
                    onChange={(e) => setEditing({ ...editing, hotspots: parseHotspots(e.target.value) })}
                    placeholder={'SKU-001|34|45\nSKU-002|60|70'}
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
