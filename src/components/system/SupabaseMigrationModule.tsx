import React, { useState, useEffect, useRef } from 'react';
import {
  CloudDownload as CloudArrowDownIcon,
  CloudUpload as CloudArrowUpIcon,
  Play as PlayIcon,
  CheckCircle2 as CheckCircleIcon,
  AlertCircle as ExclamationCircleIcon,
  Info as InformationCircleIcon,
  Table as TableCellsIcon,
  RefreshCw as ArrowPathIcon
} from 'lucide-react';
import { SupabaseMigrationService, SupabaseConfig, MigrationLog } from '../../services/api/supabaseMigrationService';
import { toast } from 'sonner';

const SupabaseMigrationModule: React.FC = () => {
  const [source, setSource] = useState<SupabaseConfig>({ url: '', key: '' });
  const [target, setTarget] = useState<SupabaseConfig>({ url: '', key: '' });
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [logs, setLogs] = useState<MigrationLog[]>([]);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [progress, setProgress] = useState<{ [key: string]: number }>({});
  const [sourceManagementToken, setSourceManagementToken] = useState('');
  const [targetManagementToken, setTargetManagementToken] = useState('');
  const [migrateOptions, setMigrateOptions] = useState({
    functions: true,
    views: true,
    triggers: true,
    policies: true,
    data: true
  });

  const logEndRef = useRef<HTMLDivElement>(null);
  const migrationService = useRef(new SupabaseMigrationService((newLogs) => setLogs(newLogs)));

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleConnect = async () => {
    if (!source.url || !source.key || !target.url || !target.key) {
      toast.error('Lütfen tüm bilgileri giriniz');
      return;
    }

    const success = await migrationService.current.connect(source, target);
    if (success) {
      setIsConnected(true);

      // Extract project ref from source URL for Management API discovery fallback
      let projectRef = undefined;
      try {
        const url = new URL(source.url);
        projectRef = url.hostname.split('.')[0];
      } catch (e) { }

      const tableList = await migrationService.current.getTables(projectRef, sourceManagementToken);
      setTables(tableList);
      setSelectedTables(tableList);
      toast.success('Bağlantı başarılı');
    } else {
      setIsConnected(false);
      toast.error('Bağlantı başarısız');
    }
  };

  const toggleTable = (tableName: string) => {
    setSelectedTables(prev =>
      prev.includes(tableName)
        ? prev.filter(t => t !== tableName)
        : [...prev, tableName]
    );
  };

  const runMigration = async () => {
    if (selectedTables.length === 0) {
      toast.error('Lütfen en az bir tablo seçiniz');
      return;
    }

    setIsMigrating(true);
    setProgress({});

    // Extract project refs for schema migration
    let sourceRef = '';
    let targetRef = '';
    try {
      sourceRef = new URL(source.url).hostname.split('.')[0];
      targetRef = new URL(target.url).hostname.split('.')[0];
    } catch (e) { }

    // 1. Migrate Functions
    if (migrateOptions.functions) {
      await migrationService.current.migrateFunctions(sourceRef, sourceManagementToken, targetRef, targetManagementToken);
    }

    // 2. Migrate Tables
    for (const table of selectedTables) {
      const success = await migrationService.current.migrateTable(
        table,
        (p) => {
          setProgress(prev => ({ ...prev, [table]: p }));
        },
        sourceRef,
        targetRef,
        sourceManagementToken,
        targetManagementToken,
        !migrateOptions.data
      );
      if (!success) {
        toast.error(`${table} aktarımı durduruldu!`);
      }
    }

    // 2.5 Setup Default Admin if Schema Only
    if (!migrateOptions.data) {
      await migrationService.current.setupDefaultAdmin(targetRef, targetManagementToken);
    }

    // 3. Migrate Views
    if (migrateOptions.views) {
      await migrationService.current.migrateViews(sourceRef, sourceManagementToken, targetRef, targetManagementToken);
    }

    // 4. Migrate Triggers
    if (migrateOptions.triggers) {
      await migrationService.current.migrateTriggers(sourceRef, sourceManagementToken, targetRef, targetManagementToken);
    }

    // 5. Migrate Policies
    if (migrateOptions.policies) {
      await migrationService.current.migratePolicies(sourceRef, sourceManagementToken, targetRef, targetManagementToken);
    }

    setIsMigrating(false);
    toast.success('Aktarım tamamlandı');
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <ArrowPathIcon className="w-8 h-8 text-indigo-500" />
            Supabase Veri Aktarımı
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Buluttan buluta veri senkronizasyon aracı</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4 text-orange-500 font-semibold">
            <ExclamationCircleIcon className="w-5 h-5" />
            Yönetim Bilgileri (Şema & Nesne Aktarımı İçin)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kaynak Management PAT</label>
              <input
                type="password"
                value={sourceManagementToken}
                onChange={(e) => setSourceManagementToken(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 transition-all outline-none text-xs font-mono"
                placeholder="Kaynak sbp_..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hedef Management PAT</label>
              <input
                type="password"
                value={targetManagementToken}
                onChange={(e) => setTargetManagementToken(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 transition-all outline-none text-xs font-mono"
                placeholder="Hedef sbp_..."
              />
            </div>
          </div>
          <p className="text-[10px] text-gray-400 mt-2">Tabloların, triggerların ve politikaların otomatik aktarımı için gereklidir.</p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4 text-indigo-500 font-semibold">
            <InformationCircleIcon className="w-5 h-5" />
            Aktarılacak Veritabanı Nesneleri
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={migrateOptions.functions} onChange={e => setMigrateOptions({ ...migrateOptions, functions: e.target.checked })} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4" />
              <span className="text-sm text-gray-600 dark:text-gray-400 group-hover:text-indigo-500 transition-colors">Fonksiyonlar</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={migrateOptions.views} onChange={e => setMigrateOptions({ ...migrateOptions, views: e.target.checked })} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4" />
              <span className="text-sm text-gray-600 dark:text-gray-400 group-hover:text-indigo-500 transition-colors">View Yapıları</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={migrateOptions.triggers} onChange={e => setMigrateOptions({ ...migrateOptions, triggers: e.target.checked })} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4" />
              <span className="text-sm text-gray-600 dark:text-gray-400 group-hover:text-indigo-500 transition-colors">Triggerlar</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={migrateOptions.policies} onChange={e => setMigrateOptions({ ...migrateOptions, policies: e.target.checked })} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4" />
              <span className="text-sm text-gray-600 dark:text-gray-400 group-hover:text-indigo-500 transition-colors">RLS Politikaları</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group font-bold">
              <input type="checkbox" checked={migrateOptions.data} onChange={e => setMigrateOptions({ ...migrateOptions, data: e.target.checked })} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4" />
              <span className="text-sm text-indigo-600 dark:text-indigo-400 group-hover:text-indigo-500 transition-colors underline underline-offset-4">Tablo Verilerini Aktar</span>
            </label>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source Config */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4 text-indigo-600 font-semibold">
            <CloudArrowDownIcon className="w-5 h-5" />
            Kaynak Supabase (Source)
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project URL</label>
              <input
                type="text"
                value={source.url}
                onChange={(e) => setSource({ ...source, url: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                placeholder="https://xyz.supabase.co"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Service Role Key</label>
              <input
                type="password"
                value={source.key}
                onChange={(e) => setSource({ ...source, key: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                placeholder="eyJhbGci..."
              />
            </div>
          </div>
        </div>

        {/* Target Config */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4 text-emerald-600 font-semibold">
            <CloudArrowUpIcon className="w-5 h-5" />
            Hedef Supabase (Target)
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project URL</label>
              <input
                type="text"
                value={target.url}
                onChange={(e) => setTarget({ ...target, url: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                placeholder="https://abc.supabase.co"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Service Role Key</label>
              <input
                type="password"
                value={target.key}
                onChange={(e) => setTarget({ ...target, key: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                placeholder="eyJhbGci..."
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          onClick={handleConnect}
          disabled={isMigrating}
          className={`flex items-center gap-2 px-8 py-3 rounded-xl font-bold shadow-lg transition-all transform active:scale-95 ${isConnected
              ? 'bg-emerald-500 text-white hover:bg-emerald-600'
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
            } disabled:opacity-50`}
        >
          {isConnected ? <CheckCircleIcon className="w-5 h-5" /> : <ArrowPathIcon className="w-5 h-5" />}
          {isConnected ? 'Bağlantı Kuruldu' : 'Bağlantıları Kur'}
        </button>
      </div>

      {isConnected && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Table Selection */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 lg:col-span-1 h-[500px] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="text-gray-800 dark:text-white font-semibold flex items-center gap-2">
                <TableCellsIcon className="w-5 h-5 text-indigo-500" />
                Tablo Seçimi ({selectedTables.length}/{tables.length})
              </div>
              <button
                onClick={() => setSelectedTables(selectedTables.length === tables.length ? [] : [...tables])}
                className="text-xs text-indigo-500 hover:underline font-medium"
              >
                {selectedTables.length === tables.length ? 'Tümünü Bırak' : 'Tümünü Seç'}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {tables.map(table => (
                <div
                  key={table}
                  onClick={() => toggleTable(table)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${selectedTables.includes(table)
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                      : 'border-gray-100 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                >
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{table}</span>
                  {progress[table] === 100 ? (
                    <CheckCircleIcon className="w-5 h-5 text-emerald-500" />
                  ) : progress[table] > 0 ? (
                    <span className="text-[10px] font-bold text-indigo-500 font-mono">{progress[table]}%</span>
                  ) : selectedTables.includes(table) ? (
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                  ) : null}
                </div>
              ))}
            </div>
            <button
              onClick={runMigration}
              disabled={isMigrating || selectedTables.length === 0}
              className="mt-6 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-50 shadow-md shadow-indigo-200 dark:shadow-none"
            >
              <PlayIcon className="w-5 h-5" />
              Aktarımı Başlat
            </button>
          </div>

          {/* Logs */}
          <div className="bg-gray-900 rounded-2xl p-6 shadow-inner lg:col-span-2 h-[500px] flex flex-col font-mono">
            <div className="text-gray-400 text-xs mb-4 flex items-center gap-2 uppercase tracking-widest font-bold border-b border-gray-800 pb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Migration Log Terminal
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5 text-[13px] pr-2 custom-scrollbar">
              {logs.length === 0 && (
                <div className="text-gray-600 italic">Bağlantı kurduktan sonra işlem logları burada görünecektir...</div>
              )}
              {logs.map((log, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-gray-600 whitespace-nowrap">[{log.timestamp}]</span>
                  <span className={
                    log.level === 'error' ? 'text-red-400' :
                      log.level === 'success' ? 'text-emerald-400' :
                        'text-indigo-400'
                  }>
                    {log.level === 'error' ? '✖' : log.level === 'success' ? '✔' : 'ℹ'}
                  </span>
                  <span className="text-gray-300 leading-relaxed">{log.message}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(99, 102, 241, 0.2);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(99, 102, 241, 0.4);
        }
      `}</style>
    </div>
  );
};

export default SupabaseMigrationModule;
