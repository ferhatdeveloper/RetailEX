import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Progress, Radio, Space, Typography } from 'antd';
import {
  CloudDownloadOutlined,
  CloudUploadOutlined,
  SwapOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { toast } from 'sonner';
import { IS_TAURI } from '../../utils/env';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../shared/PercentBodyModal';
import {
  DATA_TOPOLOGY_OPTIONS,
  SYNC_DIRECTION_OPTIONS,
  describeDataTopology,
  loadLogoErpSyncFlowSettings,
  saveLogoErpSyncFlowSettings,
  type LogoDataTopology,
  type LogoSyncDirection,
} from '../../services/logoErpSyncFlow';
import { runLogoSyncAction } from '../../services/logoSyncOrchestrator';
import { DB_SETTINGS } from '../../services/postgres';

const { Text, Title } = Typography;

type Props = {
  open: boolean;
  onClose: () => void;
  serviceType: 'rest' | 'lobject';
  connected: boolean;
};

export function LogoSyncActionModal({ open, onClose, serviceType, connected }: Props) {
  const [syncDirection, setSyncDirection] = useState<LogoSyncDirection>('pull_only');
  const [dataTopology, setDataTopology] = useState<LogoDataTopology>('logo_merkez');
  const [autoHybridAfterPull, setAutoHybridAfterPull] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [resultMsg, setResultMsg] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const s = loadLogoErpSyncFlowSettings();
    setSyncDirection(s.syncDirection);
    setDataTopology(s.dataTopology);
    setAutoHybridAfterPull(s.autoHybridAfterPull);
    setLogLines([]);
    setResultMsg('');
    setProgress(0);
  }, [open]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logLines]);

  const appendLog = useCallback((line: string) => {
    setLogLines((prev) => [...prev.slice(-200), line]);
  }, []);

  const persistSettings = useCallback(() => {
    saveLogoErpSyncFlowSettings({ syncDirection, dataTopology, autoHybridAfterPull });
  }, [syncDirection, dataTopology, autoHybridAfterPull]);

  const runAction = async (action: 'pull' | 'push' | 'full') => {
    if (!connected && serviceType === 'rest') {
      toast.error('Önce Logo REST bağlantısını kurun.');
      return;
    }
    persistSettings();
    setRunning(true);
    setProgress(12);
    setResultMsg('');
    setLogLines([]);

    try {
      const r = await runLogoSyncAction(action, {
        serviceType,
        onLog: (line) => {
          appendLog(line);
          setProgress((p) => Math.min(95, p + 4));
        },
      });
      setProgress(100);
      setResultMsg(r.message);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setResultMsg(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  };

  if (!open) return null;

  const topologyOptions = DATA_TOPOLOGY_OPTIONS.filter((o) => {
    if (!IS_TAURI && o.value !== 'logo_merkez') return false;
    return true;
  });

  const pushDisabled = serviceType !== 'rest';
  const hybridHint =
    DB_SETTINGS.activeMode === 'hybrid'
      ? 'Hibrit mod açık — çekim sonrası merkez↔mağaza aktarımı yapılabilir.'
      : 'Hibrit mod kapalı — yalnızca Logo katmanı güncellenir.';

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel="Logo veri alma ve gönderme">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200 shrink-0 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-t-xl">
        <div>
          <Title level={5} style={{ margin: 0, color: '#fff' }}>
            Logo veri alma / gönderme
          </Title>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>
            {serviceType === 'rest' ? 'REST API' : 'MSSQL (LOBJECT)'} · {hybridHint}
          </Text>
        </div>
        <Button type="text" icon={<CloseOutlined />} onClick={onClose} style={{ color: '#fff' }} />
      </div>

      <div className="px-5 py-4 space-y-4 shrink-0 border-b border-gray-100">
        <div>
          <Text strong className="block mb-2">
            Senkron yönü
          </Text>
          <Radio.Group
            value={syncDirection}
            onChange={(e) => setSyncDirection(e.target.value)}
            disabled={running}
          >
            <Space direction="vertical">
              {SYNC_DIRECTION_OPTIONS.map((o) => (
                <Radio key={o.value} value={o.value}>
                  {o.label}
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        </div>

        <div>
          <Text strong className="block mb-2">
            Veri akışı
          </Text>
          <Radio.Group
            value={dataTopology}
            onChange={(e) => setDataTopology(e.target.value)}
            disabled={running}
          >
            <Space direction="vertical">
              {topologyOptions.map((o) => (
                <Radio key={o.value} value={o.value}>
                  {o.label}
                </Radio>
              ))}
            </Space>
          </Radio.Group>
          <Text type="secondary" className="block mt-2 text-xs">
            {describeDataTopology(dataTopology)}
          </Text>
        </div>

        {IS_TAURI && dataTopology !== 'logo_merkez' ? (
          <Checkbox
            checked={autoHybridAfterPull}
            onChange={(e) => setAutoHybridAfterPull(e.target.checked)}
            disabled={running}
          >
            Logo çekiminden sonra hibrit aktarımı otomatik çalıştır
          </Checkbox>
        ) : null}

        <Space wrap>
          <Button
            type="primary"
            icon={<CloudDownloadOutlined />}
            loading={running}
            disabled={!connected && serviceType === 'rest'}
            onClick={() => void runAction('pull')}
          >
            Logo&apos;dan çek
          </Button>
          <Button
            icon={<CloudUploadOutlined />}
            loading={running}
            disabled={pushDisabled || (!connected && serviceType === 'rest')}
            onClick={() => void runAction('push')}
          >
            Logo&apos;ya gönder
          </Button>
          <Button
            icon={<SwapOutlined />}
            loading={running}
            disabled={
              (!connected && serviceType === 'rest') ||
              syncDirection === 'pull_only' ||
              (syncDirection === 'push_only' && pushDisabled)
            }
            onClick={() => void runAction('full')}
          >
            Çek + gönder
          </Button>
        </Space>

        {running ? <Progress percent={progress} status="active" showInfo={false} /> : null}
        {resultMsg ? <Alert type={running ? 'info' : 'success'} message={resultMsg} showIcon /> : null}
      </div>

      <PercentBodyModalScrollBody className="px-5 py-3 bg-gray-50 font-mono text-xs text-gray-700 min-h-[140px]">
        {logLines.length === 0 ? (
          <Text type="secondary">İşlem günlüğü burada görünür…</Text>
        ) : (
          logLines.map((line, i) => (
            <div key={`${i}-${line.slice(0, 24)}`} className="py-0.5 border-b border-gray-100 last:border-0">
              {line}
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </PercentBodyModalScrollBody>

      <div className="px-5 py-3 border-t border-gray-200 shrink-0 flex justify-end">
        <Button onClick={onClose} disabled={running}>
          Kapat
        </Button>
      </div>
    </PercentBodyModal>
  );
}
