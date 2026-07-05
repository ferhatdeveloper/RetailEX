import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Space, Typography } from 'antd';
import { CloudDownloadOutlined, SwapOutlined } from '@ant-design/icons';
import { toast } from 'sonner';
import { IS_TAURI } from '../../utils/env';
import {
  loadLogoRestConfig,
  loadLogoRestSession,
  logoTestConnection,
  getLogoMappingForErp,
  resolveLogoContext,
} from '../../services/logoRestApi';
import { loadLogoErpMode } from '../../services/logoErpMode';
import {
  loadLogoRestSyncSettings,
} from '../../services/logoRestSyncService';
import { loadLogoMssqlSyncSettings } from '../../services/logoMssqlSyncService';
import {
  labelDataTopology,
  labelSyncDirection,
  loadLogoErpSyncFlowSettings,
} from '../../services/logoErpSyncFlow';
import { LogoImportPreviewTabs } from './LogoImportPreviewTabs';
import { LogoSyncActionModal } from './LogoSyncActionModal';

const { Text } = Typography;

type Props = {
  serviceType: 'rest' | 'lobject';
};

export function LogoErpSyncCollapse({ serviceType }: Props) {
  const [restConnected, setRestConnected] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [flowVersion, setFlowVersion] = useState(0);

  const checkRest = useCallback(async () => {
    if (serviceType !== 'rest') return;
    const session = loadLogoRestSession();
    if (session && Date.now() < session.expiresAt) {
      setRestConnected(true);
      return;
    }
    const cfg = loadLogoRestConfig();
    const r = await logoTestConnection(cfg);
    setRestConnected(r.ok);
  }, [serviceType]);

  useEffect(() => {
    void checkRest();
    const onSaved = () => void checkRest();
    const onFlow = () => setFlowVersion((v) => v + 1);
    window.addEventListener('retailex:logo-settings-saved', onSaved);
    window.addEventListener('retailex:logo-rest-connected', onSaved);
    window.addEventListener('retailex:logo-sync-flow-saved', onFlow);
    return () => {
      window.removeEventListener('retailex:logo-settings-saved', onSaved);
      window.removeEventListener('retailex:logo-rest-connected', onSaved);
      window.removeEventListener('retailex:logo-sync-flow-saved', onFlow);
    };
  }, [checkRest]);

  const flow = loadLogoErpSyncFlowSettings();
  void flowVersion;

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
        <Alert
          type="info"
          showIcon
          message={
            <>
              REST yerine doğrudan Logo SQL Server kullanılır. Ayrı{' '}
              <Text strong>RetailEX-Logo-Connector</Text> Windows servisi artık gerekli değil —
              senkron Tauri içinde çalışır.
            </>
          }
        />
        <Text type="secondary">
          Yön: {labelSyncDirection(flow.syncDirection)} · Akış: {labelDataTopology(flow.dataTopology)}
        </Text>
        <Text type="secondary">
          Periyodik senkron: {mssql.enabled ? `Açık (${mssql.intervalMinutes} dk)` : 'Kapalı'}
        </Text>
        <Button
          type="primary"
          size="large"
          icon={<SwapOutlined />}
          onClick={() => setModalOpen(true)}
        >
          Veri al / gönder…
        </Button>
        {mssql.lastSyncAt ? (
          <Text type="secondary">
            Son senkron: {new Date(mssql.lastSyncAt).toLocaleString('tr-TR')}
            {mssql.lastMessage ? ` — ${mssql.lastMessage}` : ''}
          </Text>
        ) : null}
        <LogoSyncActionModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          serviceType="lobject"
          connected
        />
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

      <Alert
        type="info"
        showIcon
        message="Web senkronu Logo REST + pg_bridge üzerinden çalışır; ayrı connector kurulumu gerekmez."
      />

      <Text type="secondary">
        Yön: {labelSyncDirection(flow.syncDirection)} · Akış: {labelDataTopology(flow.dataTopology)}
        {' · '}
        Otomatik çekim: {rest.enabled ? `Açık (${rest.intervalMinutes} dk)` : 'Kapalı'}
      </Text>

      <Space wrap>
        <Button
          type="primary"
          size="large"
          icon={<CloudDownloadOutlined />}
          disabled={!restConnected}
          onClick={() => setModalOpen(true)}
        >
          Veri al / gönder…
        </Button>
      </Space>

      {rest.lastSyncAt ? (
        <Text type="secondary">
          Son senkron: {new Date(rest.lastSyncAt).toLocaleString('tr-TR')}
          {rest.lastMessage ? ` — ${rest.lastMessage}` : ''}
        </Text>
      ) : null}

      <LogoSyncActionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        serviceType="rest"
        connected={restConnected}
      />
    </Space>
  );
}
