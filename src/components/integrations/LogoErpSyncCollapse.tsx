import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Space, Typography } from 'antd';
import { CloudDownloadOutlined, PlayCircleOutlined, SendOutlined } from '@ant-design/icons';
import { toast } from 'sonner';
import { IS_TAURI } from '../../utils/env';
import {
  loadLogoRestConfig,
  logoTestConnection,
  getLogoMappingForErp,
  resolveLogoContext,
} from '../../services/logoRestApi';
import { loadLogoErpMode } from '../../services/logoErpMode';
import {
  loadLogoRestSyncSettings,
  runLogoRestSyncNow,
} from '../../services/logoRestSyncService';
import {
  loadLogoMssqlSyncSettings,
  runLogoMssqlSyncNow,
} from '../../services/logoMssqlSyncService';
import { pushPendingSalesToLogo } from '../../services/logoRestInvoicePush';
import { LogoImportPreviewTabs } from './LogoImportPreviewTabs';

const { Text } = Typography;

type Props = {
  serviceType: 'rest' | 'lobject';
};

export function LogoErpSyncCollapse({ serviceType }: Props) {
  const [restConnected, setRestConnected] = useState(false);
  const [running, setRunning] = useState(false);
  const [mssqlRunning, setMssqlRunning] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [message, setMessage] = useState('');

  const checkRest = useCallback(async () => {
    if (serviceType !== 'rest') return;
    const cfg = loadLogoRestConfig();
    const r = await logoTestConnection(cfg);
    setRestConnected(r.ok);
  }, [serviceType]);

  useEffect(() => {
    void checkRest();
    const onSaved = () => void checkRest();
    window.addEventListener('retailex:logo-settings-saved', onSaved);
    window.addEventListener('retailex:logo-rest-connected', onSaved);
    return () => {
      window.removeEventListener('retailex:logo-settings-saved', onSaved);
      window.removeEventListener('retailex:logo-rest-connected', onSaved);
    };
  }, [checkRest]);

  const handleRestSync = async () => {
    setRunning(true);
    setMessage('');
    try {
      const r = await runLogoRestSyncNow();
      setMessage(r.message);
      if (r.ok) toast.success('Logo REST senkron tamamlandı');
      else toast.error(r.message);
    } finally {
      setRunning(false);
    }
  };

  const handleMssqlSync = async () => {
    setMssqlRunning(true);
    setMessage('');
    try {
      const r = await runLogoMssqlSyncNow();
      setMessage(r.message);
      if (r.ok) toast.success('Logo MSSQL senkron tamamlandı');
      else toast.error(r.message);
    } finally {
      setMssqlRunning(false);
    }
  };

  const handlePushInvoices = async () => {
    setPushing(true);
    setMessage('');
    try {
      const cfg = loadLogoRestConfig();
      const r = await pushPendingSalesToLogo(cfg, { limit: 25 });
      setMessage(r.messages.join(' · '));
      toast.success('Fatura gönderimi tamamlandı');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage(msg);
      toast.error(msg);
    } finally {
      setPushing(false);
    }
  };

  if (serviceType === 'lobject') {
    if (!IS_TAURI) {
      return (
        <Alert
          type="info"
          showIcon
          message="LOBJECT senkronu yalnızca masaüstü uygulamasında çalışır."
        />
      );
    }
    const mssql = loadLogoMssqlSyncSettings();
    return (
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Text type="secondary">
          Periyodik senkron: {mssql.enabled ? `Açık (${mssql.intervalMinutes} dk)` : 'Kapalı'} — ayarlar
          Parametreler bölümünden yönetilir.
        </Text>
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          loading={mssqlRunning}
          onClick={() => void handleMssqlSync()}
        >
          Şimdi çek (MSSQL)
        </Button>
        {mssql.lastSyncAt ? (
          <Text type="secondary">
            Son senkron: {new Date(mssql.lastSyncAt).toLocaleString('tr-TR')}
            {mssql.lastMessage ? ` — ${mssql.lastMessage}` : ''}
          </Text>
        ) : null}
        {message ? <Alert type="info" message={message} /> : null}
      </Space>
    );
  }

  const rest = loadLogoRestSyncSettings();
  const cfg = loadLogoRestConfig();
  const mapping = getLogoMappingForErp(cfg);
  const ctx = resolveLogoContext(cfg);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <LogoImportPreviewTabs connected={restConnected} />

      {!restConnected ? (
        <Alert
          type="warning"
          showIcon
          message="REST bağlantısı kurulmamış. Genel bölümünden bilgileri girip Bağlantı Test yapın."
        />
      ) : (
        <Text type="secondary">
          Logo bağlamı: firma {mapping?.logoFirmNr ?? ctx.firmNr} / dönem{' '}
          {mapping?.logoPeriodNr ?? ctx.periodNr}
          {ctx.logoDb ? ` · ${ctx.logoDb}` : ''}
        </Text>
      )}
      <Text type="secondary">
        Otomatik çekim: {rest.enabled ? `Açık (${rest.intervalMinutes} dk)` : 'Kapalı'}
      </Text>
      <Space wrap>
        <Button
          icon={<CloudDownloadOutlined />}
          loading={running}
          disabled={!restConnected}
          onClick={() => void handleRestSync()}
        >
          Şimdi çek (REST)
        </Button>
        <Button
          icon={<SendOutlined />}
          loading={pushing}
          disabled={!restConnected || loadLogoErpMode() !== 'rest'}
          onClick={() => void handlePushInvoices()}
        >
          Bekleyen faturaları gönder
        </Button>
      </Space>
      {rest.lastSyncAt ? (
        <Text type="secondary">
          Son senkron: {new Date(rest.lastSyncAt).toLocaleString('tr-TR')}
          {rest.lastMessage ? ` — ${rest.lastMessage}` : ''}
        </Text>
      ) : null}
      {message ? <Alert type="info" message={message} /> : null}
    </Space>
  );
}
