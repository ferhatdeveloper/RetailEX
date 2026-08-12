import { Button, Card, Col, Form, Input, Row, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useState } from 'react';
import type { EticaretContactInfo, EticaretSettings, EticaretSocialLink } from '../../core/types';
import { createContentId, sortByOrder } from '../../core/contentTypes';

const { Text } = Typography;

type Props = {
  form: EticaretSettings;
  onChange: (patch: Partial<EticaretSettings>) => void;
};

const PLATFORMS = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'twitter', label: 'X / Twitter' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'other', label: 'Diğer' },
];

export function ContactSocialSection({ form, onChange }: Props) {
  const contact = form.contactInfo || {};
  const links = sortByOrder(form.socialLinks || []);
  const [draft, setDraft] = useState<EticaretSocialLink | null>(null);

  const patchContact = (patch: Partial<EticaretContactInfo>) => {
    onChange({ contactInfo: { ...contact, ...patch } });
  };

  const saveLink = (row: EticaretSocialLink) => {
    const list = form.socialLinks || [];
    const exists = list.some((l) => l.id === row.id);
    onChange({
      socialLinks: exists ? list.map((l) => (l.id === row.id ? row : l)) : [...list, row],
    });
    setDraft(null);
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Card title="İletişim bilgileri" size="small">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Text strong>Telefon</Text>
            <Input
              value={contact.phone || ''}
              onChange={(e) => patchContact({ phone: e.target.value })}
              style={{ marginTop: 8 }}
              placeholder="+90 555 000 00 00"
            />
          </Col>
          <Col xs={24} md={8}>
            <Text strong>E-posta</Text>
            <Input
              value={contact.email || ''}
              onChange={(e) => patchContact({ email: e.target.value })}
              style={{ marginTop: 8 }}
              placeholder="info@magaza.com"
            />
          </Col>
          <Col xs={24} md={8}>
            <Text strong>WhatsApp</Text>
            <Input
              value={contact.whatsapp || ''}
              onChange={(e) => patchContact({ whatsapp: e.target.value })}
              style={{ marginTop: 8 }}
              placeholder="905551234567"
            />
          </Col>
          <Col xs={24} md={12}>
            <Text strong>Adres</Text>
            <Input.TextArea
              value={contact.address || ''}
              onChange={(e) => patchContact({ address: e.target.value })}
              style={{ marginTop: 8 }}
              rows={2}
            />
          </Col>
          <Col xs={24} md={12}>
            <Text strong>Çalışma saatleri</Text>
            <Input
              value={contact.hours || ''}
              onChange={(e) => patchContact({ hours: e.target.value })}
              style={{ marginTop: 8 }}
              placeholder="Pzt–Cmt 09:00–19:00"
            />
          </Col>
        </Row>
      </Card>

      <Card
        title="Sosyal medya"
        size="small"
        extra={
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() =>
              setDraft({
                id: createContentId('social'),
                platform: 'instagram',
                url: '',
                enabled: true,
                sortOrder: links.length,
              })
            }
          >
            Ekle
          </Button>
        }
      >
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={links}
          columns={[
            { title: 'Platform', dataIndex: 'platform', render: (v: string) => <Tag>{v}</Tag> },
            { title: 'URL', dataIndex: 'url', ellipsis: true },
            {
              title: 'Aktif',
              dataIndex: 'enabled',
              width: 70,
              render: (v: boolean) => (v ? 'Evet' : 'Hayır'),
            },
            {
              title: '',
              width: 60,
              render: (_: unknown, r: EticaretSocialLink) => (
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() =>
                    onChange({ socialLinks: (form.socialLinks || []).filter((l) => l.id !== r.id) })
                  }
                />
              ),
            },
          ]}
        />
        {draft ? (
          <Card size="small" style={{ marginTop: 12 }} title="Yeni sosyal link">
            <Row gutter={12}>
              <Col xs={24} md={6}>
                <Select
                  style={{ width: '100%' }}
                  value={draft.platform}
                  onChange={(v) => setDraft({ ...draft, platform: v })}
                  options={PLATFORMS}
                />
              </Col>
              <Col xs={24} md={14}>
                <Input
                  value={draft.url}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                  placeholder="https://..."
                />
              </Col>
              <Col xs={12} md={2}>
                <Switch checked={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} />
              </Col>
              <Col xs={12} md={2}>
                <Button type="primary" onClick={() => saveLink(draft)}>
                  Kaydet
                </Button>
              </Col>
            </Row>
          </Card>
        ) : null}
      </Card>

      <Card title="Footer bülten alanı" size="small">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Text strong>Başlık</Text>
            <Input
              value={form.newsletter?.footerTitle || ''}
              onChange={(e) => onChange({ newsletter: { ...form.newsletter, footerTitle: e.target.value } })}
              style={{ marginTop: 8 }}
              placeholder="Bültenimize abone olun"
            />
          </Col>
          <Col xs={24} md={12}>
            <Text strong>Alt metin</Text>
            <Input
              value={form.newsletter?.footerSubtitle || ''}
              onChange={(e) => onChange({ newsletter: { ...form.newsletter, footerSubtitle: e.target.value } })}
              style={{ marginTop: 8 }}
              placeholder="Kampanya ve yeniliklerden haberdar olun"
            />
          </Col>
        </Row>
      </Card>
    </Space>
  );
}
