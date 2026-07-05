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
import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import type { EticaretFeaturedProduct } from '../../core/contentTypes';
import { createContentId, sortByOrder } from '../../core/contentTypes';

const { Text } = Typography;

type Props = {
  items: EticaretFeaturedProduct[];
  onChange: (items: EticaretFeaturedProduct[]) => void;
  productOptions: Array<{ value: string; label: string }>;
  onSearchProducts: (term: string) => void;
  searchLoading?: boolean;
};

export function FeaturedSection({
  items,
  onChange,
  productOptions,
  onSearchProducts,
  searchLoading,
}: Props) {
  const [editing, setEditing] = useState<EticaretFeaturedProduct | null>(null);
  const [search, setSearch] = useState('');
  const sorted = sortByOrder(items);

  const save = (row: EticaretFeaturedProduct) => {
    const exists = items.some((f) => f.id === row.id);
    onChange(exists ? items.map((f) => (f.id === row.id ? row : f)) : [...items, row]);
    setEditing(null);
  };

  const addFromSearch = () => {
    const code = search.trim();
    if (!code) return;
    const opt = productOptions.find((o) => o.value === code);
    onChange([
      ...items,
      {
        id: createContentId('feat'),
        productCode: code,
        productName: opt?.label.split(' · ')[0],
        badge: 'Öne çıkan',
        sortOrder: items.length,
        enabled: true,
      },
    ]);
    setSearch('');
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <div>
        <Text strong>Öne çıkan ürünler</Text>
        <br />
        <Text type="secondary">Vitrin ana sayfasında listenin en üstünde gösterilir.</Text>
      </div>

      <Space.Compact style={{ width: '100%', maxWidth: 520 }}>
        <Select
          showSearch
          allowClear
          style={{ flex: 1 }}
          placeholder="Ürün ara (kod veya ad)"
          value={search || undefined}
          onSearch={(v) => onSearchProducts(v)}
          onChange={(v) => setSearch(v || '')}
          loading={searchLoading}
          options={productOptions}
          filterOption={false}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={addFromSearch}>
          Ekle
        </Button>
        <Button icon={<SearchOutlined />} onClick={() => onSearchProducts(search)} loading={searchLoading}>
          Ara
        </Button>
      </Space.Compact>

      <Table
        rowKey="id"
        size="small"
        dataSource={sorted}
        pagination={false}
        columns={[
          { title: 'Kod', dataIndex: 'productCode', key: 'productCode' },
          { title: 'Ürün', dataIndex: 'productName', key: 'productName' },
          {
            title: 'Rozet',
            dataIndex: 'badge',
            key: 'badge',
            render: (v: string) => (v ? <Tag color="gold">{v}</Tag> : '—'),
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
            render: (_: unknown, r: EticaretFeaturedProduct) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r)} />
                <Popconfirm title="Kaldırılsın mı?" onConfirm={() => onChange(items.filter((f) => f.id !== r.id))}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      {editing ? (
        <Card title="Öne çıkan düzenle" size="small">
          <Form layout="vertical" onFinish={() => save(editing)}>
            <Row gutter={12}>
              <Col xs={24} md={8}>
                <Form.Item label="Ürün kodu">
                  <Input value={editing.productCode} disabled />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Rozet">
                  <Input value={editing.badge} onChange={(e) => setEditing({ ...editing, badge: e.target.value })} />
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
