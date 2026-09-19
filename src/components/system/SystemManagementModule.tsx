// System Management Module - All System Settings Modules

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Settings, Users, Shield, Database, Radio, HardDrive,
  Activity, Bell, Key, FileText, AlertCircle, Download, Loader2,
  Upload, CheckCircle, Clock, User, Lock, Trash2, Edit, Plus, Save, X, Receipt, Image, Printer,
  Phone, Menu, PanelLeftClose, Monitor,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { PendingDevicesPanel } from './PendingDevicesPanel';
import { useResponsive } from '../../hooks/useResponsive';
import { useLanguage } from '../../contexts/LanguageContext';
import { IS_TAURI } from '../../utils/env';
import { checkPgBridgeReachable, runPostgresFullBackup } from '../../services/postgresFullBackup';
import {
  checkDesktopUpdate,
  getDesktopUpdateEndpoint,
  runDesktopUpdateWithBackup,
  type DesktopUpdateProgress,
} from '../../services/desktopUpdater';
import { APP_VERSION } from '../../core/version';
import { PrinterSettings } from './PrinterSettings';
import { PrintOptionsSettings } from './PrintOptionsSettings';
import { InvoiceCodeFormatSettings } from './InvoiceCodeFormatSettings';
import { TemplateManager } from '../modules/TemplateManager';
import { RestaurantCallerIdSettings } from '../restaurant/components/RestaurantCallerIdSettings';
import { RECEIPT_PRODUCT_NAME_FIELD_OPTIONS } from '../../utils/receiptProductName';
import {
  getRuntimeReportMenuParams,
  loadReportMenuParams,
  subscribeReportMenuParams,
  type ReportMenuParamKey,
  type ReportMenuParams,
} from '../../services/reportMenuParamsService';
import { getGrafanaBaseUrl, getGrafanaEmbedUrl } from '../../utils/grafanaEmbed';

type SystemView =
  | 'userManagement'
  | 'roleAuthorization'
  | 'definitionsParameters'
  | 'receiptSettings'
  | 'invoiceLabelDesigner'
  | 'printerSettings'
  | 'printOptions'
  | 'callerIdVirtualPbx'
  | 'dataBroadcast'
  | 'pendingPosDevices'
  | 'backupRestore'
  | 'logAudit'
  | 'systemHealth';

type SystemManagementModuleProps = {
  /** Yönetim modülünden gelen ekran kimliği — sol menüde doğru sekme açılır */
  routeHint?: string;
};

const SIDEBAR_VISIBLE_STORAGE_KEY = 'retailex_system_mgmt_sidebar_visible';

function readSidebarVisiblePreference(): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(SIDEBAR_VISIBLE_STORAGE_KEY) !== '0';
}

const ROUTE_HINT_TO_VIEW: Partial<Record<string, SystemView>> = {
  settings: 'userManagement',
  generalsettings: 'definitionsParameters',
  definitions: 'definitionsParameters',
  'parameter-settings': 'definitionsParameters',
  parameters: 'definitionsParameters',
  parametre: 'definitionsParameters',
  backuprestore: 'backupRestore',
  systemhealth: 'systemHealth',
  pendingposdevices: 'pendingPosDevices',
  'invoice-label-designer': 'invoiceLabelDesigner',
  'report-designer': 'invoiceLabelDesigner',
  'label-designer': 'invoiceLabelDesigner',
  'print-options': 'printOptions',
  printoptions: 'printOptions',
  smsmanage: 'definitionsParameters',
  emailcamp: 'definitionsParameters',
};

