import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Switch,
  Typography,
} from 'antd';
import { ApiOutlined, RobotOutlined, SaveOutlined } from '@ant-design/icons';
import { toast } from 'sonner';
import {
  DEFAULT_OPENROUTER_CONFIG,
  OPENROUTER_MODEL_PRESETS,
  loadOpenRouterConfig,
  saveOpenRouterConfig,
  type OpenRouterConfig,
} from '../../services/openRouterConfig';
import { testOpenRouterConnection } from '../../services/openRouterService';

const { Text, Title, Paragraph, Link } = Typography;

export function OpenRouterAiSection() {
  const [form] = Form.useForm<OpenRouterConfig>();
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);

  const reload = useCallback(() => {
    const cfg = loadOpenRouterConfig();
    form.setFieldsValue(cfg);
    setEnabled(cfg.enabled);
  }, [form]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();
      const next = saveOpenRouterConfig({
        ...values,
        enabled: Boolean(values.enabled),
        apiKey: String(values.apiKey || '').trim(),
        model: String(values.model || '').trim(),
        baseUrl: String(values.baseUrl || DEFAULT_OPENROUTER_CONFIG.baseUrl).trim(),
      });
      setEnabled(next.enabled);
      toast.success(
        next.enabled
          ? 'OpenRouter kaydedildi — rapor AI ve asistan bu modeli kullanır.'
          : 'OpenRouter ayarları kaydedildi (şimdilik kapalı).',
      );
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'errorFields' in e) return;
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const values = form.getFieldsValue(true);
      const trial: OpenRouterConfig = {
        ...loadOpenRouterConfig(),
        ...values,
        enabled: true,
        apiKey: String(values.apiKey || '').trim(),
      };
      if (!trial.apiKey) {
        toast.error('Test için API anahtarı gerekli.');
        return;
      }
      const result = await testOpenRouterConnection(trial);
      if (result.ok) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card
      title={
        <Space>
          <RobotOutlined />
          <span>Yapay Zeka — OpenRouter</span>
          {enabled ? (
            <Text type="success" style={{ fontSize: 12 }}>
              Açık
            </Text>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Kapalı
            </Text>
          )}
        </Space>
      }
      extra={
        <Space>
          <Button icon={<ApiOutlined />} loading={testing} onClick={() => void handleTest()}>
            Bağlantı testi
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={() => void handleSave()}
          >
            Kaydet
          </Button>
        </Space>
      }
    >
      <Paragraph type="secondary" style={{ marginTop: 0 }}>
        OpenRouter üzerinden GPT, Claude, Gemini ve diğer modellere tek API anahtarı ile erişim.
        Rapor sohbeti ve AI asistan bu ayarı kullanır. Çağrılar güvenlik için{' '}
        <Text code>pg_bridge</Text> üzerinden iletilir.
      </Paragraph>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Anahtar alma"
        description={
          <span>
            Ücretsiz / ücretli anahtar:{' '}
            <Link href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
              openrouter.ai/keys
            </Link>
            . İsteğe bağlı sunucu env: <Text code>OPENROUTER_API_KEY</Text> (bridge).
          </span>
        }
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={DEFAULT_OPENROUTER_CONFIG}
        onValuesChange={(_, all) => setEnabled(Boolean(all.enabled))}
      >
        <Row gutter={[16, 0]}>
          <Col xs={24} md={8}>
            <Form.Item name="enabled" label="OpenRouter etkin" valuePropName="checked">
              <Switch checkedChildren="Açık" unCheckedChildren="Kapalı" />
            </Form.Item>
          </Col>
          <Col xs={24} md={16}>
            <Form.Item
              name="apiKey"
              label="API anahtarı"
              rules={[{ required: false }]}
              extra="sk-or-… ile başlar. Tarayıcıda saklanır; istekler köprüye gider."
            >
              <Input.Password placeholder="sk-or-v1-…" autoComplete="off" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="model" label="Model" rules={[{ required: true, message: 'Model seçin' }]}>
              <Select
                showSearch
                allowClear={false}
                options={OPENROUTER_MODEL_PRESETS}
                optionFilterProp="label"
                placeholder="Model"
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="baseUrl"
              label="API taban URL"
              rules={[{ required: true, message: 'URL gerekli' }]}
            >
              <Input placeholder="https://openrouter.ai/api/v1" />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="temperature" label="Temperature (0–2)">
              <InputNumber min={0} max={2} step={0.1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="maxTokens" label="Max tokens">
              <InputNumber min={256} max={16000} step={256} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="siteName" label="Uygulama adı (X-Title)">
              <Input placeholder="RetailEX" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="siteUrl" label="Site URL (HTTP-Referer)" hidden>
              <Input />
            </Form.Item>
          </Col>
        </Row>
      </Form>

      <Title level={5} style={{ marginTop: 8 }}>
        Nerede kullanılır?
      </Title>
      <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(0,0,0,0.65)' }}>
        <li>Raporlar → AI sohbet paneli</li>
        <li>İleride stok / yönetim asistanı (aynı servis)</li>
      </ul>
    </Card>
  );
}
