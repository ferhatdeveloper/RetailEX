import { useState, useEffect, useCallback } from 'react';
import {
  AlertCircle,
  Loader2,
  Download,
  RefreshCw,
  Server,
  Package,
  Users,
  FileText,
  CheckCircle,
  XCircle,
  Database,
  Plus,
  Search,
} from 'lucide-react';
import { ERP_SETTINGS } from '../../services/postgres';
import {
  LOGO_DEFAULT_BASE_URL,
  LOGO_KEY_RESOURCES,
  loadLogoRestConfig,
  saveLogoRestConfig,
  logoTestConnection,
  logoGetDataPreview,
  logoListResource,
  logoCreateResource,
  logoDescribeServices,
  logoRevokeSession,
  getErpFirmPeriodLabel,
  type LogoRestConfig,
  type LogoDataPreview,
  type LogoDescribeEntry,
} from '../../services/logoRestApi';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export function LogoTigerRestPanel() {
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

  const refreshErpContext = useCallback(() => {
    setErpFirmPeriod(getErpFirmPeriodLabel());
  }, []);

  useEffect(() => {
    refreshErpContext();
    const onStorage = () => refreshErpContext();
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refreshErpContext]);

  const updateConfig = (patch: Partial<LogoRestConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      saveLogoRestConfig(next);
      return next;
    });
  };

  const handleTestConnection = async () => {
    setConnectionStatus('connecting');
    setConnectionError('');
    refreshErpContext();

    const result = await logoTestConnection(config);
    if (result.ok) {
      setConnectionStatus('connected');
      if (result.currentFirm != null && result.currentPeriod != null) {
        setConnectionError('');
      }
    } else {
      setConnectionStatus('error');
      setConnectionError(result.error || 'Bağlantı hatası');
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

  return (
    <div className="space-y-6">
      {/* Firma / dönem — RetailEX oturumundan */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center gap-2 text-blue-800 mb-2">
          <Database className="w-4 h-4" />
          <span className="text-sm font-medium">Aktif firma / dönem (RetailEX oturumu)</span>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Firma no → Logo:</span>{' '}
            <code className="font-mono bg-white px-2 py-0.5 rounded border">
              {erpFirmPeriod.firmLabel} → {erpFirmPeriod.firmNr}
            </code>
          </div>
          <div>
            <span className="text-gray-600">Dönem no → Logo:</span>{' '}
            <code className="font-mono bg-white px-2 py-0.5 rounded border">
              {erpFirmPeriod.periodLabel} → {erpFirmPeriod.periodNr}
            </code>
          </div>
        </div>
        <p className="text-xs text-blue-700 mt-2">
          Token ve <code>CompanyLogin/{'{'}firmNr{'}'}/{'{'}periodNr{'}'}</code> çağrısında{' '}
          <code>ERP_SETTINGS.firmNr</code> ({ERP_SETTINGS.firmNr}) ve{' '}
          <code>periodNr</code> ({ERP_SETTINGS.periodNr}) kullanılır.
        </p>
      </div>

      {/* Bağlantı ayarları */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center text-white">1</div>
          <h3 className="text-lg text-gray-900">Logo REST API Bağlantısı</h3>
        </div>

        <div className="grid grid-cols-2 gap-4 pl-10">
          <div className="col-span-2">
            <label className="block text-sm text-gray-700 mb-1.5">
              <Server className="w-4 h-4 inline mr-1" />
              API Base URL
            </label>
            <input
              type="text"
              value={config.baseUrl}
              onChange={(e) => updateConfig({ baseUrl: e.target.value })}
              placeholder={LOGO_DEFAULT_BASE_URL}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Örnek: http://185.206.80.132:32001/api/v1 — help URL'si otomatik kırpılır.
            </p>
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1.5">Logo kullanıcı adı</label>
            <input
              type="text"
              value={config.username}
              onChange={(e) => updateConfig({ username: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1.5">Logo şifre</label>
            <input
              type="password"
              value={config.password}
              onChange={(e) => updateConfig({ password: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1.5">Client ID</label>
            <input
              type="text"
              value={config.clientId}
              onChange={(e) => updateConfig({ clientId: e.target.value })}
              placeholder="logotigerrestservice"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1.5">Client Secret</label>
            <input
              type="password"
              value={config.clientSecret}
              onChange={(e) => updateConfig({ clientSecret: e.target.value })}
              placeholder="Logo REST uygulama kaydı"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm text-gray-700 mb-1.5">Logo DB (isteğe bağlı)</label>
            <input
              type="text"
              value={config.logoDb || ''}
              onChange={(e) => updateConfig({ logoDb: e.target.value })}
              placeholder="TIGERDB veya boş bırakın"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono text-sm"
            />
          </div>
        </div>

        {connectionError && (
          <div className="mt-4 ml-10 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{connectionError}</p>
          </div>
        )}

        <div className="mt-4 ml-10 flex flex-wrap gap-2">
          <button
            onClick={handleTestConnection}
            disabled={!config.username || !config.password || !config.clientId || connectionStatus === 'connecting'}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {connectionStatus === 'connecting' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Bağlanıyor…
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Bağlan ({erpFirmPeriod.firmNr}/{erpFirmPeriod.periodNr})
              </>
            )}
          </button>
          {connectionStatus === 'connected' && (
            <button
              onClick={handleDisconnect}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Oturumu kapat
            </button>
          )}
        </div>
      </div>

      {/* Önizleme */}
      {connectionStatus === 'connected' && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center text-white">2</div>
            <h3 className="text-lg text-gray-900">Logo veri özeti</h3>
          </div>
          <div className="pl-10">
            {!previewData ? (
              <button
                onClick={handleLoadPreview}
                disabled={isLoadingPreview}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isLoadingPreview ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Yükleniyor…
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Kayıt sayılarını getir
                  </>
                )}
              </button>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {Object.entries(previewData.resources).map(([key, count]) => (
                  <div key={key} className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                    <div className="flex items-center gap-2 text-orange-600 mb-2 text-sm">
                      {key === 'items' ? <Package className="w-4 h-4" /> :
                       key === 'Arps' ? <Users className="w-4 h-4" /> :
                       <FileText className="w-4 h-4" />}
                      {resourceLabel[key] || key}
                    </div>
                    <div className="text-2xl text-orange-900">
                      {count != null ? count.toLocaleString('tr-TR') : '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Okuma / yazma */}
      {connectionStatus === 'connected' && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center text-white">3</div>
            <h3 className="text-lg text-gray-900">Veri okuma ve Logo'ya ekleme</h3>
          </div>
          <div className="pl-10 space-y-4">
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
        </div>
      )}

      {connectionStatus === 'connected' && (
        <div className="ml-10 flex items-center gap-2 text-sm text-green-700">
          <CheckCircle className="w-4 h-4" />
          Logo REST oturumu açık — firma {erpFirmPeriod.firmNr}, dönem {erpFirmPeriod.periodNr}
        </div>
      )}
      {connectionStatus === 'error' && (
        <div className="ml-10 flex items-center gap-2 text-sm text-red-600">
          <XCircle className="w-4 h-4" />
          Bağlantı kurulamadı
        </div>
      )}
    </div>
  );
}
