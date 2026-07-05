import { useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  AlertCircle,
  Loader2,
  Download,
  RefreshCw,
  Server,
  FileText,
  CheckCircle,
  XCircle,
  Database,
  Plus,
  Search,
} from 'lucide-react';
import {
  LOGO_API_URL_EXAMPLE,
  LOGO_DEFAULT_CLIENT_ID,
  LOGO_KEY_RESOURCES,
  loadLogoRestConfig,
  saveLogoRestConfig,
  logoTestConnection,
  logoGetDataPreview,
  logoListResource,
  logoCreateResource,
  logoDescribeServices,
  logoRevokeSession,
  logoListFirmCatalog,
  logoSwitchContext,
  resolveLogoContext,
  syncLogoRestUrlFromWebConfig,
  setLogoRestBaseUrl,
  getErpFirmPeriodLabel,
  getErpFirmKey,
  getLogoMappingForErp,
  saveLogoFirmMappingForErp,
  saveLogoFirmCatalog,
  periodsForFirm,
  getLogoCloudWebPrivateUrlHint,
  type LogoRestConfig,
  type LogoDataPreview,
  type LogoDescribeEntry,
  type LogoFirmOption,
  type LogoPeriodOption,
} from '../../services/logoRestApi';
import {
  syncLogoAllFromRest,
  type LogoSyncLogEntry,
  type LogoSyncProgress,
  type LogoSyncResult,
} from '../../services/logoRestSync';
import {
  loadLogoRestSyncSettings,
  saveLogoRestSyncSettings,
  runLogoRestSyncNow,
  startLogoRestAutoSync,
  stopLogoRestAutoSync,
  subscribeLogoRestSyncLogs,
  type LogoRestSyncSettings,
} from '../../services/logoRestSyncService';
import { loadLogoErpMode } from '../../services/logoErpMode';
import {
  getLogoInvoicePushIntervalSec,
  isLogoInvoiceAutoPushEnabled,
  pushPendingSalesToLogo,
  setLogoInvoiceAutoPushEnabled,
  setLogoInvoicePushIntervalSec,
  startLogoInvoiceAutoPush,
  stopLogoInvoiceAutoPush,
} from '../../services/logoRestInvoicePush';
import { useProductStore } from '../../store/useProductStore';
import { useCustomerStore } from '../../store/useCustomerStore';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';

import type { LogoErpPanelTab } from './logoErpPanelTypes';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

