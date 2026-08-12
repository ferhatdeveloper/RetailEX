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
import type { EticaretFooterLink } from '../../core/contentTypes';
import { createContentId, sortByOrder } from '../../core/contentTypes';

const { Text } = Typography;

type Props = {
  items: EticaretFooterLink[];
  onChange: (items: EticaretFooterLink[]) => void;
};

const emptyItem = (sortOrder: number): EticaretFooterLink => ({
  id: createContentId('footer'),
  label: '',
  url: '',
  column: 'info',
  enabled: true,
  sortOrder,
});

const COLUMN_LABELS: Record<EticaretFooterLink['column'], string> = {
  shop: 'Mağaza',
  info: 'Bilgi',
  legal: 'Yasal',
};

export function FooterSection({ items, onChange }: Props) {
  const [editing, setEditing] = useState<EticaretFooterLink | null>(null);
  const sorted = sortByOrder(items);

  const save = (row: EticaretFooterLink) => {
    const exists = items.some((i) => i.id === row.id);
    onChange(exists ? items.map((i) => (i.id === row.id ? row : i)) : [...items, row]);
    setEditing(null);
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Text strong>Alt bilgi bağlantıları</Text>
          <br />
          <Text type="secondary">Vitrin footer sütunları — mağaza, bilgi ve yasal linkler.</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing(emptyItem(items.length))}>
          Link ekle
        </Button>
      </div>

      <Table
        rowKey="id"
        size="small"
        dataSource={sorted}
        pagination={false}
        columns={[
          { title: 'Etiket', dataIndex: 'label', key: 'label' },
          { title: 'URL', dataIndex: 'url', key: 'url', ellipsis: true },
          {
            title: 'Sütun',
            dataIndex: 'column',
            key: 'column',
            render: (v: EticaretFooterLink['column']) => <Tag>{COLUMN_LABELS[v] || v}</Tag>,
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
            render: (_: unknown, r: EticaretFooterLink) => (
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
        <Card title="Footer link düzenle" size="small">
          <Form layout="vertical" onFinish={() => save(editing)}>
            <Row gutter={12}>
              <Col xs={24} md={8}>
                <Form.Item label="Etiket" required>
                  <Input value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="URL" required>
                  <Input
                    value={editing.url}
                    onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                    placeholder="/sayfa/hakkimizda veya https://..."
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Sütun">
                  <Select
                    value={editing.column}
                    onChange={(v) => setEditing({ ...editing, column: v })}
                    options={[
                      { value: 'shop', label: 'Mağaza' },
                      { value: 'info', label: 'Bilgi' },
                      { value: 'legal', label: 'Yasal' },
                    ]}
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