export function SystemManagementModule({ routeHint }: SystemManagementModuleProps) {
  const [currentView, setCurrentView] = useState<SystemView>('userManagement');
  const { tm, t } = useLanguage();
  const { darkMode } = useTheme();
  const { isMobile } = useResponsive();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(readSidebarVisiblePreference);
  const [menuParams, setMenuParams] = useState<ReportMenuParams>(() => getRuntimeReportMenuParams());

  const setSidebarVisiblePersisted = useCallback((visible: boolean) => {
    setSidebarVisible(visible);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SIDEBAR_VISIBLE_STORAGE_KEY, visible ? '1' : '0');
    }
  }, []);

  const toggleDesktopSidebar = useCallback(() => {
    setSidebarVisiblePersisted(!sidebarVisible);
  }, [sidebarVisible, setSidebarVisiblePersisted]);

  useEffect(() => {
    if (!routeHint) return;
    const v = ROUTE_HINT_TO_VIEW[routeHint];
    if (v) setCurrentView(v);
  }, [routeHint]);

  useEffect(() => {
    if (!isMobile) setMobileMenuOpen(false);
  }, [isMobile]);

  useEffect(() => {
    let cancelled = false;
    void loadReportMenuParams().then((p) => {
      if (!cancelled) setMenuParams(p);
    });
    const unsub = subscribeReportMenuParams((p) => setMenuParams(p));
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const showVirtualPbx = menuParams['virtual-pbx-caller-id'] === true;

  useEffect(() => {
    if (!showVirtualPbx && currentView === 'callerIdVirtualPbx') {
      setCurrentView('userManagement');
    }
  }, [showVirtualPbx, currentView]);

  const menuItems = [
    { id: 'userManagement' as const, label: 'Kullanıcı Yönetimi', icon: Users, color: 'blue' },
    { id: 'roleAuthorization' as const, label: 'Rol & Yetkilendirme', icon: Shield, color: 'purple' },
    { id: 'definitionsParameters' as const, label: tm('definitionsParameters'), icon: Settings, color: 'green' },
    { id: 'receiptSettings' as const, label: 'Fiş / Firma Bilgisi', icon: Receipt, color: 'amber' },
    { id: 'invoiceLabelDesigner' as const, label: tm('invoiceLabelDesigner'), icon: FileText, color: 'indigo' },
    { id: 'printerSettings' as const, label: 'Yazıcı Ayarları', icon: Printer, color: 'slate' },
    { id: 'printOptions' as const, label: 'Yazdırma Seçenekleri', icon: Printer, color: 'blue' },
    ...(showVirtualPbx
      ? [{ id: 'callerIdVirtualPbx' as const, label: tm('menuParamVirtualPbx'), icon: Phone, color: 'violet' }]
      : []),
    { id: 'dataBroadcast' as const, label: 'Bilgi Gönder/AI Merkezi', icon: Radio, color: 'orange' },
    { id: 'pendingPosDevices' as const, label: 'Kasa Cihazları', icon: Monitor, color: 'amber' },
    { id: 'backupRestore' as const, label: 'Yedekleme/Geri Yükleme', icon: HardDrive, color: 'indigo' },
    { id: 'logAudit' as const, label: 'Log/Denetim', icon: FileText, color: 'red' },
    { id: 'systemHealth' as const, label: 'Sistem Sağlığı', icon: Activity, color: 'teal' },
  ];

  const activeMenuItem = menuItems.find((item) => item.id === currentView);
  const desktopSidebarOpen = !isMobile && sidebarVisible;

  return (
    <div className="h-full flex flex-col md:flex-row bg-gray-50 relative min-h-0 min-w-0">
      {isMobile && mobileMenuOpen && (
        <button
          type="button"
          aria-label={tm('close')}
          className="fixed inset-0 z-40 bg-black/40 border-0 cursor-pointer"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sol menü */}
      <div
        className={
          isMobile
            ? `fixed inset-y-0 left-0 z-50 w-56 max-w-[85vw] border-r border-gray-200 bg-white overflow-y-auto shadow-xl transition-transform duration-200 ease-out ${
                mobileMenuOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
              }`
            : `shrink-0 border-r border-gray-200 bg-white overflow-hidden transition-[width] duration-200 ease-out ${
                desktopSidebarOpen ? 'w-56' : 'w-0 border-r-0'
              }`
        }
      >
        <nav
          className={`p-2 space-y-0.5 h-full overflow-y-auto ${
            !isMobile && !desktopSidebarOpen ? 'invisible w-56' : 'w-56'
          }`}
        >
          {!isMobile && desktopSidebarOpen && (
            <div className="flex items-center justify-between gap-2 px-1 pb-2 mb-1 border-b border-gray-100">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider truncate">
                {tm('systemManagement')}
              </span>
              <button
                type="button"
                onClick={toggleDesktopSidebar}
                className="shrink-0 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-1.5 text-gray-600 hover:bg-gray-50"
                aria-label={t.hideMenu}
                title={t.hideMenu}
              >
                <PanelLeftClose className="w-4 h-4" aria-hidden />
              </button>
            </div>
          )}
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentView(item.id);
                  if (isMobile) setMobileMenuOpen(false);
                }}
                title={item.label}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
      {/* Content Area */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden md:overflow-auto">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-white shrink-0">
          {(isMobile || !desktopSidebarOpen) && (
            <button
              type="button"
              onClick={() => {
                if (isMobile) setMobileMenuOpen(true);
                else setSidebarVisiblePersisted(true);
              }}
              className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-2 text-gray-700 shadow-sm hover:bg-gray-50"
              aria-label={isMobile ? tm('mainMenu') : t.showMenu}
              title={isMobile ? tm('mainMenu') : t.showMenu}
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>
          )}
          {!isMobile && desktopSidebarOpen && (
            <button
              type="button"
              onClick={toggleDesktopSidebar}
              className="hidden md:inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-2 text-gray-700 shadow-sm hover:bg-gray-50"
              aria-label={t.hideMenu}
              title={t.hideMenu}
            >
              <PanelLeftClose className="h-5 w-5" aria-hidden />
            </button>
          )}
          <span className="text-sm font-semibold text-gray-800 truncate flex-1 min-w-0">
            {activeMenuItem?.label ?? tm('systemManagement')}
          </span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
        {currentView === 'userManagement' && <UserManagementView />}
        {currentView === 'roleAuthorization' && <RoleAuthorizationView />}
        {currentView === 'definitionsParameters' && <DefinitionsParametersView />}
        {currentView === 'receiptSettings' && <ReceiptSettingsView />}
        {currentView === 'invoiceLabelDesigner' && (
          <div className="min-h-full bg-gray-50 p-4 sm:p-6">
            <div className="bg-white rounded-xl border border-gray-200 min-h-[calc(100vh-8rem)]">
              <TemplateManager />
            </div>
          </div>
        )}
        {currentView === 'printerSettings' && <PrinterSettings />}
        {currentView === 'printOptions' && <PrintOptionsSettings />}
        {currentView === 'callerIdVirtualPbx' && (
          <div className="min-h-full bg-gray-50">
            <RestaurantCallerIdSettings />
          </div>
        )}
        {currentView === 'dataBroadcast' && <DataBroadcastView />}
        {currentView === 'pendingPosDevices' && (
          <div className="p-4 sm:p-6 max-w-5xl">
            <PendingDevicesPanel darkMode={darkMode} />
          </div>
        )}
        {currentView === 'backupRestore' && <BackupRestoreView />}
        {currentView === 'logAudit' && <LogAuditView />}
        {currentView === 'systemHealth' && (
          <div className="h-full min-h-[min(70vh,640px)] flex flex-col overflow-hidden">
            <SystemHealthView />
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

// User Management View
function UserManagementView() {
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list');
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const users = [
    { id: 1, username: 'ahmed.maliki', fullName: 'Ahmed Al-Maliki', email: 'ahmed@exretailos.iq', role: 'Yönetici', store: 'Baghdad Merkez', status: 'Aktif', lastLogin: '2025-01-18 14:30' },
    { id: 2, username: 'mohammed.hassan', fullName: 'Mohammed Hassan', email: 'mohammed@exretailos.iq', role: 'Mağaza Müdürü', store: 'Erbil Merkez', status: 'Aktif', lastLogin: '2025-01-18 13:15' },
    { id: 3, username: 'ali.sadr', fullName: 'Ali Al-Sadr', email: 'ali@exretailos.iq', role: 'Kasiyer', store: 'Basra Merkez', status: 'Aktif', lastLogin: '2025-01-18 12:00' },
    { id: 4, username: 'hussein.najjar', fullName: 'Hussein Al-Najjar', email: 'hussein@exretailos.iq', role: 'Depo Sorumlusu', store: 'Mosul Sanayi', status: 'Pasif', lastLogin: '2025-01-15 09:45' },
  ];

  if (view === 'create' || view === 'edit') {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow-sm border">
          {/* Header */}
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <User className="h-5 w-5 text-blue-600" />
              {view === 'create' ? 'Yeni Kullanıcı Ekle' : 'Kullanıcı Düzenle'}
            </h3>
            <button onClick={() => setView('list')} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form */}
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Kullanıcı Adı *</label>
                <input type="text" defaultValue={selectedUser?.username} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="ornek.kullanici" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tam Ad *</label>
                <input type="text" defaultValue={selectedUser?.fullName} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Ahmed Al-Maliki" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">E-posta *</label>
                <input type="email" defaultValue={selectedUser?.email} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="kullanici@exretailos.iq" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Telefon</label>
                <input type="tel" className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="+964 770 123 4567" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Rol *</label>
                <select defaultValue={selectedUser?.role} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                  <option>Yönetici</option>
                  <option>Mağaza Müdürü</option>
                  <option>Kasiyer</option>
                  <option>Depo Sorumlusu</option>
                  <option>Muhasebe</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Mağaza *</label>
                <select defaultValue={selectedUser?.store} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                  <option>Baghdad Merkez Mağazası</option>
                  <option>Erbil Merkez Çarşı</option>
                  <option>Basra Merkez AVM</option>
                  <option>Mosul Sanayi Mağazası</option>
                </select>
              </div>
            </div>

            {view === 'create' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Şifre *</label>
                  <input type="password" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Şifre Tekrar *</label>
                  <input type="password" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Durum</label>
              <select defaultValue={selectedUser?.status || 'Aktif'} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option>Aktif</option>
                <option>Pasif</option>
              </select>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <button
                onClick={() => setView('list')}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={() => {
                  alert(view === 'create' ? 'Kullanıcı eklendi!' : 'Kullanıcı güncellendi!');
                  setView('list');
                }}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                Kaydet
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow-sm border">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Kullanıcı Yönetimi</h3>
            <p className="text-sm text-gray-600 mt-1">{users.length} kullanıcı kayıtlı</p>
          </div>
          <button
            onClick={() => setView('create')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Yeni Kullanıcı
          </button>
        </div>

        {/* Users Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 text-sm font-medium text-gray-700">Kullanıcı Adı</th>
                <th className="text-left p-3 text-sm font-medium text-gray-700">Tam Ad</th>
                <th className="text-left p-3 text-sm font-medium text-gray-700">E-posta</th>
                <th className="text-left p-3 text-sm font-medium text-gray-700">Rol</th>
                <th className="text-left p-3 text-sm font-medium text-gray-700">Mağaza</th>
                <th className="text-left p-3 text-sm font-medium text-gray-700">Durum</th>
                <th className="text-left p-3 text-sm font-medium text-gray-700">Son Giriş</th>
                <th className="text-right p-3 text-sm font-medium text-gray-700">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 text-sm font-medium text-gray-800">{user.username}</td>
                  <td className="p-3 text-sm text-gray-700">{user.fullName}</td>
                  <td className="p-3 text-sm text-gray-600">{user.email}</td>
                  <td className="p-3">
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">{user.role}</span>
                  </td>
                  <td className="p-3 text-sm text-gray-700">{user.store}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 text-xs rounded ${user.status === 'Aktif' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="p-3 text-sm text-gray-600">{user.lastLogin}</td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setView('edit');
                        }}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`${user.fullName} kullanıcısını silmek istediğinize emin misiniz?`)) {
                            alert('Kullanıcı silindi!');
                          }
                        }}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Role Authorization View
function RoleAuthorizationView() {
  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5 text-purple-600" />
          Rol ve Yetkilendirme Yönetimi
        </h3>
        <p className="text-gray-600 mb-4">Kullanıcı rollerini ve yetkilerini yönetin</p>
        <div className="text-center py-8">
          <Shield className="h-16 w-16 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Rol yönetimi ekranı hazırlanıyor...</p>
        </div>
      </div>
    </div>
  );
}

// Definitions Parameters View — rapor menüsü ve diğer sistem parametreleri
function DefinitionsParametersView() {
  const { tm } = useLanguage();
  const [params, setParams] = useState(() => getRuntimeReportMenuParams());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { loadReportMenuParams } = await import('../../services/reportMenuParamsService');
        const data = await loadReportMenuParams();
        if (!cancelled) setParams(data);
      } catch {
        if (!cancelled) setToast(tm('reportMenuParamsLoadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tm]);

  const reportParamRows: { key: ReportMenuParamKey; labelKey: string }[] = [
    { key: 'beauty-overdue-uncalled-report', labelKey: 'bOverdueUncalledReportMenu' },
    { key: 'beauty-survey-report', labelKey: 'bShellNavSurveyReport' },
    { key: 'beauty-survey-trend-report', labelKey: 'bSurveyTrendReportMenu' },
    { key: 'beauty-survey-staff-report', labelKey: 'bSurveyStaffReportMenu' },
    { key: 'beauty-survey-service-report', labelKey: 'bSurveyServiceReportMenu' },
    { key: 'beauty-survey-nps-report', labelKey: 'bSurveyNpsReportMenu' },
    { key: 'beauty-survey-comments-report', labelKey: 'bSurveyCommentsReportMenu' },
  ];

  const featureParamRows: { key: ReportMenuParamKey; labelKey: string }[] = [
    { key: 'virtual-pbx-caller-id', labelKey: 'menuParamVirtualPbx' },
    { key: 'stock-price-change-slips', labelKey: 'menuParamStockPriceChange' },
    { key: 'product-list-sales-purchase-totals', labelKey: 'menuParamProductListSalesPurchaseTotals' },
    { key: 'daily-report-supplier-payments', labelKey: 'menuParamDailyReportSupplierPayments' },
  ];

  const toggleParam = (key: ReportMenuParamKey) => {
    setParams((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      const { saveReportMenuParams } = await import('../../services/reportMenuParamsService');
      await saveReportMenuParams(params);
      setToast(tm('reportMenuParamsSaved'));
    } catch {
      setToast(tm('reportMenuParamsSaveError'));
    } finally {
      setSaving(false);
    }
  };

  const renderParamList = (rows: { key: ReportMenuParamKey; labelKey: string }[]) => (
    <ul className="divide-y divide-gray-100">
      {rows.map((row) => {
        const on = params[row.key] === true;
        return (
          <li key={row.key} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{tm(row.labelKey)}</p>
              <p className="text-[11px] text-gray-400 font-mono truncate">{row.key}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => toggleParam(row.key)}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                on ? 'bg-green-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  on ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Settings className="h-5 w-5 text-green-600" />
          {tm('parameterSettingsTitle')}
        </h3>
        <p className="text-sm text-gray-500 mb-6">{tm('parameterSettingsSubtitle')}</p>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-gray-500 text-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
            {tm('loading')}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h4 className="text-sm font-semibold text-gray-800">{tm('reportMenuParamsSection')}</h4>
                <p className="text-xs text-gray-500 mt-0.5">{tm('reportMenuParamsHint')}</p>
              </div>
              {renderParamList(reportParamRows)}
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h4 className="text-sm font-semibold text-gray-800">{tm('featureMenuParamsSection')}</h4>
                <p className="text-xs text-gray-500 mt-0.5">{tm('featureMenuParamsHint')}</p>
              </div>
              {renderParamList(featureParamRows)}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={loading || saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {tm('save')}
          </button>
          {toast && <span className="text-sm text-gray-600">{toast}</span>}
        </div>
      </div>
    </div>
  );
}

// Fiş / Firma Bilgisi View — fişte gösterilecek logo ve firma bilgileri
function ReceiptSettingsView() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState({
    companyName: '',
    companyAddress: '',
    companyPhone: '',
    companyTaxOffice: '',
    companyTaxNumber: '',
    logoDataUrl: '' as string,
    /** Boş = uygulama dili; dolu = POS fiş varsayılanı */
    defaultReceiptLanguage: '' as '' | 'tr' | 'en' | 'ar' | 'ku' | 'uz',
    productNameFieldTr: 'name',
    productNameFieldEn: 'name',
    productNameFieldAr: 'name',
    productNameFieldKu: 'name',
    productNameFieldUz: 'name',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getReceiptSettings } = await import('../../services/receiptSettingsService');
        const data = await getReceiptSettings();
        if (!cancelled) {
          const m = data.productNameFieldByLang || {};
          setForm({
            companyName: data.companyName ?? '',
            companyAddress: data.companyAddress ?? '',
            companyPhone: data.companyPhone ?? '',
            companyTaxOffice: data.companyTaxOffice ?? '',
            companyTaxNumber: data.companyTaxNumber ?? '',
            logoDataUrl: data.logoDataUrl ?? '',
            defaultReceiptLanguage: (['tr', 'en', 'ar', 'ku', 'uz'].includes(String(data.defaultReceiptLanguage))
              ? (data.defaultReceiptLanguage as 'tr' | 'en' | 'ar' | 'ku' | 'uz')
              : '') as '' | 'tr' | 'en' | 'ar' | 'ku' | 'uz',
            productNameFieldTr: m.tr || 'name',
            productNameFieldEn: m.en || 'name',
            productNameFieldAr: m.ar || 'name',
            productNameFieldKu: m.ku || 'name',
            productNameFieldUz: m.uz || 'name',
          });
        }
      } catch (e) {
        if (!cancelled) setToast('Ayarlar yüklenemedi.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, logoDataUrl: (reader.result as string) ?? '' }));
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      const { saveReceiptSettings, invalidateReceiptSettingsCache } = await import('../../services/receiptSettingsService');
      await saveReceiptSettings({
        companyName: form.companyName || undefined,
        companyAddress: form.companyAddress || undefined,
        companyPhone: form.companyPhone || undefined,
        companyTaxOffice: form.companyTaxOffice || undefined,
        companyTaxNumber: form.companyTaxNumber || undefined,
        logoDataUrl: form.logoDataUrl || undefined,
        defaultReceiptLanguage: form.defaultReceiptLanguage || undefined,
        productNameFieldByLang: {
          tr: form.productNameFieldTr || 'name',
          en: form.productNameFieldEn || 'name',
          ar: form.productNameFieldAr || 'name',
          ku: form.productNameFieldKu || 'name',
          uz: form.productNameFieldUz || 'name',
        },
      });
      invalidateReceiptSettingsCache();
      setToast('Fiş ayarları kaydedildi.');
    } catch (e) {
      setToast('Kaydetme başarısız.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-gray-500">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <Receipt className="h-5 w-5 text-amber-600" />
          Fiş / Firma Bilgisi
        </h3>
        <p className="text-gray-600 mb-6 text-sm">
          Hesap (adisyon), mutfak fişi, ödeme ekranı fişi ve 80 mm önizlemede kullanılacak firma bilgisi, logo, varsayılan fiş dili ve ürün adı alanları.
        </p>

        {toast && (
          <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${toast.includes('başarısız') ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
            {toast}
          </div>
        )}

        <div className="space-y-6 max-w-3xl">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Firma logosu (fişte üstte)</label>
            <div className="flex items-start gap-4">
              <div className="shrink-0 w-24 h-24 border border-gray-300 rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center">
                {form.logoDataUrl ? (
                  <img src={form.logoDataUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                ) : (
                  <Image className="w-10 h-10 text-gray-400" />
                )}
              </div>
              <div className="flex-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="block w-full text-sm text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-amber-50 file:text-amber-700"
                />
                <p className="text-xs text-gray-500 mt-1">Önerilen: kare veya yatay logo, 200x200 px civarı.</p>
                {form.logoDataUrl && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, logoDataUrl: '' }))}
                    className="mt-2 text-xs text-red-600 hover:underline"
                  >
                    Logoyu kaldır
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Firma / işletme adı</label>
            <input
              type="text"
              value={form.companyName}
              onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Örn: ABC Restoran"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Adres</label>
            <input
              type="text"
              value={form.companyAddress}
              onChange={(e) => setForm((f) => ({ ...f, companyAddress: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Cadde, mahalle, şehir"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
            <input
              type="text"
              value={form.companyPhone}
              onChange={(e) => setForm((f) => ({ ...f, companyPhone: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="+90 212 ..."
            />
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-4 space-y-4">
            <h4 className="text-sm font-semibold text-gray-900">Fiş dili ve ürün adı alanları</h4>
            <p className="text-xs text-gray-600">
              Restoran ve Market POS’ta fiş / önizleme açılışında kullanılacak varsayılan dil (mutfak fişi ve ödeme fişi dahil). “Uygulama dili” seçiliyse arayüz dili kullanılır; yoksa yazıcı ayarındaki yerel varsayılan yedeklenir. Ürün adı: her dil için `rex_*_products` tablosundaki alan adını seçin (ör. İngilizce için <code className="bg-white px-1 rounded">description_en</code>).
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Varsayılan fiş dili</label>
              <select
                value={form.defaultReceiptLanguage}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    defaultReceiptLanguage: e.target.value as typeof f.defaultReceiptLanguage,
                  }))
                }
                className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg bg-white"
              >
                <option value="">Uygulama dili (otomatik)</option>
                <option value="tr">Türkçe</option>
                <option value="en">English</option>
                <option value="ar">العربية</option>
                <option value="ku">کوردی</option>
                <option value="uz">Oʻzbekcha</option>
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(
                [
                  { key: 'productNameFieldTr' as const, label: 'TR — ürün adı alanı' },
                  { key: 'productNameFieldEn' as const, label: 'EN — ürün adı alanı' },
                  { key: 'productNameFieldAr' as const, label: 'AR — ürün adı alanı' },
                  { key: 'productNameFieldKu' as const, label: 'KU — ürün adı alanı' },
                  { key: 'productNameFieldUz' as const, label: 'UZ — ürün adı alanı' },
                ]
              ).map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                  <select
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
                  >
                    {RECEIPT_PRODUCT_NAME_FIELD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vergi dairesi</label>
              <input
                type="text"
                value={form.companyTaxOffice}
                onChange={(e) => setForm((f) => ({ ...f, companyTaxOffice: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="Örn: Kadıköy"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vergi numarası</label>
              <input
                type="text"
                value={form.companyTaxNumber}
                onChange={(e) => setForm((f) => ({ ...f, companyTaxNumber: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="10 haneli"
              />
            </div>
          </div>

          <div className="pt-4 border-t flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>
      <InvoiceCodeFormatSettings />
    </div>
  );
}

// Data Broadcast View
function DataBroadcastView() {
  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Radio className="h-5 w-5 text-orange-600" />
          Bilgi Gönder / AI Merkezi
        </h3>
        <p className="text-gray-600 mb-4">Merkezi veri yayını ve AI entegrasyonu</p>
        <div className="text-center py-8">
          <Radio className="h-16 w-16 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Veri yayını ekranı hazırlanıyor...</p>
        </div>
      </div>
    </div>
  );
}

// Backup Restore View
function BackupRestoreView() {
  const [busy, setBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<string | null>(null);
  const [pendingVersion, setPendingVersion] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [bridgeOk, setBridgeOk] = useState<boolean | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const logPreRef = useRef<HTMLPreElement>(null);

  const appendLog = useCallback((line: string) => {
    const stamp = new Date().toLocaleTimeString('tr-TR', { hour12: false });
    setLogLines((prev) => [...prev, `[${stamp}] ${line}`]);
  }, []);

  useEffect(() => {
    const el = logPreRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logLines]);

  useEffect(() => {
    if (IS_TAURI) return;
    let cancelled = false;
    checkPgBridgeReachable().then((ok) => {
      if (!cancelled) setBridgeOk(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!IS_TAURI) return;
    let cancelled = false;
    checkDesktopUpdate()
      .then((u) => {
        if (cancelled) return;
        if (u) {
          setPendingVersion(u.version);
          setUpdateInfo(`Yeni sürüm mevcut: v${u.version} (kurulu: v${APP_VERSION.full})`);
        } else {
          setUpdateInfo(`Güncel sürüm: v${APP_VERSION.full}`);
        }
      })
      .catch((e) => {
        if (!cancelled) setUpdateInfo(`Güncelleme kontrolü: ${String((e as Error)?.message || e)}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDesktopUpdate = async () => {
    if (!pendingVersion) return;
    const ok = window.confirm(
      `v${pendingVersion} kurulacak. Önce PostgreSQL tam yedeği alınır; yedek başarısız olursa güncelleme iptal edilir. Devam?`,
    );
    if (!ok) return;
    setToast(null);
    setUpdateBusy(true);
    appendLog('=== Masaüstü güncelleme (GitHub) ===');
    try {
      const res = await runDesktopUpdateWithBackup((p: DesktopUpdateProgress) => {
        appendLog(p.message);
      });
      if (res.ok) {
        setToast({ kind: 'ok', text: res.message });
      } else {
        setToast({ kind: 'err', text: res.message });
      }
    } finally {
      appendLog('=== Güncelleme işlemi sonu ===');
      setUpdateBusy(false);
    }
  };

  const handleFullPgBackup = async () => {
    setToast(null);
    appendLog('=== PostgreSQL tam yedek ===');
    setBusy(true);
    try {
      const res = await runPostgresFullBackup((line) => appendLog(line));
      if (res.ok) {
        if (res.mode === 'tauri') {
          setToast({ kind: 'ok', text: res.message });
        } else {
          setToast({ kind: 'ok', text: `Dosya indirildi: ${res.fileName}` });
        }
      } else {
        setToast({ kind: 'err', text: res.message });
      }
    } finally {
      appendLog('=== İşlem sonu ===');
      setBusy(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {IS_TAURI && (
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-4 border-b">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Download className="h-5 w-5 text-blue-600" />
              Masaüstü güncelleme (GitHub)
            </h3>
            <p className="text-sm text-gray-600 mt-2 max-w-3xl">
              Güncelleme paketi GitHub Release üzerinden indirilir. Kurulumdan önce{' '}
              <code className="text-xs bg-gray-100 px-1 rounded">pg_dump</code> ile tam SQL yedeği alınır;
              uygulama yeniden açıldığında bekleyen migration dosyaları otomatik uygulanır.
            </p>
            <p className="text-xs text-slate-500 mt-1 break-all">{getDesktopUpdateEndpoint()}</p>
          </div>
          <div className="p-6 space-y-4">
            {updateInfo && (
              <p className={`text-sm ${pendingVersion ? 'text-blue-800' : 'text-gray-600'}`}>{updateInfo}</p>
            )}
            <button
              type="button"
              onClick={handleDesktopUpdate}
              disabled={updateBusy || !pendingVersion}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updateBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {pendingVersion ? `Güncelle (v${pendingVersion})` : 'Güncelleme yok'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Database className="h-5 w-5 text-indigo-600" />
            PostgreSQL tam yedek
          </h3>
          <p className="text-sm text-gray-600 mt-2 max-w-3xl">
            <code className="text-xs bg-gray-100 px-1 rounded">pg_dump</code> ile şema ve verilerin tamamı düz SQL
            dosyası olarak alınır. Çevrimiçi modda uzak sunucu, çevrimdışı veya hibritte yerel şube veritabanı
            yedeklenir. Sunucuda PostgREST (HTTPS) kullanılıyorsa yedek, köprü üzerinden PostgREST ile{' '}
            <strong>aynı Docker içi PostgreSQL</strong> bağlantısıyla alınır (<code className="text-xs bg-gray-100 px-1 rounded">/api/pg_dump_internal</code>
            ); tarayıcıdaki <code className="text-xs bg-gray-100 px-1 rounded">api…:443</code> adresi doğrudan{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">pg_dump</code> için kullanılmaz.
          </p>
        </div>
        <div className="p-6 space-y-4">
          {!IS_TAURI && bridgeOk !== null && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                bridgeOk
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              {bridgeOk
                ? 'pg_bridge erişilebilir — tarayıcıdan tam yedek indirilebilir (sunucuda pg_dump kurulu olmalı).'
                : 'pg_bridge yanıt vermiyor. Web’de tam yedek için `npm run bridge` veya aynı origin üzerinden köprüyü çalıştırın.'}
            </div>
          )}
          {IS_TAURI && (
            <p className="text-sm text-gray-600">
              Yedek dosyası, yapılandırmada tanımlı yedek klasörüne (boşsa{' '}
              <code className="text-xs bg-gray-100 px-1 rounded">C:\RetailEX_Backups</code>) yazılır. PostgreSQL
              istemci araçlarında <code className="text-xs bg-gray-100 px-1 rounded">pg_dump</code> bulunmalıdır.
            </p>
          )}

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">İşlem günlüğü</span>
              <button
                type="button"
                disabled={busy || logLines.length === 0}
                onClick={() => setLogLines([])}
                className="text-xs text-slate-500 hover:text-indigo-600 disabled:opacity-40 disabled:pointer-events-none"
              >
                Günlüğü temizle
              </button>
            </div>
            <pre
              ref={logPreRef}
              className="min-h-[10rem] max-h-72 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-emerald-400 shadow-inner whitespace-pre-wrap break-words"
              aria-live="polite"
              aria-label="Yedekleme günlüğü"
            >
              {logLines.length === 0 ? (
                <span className="text-slate-500">Henüz kayıt yok. «Tam PostgreSQL yedeği al» ile başlatın.</span>
              ) : (
                logLines.join('\n')
              )}
            </pre>
          </div>

          {toast && (
            <div
              className={`rounded-lg px-4 py-3 text-sm ${
                toast.kind === 'ok' ? 'bg-green-50 text-green-900 border border-green-200' : 'bg-red-50 text-red-900 border border-red-200'
              }`}
            >
              {toast.text}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={handleFullPgBackup}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Download className="h-5 w-5" aria-hidden />}
              {busy ? 'Yedekleniyor…' : 'Tam PostgreSQL yedeği al'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-indigo-600" />
            Diğer yedekleme / geri yükleme
          </h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-6 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center gap-3 text-center">
              <Upload className="h-8 w-8 text-gray-400" />
              <span className="font-medium text-gray-700">Geri yükleme</span>
              <span className="text-sm text-gray-500">SQL geri yükleme sihirbazı bu ekranda yakında sunulacak.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Log Audit View
function LogAuditView() {
  const logs = [
    { id: 1, user: 'Ahmed Al-Maliki', action: 'Kullanıcı Girişi', module: 'Sistem', details: 'Başarılı giriş', timestamp: '2025-01-18 14:30:15', ip: '192.168.1.100' },
    { id: 2, user: 'Mohammed Hassan', action: 'Ürün Ekleme', module: 'Stok', details: 'Yeni ürün eklendi: iPhone 15 Pro', timestamp: '2025-01-18 13:15:42', ip: '192.168.1.101' },
    { id: 3, user: 'Ali Al-Sadr', action: 'Satış', module: 'POS', details: 'Satış tamamlandı: 1,250,000 IQD', timestamp: '2025-01-18 12:00:30', ip: '192.168.1.102' },
  ];

  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="h-5 w-5 text-red-600" />
            Log ve Denetim Kayıtları
          </h3>
          <p className="text-sm text-gray-600 mt-1">{logs.length} kayıt listeleniyor</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 text-sm font-medium text-gray-700">Zaman</th>
                <th className="text-left p-3 text-sm font-medium text-gray-700">Kullanıcı</th>
                <th className="text-left p-3 text-sm font-medium text-gray-700">İşlem</th>
                <th className="text-left p-3 text-sm font-medium text-gray-700">Modül</th>
                <th className="text-left p-3 text-sm font-medium text-gray-700">Detaylar</th>
                <th className="text-left p-3 text-sm font-medium text-gray-700">IP Adresi</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 text-sm text-gray-700">{log.timestamp}</td>
                  <td className="p-3 text-sm font-medium text-gray-800">{log.user}</td>
                  <td className="p-3">
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">{log.action}</span>
                  </td>
                  <td className="p-3 text-sm text-gray-700">{log.module}</td>
                  <td className="p-3 text-sm text-gray-600">{log.details}</td>
                  <td className="p-3 text-sm text-gray-500 font-mono">{log.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// System Health View — Grafana panosu (Dokploy: /__grafana → grafana:3000)
function SystemHealthView() {
  const { darkMode } = useTheme();
  const embedUrl = getGrafanaEmbedUrl({ dark: darkMode });
  const baseUrl = getGrafanaBaseUrl();
  const [iframeError, setIframeError] = useState(false);

  return (
    <div className={`flex flex-col h-full min-h-0 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div
        className={`shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b ${
          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Activity className={`h-5 w-5 shrink-0 ${darkMode ? 'text-teal-400' : 'text-teal-600'}`} />
          <div className="min-w-0">
            <h3 className={`font-semibold text-sm truncate ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              Sistem Sağlığı — Grafana
            </h3>
            <p className={`text-xs truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Konteyner CPU / RAM (Prometheus + cAdvisor)
            </p>
          </div>
        </div>
        <a
          href={baseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-xs font-medium px-3 py-1.5 rounded-lg border shrink-0 ${
            darkMode
              ? 'border-gray-600 text-teal-300 hover:bg-gray-700'
              : 'border-teal-200 text-teal-700 hover:bg-teal-50'
          }`}
        >
          Grafana’yı aç
        </a>
      </div>

      <div className="flex-1 min-h-0 relative" style={{ minHeight: 'min(70vh, 640px)' }}>
        {iframeError ? (
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center ${
              darkMode ? 'text-gray-300' : 'text-gray-600'
            }`}
          >
            <AlertCircle className="h-10 w-10 text-amber-500" />
            <p className="font-medium">Grafana yüklenemedi</p>
            <p className="text-sm max-w-md">
              Dokploy’da <code className="text-xs">grafana</code> servisinin çalıştığını ve frontend nginx
              proxy’sinin (<code className="text-xs">/__grafana</code>) güncel olduğunu kontrol edin.
            </p>
            <a
              href={baseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-teal-600 hover:underline"
            >
              {baseUrl}
            </a>
          </div>
        ) : (
          <iframe
            title="Grafana Sistem Sağlığı"
            src={embedUrl}
            className="absolute inset-0 w-full h-full border-0 bg-transparent"
            allow="fullscreen"
            referrerPolicy="no-referrer-when-downgrade"
            onError={() => setIframeError(true)}
          />
        )}
      </div>
    </div>
  );
}