function Field({
  label,
  required,
  children,
  className = '',
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-medium text-gray-600 mb-1">
        {label}
        {required ? <span className="text-red-500 ml-0.5">*</span> : null}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full h-9 px-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-400';

type LogoTigerRestPanelProps = {
  activeTab?: LogoErpPanelTab;
};

export function LogoTigerRestPanel({ activeTab = 'general' }: LogoTigerRestPanelProps) {
  const [config, setConfig] = useState<LogoRestConfig>(() => loadLogoRestConfig());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [connectionError, setConnectionError] = useState('');
  const [erpFirmPeriod, setErpFirmPeriod] = useState(getErpFirmPeriodLabel);

  const [previewData, setPreviewData] = useState<LogoDataPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const [services, setServices] = useState<LogoDescribeEntry[]>([]);
  const [selectedResource, setSelectedResource] = useState('items');
  const [resourceFilter, setResourceFilter] = useState('');
  const [listResult, setListResult] = useState<{ count: number | null; items: unknown[] } | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(false);

  const [createJson, setCreateJson] = useState('{\n  "CODE": "REX-001",\n  "NAME": "RetailEX Ürün"\n}');
  const [createMsg, setCreateMsg] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [firms, setFirms] = useState<LogoFirmOption[]>(() => loadLogoRestConfig().firmCatalog ?? []);
  const [periods, setPeriods] = useState<LogoPeriodOption[]>([]);
  const [isLoadingFirms, setIsLoadingFirms] = useState(false);
  const [activeContext, setActiveContext] = useState(() => resolveLogoContext(loadLogoRestConfig()));

  const [syncOptions, setSyncOptions] = useState(() => {
    const m = loadLogoRestSyncSettings().modules;
    return {
      products: m.masterData,
      customers: m.customers,
      suppliers: m.suppliers,
      salesInvoices: m.salesInvoices,
      purchaseInvoices: m.purchaseInvoices,
      itemSlips: m.itemSlips,
      banks: m.banks,
      salesOrders: m.salesOrders,
      purchaseOrders: m.purchaseOrders,
    };
  });
  const [restAutoSync, setRestAutoSync] = useState<LogoRestSyncSettings>(() => loadLogoRestSyncSettings());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<LogoSyncProgress | null>(null);
  const [syncResult, setSyncResult] = useState<LogoSyncResult | null>(null);
  const [syncLog, setSyncLog] = useState<LogoSyncLogEntry[]>([]);
  const [autoInvoicePush, setAutoInvoicePush] = useState(() => isLogoInvoiceAutoPushEnabled());
  const [invoicePushInterval, setInvoicePushInterval] = useState(() => getLogoInvoicePushIntervalSec());
  const [isPushingInvoices, setIsPushingInvoices] = useState(false);
  const [invoicePushMsg, setInvoicePushMsg] = useState('');

  const appendSyncLog = useCallback((entry: LogoSyncLogEntry) => {
    setSyncLog((prev) => [...prev.slice(-199), entry]);
  }, []);

  const loadProducts = useProductStore((s) => s.loadProducts);
  const loadCustomers = useCustomerStore((s) => s.loadCustomers);
  const { selectedFirm, selectedPeriod } = useFirmaDonem();

  const logoDbOptions = Array.from(
    new Set([...(config.logoDbs || []), config.logoDb].filter((x) => x && String(x).trim()))
  ) as string[];

  const refreshErpContext = useCallback(() => {
    setErpFirmPeriod(getErpFirmPeriodLabel());
    setActiveContext(resolveLogoContext(config));
  }, [config]);

  useEffect(() => {
    syncLogoRestUrlFromWebConfig();
    const loaded = loadLogoRestConfig();
    setConfig(loaded);
    setFirms(loaded.firmCatalog ?? []);
    refreshErpContext();
    const mapping = getLogoMappingForErp(loaded);
    if (mapping) {
      setPeriods(periodsForFirm(loaded.firmCatalog ?? [], mapping.logoFirmNr));
    }
    const onStorage = () => {
      syncLogoRestUrlFromWebConfig();
      const cfg = loadLogoRestConfig();
      setConfig(cfg);
      setFirms(cfg.firmCatalog ?? []);
      refreshErpContext();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refreshErpContext]);

  useEffect(() => {
    refreshErpContext();
    const mapping = getLogoMappingForErp(config);
    setActiveContext(resolveLogoContext(config));
    if (mapping && firms.length > 0) {
      setPeriods(periodsForFirm(firms, mapping.logoFirmNr));
    }
  }, [selectedFirm?.firm_nr, selectedPeriod?.nr, config, firms, refreshErpContext]);

  useEffect(() => {
    if (connectionStatus !== 'connected' || !autoInvoicePush) {
      stopLogoInvoiceAutoPush();
      return;
    }
    startLogoInvoiceAutoPush(config, appendSyncLog);
    return () => stopLogoInvoiceAutoPush();
  }, [connectionStatus, autoInvoicePush, config, appendSyncLog, invoicePushInterval]);

  useEffect(() => {
    if (connectionStatus !== 'connected' || loadLogoErpMode() !== 'rest') {
      stopLogoRestAutoSync();
      return;
    }
    const stop = startLogoRestAutoSync();
    const unsub = subscribeLogoRestSyncLogs((line) => appendSyncLog({
      at: new Date().toISOString(),
      entity: 'system',
      action: 'read',
      code: 'auto',
      detail: line,
      ok: true,
    }));
    return () => {
      stop();
      unsub();
    };
  }, [connectionStatus, restAutoSync.enabled, restAutoSync.intervalMinutes, appendSyncLog]);

  const updateConfig = (patch: Partial<LogoRestConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      saveLogoRestConfig(next);
      setActiveContext(resolveLogoContext(next));
      if (patch.selectedFirmNr != null) {
        setPeriods(periodsForFirm(firms, patch.selectedFirmNr));
      }
      return next;
    });
  };

  const handleBaseUrlChange = (url: string) => {
    setLogoRestBaseUrl(url, { manual: true });
    setConfig(loadLogoRestConfig());
    setActiveContext(resolveLogoContext(loadLogoRestConfig()));
  };

  const persistMappingForCurrentErp = (
    logoFirmNr: number,
    logoPeriodNr: number,
    patch?: { logoDb?: string; firm?: LogoFirmOption }
  ) => {
    const firm = patch?.firm ?? firms.find((f) => f.firmNr === logoFirmNr);
    const next = saveLogoFirmMappingForErp(config, {
      logoFirmNr,
      logoPeriodNr,
      logoDb: patch?.logoDb ?? config.logoDb,
      logoFirmName: firm?.name,
      logoFirmTitle: firm?.title || firm?.name,
    });
    setConfig(next);
    setActiveContext(resolveLogoContext(next));
    return next;
  };

  const handleLoadFirms = async () => {
    setIsLoadingFirms(true);
    setConnectionError('');
    try {
      const list = await logoListFirmCatalog(config);
      setFirms(list);
      const next = saveLogoFirmCatalog(config, list);
      setConfig(next);

      const erpKey = getErpFirmKey();
      const existing = next.firmMappings?.[erpKey];
      const ctx = resolveLogoContext(next);
      const match =
        list.find((f) => f.firmNr === existing?.logoFirmNr) ??
        list.find((f) => f.firmNr === ctx.firmNr) ??
        list[0];

      if (match) {
        const pList = match.periods;
        setPeriods(pList);
        const periodNr =
          existing?.logoPeriodNr && existing.logoPeriodNr > 0
            ? existing.logoPeriodNr
            : match.defaultPeriod ?? pList.find((p) => p.active)?.number ?? pList[0]?.number ?? 1;
        if (!existing?.logoFirmNr && list.length === 1) {
          persistMappingForCurrentErp(match.firmNr, periodNr, { firm: match });
        }
      }
    } catch (e: unknown) {
      setConnectionError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoadingFirms(false);
    }
  };

  const handleFirmChange = (firmNr: number) => {
    const firm = firms.find((f) => f.firmNr === firmNr);
    const pList = periodsForFirm(firms, firmNr);
    setPeriods(pList);
    const defaultP = firm?.defaultPeriod ?? pList.find((p) => p.active)?.number ?? pList[0]?.number ?? 1;
    persistMappingForCurrentErp(firmNr, defaultP, { firm });
  };

  const handlePeriodChange = (periodNr: number) => {
    const mapping = getLogoMappingForErp(config);
    const firmNr = mapping?.logoFirmNr ?? config.selectedFirmNr ?? resolveLogoContext(config).firmNr;
    persistMappingForCurrentErp(firmNr, periodNr);
  };

  const handleDbChange = (logoDb: string) => {
    const mapping = getLogoMappingForErp(config);
    if (mapping) {
      const next = saveLogoFirmMappingForErp(config, { ...mapping, logoDb });
      setConfig(next);
      setActiveContext(resolveLogoContext(next));
    } else {
      updateConfig({ logoDb });
    }
  };

  const handleTestConnection = async () => {
    setConnectionStatus('connecting');
    setConnectionError('');
    refreshErpContext();

    const result = await logoTestConnection(config);
    if (result.ok) {
      setConnectionStatus('connected');
      if (result.context) setActiveContext(result.context);
      void handleLoadFirms();
    } else {
      setConnectionStatus('error');
      setConnectionError(result.error || 'Bağlantı hatası');
    }
  };

  const handleApplyContext = async () => {
    setConnectionStatus('connecting');
    setConnectionError('');
    try {
      const ctx = resolveLogoContext(config);
      await logoSwitchContext(config, {
        logoDb: ctx.logoDb,
        firmNr: ctx.firmNr,
        periodNr: ctx.periodNr,
        useErpContext: config.useErpContext,
      });
      const reloaded = loadLogoRestConfig();
      setConfig(reloaded);
      setActiveContext(resolveLogoContext(reloaded));
      setConnectionStatus('connected');
      setPreviewData(null);
      setListResult(null);
    } catch (e: unknown) {
      setConnectionStatus('error');
      setConnectionError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDisconnect = async () => {
    await logoRevokeSession(config);
    setConnectionStatus('disconnected');
    setPreviewData(null);
    setListResult(null);
    setServices([]);
  };

  const handleLoadPreview = async () => {
    if (connectionStatus !== 'connected') return;
    setIsLoadingPreview(true);
    try {
      const data = await logoGetDataPreview(config);
      setPreviewData(data);
    } catch (e: unknown) {
      setConnectionError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleLoadServices = async () => {
    if (connectionStatus !== 'connected') return;
    try {
      const list = await logoDescribeServices(config);
      setServices(list);
    } catch (e: unknown) {
      setConnectionError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleFetchResource = async () => {
    if (connectionStatus !== 'connected' || !selectedResource) return;
    setIsLoadingList(true);
    setListResult(null);
    try {
      const r = await logoListResource(config, selectedResource, {
        limit: 25,
        withCount: true,
        q: resourceFilter.trim() || undefined,
      });
      setListResult({ count: r.count, items: r.items });
    } catch (e: unknown) {
      setConnectionError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoadingList(false);
    }
  };

  const handleCreateResource = async () => {
    if (connectionStatus !== 'connected' || !selectedResource) return;
    setIsCreating(true);
    setCreateMsg('');
    try {
      const parsed = JSON.parse(createJson) as Record<string, unknown>;
      const created = await logoCreateResource(config, selectedResource, parsed);
      setCreateMsg('Kayıt oluşturuldu.');
      setListResult(null);
      console.log('[Logo REST] created', created);
    } catch (e: unknown) {
      setCreateMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setIsCreating(false);
    }
  };

  const handleSyncFromLogo = async () => {
    if (connectionStatus !== 'connected') {
      setConnectionError('Önce Logo bağlantısını test edin (Bağlan).');
      return;
    }
    setIsSyncing(true);
    setSyncProgress(null);
    setSyncResult(null);
    setSyncLog([]);
    setConnectionError('');
    try {
      const result = await syncLogoAllFromRest(
        config,
        {
          products: syncOptions.products,
          customers: syncOptions.customers,
          suppliers: syncOptions.suppliers,
          salesInvoices: syncOptions.salesInvoices,
          purchaseInvoices: syncOptions.purchaseInvoices,
          itemSlips: syncOptions.itemSlips,
          banks: syncOptions.banks,
          salesOrders: syncOptions.salesOrders,
          purchaseOrders: syncOptions.purchaseOrders,
          onLog: appendSyncLog,
        },
        (p) => {
          setSyncProgress(p);
          if (p.lastLog) appendSyncLog(p.lastLog);
        }
      );
      setSyncResult(result);
      if (!result.ok) {
        setConnectionError(result.error || 'Senkronizasyon başarısız');
        return;
      }
      await Promise.all([
        syncOptions.products ? loadProducts(true) : Promise.resolve(),
        syncOptions.customers ? loadCustomers() : Promise.resolve(),
      ]);
    } catch (e: unknown) {
      setConnectionError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePushInvoicesNow = async () => {
    if (connectionStatus !== 'connected') return;
    setIsPushingInvoices(true);
    setInvoicePushMsg('');
    try {
      const r = await pushPendingSalesToLogo(config, { onLog: appendSyncLog, limit: 25 });
      setInvoicePushMsg(r.messages.join(' · '));
    } catch (e: unknown) {
      setInvoicePushMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setIsPushingInvoices(false);
    }
  };

  const handleToggleAutoInvoicePush = (enabled: boolean) => {
    setAutoInvoicePush(enabled);
    setLogoInvoiceAutoPushEnabled(enabled);
    if (!enabled) stopLogoInvoiceAutoPush();
  };

  const handleInvoiceIntervalChange = (sec: number) => {
    const v = Math.max(30, Math.min(3600, sec));
    setInvoicePushInterval(v);
    setLogoInvoicePushIntervalSec(v);
  };

  const resourceLabel: Record<string, string> = {
    items: 'Ürünler',
    Arps: 'Cari hesaplar',
    customers: 'Müşteriler',
    salesInvoices: 'Satış faturaları',
    purchaseInvoices: 'Alış faturaları',
    salesOrders: 'Satış siparişleri',
    purchaseOrders: 'Alış siparişleri',
    itemSlips: 'Malzeme fişleri',
    GLAccounts: 'Muhasebe hesapları',
  };

  const savedMapping = getLogoMappingForErp(config);
  const mappedFirmNr = savedMapping?.logoFirmNr ?? activeContext.firmNr;
  const mappedPeriodNr = savedMapping?.logoPeriodNr ?? activeContext.periodNr;

  const statusBadge =
    connectionStatus === 'connected' ? (
      <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
        <CheckCircle className="w-3 h-3" /> Bağlı
      </span>
    ) : connectionStatus === 'error' ? (
      <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
        <XCircle className="w-3 h-3" /> Hata
      </span>
    ) : null;

  if (activeTab === 'general') {
    return (
      <div className="space-y-4">
        <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2">
          <span className="text-gray-600">
            RetailEX: <code className="font-mono">firma {erpFirmPeriod.firmLabel}</code>
            {' · '}
            <code className="font-mono">dönem {erpFirmPeriod.periodLabel}</code>
          </span>
          {statusBadge}
          {savedMapping && (
            <span className="text-blue-800">
              Logo eşlemesi: <strong>{savedMapping.logoFirmNr}</strong> / dönem{' '}
              <strong>{savedMapping.logoPeriodNr}</strong>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Sol — firma / dönem / DB */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-3">
            <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              Logo bağlamı
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Logo firma" required>
                <select
                  value={mappedFirmNr || ''}
                  onChange={(e) => handleFirmChange(Number(e.target.value))}
                  className={inputCls}
                >
                  <option value="">Seçin…</option>
                  {firms.map((f) => (
                    <option key={f.firmNr} value={f.firmNr}>
                      {f.firmNr} — {f.title || f.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Logo dönem" required>
                <select
                  value={mappedPeriodNr || ''}
                  onChange={(e) => handlePeriodChange(Number(e.target.value))}
                  className={inputCls}
                  disabled={!periods.length}
                >
                  <option value="">Seçin…</option>
                  {periods.map((p) => (
                    <option key={p.number} value={p.number}>
                      {p.number}
                      {p.active ? ' (aktif)' : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Veritabanı (logodb)" className="col-span-2">
                <select
                  value={config.logoDb || ''}
                  onChange={(e) => handleDbChange(e.target.value)}
                  className={`${inputCls} font-mono`}
                >
                  <option value="">Varsayılan</option>
                  {logoDbOptions.map((db) => (
                    <option key={db} value={db}>{db}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleLoadFirms}
                disabled={isLoadingFirms || !config.username || !config.password}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg hover:bg-white disabled:opacity-50 inline-flex items-center gap-1"
              >
                {isLoadingFirms ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Firmaları yükle
              </button>
              {connectionStatus === 'connected' && (
                <button
                  type="button"
                  onClick={handleApplyContext}
                  className="px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Bağlamı uygula
                </button>
              )}
            </div>
          </div>

          {/* Sağ — REST servis */}
          <div className="rounded-lg border border-orange-200 bg-orange-50/30 p-4 space-y-3">
            <h4 className="text-xs font-semibold text-orange-800 uppercase tracking-wide flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" />
              REST Service
            </h4>
            <Field label="Rest Entegrasyon API" required>
              <input
                type="text"
                value={config.baseUrl}
                onChange={(e) => handleBaseUrlChange(e.target.value)}
                placeholder={LOGO_API_URL_EXAMPLE}
                className={`${inputCls} font-mono`}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Logo kullanıcı adı" required>
                <input
                  type="text"
                  value={config.username}
                  onChange={(e) => updateConfig({ username: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Logo şifre" required>
                <input
                  type="password"
                  value={config.password}
                  onChange={(e) => updateConfig({ password: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Rest Client Id">
                <input
                  type="text"
                  value={config.clientId}
                  onChange={(e) => updateConfig({ clientId: e.target.value })}
                  placeholder={LOGO_DEFAULT_CLIENT_ID}
                  className={`${inputCls} font-mono`}
                />
              </Field>
              <Field label="Rest Client Secret">
                <input
                  type="password"
                  value={config.clientSecret}
                  onChange={(e) => updateConfig({ clientSecret: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Firma No">
                <input
                  type="text"
                  readOnly
                  value={String(mappedFirmNr || '')}
                  className={`${inputCls} bg-gray-50`}
                />
              </Field>
            </div>
            {getLogoCloudWebPrivateUrlHint(config.baseUrl) && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                {getLogoCloudWebPrivateUrlHint(config.baseUrl)}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={!config.baseUrl?.trim() || !config.username || !config.password || connectionStatus === 'connecting'}
                className="px-3 py-1.5 text-xs bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 inline-flex items-center gap-1"
              >
                {connectionStatus === 'connecting' ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                Bağlan
              </button>
              {connectionStatus === 'connected' && (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-white"
                >
                  Oturumu kapat
                </button>
              )}
            </div>
          </div>
        </div>

        {connectionError && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {connectionError}
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'params') {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 p-4 space-y-4">
          <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Otomatik aktarım</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            {(
              [
                ['products', 'Ürün kartları otomatik gönderilsin'],
                ['customers', 'Cari hesap kartları otomatik gönderilsin'],
                ['suppliers', 'Tedarikçi kartları otomatik gönderilsin'],
                ['salesInvoices', 'Satış faturaları'],
                ['purchaseInvoices', 'Alış faturaları'],
                ['itemSlips', 'Stok fişleri'],
                ['banks', 'Kasa / banka'],
                ['salesOrders', 'Satış siparişleri'],
                ['purchaseOrders', 'Alış siparişleri'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-2 cursor-pointer border-b border-dashed border-gray-100 pb-2">
                <span className="text-gray-700 text-xs">{label}</span>
                <select
                  value={syncOptions[key] ? 'yes' : 'no'}
                  onChange={(e) => {
                    const checked = e.target.value === 'yes';
                    const next = { ...syncOptions, [key]: checked };
                    setSyncOptions(next);
                    const mapKey = key === 'products' ? 'masterData' : key;
                    saveLogoRestSyncSettings({
                      modules: { ...restAutoSync.modules, [mapKey]: checked },
                    });
                    setRestAutoSync(loadLogoRestSyncSettings());
                  }}
                  className="h-8 text-xs border border-gray-200 rounded-lg px-2 bg-white"
                >
                  <option value="no">Hayır</option>
                  <option value="yes">Evet</option>
                </select>
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex items-center justify-between gap-2 text-sm">
            <span className="text-gray-700">Periyodik otomatik çekim</span>
            <select
              value={restAutoSync.enabled ? 'yes' : 'no'}
              onChange={(e) => {
                const next = saveLogoRestSyncSettings({ enabled: e.target.value === 'yes' });
                setRestAutoSync(next);
              }}
              className="h-8 text-xs border border-gray-200 rounded-lg px-2"
            >
              <option value="no">Hayır</option>
              <option value="yes">Evet</option>
            </select>
          </label>
          <Field label="Çekim aralığı (dk)">
            <input
              type="number"
              min={5}
              max={1440}
              value={restAutoSync.intervalMinutes}
              onChange={(e) => {
                const next = saveLogoRestSyncSettings({
                  intervalMinutes: Math.min(1440, Math.max(5, parseInt(e.target.value, 10) || 30)),
                });
                setRestAutoSync(next);
              }}
              className={inputCls}
            />
          </Field>
          <label className="flex items-center justify-between gap-2 text-sm">
            <span className="text-gray-700">Faturaları Logo&apos;ya otomatik gönder</span>
            <select
              value={autoInvoicePush ? 'yes' : 'no'}
              onChange={(e) => handleToggleAutoInvoicePush(e.target.value === 'yes')}
              className="h-8 text-xs border border-gray-200 rounded-lg px-2"
            >
              <option value="no">Hayır</option>
              <option value="yes">Evet</option>
            </select>
          </label>
          <Field label="Fatura gönderim aralığı (sn)">
            <input
              type="number"
              min={30}
              max={3600}
              value={invoicePushInterval}
              onChange={(e) => handleInvoiceIntervalChange(Number(e.target.value))}
              className={inputCls}
            />
          </Field>
        </div>
      </div>
    );
  }

  /* activeTab === 'sync' */
  return (
    <div className="space-y-4">
      {connectionStatus !== 'connected' && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Senkron işlemleri için önce <strong>Genel</strong> sekmesinden Logo REST bağlantısını kurun.
        </p>
      )}

      {/* LEGACY_SYNC_BODY */}
      {connectionStatus === 'connected' && (
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Logo veri özeti</h4>
            {!previewData && (
              <button
                type="button"
                onClick={handleLoadPreview}
                disabled={isLoadingPreview}
                className="px-2.5 py-1 text-xs bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 inline-flex items-center gap-1"
              >
                {isLoadingPreview ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                Sayıları getir
              </button>
            )}
          </div>
          {previewData && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(previewData.resources).map(([key, count]) => (
                <div key={key} className="p-2.5 bg-orange-50 border border-orange-100 rounded-lg">
                  <div className="text-[10px] text-orange-700">{resourceLabel[key] || key}</div>
                  <div className="text-lg font-semibold text-orange-900">
                    {count != null ? count.toLocaleString('tr-TR') : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Logo → RetailEX senkronizasyonu */}
      {connectionStatus === 'connected' && (
        <div className="rounded-lg border border-slate-200 p-4 space-y-3">
          <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
            Logo&apos;dan RetailEX&apos;e aktar
          </h4>
          <p className="text-xs text-gray-600">
            Modül seçimleri <strong>Parametreler</strong> sekmesindedir. Hedef:{' '}
            <code>rex_{erpFirmPeriod.firmLabel}_*</code>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isSyncing}
              onClick={() => void runLogoRestSyncNow().then((r) => {
                setRestAutoSync(loadLogoRestSyncSettings());
                if (!r.ok) setConnectionError(r.message);
              })}
              className="px-3 py-1.5 text-xs border border-green-600 text-green-700 rounded-lg hover:bg-green-50 disabled:opacity-50"
            >
              Şimdi çek (otomatik ayarlarla)
            </button>
            <button
              type="button"
              onClick={handleSyncFromLogo}
              disabled={isSyncing || !Object.values(syncOptions).some(Boolean)}
              className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-1"
            >
              {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              Seçili modülleri içe aktar
            </button>
            {restAutoSync.lastSyncAt && (
              <span className="text-xs text-gray-500">
                Son: {new Date(restAutoSync.lastSyncAt).toLocaleString('tr-TR')}
              </span>
            )}
          </div>

            {syncProgress && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-900">
                {syncProgress.message}
                {syncProgress.total != null && syncProgress.current != null && (
                  <span className="ml-2 text-green-700">
                    ({syncProgress.current}/{syncProgress.total})
                  </span>
                )}
              </div>
            )}

            {syncLog.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 text-xs text-gray-600 border-b">
                  Canlı aktarım günlüğü ({syncLog.length} satır)
                </div>
                <div className="max-h-48 overflow-y-auto p-2 font-mono text-xs bg-gray-900 text-green-400 space-y-0.5">
                  {syncLog.map((line, i) => (
                    <div key={`${line.at}-${i}`} className={line.ok ? '' : 'text-red-400'}>
                      [{new Date(line.at).toLocaleTimeString('tr-TR')}] {line.entity}{' '}
                      {line.action} {line.code}
                      {line.name ? ` — ${line.name}` : ''}
                      {line.detail ? ` (${line.detail})` : ''}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {syncResult && (
              <div
                className={`p-4 rounded-lg border text-sm ${
                  syncResult.ok
                    ? 'bg-green-50 border-green-200 text-green-900'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                <div className="flex items-center gap-2 mb-2 font-medium">
                  {syncResult.ok ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  {syncResult.ok ? 'Senkronizasyon tamamlandı' : 'Senkronizasyon hatası'}
                </div>
                <ul className="list-disc list-inside space-y-1">
                  {syncResult.messages.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
        </div>
      )}

      {connectionStatus === 'connected' && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4 space-y-2">
          <h4 className="text-xs font-semibold text-indigo-900 uppercase tracking-wide">
            RetailEX → Logo fatura gönderimi
          </h4>
          <button
            type="button"
            onClick={handlePushInvoicesNow}
            disabled={isPushingInvoices}
            className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-1"
          >
            {isPushingInvoices ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
            Bekleyen faturaları gönder
          </button>
          {invoicePushMsg && (
            <p className="text-xs text-indigo-900">{invoicePushMsg}</p>
          )}
        </div>
      )}

      {connectionStatus === 'connected' && (
        <details className="rounded-lg border border-gray-200 p-3">
          <summary className="text-xs font-medium text-gray-700 cursor-pointer">
            Gelişmiş — Logo REST kaynak okuma / yazma
          </summary>
          <div className="mt-3 space-y-3 pt-3 border-t border-gray-100">
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm text-gray-700 mb-1">Kaynak (resource)</label>
                <select
                  value={selectedResource}
                  onChange={(e) => setSelectedResource(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  {LOGO_KEY_RESOURCES.map((r) => (
                    <option key={r} value={r}>{resourceLabel[r] || r}</option>
                  ))}
                  {services
                    .filter((s) => !LOGO_KEY_RESOURCES.includes(s.name as typeof LOGO_KEY_RESOURCES[number]))
                    .slice(0, 30)
                    .map((s) => (
                      <option key={s.name} value={s.name}>{s.description || s.name}</option>
                    ))}
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm text-gray-700 mb-1">Filtre (q)</label>
                <input
                  type="text"
                  value={resourceFilter}
                  onChange={(e) => setResourceFilter(e.target.value)}
                  placeholder="CODE like 'MAL*'"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                />
              </div>
              <button
                onClick={handleFetchResource}
                disabled={isLoadingList}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isLoadingList ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Listele
              </button>
              <button
                onClick={handleLoadServices}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
              >
                Tüm servisleri yükle
              </button>
            </div>

            {listResult && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 text-sm text-gray-700 border-b">
                  {selectedResource}: {listResult.count != null ? `${listResult.count} kayıt` : `${listResult.items.length} satır`}
                </div>
                <pre className="p-4 text-xs overflow-auto max-h-64 bg-gray-900 text-green-400">
                  {JSON.stringify(listResult.items, null, 2)}
                </pre>
              </div>
            )}

            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Plus className="w-4 h-4 text-orange-600" />
                <span className="text-sm font-medium text-gray-900">
                  Logo'ya yeni kayıt ekle — POST /{selectedResource}
                </span>
              </div>
              <textarea
                value={createJson}
                onChange={(e) => setCreateJson(e.target.value)}
                rows={8}
                className="w-full font-mono text-xs border border-gray-300 rounded-lg p-3"
              />
              <div className="mt-2 flex items-center gap-3">
                <button
                  onClick={handleCreateResource}
                  disabled={isCreating}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Logo'ya gönder
                </button>
                {createMsg && (
                  <span className={`text-sm ${createMsg.startsWith('Kayıt') ? 'text-green-700' : 'text-red-700'}`}>
                    {createMsg}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Gövde <code>restRecord</code> olarak gönderilir. Şema:{' '}
                <code>{config.baseUrl}/services/{selectedResource}?expandLevel=full</code>
              </p>
            </div>
          </div>
        </details>
      )}

      {connectionStatus === 'connected' && (
        <p className="text-xs text-green-700 flex items-center gap-1">
          <CheckCircle className="w-3.5 h-3.5" />
          Bağlı — Logo {activeContext.firmNr}/{activeContext.periodNr}
          {activeContext.logoDb ? ` · ${activeContext.logoDb}` : ''}
        </p>
      )}
      {connectionStatus === 'error' && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <XCircle className="w-3.5 h-3.5" />
          Bağlantı kurulamadı
        </p>
      )}
    </div>
  );
}
