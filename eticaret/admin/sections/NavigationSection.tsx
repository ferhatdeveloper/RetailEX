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
import type { EticaretMenuItem } from '../../core/contentTypes';
import { createContentId, sortByOrder } from '../../core/contentTypes';

const { Text } = Typography;

type Props = {
  items: EticaretMenuItem[];
  onChange: (items: EticaretMenuItem[]) => void;
};

const emptyItem = (sortOrder: number): EticaretMenuItem => ({
  id: createContentId('nav'),
  label: '',
  type: 'internal',
  path: '',
  enabled: true,
  sortOrder,
});

export function NavigationSection({ items, onChange }: Props) {
  const [editing, setEditing] = useState<EticaretMenuItem | null>(null);
  const sorted = sortByOrder(items);

  const save = (row: EticaretMenuItem) => {
    const exists = items.some((i) => i.id === row.id);
    onChange(exists ? items.map((i) => (i.id === row.id ? row : i)) : [...items, row]);
    setEditing(null);
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Text strong>Menü başlıkları</Text>
          <br />
          <Text type="secondary">Vitrin üst navigasyonu — sıra, etiket ve bağlantı.</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing(emptyItem(items.length))}>
          Menü ekle
        </Button>
      </div>

      <Table
        rowKey="id"
        size="small"
        dataSource={sorted}
        pagination={false}
        columns={[
          { title: 'Etiket', dataIndex: 'label', key: 'label' },
          {
            title: 'Tür',
            dataIndex: 'type',
            key: 'type',
            render: (v: string) => <Tag>{v}</Tag>,
          },
          {
            title: 'Hedef',
            key: 'target',
            render: (_: unknown, r: EticaretMenuItem) =>
              r.type === 'page' ? r.pageSlug : r.type === 'external' ? r.url : r.path || '/',
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
            render: (_: unknown, r: EticaretMenuItem) => (
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
        <Card title="Menü düzenle" size="small">
          <Form layout="vertical" onFinish={() => save(editing)}>
            <Row gutter={12}>
              <Col xs={24} md={8}>
                <Form.Item label="Etiket" required>
                  <Input value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Tür">
                  <Select
                    value={editing.type}
                    onChange={(v) => setEditing({ ...editing, type: v })}
                    options={[
                      { value: 'internal', label: 'Dahili yol' },
                      { value: 'page', label: 'CMS sayfa' },
                      { value: 'external', label: 'Harici URL' },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label={editing.type === 'page' ? 'Sayfa slug' : editing.type === 'external' ? 'URL' : 'Yol'}>
                  <Input
                    value={
                      editing.type === 'page'
                        ? editing.pageSlug || ''
                        : editing.type === 'external'
                          ? editing.url || ''
                          : editing.path || ''
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (editing.type === 'page') setEditing({ ...editing, pageSlug: v });
                      else if (editing.type === 'external') setEditing({ ...editing, url: v });
                      else setEditing({ ...editing, path: v });
                    }}
                    placeholder={editing.type === 'internal' ? 'sepet, kategori, odeme' : ''}
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
