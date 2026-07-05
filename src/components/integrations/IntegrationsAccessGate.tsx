import { useState } from 'react';
import { Button, Card, Input, Typography } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { toast } from 'sonner';
import {
  grantIntegrationsAccess,
  verifyIntegrationsPassword,
} from '../../utils/integrationsAccess';

const { Title, Text } = Typography;

type Props = {
  onGranted: () => void;
};

export function IntegrationsAccessGate({ onGranted }: Props) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = () => {
    setLoading(true);
    try {
      if (!verifyIntegrationsPassword(password)) {
        toast.error('Geçersiz yetkili şifre');
        setPassword('');
        return;
      }
      grantIntegrationsAccess();
      toast.success('Entegrasyon sayfasına erişim açıldı');
      onGranted();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Card
        bordered
        style={{ width: '100%', maxWidth: 420, borderColor: '#d9d9d9' }}
        styles={{ body: { padding: 28 } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div
            style={{
              width: 56,
              height: 56,
              margin: '0 auto 12px',
              borderRadius: 6,
              background: '#f5f5f5',
              border: '1px solid #f0f0f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LockOutlined style={{ fontSize: 24, color: '#1677ff' }} />
          </div>
          <Title level={4} style={{ margin: 0 }}>
            Yetkili Erişim
          </Title>
          <Text type="secondary">Entegrasyon ayarlarına girmek için yetkili şifresini girin.</Text>
        </div>

        <Input.Password
          size="large"
          placeholder="Yetkili şifre"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onPressEnter={handleSubmit}
          autoFocus
        />

        <Button
          type="primary"
          block
          size="large"
          style={{ marginTop: 16 }}
          loading={loading}
          onClick={handleSubmit}
        >
          Devam
        </Button>
      </Card>
    </div>
  );
}
