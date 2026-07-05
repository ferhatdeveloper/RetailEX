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
import type { EticaretStaticPage } from '../../core/contentTypes';
import { createContentId, sortByOrder } from '../../core/contentTypes';

const { Text } = Typography;

type Props = {
  pages: EticaretStaticPage[];
  onChange: (pages: EticaretStaticPage[]) => void;
};

const emptyPage = (): EticaretStaticPage => ({
  id: createContentId('page'),
  slug: '',
  title: '',
  bodyHtml: '<p></p>',
  enabled: true,
  sortOrder: 0,
  showInMenu: false,
});

export function PagesSection({ pages, onChange }: Props) {
  const [editing, setEditing] = useState<EticaretStaticPage | null>(null);
  const sorted = sortByOrder(pages);

  const save = (row: EticaretStaticPage) => {
    const exists = pages.some((p) => p.id === row.id);
    onChange(exists ? pages.map((p) => (p.id === row.id ? row : p)) : [...pages, row]);
    setEditing(null);
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Text strong>Sayfalar (CMS)</Text>
          <br />
          <Text type="secondary">Hakkımızda, iletişim, gizlilik vb. — `/magaza/kiracı/sayfa/slug`</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing(emptyPage())}>
          Sayfa ekle
        </Button>
      </div>

      <Table
        rowKey="id"
        size="small"
        dataSource={sorted}
        pagination={false}
        columns={[
          { title: 'Başlık', dataIndex: 'title', key: 'title' },
          { title: 'Slug', dataIndex: 'slug', key: 'slug', render: (v: string) => <Text code>{v}</Text> },
          {
            title: 'Menüde',
            dataIndex: 'showInMenu',
            key: 'showInMenu',
            render: (v: boolean) => (v ? <Tag color="blue">Evet</Tag> : '—'),
          },
          {
            title: 'Aktif',
            dataIndex: 'enabled',
            key: 'enabled',
            render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Evet' : 'Hayır'}</Tag>,
          },
          {
            title: '',
            key: 'actions',
            width: 100,
            render: (_: unknown, r: EticaretStaticPage) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r)} />
                <Popconfirm title="Silinsin mi?" onConfirm={() => onChange(pages.filter((p) => p.id !== r.id))}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      {editing ? (
        <Card title="Sayfa düzenle" size="small">
          <Form layout="vertical" onFinish={() => save(editing)}>
            <Row gutter={12}>
              <Col xs={24} md={8}>
                <Form.Item label="Başlık" required>
                  <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Slug (URL)" required>
                  <Input
                    value={editing.slug}
                    onChange={(e) =>
                      setEditing({ ...editing, slug: e.target.value.trim().toLowerCase().replace(/\s+/g, '-') })
                    }
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
                <Form.Item label="Menüde göster">
                  <Switch checked={editing.showInMenu} onChange={(v) => setEditing({ ...editing, showInMenu: v })} />
                </Form.Item>
              </Col>
              <Col xs={12} md={4}>
                <Form.Item label="Aktif">
                  <Switch checked={editing.enabled} onChange={(v) => setEditing({ ...editing, enabled: v })} />
                </Form.Item>
              </Col>
              <Col xs={24}>
                <Form.Item label="İçerik (HTML)">
                  <Input.TextArea
                    rows={8}
                    value={editing.bodyHtml}
                    onChange={(e) => setEditing({ ...editing, bodyHtml: e.target.value })}
                  />
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
