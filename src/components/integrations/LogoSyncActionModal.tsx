import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Progress, Radio, Space, Typography } from 'antd';
import {
  ApiOutlined,
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
import {
  loadLogoRestConfig,
  logoTestConnection,
  resolveLogoContext,
} from '../../services/logoRestApi';
import { runLogoSyncAction } from '../../services/logoSyncOrchestrator';
import {
  loadLogoRestSyncSettings,
  saveLogoRestSyncSettings,
  type LogoPushModules,
  type LogoRestSyncModules,
} from '../../services/logoRestSyncService';
import { DB_SETTINGS } from '../../services/postgres';

const { Text, Title } = Typography;

type Props = {
  open: boolean;
  onClose: () => void;
  serviceType: 'rest' | 'lobject';
  connected: boolean;
  /** REST bağlantı testi başarılı olunca (üst bileşen durumunu günceller) */
  onConnectedChange?: (connected: boolean) => void;
};

type PullSel = {
  masterData: boolean;
  customers: boolean;
  suppliers: boolean;
  salesInvoices: boolean;
  purchaseInvoices: boolean;
  itemSlips: boolean;
  banks: boolean;
};

const PULL_LABELS: { key: keyof PullSel; label: string }[] = [
  { key: 'masterData', label: 'Ürün / stok kartları' },
  { key: 'customers', label: 'Müşteri carileri' },
  { key: 'suppliers', label: 'Tedarikçi carileri' },
  { key: 'salesInvoices', label: 'Satış faturaları' },
  { key: 'purchaseInvoices', label: 'Alış faturaları' },
  { key: 'itemSlips', label: 'Malzeme / stok fişleri' },
  { key: 'banks', label: 'Kasa / banka kartları' },
];

const PUSH_LABELS: { key: keyof LogoPushModules; label: string }[] = [
  { key: 'products', label: 'Ürünler (bekleyen)' },
  { key: 'customers', label: 'Müşteriler (bekleyen)' },
  { key: 'suppliers', label: 'Tedarikçiler (bekleyen)' },
  { key: 'invoices', label: 'Satış faturaları (bekleyen)' },
];

export function LogoSyncActionModal({
  open,
  onClose,
  serviceType,
  connected,
  onConnectedChange,
}: Props) {
  const [syncDirection, setSyncDirection] = useState<LogoSyncDirection>('pull_only');
  const [dataTopology, setDataTopology] = useState<LogoDataTopology>('logo_merkez');
  const [autoHybridAfterPull, setAutoHybridAfterPull] = useState(true);
  const [pullMode, setPullMode] = useState<'incremental' | 'full'>('incremental');
  const [pullSel, setPullSel] = useState<PullSel>({
    masterData: true,
    customers: true,
    suppliers: true,
    salesInvoices: true,
    purchaseInvoices: true,
    itemSlips: true,
    banks: true,
  });
  const [pushSel, setPushSel] = useState<LogoPushModules>({
    products: true,
    customers: true,
    suppliers: true,
    invoices: true,
  });
  const [isConnected, setIsConnected] = useState(connected);
  const [testingConn, setTestingConn] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [resultMsg, setResultMsg] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const s = loadLogoErpSyncFlowSettings();
    const rest = loadLogoRestSyncSettings();
    setSyncDirection(s.syncDirection);
    setDataTopology(s.dataTopology);
    setAutoHybridAfterPull(s.autoHybridAfterPull);
    setPullMode(rest.pullMode);
    setPullSel({
      masterData: rest.modules.masterData,
      customers: rest.modules.customers,
      suppliers: rest.modules.suppliers,
      salesInvoices: rest.modules.salesInvoices,
      purchaseInvoices: rest.modules.purchaseInvoices,
      itemSlips: rest.modules.itemSlips,
      banks: rest.modules.banks,
    });
    setPushSel({ ...rest.pushModules });
    setIsConnected(connected || serviceType === 'lobject');
    setLogLines([]);
    setResultMsg('');
    setProgress(0);
  }, [open, connected, serviceType]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logLines]);

  const appendLog = useCallback((line: string) => {
    setLogLines((prev) => [...prev.slice(-200), line]);
  }, []);

  const persistSettings = useCallback(() => {
    saveLogoErpSyncFlowSettings({ syncDirection, dataTopology, autoHybridAfterPull });
    saveLogoRestSyncSettings({
      pullMode,
      modules: {
        ...loadLogoRestSyncSettings().modules,
        ...pullSel,
        salesOrders: false,
        purchaseOrders: false,
      },
      pushModules: pushSel,
    });
  }, [syncDirection, dataTopology, autoHybridAfterPull, pullMode, pullSel, pushSel]);

  const testRestConnection = async () => {
    if (serviceType !== 'rest') {
      toast.info('Bağlantı kontrolü REST Servis modunda kullanılır.');
      return;
    }
    setTestingConn(true);
    appendLog(`[${new Date().toLocaleTimeString('tr-TR')}] Logo REST bağlantı kontrolü…`);
    try {
      const cfg = loadLogoRestConfig();
      if (!String(cfg.baseUrl || '').trim()) {
        const msg = 'REST adresi boş — Genel sekmesinde Logo REST URL girin.';
        toast.error(msg);
        appendLog(msg);
        setIsConnected(false);
        onConnectedChange?.(false);
        return;
      }
      const result = await logoTestConnection(cfg);
      if (result.ok) {
        const ctx = result.context ?? resolveLogoContext(cfg);
        const detail =
          `Bağlantı başarılı · firma ${result.currentFirm ?? ctx.firmNr}` +
          ` / dönem ${result.currentPeriod ?? ctx.periodNr}` +
          (ctx.logoDb ? ` · ${ctx.logoDb}` : '') +
          (result.databases?.length ? ` · ${result.databases.length} DB` : '');
        toast.success(detail);
        appendLog(`[${new Date().toLocaleTimeString('tr-TR')}] ${detail}`);
        setIsConnected(true);
        onConnectedChange?.(true);
        window.dispatchEvent(new CustomEvent('retailex:logo-rest-connected'));
        setResultMsg(detail);
      } else {
        const msg = result.error || 'Logo REST bağlantısı başarısız';
        toast.error(msg, { duration: 12_000 });
        appendLog(`[${new Date().toLocaleTimeString('tr-TR')}] HATA: ${msg}`);
        setIsConnected(false);
        onConnectedChange?.(false);
        setResultMsg(msg);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
      appendLog(`[${new Date().toLocaleTimeString('tr-TR')}] HATA: ${msg}`);
      setIsConnected(false);
      onConnectedChange?.(false);
    } finally {
      setTestingConn(false);
    }
  };

  const runAction = async (action: 'pull' | 'push' | 'full') => {
    if (!isConnected && serviceType === 'rest') {
      toast.error('Önce «Bağlantı kontrol» ile Logo REST’e bağlanın.');
      return;
    }
    if (action !== 'push') {
      const anyPull = Object.values(pullSel).some(Boolean);
      if (!anyPull) {
        toast.error("Logo'dan çekmek için en az bir veri türü seçin.");
        return;
      }
    }
    if (action !== 'pull') {
      const anyPush = Object.values(pushSel).some(Boolean);
      if (!anyPush && (action === 'push' || syncDirection !== 'pull_only')) {
        toast.error("Logo'ya göndermek için en az bir veri türü seçin.");
        return;
      }
    }

    persistSettings();
    setRunning(true);
    setProgress(12);
    setResultMsg('');
    setLogLines([]);

    const pullModules: Partial<LogoRestSyncModules> = {
      ...pullSel,
      salesOrders: false,
      purchaseOrders: false,
    };

    try {
      const r = await runLogoSyncAction(action, {
        serviceType,
        pullModules,
        pullMode,
        pushModules: pushSel,
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

  const showPull = syncDirection !== 'push_only';
  const showPush = syncDirection !== 'pull_only' && !pushDisabled;

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
        {serviceType === 'rest' ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type={isConnected ? 'default' : 'primary'}
              icon={<ApiOutlined />}
              loading={testingConn}
              disabled={running}
              onClick={() => void testRestConnection()}
            >
              Bağlantı kontrol
            </Button>
            <Text type={isConnected ? 'success' : 'danger'} className="text-sm">
              {isConnected ? 'REST bağlı' : 'REST bağlı değil — önce bağlantıyı kontrol edin'}
            </Text>
          </div>
        ) : null}

        {!isConnected && serviceType === 'rest' ? (
          <Alert
            type="warning"
            showIcon
            message="Logo REST oturumu yok. «Bağlantı kontrol» ile bağlanın (URL / kullanıcı Genel sekmesinde kayıtlı olmalı)."
          />
        ) : null}

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

        {showPull ? (
          <div>
            <Text strong className="block mb-2">
              Logo&apos;dan çekilecekler
            </Text>
            <Radio.Group
              value={pullMode}
              onChange={(e) => setPullMode(e.target.value)}
              disabled={running}
              className="mb-2 block"
            >
              <Radio value="incremental">Yalnızca değişenler (önerilen)</Radio>
              <Radio value="full">Tam senkron (tüm kayıtlar)</Radio>
            </Radio.Group>
            <Text type="secondary" className="block mb-2 text-xs">
              Artımlı mod son senkron tarihinden (ve belge gün penceresinden) sonraki kayıtları alır;
              her seferinde baştan tüm listeyi çekmez.
            </Text>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {PULL_LABELS.map((o) => (
                <Checkbox
                  key={o.key}
                  checked={pullSel[o.key]}
                  disabled={running}
                  onChange={(e) => setPullSel((p) => ({ ...p, [o.key]: e.target.checked }))}
                >
                  {o.label}
                </Checkbox>
              ))}
            </div>
          </div>
        ) : null}

        {showPush ? (
          <div>
            <Text strong className="block mb-2">
              Logo&apos;ya gönderilecekler
            </Text>
            <Text type="secondary" className="block mb-2 text-xs">
              Yalnızca RetailEX&apos;te «bekleyen» (logo_sync_status=pending) kayıtlar gönderilir.
            </Text>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {PUSH_LABELS.map((o) => (
                <Checkbox
                  key={o.key}
                  checked={pushSel[o.key]}
                  disabled={running || pushDisabled}
                  onChange={(e) => setPushSel((p) => ({ ...p, [o.key]: e.target.checked }))}
                >
                  {o.label}
                </Checkbox>
              ))}
            </div>
          </div>
        ) : null}

        <Space wrap>
          <Button
            type="primary"
            icon={<CloudDownloadOutlined />}
            loading={running}
            disabled={(!isConnected && serviceType === 'rest') || syncDirection === 'push_only' || testingConn}
            onClick={() => void runAction('pull')}
          >
            Logo&apos;dan çek
          </Button>
          <Button
            icon={<CloudUploadOutlined />}
            loading={running}
            disabled={
              pushDisabled ||
              (!isConnected && serviceType === 'rest') ||
              syncDirection === 'pull_only' ||
              testingConn
            }
            onClick={() => void runAction('push')}
          >
            Logo&apos;ya gönder
          </Button>
          <Button
            icon={<SwapOutlined />}
            loading={running}
            disabled={
              (!isConnected && serviceType === 'rest') ||
              syncDirection === 'pull_only' ||
              (syncDirection === 'push_only' && pushDisabled) ||
              testingConn
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
