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
import type { EticaretMenuItem, EticaretMenuLink, EticaretMegaMenuColumn } from '../../core/contentTypes';
import { createContentId, sortByOrder } from '../../core/contentTypes';

const { Text } = Typography;

function parseLinkLines(text: string): EticaretMenuLink[] {
  return text
    .split('\n')
    .map((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('[') || trimmed === '---') return null;
      const [label, target = ''] = trimmed.split('|').map((s) => s.trim());
      if (!label) return null;
      const isPage = target.startsWith('sayfa:');
      const isExternal = target.startsWith('http://') || target.startsWith('https://');
      return {
        id: `sub_${idx}`,
        label,
        type: isPage ? 'page' : isExternal ? 'external' : 'internal',
        pageSlug: isPage ? target.replace(/^sayfa:/, '') : undefined,
        path: !isPage && !isExternal ? target : undefined,
        url: isExternal ? target : undefined,
        enabled: true,
        sortOrder: idx,
      } as EticaretMenuLink;
    })
    .filter((x): x is EticaretMenuLink => x != null);
}

function parseMegaColumnsText(text: string, fallbackTitle: string): EticaretMegaMenuColumn[] {
  const chunks = text.split(/\n---\n|\n---$/);
  return chunks
    .map((chunk, colIdx) => {
      const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
      let title = fallbackTitle || 'Menü';
      const linkLines: string[] = [];
      lines.forEach((line) => {
        const m = line.match(/^\[(.+)\]$/);
        if (m) title = m[1] || title;
        else linkLines.push(line);
      });
      const links = parseLinkLines(linkLines.join('\n'));
      if (!links.length && !title) return null;
      return {
        id: `col_${colIdx}`,
        title,
        links,
        sortOrder: colIdx,
      } as EticaretMegaMenuColumn;
    })
    .filter((x): x is EticaretMegaMenuColumn => x != null && (x.links.length > 0 || x.title));
}

function megaColumnsToText(cols: EticaretMegaMenuColumn[]): string {
  return sortByOrder(cols)
    .map((col) => {
      const header = `[${col.title || 'Menü'}]`;
      const links = (col.links || [])
        .map((l) => `${l.label}|${l.type === 'page' ? `sayfa:${l.pageSlug}` : l.type === 'external' ? l.url : l.path || ''}`)
        .join('\n');
      return `${header}\n${links}`;
    })
    .join('\n---\n');
}

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
            title: 'Stil',
            key: 'menuStyle',
            render: (_: unknown, r: EticaretMenuItem) => (
              <Tag>{r.menuStyle || (r.megaColumns?.length ? 'mega' : r.children?.length ? 'dropdown' : 'simple')}</Tag>
            ),
          },
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
                <Form.Item label="Menü stili">
                  <Select
                    value={editing.menuStyle || 'simple'}
                    onChange={(v) => setEditing({ ...editing, menuStyle: v })}
                    options={[
                      { value: 'simple', label: 'Basit link' },
                      { value: 'dropdown', label: 'Açılır alt menü' },
                      { value: 'mega', label: 'Mega menü (sütunlar)' },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Rozet (isteğe bağlı)">
                  <Input
                    value={editing.badge || ''}
                    onChange={(e) => setEditing({ ...editing, badge: e.target.value })}
                    placeholder="Yeni, İndirim"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Rozet stili">
                  <Select
                    value={editing.badgeStyle || 'new'}
                    onChange={(v) => setEditing({ ...editing, badgeStyle: v })}
                    options={[
                      { value: 'new', label: 'Yeni' },
                      { value: 'hot', label: 'Popüler' },
                      { value: 'sale', label: 'İndirim' },
                    ]}
                  />
                </Form.Item>
              </Col>
              {editing.menuStyle === 'mega' ? (
                <Col xs={24} md={8}>
                  <Form.Item label="Mega menü düzeni">
                    <Select
                      value={editing.megaLayout || 'style_2'}
                      onChange={(v) => setEditing({ ...editing, megaLayout: v })}
                      options={[
                        { value: 'style_2', label: 'Stil 2 (sütunlar)' },
                        { value: 'style_3', label: 'Stil 3 (görselli)' },
                      ]}
                    />
                  </Form.Item>
                </Col>
              ) : null}
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
              {(editing.menuStyle === 'dropdown' || editing.menuStyle === 'mega') && (
                <Col xs={24}>
                  <Form.Item
                    label={
                      editing.menuStyle === 'mega'
                        ? 'Mega menü — sütunlar (--- ile ayırın, [Sütun başlığı] ile başlayın)'
                        : 'Alt menü bağlantıları (satır: etiket|yol)'
                    }
                  >
                    <Input.TextArea
                      rows={6}
                      value={
                        editing.menuStyle === 'mega'
                          ? megaColumnsToText(editing.megaColumns || [])
                          : (editing.children || [])
                              .map((l) => `${l.label}|${l.type === 'page' ? `sayfa:${l.pageSlug}` : l.path || l.url || ''}`)
                              .join('\n')
                      }
                      onChange={(e) => {
                        if (editing.menuStyle === 'mega') {
                          setEditing({ ...editing, megaColumns: parseMegaColumnsText(e.target.value, editing.label) });
                        } else {
                          setEditing({ ...editing, children: parseLinkLines(e.target.value) });
                        }
                      }}
                      placeholder={'[Ürünler]\nElbise|kategori\n---\n[Kurumsal]\nHakkımızda|sayfa:hakkimizda'}
                    />
                  </Form.Item>
                </Col>
              )}
              <Col xs={12} md={4}>
                <Form.Item label="Yeni sekmede aç">
                  <Switch
                    checked={Boolean(editing.openInNewTab)}
                    onChange={(v) => setEditing({ ...editing, openInNewTab: v })}
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
