import { Card, Input, Select, Switch, Table, Tag, Typography } from 'antd';
import type { EticaretHomepageSection, EticaretSettings } from '../../core/types';
import { DEFAULT_HOMEPAGE_SECTIONS } from '../../core/contentTypes';
import { sortByOrder } from '../../core/contentTypes';

const { Text, Paragraph } = Typography;

type Props = {
  form: EticaretSettings;
  onChange: (patch: Partial<EticaretSettings>) => void;
};

const SECTION_LABELS: Record<EticaretHomepageSection['type'], string> = {
  slider: 'Slider',
  hero_banner: 'Hero banner',
  strip_banners: 'Şerit bannerlar',
  campaign_promo: 'Kampanya promosyonu',
  products: 'Ürün listesi',
  lookbook_teaser: 'Lookbook önizleme',
  custom_html: 'Özel HTML bloğu',
};

export function HomepageSection({ form, onChange }: Props) {
  const sections = sortByOrder(form.homepageSections?.length ? form.homepageSections : DEFAULT_HOMEPAGE_SECTIONS);

  const patchSection = (id: string, patch: Partial<EticaretHomepageSection>) => {
    onChange({
      homepageSections: sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  };

  return (
    <Card title="Ana sayfa bölüm sırası" size="small">
      <Paragraph type="secondary">
        Ella demo blokları (spotlight, markalar, Instagram vb.) yönetilmeyen bölümler olarak gizlenir. Aşağıdaki
        sıra ve aç/kapa ile vitrin ana sayfa düzenini belirleyin.
      </Paragraph>
      <Table
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={sections}
        columns={[
          {
            title: 'Bölüm',
            key: 'type',
            render: (_: unknown, r: EticaretHomepageSection) => (
              <Tag>{SECTION_LABELS[r.type] || r.type}</Tag>
            ),
          },
          {
            title: 'Başlık (isteğe bağlı)',
            key: 'title',
            render: (_: unknown, r: EticaretHomepageSection) =>
              r.type === 'custom_html' || r.type === 'lookbook_teaser' ? (
                <Input
                  size="small"
                  value={r.title || ''}
                  onChange={(e) => patchSection(r.id, { title: e.target.value })}
                  placeholder="Bölüm başlığı"
                />
              ) : (
                '—'
              ),
          },
          {
            title: 'Sıra',
            width: 90,
            render: (_: unknown, r: EticaretHomepageSection) => (
              <Select
                size="small"
                style={{ width: 70 }}
                value={r.sortOrder}
                onChange={(v) => patchSection(r.id, { sortOrder: v })}
                options={sections.map((_, i) => ({ value: i, label: String(i) }))}
              />
            ),
          },
          {
            title: 'Aktif',
            width: 70,
            render: (_: unknown, r: EticaretHomepageSection) => (
              <Switch checked={r.enabled !== false} onChange={(v) => patchSection(r.id, { enabled: v })} />
            ),
          },
        ]}
      />
      {sections.some((s) => s.type === 'custom_html') ? (
        <div style={{ marginTop: 16 }}>
          <Text strong>Özel HTML</Text>
          <Input.TextArea
            rows={4}
            style={{ marginTop: 8 }}
            value={sections.find((s) => s.type === 'custom_html')?.customHtml || ''}
            onChange={(e) => {
              const custom = sections.find((s) => s.type === 'custom_html');
              if (custom) patchSection(custom.id, { customHtml: e.target.value });
            }}
            placeholder="<section>...</section>"
          />
        </div>
      ) : null}
    </Card>
  );
}
