import React, { useState, useEffect, useRef } from 'react';
import {
  Send, Radio, CheckCircle, XCircle, Clock, RefreshCw, Trash2, Monitor, Store,
  Plus, Filter, Download, Upload, Calendar, Users, Settings, BarChart3,
  Layers, MapPin, Box, AlertTriangle, TrendingUp, Server, Zap, Layout,
  FileText, Copy, Edit, Tag, Save, X, Search, ChevronDown, ChevronRight
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Input } from '../ui/input';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  centralBroadcast,
  BroadcastMessage,
  DeviceStatus,
  DeviceGroup,
  BroadcastTemplate,
  BroadcastCondition
} from '../../utils/centralDataBroadcast';
import { logger } from '../../utils/logger';
import { toast } from 'sonner';
import {
  enqueueEnterpriseRecord,
  enqueueEnterpriseBulk,
  enqueueAllMasterData,
  clearEnterpriseSyncQueue,
  retryEnterpriseSyncMessage,
  cancelEnterpriseSyncMessage,
  getEnterpriseSyncStats,
  getDayEndSyncStatus,
  getMposTerminalDailyStatus,
  listEnterpriseSyncMessages,
  loadEnterpriseDevices,
  processEnterpriseSyncQueue,
  pullBranchDataFromCenter,
  pullSalesAndDayEndFromBranches,
  pushMasterDataToBranches,
  resolveRecordIdFromForm,
  type EnterpriseSyncMessage,
  type DayEndStoreStatus,
  type MposTerminalDailyStatus,
} from '../../services/enterpriseSyncService';
import {
  MPOS_SEND_FILE_TYPES,
  sendMposInfoToKasaAndPush,
  sendMposInfoToAllKasasInStore,
  sendMposInfoToSelectedKasas,
  type MposSendFileType,
  type MposSendSyncMode,
} from '../../services/mposSendService';
import { checkMposSendGuard } from '../../services/mposSendGuardService';
import {
  MPOS_RECEIVE_FILE_TYPES,
  receiveMposInfoFromKasa,
  receiveDayEndFromKasas,
  type MposReceiveFileType,
} from '../../services/mposReceiveService';
import { DB_SETTINGS, ERP_SETTINGS, updateConfigs } from '../../services/postgres';
import { type BranchStoreOption } from '../../services/hybridSyncService';
import {
  listPosTerminalRegistrations,
  type PosTerminalRegistration,
} from '../../services/deviceRegistrationService';
import { organizationAPI, type Firm } from '../../services/api/organization';
import { BroadcastFormFields } from './BroadcastFormFields';
import { BroadcastChangesTimeline } from './BroadcastChangesTimeline';
import { SentMessagesList } from '../system/SentMessagesList';
import { BroadcastDataSelector } from './BroadcastDataSelector';
import { MposKalemTargetBar } from './MposKalemTargetBar';
import { MposDataTransferModal, type MposSendDeviceStatus } from './MposDataTransferModal';
import { MposDayEndDialog } from './MposDayEndDialog';
import { MposSyncLogPanel } from './MposSyncLogPanel';
import {
  getMposKasaReportSummary,
  type MposKasaReportSummary,
} from '../../services/mposKasaReportsService';

export function EnterpriseCentralDataManagement() {
  const { darkMode } = useTheme();
  const theme = darkMode ? 'dark' : 'light';
  const { t } = useLanguage();

  const [queue, setQueue] = useState<BroadcastMessage[]>([]);
  const [devices, setDevices] = useState<DeviceStatus[]>([]);
  const [deviceGroups, setDeviceGroups] = useState<DeviceGroup[]>([]);
  const [templates, setTemplates] = useState<BroadcastTemplate[]>([]);
  const [stats, setStats] = useState<any>({
    totalDevices: 0,
    onlineDevices: 0,
    offlineDevices: 0,
    pendingBroadcasts: 0,
    scheduledBroadcasts: 0,
    deliveredBroadcasts: 0,
    failedBroadcasts: 0,
    totalPendingMessages: 0,
    successRate: 0,
    averageDeliveryTime: 0,
    totalDataTransferred: 0,
    last24hBroadcasts: 0,
    last24hSuccess: 0,
    last24hFailed: 0
  });
  const [history, setHistory] = useState<BroadcastMessage[]>([]);
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  // Form state
  const [broadcastType, setBroadcastType] = useState<BroadcastMessage['type']>('product');
  const [broadcastAction, setBroadcastAction] = useState<BroadcastMessage['action']>('sync');
  const [broadcastPriority, setBroadcastPriority] = useState<BroadcastMessage['priority']>('normal');
  const [broadcastChannel, setBroadcastChannel] = useState<BroadcastMessage['channel']>('auto');
  const [targetDevices, setTargetDevices] = useState<string[]>(['all']);
  const [targetGroups, setTargetGroups] = useState<string[]>([]);
  const [targetStores, setTargetStores] = useState<string[]>([]);
  const [targetRegions, setTargetRegions] = useState<string[]>([]);
  const [conditions, setConditions] = useState<BroadcastCondition[]>([]);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [tags, setTags] = useState<string[]>([]);

  // Kullanıcı dostu form verileri
  const [formData, setFormData] = useState<Record<string, any>>({});

  // Yeni ayarlar
  const [messageCheckInterval, setMessageCheckInterval] = useState(
    () => DB_SETTINGS.hybridSyncIntervalSec ?? 30,
  );
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const [bulkSearch, setBulkSearch] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkOnlyChanged, setBulkOnlyChanged] = useState(false);
  const [bulkType, setBulkType] = useState<'product' | 'customer'>('product');
  const [dayEndStatus, setDayEndStatus] = useState<DayEndStoreStatus[]>([]);

  // Group management state
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupColor, setGroupColor] = useState('#3B82F6');
  const [selectedDevicesForGroup, setSelectedDevicesForGroup] = useState<string[]>([]);

  // Template management state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const [templateDescription, setTemplateDescription] = useState('');

  // Selector state
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorType, setSelectorType] = useState<'product' | 'customer' | 'campaign'>('product');

  // Filter state
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDateRange, setFilterDateRange] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [isSyncBusy, setIsSyncBusy] = useState(false);

  const [firms, setFirms] = useState<Firm[]>([]);
  const [branchStores, setBranchStores] = useState<BranchStoreOption[]>([]);
  const [approvedTerminals, setApprovedTerminals] = useState<PosTerminalRegistration[]>([]);
  const [selectedFirmNr, setSelectedFirmNr] = useState('');
  const [selectedBranchStoreId, setSelectedBranchStoreId] = useState('');
  const [selectedTerminalDeviceId, setSelectedTerminalDeviceId] = useState('');
  const [mposFileTypes, setMposFileTypes] = useState<MposSendFileType[]>(['products']);
  const [mposReceiveFileTypes, setMposReceiveFileTypes] = useState<MposReceiveFileType[]>(['sales']);
  const [terminalDailyStatus, setTerminalDailyStatus] = useState<MposTerminalDailyStatus[]>([]);
  const [kasaReport, setKasaReport] = useState<MposKasaReportSummary | null>(null);
  const [includeProductImages, setIncludeProductImages] = useState(false);
  const [selectedTerminalDeviceIds, setSelectedTerminalDeviceIds] = useState<string[]>([]);
  const [mposSyncMode, setMposSyncMode] = useState<MposSendSyncMode>('full');
  const [mposDateFrom, setMposDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [mposDateTo, setMposDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [sendProgress, setSendProgress] = useState<{ current: number; total: number; label: string } | null>(
    null,
  );
  const [sendDeviceStatuses, setSendDeviceStatuses] = useState<MposSendDeviceStatus[]>([]);
  const [dayEndDialogOpen, setDayEndDialogOpen] = useState(false);
  const [dayEndProgress, setDayEndProgress] = useState<{ current: number; total: number; label: string } | null>(
    null,
  );
  const [filterQueueByKasa, setFilterQueueByKasa] = useState(true);
  const [dayEndAutoEnabled, setDayEndAutoEnabled] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem('retailex_mpos_dayend_auto') === '1',
  );
  const [dayEndAutoTime, setDayEndAutoTime] = useState(
    () => (typeof localStorage !== 'undefined' && localStorage.getItem('retailex_mpos_dayend_time')) || '23:00',
  );
  const lastDayEndAutoRunRef = useRef('');
  const [showAdvancedSend, setShowAdvancedSend] = useState(false);
  const [mposTransferModalOpen, setMposTransferModalOpen] = useState(false);

  const padFirmNr = (nr: string) => String(nr || '').replace(/\D/g, '').padStart(3, '0');

  const resolveMposTargetStoreId = (): string | null => selectedBranchStoreId || null;

  const resolveMposEffectiveStoreId = (): string => {
    const fromBranch = selectedBranchStoreId.trim();
    if (fromBranch) return fromBranch;
    return selectedTerminal()?.storeId?.trim() || '';
  };

  const selectedTerminal = (): PosTerminalRegistration | undefined =>
    approvedTerminals.find((t) => t.deviceId === selectedTerminalDeviceId);

  const filteredTerminalsForFirm = approvedTerminals.filter(
    (t) => padFirmNr(t.firmNr) === padFirmNr(selectedFirmNr),
  );

  const mposTransferBlockReason = (): string | null => {
    if (!selectedFirmNr) return 'Firma seçin.';
    if (!selectedTerminalDeviceIds.length) return 'En az bir kasa seçin.';
    const selected = filteredTerminalsForFirm.filter((t) =>
      selectedTerminalDeviceIds.includes(t.deviceId),
    );
    const missingStore = selected.filter((t) => !t.storeId?.trim());
    if (missingStore.length) {
      const names = missingStore.map((t) => t.terminalName).join(', ');
      return `Mağaza bağlantısı olmayan kasalar: ${names}. Sistem Yönetimi → Kasa Cihazları → Onaylı sekmesinden mağaza atayın.`;
    }
    return null;
  };

  const mposFirmOptions = firms.map((f) => ({
    firmNr: padFirmNr(f.firm_nr),
    name: f.name,
  }));

  const mposTargetLabel = (): string => {
    const f = firms.find((x) => padFirmNr(x.firm_nr) === padFirmNr(selectedFirmNr));
    const selected = filteredTerminalsForFirm.filter((t) =>
      selectedTerminalDeviceIds.includes(t.deviceId),
    );
    if (!f && selected.length === 0) return 'Firma ve kasa seçilmedi';
    if (f && selected.length > 1) {
      return `${f.name} (${padFirmNr(f.firm_nr)}) → ${selected.length} kasa`;
    }
    const t = selected[0] ?? selectedTerminal();
    if (f && t) {
      const deviceLabel = t.storeName
        ? `${t.terminalName} — ${t.storeName}`
        : t.terminalName;
      return `${f.name} (${padFirmNr(f.firm_nr)}) → ${deviceLabel}`;
    }
    if (f) return `${f.name} (${padFirmNr(f.firm_nr)})`;
    return t?.terminalName ?? '—';
  };

  const mposSelectedTerminals = () =>
    filteredTerminalsForFirm
      .filter((t) => selectedTerminalDeviceIds.includes(t.deviceId))
      .map((t) => ({
        deviceId: t.deviceId,
        terminalName: t.terminalName,
        storeName: t.storeName,
        storeId: t.storeId?.trim() || '',
      }));

  const handleTerminalSelectionChange = (deviceIds: string[]) => {
    setSelectedTerminalDeviceIds(deviceIds);
    if (deviceIds.length === 1) {
      handleTerminalChange(deviceIds[0]);
    } else if (deviceIds.length === 0) {
      setSelectedTerminalDeviceId('');
      setSelectedBranchStoreId('');
    } else if (!deviceIds.includes(selectedTerminalDeviceId)) {
      const first = approvedTerminals.find((t) => t.deviceId === deviceIds[0]);
      setSelectedTerminalDeviceId(deviceIds[0]);
      setSelectedBranchStoreId(first?.storeId?.trim() || '');
    }
  };

  const handleTerminalChange = (deviceId: string) => {
    setSelectedTerminalDeviceId(deviceId);
    setSelectedTerminalDeviceIds(deviceId ? [deviceId] : []);
    const term = approvedTerminals.find((t) => t.deviceId === deviceId);
    setSelectedBranchStoreId(term?.storeId?.trim() || '');
  };

  const handleFirmChange = (firmNr: string) => {
    setSelectedFirmNr(firmNr);
    setSelectedBranchStoreId('');
    setSelectedTerminalDeviceId('');
    setSelectedTerminalDeviceIds([]);
  };

  const handleBranchStoreChange = (storeId: string) => {
    setSelectedBranchStoreId(storeId);
    setSelectedTerminalDeviceId('');
    setSelectedTerminalDeviceIds([]);
  };

  const refreshKasaReport = async () => {
    const storeId = resolveMposEffectiveStoreId();
    if (!storeId) {
      setKasaReport(null);
      return;
    }
    const term = selectedTerminal();
    const r = await getMposKasaReportSummary({
      storeId,
      terminalName: term?.terminalName,
    });
    setKasaReport(r);
  };

  const validateMposKasaTarget = (requireMulti = false): boolean => {
    if (!selectedFirmNr) {
      toast.error('Lütfen firma seçin.');
      return false;
    }
    if (requireMulti) {
      if (!selectedTerminalDeviceIds.length) {
        toast.error('Lütfen en az bir kasa seçin.');
        return false;
      }
      const selected = filteredTerminalsForFirm.filter((t) =>
        selectedTerminalDeviceIds.includes(t.deviceId),
      );
      const missingStore = selected.filter((t) => !t.storeId?.trim());
      if (missingStore.length) {
        toast.error(
          `Mağaza bağlantısı olmayan kasalar: ${missingStore.map((t) => t.terminalName).join(', ')}`,
        );
        return false;
      }
      return true;
    }
    if (!selectedTerminalDeviceId) {
      toast.error('Lütfen kasa seçin.');
      return false;
    }
    if (!resolveMposEffectiveStoreId()) {
      toast.error('Seçili kasanın mağaza bağlantısı yok. Merkezde kasa kaydını kontrol edin.');
      return false;
    }
    return true;
  };

  const validateMposTarget = (): boolean => validateMposKasaTarget();

  const mapEnterpriseToBroadcast = (m: EnterpriseSyncMessage): BroadcastMessage => ({
    id: m.id,
    type: (m.type === 'sale' ? 'custom' : m.type) as BroadcastMessage['type'],
    action: (['create', 'update', 'delete', 'sync'].includes(m.action)
      ? m.action
      : 'sync') as BroadcastMessage['action'],
    data: {
      ...(m.data ?? {}),
      ...(m.terminalName ? { _syncTerminalName: m.terminalName } : {}),
    },
    targetDevices: m.targetDevices,
    priority: 'normal',
    channel: 'auto',
    createdAt: m.createdAt,
    status:
      m.status === 'completed'
        ? 'delivered'
        : m.status === 'failed'
          ? 'failed'
          : m.status === 'processing'
            ? 'sending'
            : 'pending',
    deliveredTo: m.status === 'completed' ? ['all'] : [],
    failedTo: m.status === 'failed' ? ['all'] : [],
    retryCount: 0,
  });

  const refreshEnterpriseData = async () => {
    try {
      const [pgStats, pgDevices, terminals] = await Promise.all([
        getEnterpriseSyncStats(),
        loadEnterpriseDevices(),
        listPosTerminalRegistrations({ status: 'approved', allFirms: true, limit: 500 }),
      ]);
      setApprovedTerminals(terminals);
      setStats({
        ...pgStats,
        offlineDevices: Math.max(0, pgStats.totalDevices - pgStats.onlineDevices),
      });
      setDevices(
        pgDevices.map((d) => ({
          deviceId: d.deviceId,
          deviceName: d.deviceName,
          deviceType: 'pos' as const,
          storeId: d.storeId,
          storeName: d.storeName,
          region: d.firmName,
          version: d.appVersion,
          lastSeen: d.lastSeen,
          isOnline: d.isOnline,
          pendingMessages: d.pendingMessages,
          deliveredMessages: d.deliveredMessages ?? 0,
          failedMessages: d.failedMessages ?? 0,
        })),
      );
      const queueFilter =
        filterQueueByKasa && selectedTerminal()?.terminalName
          ? {
              terminalName: selectedTerminal()!.terminalName,
              targetStoreId: selectedBranchStoreId || undefined,
            }
          : filterQueueByKasa && selectedBranchStoreId
            ? { targetStoreId: selectedBranchStoreId }
            : {};
      const pending = await listEnterpriseSyncMessages({ limit: 100, status: 'pending', ...queueFilter });
      const all = await listEnterpriseSyncMessages({ limit: 100, ...queueFilter });
      setQueue(pending.map(mapEnterpriseToBroadcast));
      setHistory(all.filter((m) => m.status === 'completed' || m.status === 'failed').map(mapEnterpriseToBroadcast));
      const de = await getDayEndSyncStatus();
      setDayEndStatus(de);
      const termDe = await getMposTerminalDailyStatus(
        selectedBranchStoreId ? { storeId: selectedBranchStoreId } : undefined,
      );
      setTerminalDailyStatus(termDe);
      await refreshKasaReport();
    } catch (e) {
      logger.warn('enterprise-sync', 'refresh failed', e);
    }
  };

  // Update data
  useEffect(() => {
    void refreshEnterpriseData();
    const interval = setInterval(() => void refreshEnterpriseData(), 3000);

    const unsubscribeBroadcast = centralBroadcast.onBroadcast((status, updatedQueue) => {
      setIsBroadcasting(status === 'started' || status === 'progress');
      setQueue(updatedQueue);
    });

    return () => {
      clearInterval(interval);
      unsubscribeBroadcast();
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const defaultFirm = padFirmNr(String(ERP_SETTINGS.firmNr || '001'));
        const [firmList, terminals] = await Promise.all([
          organizationAPI.getFirms(),
          listPosTerminalRegistrations({ status: 'approved', allFirms: true, limit: 500 }),
        ]);
        const activeFirms = firmList.filter((f) => f.is_active !== false);
        setFirms(activeFirms);
        setApprovedTerminals(terminals);
        setBranchStores(
          terminals
            .filter((t) => t.storeId && t.storeName)
            .reduce<BranchStoreOption[]>((acc, t) => {
              if (!acc.some((s) => s.id === t.storeId)) {
                acc.push({ id: t.storeId!, name: t.storeName!, code: t.storeCode || '' });
              }
              return acc;
            }, []),
        );
        if (activeFirms.some((f) => padFirmNr(f.firm_nr) === defaultFirm)) {
          setSelectedFirmNr(defaultFirm);
        } else if (activeFirms.length === 1) {
          setSelectedFirmNr(padFirmNr(activeFirms[0].firm_nr));
        }
      } catch {
        /* PG hazır değil */
      }
    })();
  }, []);

  useEffect(() => {
    const storeId = resolveMposEffectiveStoreId();
    if (storeId) setTargetDevices([storeId]);
    else setTargetDevices(['all']);
    void getMposTerminalDailyStatus(storeId ? { storeId } : undefined).then(setTerminalDailyStatus);
    void refreshKasaReport();
  }, [selectedBranchStoreId, selectedTerminalDeviceId, approvedTerminals]);

  useEffect(() => {
    if (!selectedTerminalDeviceId) return;
    const term = approvedTerminals.find((t) => t.deviceId === selectedTerminalDeviceId);
    const sid = term?.storeId?.trim() || '';
    if (sid && sid !== selectedBranchStoreId) {
      setSelectedBranchStoreId(sid);
    }
  }, [approvedTerminals, selectedTerminalDeviceId, selectedBranchStoreId]);

  const handleMposKalemSend = async (): Promise<{ success: number; failed: number } | void> => {
    if (!validateMposKasaTarget(true)) return;
    const targets = filteredTerminalsForFirm.filter((t) =>
      selectedTerminalDeviceIds.includes(t.deviceId),
    );
    if (!targets.length) {
      toast.error('Seçili kasa bulunamadı.');
      return;
    }
    const guard = await checkMposSendGuard({
      fileType: mposFileTypes[0] ?? 'products',
      storeId: targets[0]?.storeId?.trim() || resolveMposEffectiveStoreId(),
      terminalName: targets[0]?.terminalName || '',
    });
    if (!guard.allowed) {
      toast.error(guard.message);
      return;
    }
    if (guard.requireConfirm && !window.confirm(guard.message)) return;
    if (!guard.requireConfirm && guard.sentToday > 0) toast.info(guard.message);

    const initialStatuses: MposSendDeviceStatus[] = targets.map((t) => ({
      deviceId: t.deviceId,
      terminalName: t.terminalName,
      storeName: t.storeName,
      status: 'pending',
    }));
    setSendDeviceStatuses(initialStatuses);
    setIsSyncBusy(true);
    setSendProgress({ current: 0, total: targets.length, label: 'Kasalara gönderiliyor…' });

    const patchDeviceStatus = (
      deviceId: string,
      patch: Partial<MposSendDeviceStatus>,
    ) => {
      setSendDeviceStatuses((prev) =>
        prev.map((d) => (d.deviceId === deviceId ? { ...d, ...patch } : d)),
      );
    };

    try {
      let success = 0;
      let failed = 0;
      const fileTypes = mposFileTypes.length ? mposFileTypes : (['products'] as MposSendFileType[]);
      if (targets.length === 1) {
        const t = targets[0];
        const storeId = t.storeId?.trim() || resolveMposEffectiveStoreId();
        for (const fileType of fileTypes) {
          patchDeviceStatus(t.deviceId, {
            status: 'running',
            detail: `${MPOS_SEND_FILE_TYPES.find((f) => f.id === fileType)?.label ?? fileType} gönderiliyor…`,
          });
          setSendProgress({ current: 1, total: 1, label: `${t.terminalName} — ${fileType}` });
          const x = await sendMposInfoToKasaAndPush({
            fileType,
            storeId,
            terminalName: t.terminalName,
            terminalDeviceId: t.deviceId,
            includeProductImages: fileType === 'products' && includeProductImages,
            syncMode: mposSyncMode,
            dateFrom: mposSyncMode === 'incremental' ? mposDateFrom : undefined,
            dateTo: mposSyncMode === 'incremental' ? mposDateTo : undefined,
          });
          patchDeviceStatus(t.deviceId, {
            status: x.ok ? 'done' : 'error',
            detail: x.message,
            recordCount: x.count,
          });
          if (x.ok) success += 1;
          else failed += 1;
          if (x.ok) toast.success(x.message);
          else toast.error(x.message);
        }
      } else {
        for (const fileType of fileTypes) {
          const r = await sendMposInfoToSelectedKasas({
            fileType,
            terminals: targets.map((t) => ({
              terminalName: t.terminalName,
              terminalDeviceId: t.deviceId,
              storeId: t.storeId?.trim() || '',
            })),
            includeProductImages: fileType === 'products' && includeProductImages,
            syncMode: mposSyncMode,
            dateFrom: mposSyncMode === 'incremental' ? mposDateFrom : undefined,
            dateTo: mposSyncMode === 'incremental' ? mposDateTo : undefined,
            onProgress: (current, total, terminalName) => {
              setSendProgress({ current, total, label: `${terminalName} — ${fileType}` });
              const running = targets.find((t) => t.terminalName === terminalName);
              if (running) {
                patchDeviceStatus(running.deviceId, {
                  status: 'running',
                  detail: `${MPOS_SEND_FILE_TYPES.find((f) => f.id === fileType)?.label ?? fileType} gönderiliyor…`,
                });
              }
            },
            onDeviceResult: (result) => {
              patchDeviceStatus(result.terminalDeviceId, {
                status: result.ok ? 'done' : 'error',
                detail: result.message,
                recordCount: result.count,
              });
            },
          });
          success += r.success;
          failed += r.failed;
          if (r.ok) toast.success(r.message);
          else toast.error(r.message);
        }
      }
      await refreshEnterpriseData();
      return { success, failed };
    } finally {
      setIsSyncBusy(false);
      setSendProgress(null);
    }
  };

  const handleMposBulkAllKasas = async () => {
    if (!selectedFirmNr) {
      toast.error('Önce firma seçin.');
      return;
    }
    if (!filteredTerminalsForFirm.length) {
      toast.error('Bu firmada onaylı kasa yok.');
      return;
    }
    if (
      !window.confirm(
        `${filteredTerminalsForFirm.length} kasaya ${mposFileTypes.length} dosya tipi gönderilsin mi?`,
      )
    ) {
      return;
    }
    setIsSyncBusy(true);
    try {
      const byStore = new Map<string, PosTerminalRegistration[]>();
      for (const t of filteredTerminalsForFirm) {
        const sid = t.storeId?.trim();
        if (!sid) continue;
        const list = byStore.get(sid) ?? [];
        list.push(t);
        byStore.set(sid, list);
      }
      let success = 0;
      let failed = 0;
      for (const [storeId, terms] of byStore) {
        for (const fileType of mposFileTypes.length ? mposFileTypes : (['products'] as MposSendFileType[])) {
          const r = await sendMposInfoToAllKasasInStore({
            fileType,
            storeId,
            terminals: terms.map((t) => ({
              terminalName: t.terminalName,
              terminalDeviceId: t.deviceId,
            })),
            includeProductImages: fileType === 'products' && includeProductImages,
            syncMode: mposSyncMode,
            dateFrom: mposSyncMode === 'incremental' ? mposDateFrom : undefined,
            dateTo: mposSyncMode === 'incremental' ? mposDateTo : undefined,
          });
          success += r.success;
          failed += r.failed;
        }
      }
      if (success > 0 && failed === 0) toast.success(`${success} kasaya gönderildi.`);
      else if (success > 0) toast.warning(`${success} başarılı, ${failed} başarısız.`);
      else toast.error('Gönderim başarısız.');
      await refreshEnterpriseData();
    } finally {
      setIsSyncBusy(false);
    }
  };

  const handleMposKalemReset = () => {
    setSelectedTerminalDeviceId('');
    setSelectedTerminalDeviceIds([]);
    setSelectedBranchStoreId('');
    setMposFileTypes(['products']);
    setMposReceiveFileTypes(['sales']);
    setMposSyncMode('full');
    setSendProgress(null);
  };

  const handleMposKalemReceive = async () => {
    if (!validateMposKasaTarget()) return;
    const term = selectedTerminal();
    setIsSyncBusy(true);
    try {
      const receiveTypes = mposReceiveFileTypes.length
        ? mposReceiveFileTypes
        : (['sales'] as MposReceiveFileType[]);
      let okCount = 0;
      let failCount = 0;
      for (const fileType of receiveTypes) {
        const r = await receiveMposInfoFromKasa({
          fileType,
          storeId: resolveMposEffectiveStoreId(),
          terminalName: term?.terminalName || '',
          terminalDeviceId: selectedTerminalDeviceId,
        });
        if (r.ok) {
          okCount += 1;
          toast.success(r.message);
        } else {
          failCount += 1;
          toast.error(r.message);
        }
      }
      if (receiveTypes.length > 1) {
        toast.info(`${okCount} tip alındı${failCount > 0 ? `, ${failCount} hata` : ''}.`);
      }
      await refreshEnterpriseData();
    } finally {
      setIsSyncBusy(false);
    }
  };

  // MPOS Kalem: otomatik mesaj kontrol aralığı
  useEffect(() => {
    if (broadcastChannel !== 'auto') return;
    const sec = Math.min(300, Math.max(5, messageCheckInterval || 10));
    const id = window.setInterval(() => {
      void processEnterpriseSyncQueue().then((r) => {
        if (r.ok) void refreshEnterpriseData();
      });
    }, sec * 1000);
    return () => window.clearInterval(id);
  }, [broadcastChannel, messageCheckInterval]);

  useEffect(() => {
    if (!dayEndAutoEnabled) return;
    const tick = () => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (hhmm === dayEndAutoTime && lastDayEndAutoRunRef.current !== today) {
        lastDayEndAutoRunRef.current = today;
        void runBulkDayEndPull().then(() => toast.info(`Otomatik günsonu alımı (${dayEndAutoTime})`));
      }
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [dayEndAutoEnabled, dayEndAutoTime]);

  useEffect(() => {
    void refreshEnterpriseData();
  }, [filterQueueByKasa, selectedBranchStoreId, selectedTerminalDeviceId]);

  const handleSendBroadcast = async () => {
    try {
      if (!validateMposTarget()) return;
      // Form verilerinden JSON oluştur
      let data: any = {};

      switch (broadcastType) {
        case 'product':
          data = {
            id: formData.productId,
            name: formData.productName,
            barcode: formData.productBarcode,
            price: formData.productPrice ? parseFloat(formData.productPrice) : undefined,
            stock: formData.productStock ? parseInt(formData.productStock) : undefined,
            category: formData.productCategory
          };
          break;
        case 'price':
          data = {
            productId: formData.priceProductId,
            oldPrice: formData.oldPrice ? parseFloat(formData.oldPrice) : undefined,
            newPrice: formData.newPrice ? parseFloat(formData.newPrice) : undefined,
            discountPercent: formData.discountPercent ? parseFloat(formData.discountPercent) : undefined
          };
          break;
        case 'customer':
          data = {
            id: formData.customerId,
            name: formData.customerName,
            phone: formData.customerPhone,
            email: formData.customerEmail,
            address: formData.customerAddress
          };
          break;
        case 'campaign':
          data = {
            id: formData.campaignId,
            name: formData.campaignName,
            discount: formData.campaignDiscount ? parseFloat(formData.campaignDiscount) : undefined,
            startDate: formData.campaignStartDate,
            endDate: formData.campaignEndDate
          };
          break;
        case 'config':
          data = {
            key: formData.configKey,
            value: formData.configValue,
            description: formData.configDescription
          };
          break;
        case 'inventory':
          data = {
            productId: formData.inventoryProductId,
            quantity: formData.inventoryQuantity ? parseInt(formData.inventoryQuantity) : undefined,
            location: formData.inventoryLocation
          };
          break;
        case 'user':
          data = {
            id: formData.userId,
            name: formData.userName,
            email: formData.userEmail,
            role: formData.userRole
          };
          break;
        case 'notification':
          data = {
            title: formData.notificationTitle,
            message: formData.notificationMessage,
            type: formData.notificationType || 'info'
          };
          break;
        case 'report':
          data = {
            type: formData.reportType || 'sales',
            startDate: formData.reportStartDate,
            endDate: formData.reportEndDate
          };
          break;
        case 'bulk':
        case 'custom':
          try {
            data = JSON.parse(formData.customJson || '{}');
          } catch {
            data = { value: formData.customJson };
          }
          break;
      }

      // Boş alanları temizle
      Object.keys(data).forEach(key => {
        if (data[key] === undefined || data[key] === '' || data[key] === null) {
          delete data[key];
        }
      });

      const options: any = {
        targetDevices,
        targetGroups: targetGroups.length > 0 ? targetGroups : undefined,
        targetStores: targetStores.length > 0 ? targetStores : undefined,
        targetRegions: targetRegions.length > 0 ? targetRegions : undefined,
        conditions: conditions.length > 0 ? conditions : undefined,
        priority: broadcastPriority,
        channel: broadcastChannel,
        tags: tags.length > 0 ? tags : undefined
      };

      if (isScheduled && scheduledDate) {
        options.scheduledAt = new Date(scheduledDate).getTime();
      }

      if (isRecurring) {
        options.isRecurring = true;
        options.recurringSchedule = {
          frequency: 'daily',
          interval: 1,
          lastRun: 0
        };
      }

      const recordId = resolveRecordIdFromForm(broadcastType, formData);
      if (!recordId) {
        toast.error('Lütfen «Listeden Ürün Seç» ile bir kayıt seçin.');
        return;
      }

      const targetStore = resolveMposTargetStoreId();
      if (!validateMposTarget()) return;

      const syncAction =
        broadcastAction === 'delete' ? 'DELETE' : broadcastAction === 'create' ? 'INSERT' : 'UPDATE';

      const enq = await enqueueEnterpriseRecord({
        type: broadcastType,
        recordId,
        action: syncAction,
        targetStoreId: targetStore,
      });

      if (!enq.ok) {
        toast.error(enq.message);
        return;
      }

      toast.success(enq.message);

      if (broadcastChannel === 'auto') {
        setIsSyncBusy(true);
        const push = await pushMasterDataToBranches();
        setIsSyncBusy(false);
        if (push.ok) toast.info(push.message);
        else toast.error(push.message);
      }

      await refreshEnterpriseData();
      setFormData({});
      setTargetDevices(['all']);
      setTargetGroups([]);
      setTargetStores([]);
      setTargetRegions([]);
      setConditions([]);
      setTags([]);
      setIsScheduled(false);
      setScheduledDate('');
      setIsRecurring(false);

      logger.log('broadcast-ui', 'Broadcast added to queue');
    } catch (error) {
      logger.error('broadcast-ui', 'Failed to add broadcast', error);
      alert('Broadcast gönderilemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  const handleManualBroadcast = async () => {
    setIsSyncBusy(true);
    try {
      const r = await processEnterpriseSyncQueue();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      await refreshEnterpriseData();
    } finally {
      setIsSyncBusy(false);
    }
  };

  const handlePushAll = async () => {
    setIsSyncBusy(true);
    try {
      const r = await pushMasterDataToBranches();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      await refreshEnterpriseData();
    } finally {
      setIsSyncBusy(false);
    }
  };

  const handleIntervalChange = (sec: number) => {
    const normalized = Math.min(300, Math.max(5, sec || 30));
    setMessageCheckInterval(normalized);
    void updateConfigs({ settings: { hybridSyncIntervalSec: normalized } });
  };

  const handleBulkEnqueue = async () => {
    if (!validateMposTarget()) return;
    setIsSyncBusy(true);
    try {
      const r = await enqueueEnterpriseBulk({
        type: bulkType,
        search: bulkSearch || undefined,
        categoryCode: bulkCategory || undefined,
        onlyChanged: bulkOnlyChanged,
        onlyActive: true,
        targetStoreId: resolveMposTargetStoreId(),
        limit: 1000,
      });
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      await refreshEnterpriseData();
    } finally {
      setIsSyncBusy(false);
    }
  };

  const handleMposQuickSend = async (type: 'product' | 'customer' | 'all') => {
    if (!validateMposTarget()) return;
    const storeId = resolveMposTargetStoreId();
    setIsSyncBusy(true);
    try {
      const enq = await enqueueAllMasterData(type, { targetStoreId: storeId });
      if (!enq.ok) {
        toast.error(enq.message);
        return;
      }
      toast.success(enq.message);
      const push = await pushMasterDataToBranches({ targetStoreId: storeId });
      if (push.ok) toast.info(push.message);
      else toast.error(push.message);
      await refreshEnterpriseData();
    } finally {
      setIsSyncBusy(false);
    }
  };

  const handleDayEndPull = () => {
    setDayEndDialogOpen(true);
  };

  const runBulkDayEndPull = async () => {
    setIsSyncBusy(true);
    try {
      const r = await pullSalesAndDayEndFromBranches();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      await refreshEnterpriseData();
    } finally {
      setIsSyncBusy(false);
    }
  };

  const handleDayEndDialogSubmit = async (opts: {
    storeId: string;
    businessDate: string;
    terminalDeviceIds: string[];
  }) => {
    const targets = approvedTerminals.filter(
      (t) => t.storeId === opts.storeId && opts.terminalDeviceIds.includes(t.deviceId),
    );
    if (!targets.length) {
      toast.error('Seçili kasa bulunamadı.');
      return;
    }
    setIsSyncBusy(true);
    setDayEndProgress({ current: 0, total: targets.length, label: 'Günsonu alınıyor…' });
    try {
      const r = await receiveDayEndFromKasas({
        storeId: opts.storeId,
        businessDate: opts.businessDate,
        terminals: targets.map((t) => ({
          terminalName: t.terminalName,
          terminalDeviceId: t.deviceId,
        })),
        onProgress: (current, total, terminalName) => {
          setDayEndProgress({ current, total, label: `${terminalName} — günsonu alınıyor…` });
        },
      });
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      setDayEndDialogOpen(false);
      await refreshEnterpriseData();
    } finally {
      setIsSyncBusy(false);
      setDayEndProgress(null);
    }
  };

  const handleClearQueue = async (mode: 'completed' | 'all') => {
    if (mode === 'all' && !window.confirm('Tüm kuyruk kayıtları silinecek. Emin misiniz?')) return;
    const r = await clearEnterpriseSyncQueue(mode);
    if (r.ok) toast.success(r.message);
    else toast.error(r.message);
    await refreshEnterpriseData();
  };

  const handlePullAll = async () => {
    if (!validateMposKasaTarget()) return;
    setIsSyncBusy(true);
    try {
      const r = await pullBranchDataFromCenter();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      await refreshEnterpriseData();
    } finally {
      setIsSyncBusy(false);
    }
  };

  const handleCreateGroup = async () => {
    try {
      await centralBroadcast.createDeviceGroup(
        groupName,
        groupDescription,
        selectedDevicesForGroup,
        groupColor
      );
      setShowGroupModal(false);
      setGroupName('');
      setGroupDescription('');
      setSelectedDevicesForGroup([]);
      setGroupColor('#3B82F6');
    } catch (error) {
      logger.error('broadcast-ui', 'Failed to create group', error);
      alert('Grup oluşturulamadı: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  const handleCreateTemplate = async () => {
    try {
      // Form verilerini template olarak kaydet
      let dataTemplate: any = formData;

      await centralBroadcast.createTemplate(
        templateName,
        broadcastType,
        broadcastAction,
        dataTemplate,
        {
          description: templateDescription,
          targetDevices,
          targetGroups: targetGroups.length > 0 ? targetGroups : undefined,
          priority: broadcastPriority,
          channel: broadcastChannel,
          tags: tags.length > 0 ? tags : undefined
        }
      );

      setShowTemplateModal(false);
      setTemplateName('');
      setTemplateDescription('');
    } catch (error) {
      logger.error('broadcast-ui', 'Failed to create template', error);
      alert('Şablon oluşturulamadı: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  const handleUseTemplate = async (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setBroadcastType(template.type);
      setBroadcastAction(template.action);
      setFormData(template.dataTemplate || {});
      setTargetDevices(template.targetDevices);
      setTargetGroups(template.targetGroups || []);
      setBroadcastPriority(template.priority);
      setBroadcastChannel(template.channel);
      setTags(template.tags || []);
    }
  };

  const handleExportConfiguration = async () => {
    try {
      const config = await centralBroadcast.exportConfiguration();
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `exretailos_broadcast_backup_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      logger.error('broadcast-ui', 'Failed to export configuration', error);
    }
  };

  const handleImportConfiguration = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      const text = await file.text();
      const config = JSON.parse(text);
      await centralBroadcast.importConfiguration(config);
      alert('Yapılandırma başarıyla içe aktarıldı!');
    } catch (error) {
      logger.error('broadcast-ui', 'Failed to import configuration', error);
      alert('Yapılandırma içe aktarılamadı: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  const handleAddCondition = () => {
    setConditions([...conditions, { field: 'deviceType', operator: 'equals', value: 'pos' }]);
  };

  const handleRemoveCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const handleUpdateCondition = (index: number, updates: Partial<BroadcastCondition>) => {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], ...updates };
    setConditions(newConditions);
  };



  const handleOpenSelector = (type: 'product' | 'customer' | 'campaign') => {
    setSelectorType(type);
    setSelectorOpen(true);
  };

  const handleDataSelected = (data: any) => {
    if (selectorType === 'product') {
      // Handle product selection (for both product and price/inventory types)
      const isPriceType = broadcastType === 'price';
      const isInventoryType = broadcastType === 'inventory';

      setFormData(prev => ({
        ...prev,
        // Common fields
        [isPriceType ? 'priceProductId' : isInventoryType ? 'inventoryProductId' : 'productId']: data.id,

        // Product specific
        ...(!isPriceType && !isInventoryType ? {
          productBarcode: data.barcode,
          productName: data.name,
          productPrice: data.price,
          productStock: data.stock,
          productCategory: data.category
        } : {}),

        // Price specific
        ...(isPriceType ? {
          oldPrice: data.price
        } : {})
      }));
    } else if (selectorType === 'customer') {
      setFormData(prev => ({
        ...prev,
        customerId: data.id,
        customerName: data.name,
        customerPhone: data.phone,
        customerEmail: data.email,
        customerAddress: data.address
      }));
    } else if (selectorType === 'campaign') {
      setFormData(prev => ({
        ...prev,
        campaignId: data.id,
        campaignName: data.name,
        campaignDiscount: data.discount,
        campaignStartDate: data.startDate?.split('T')[0],
        campaignEndDate: data.endDate?.split('T')[0]
      }));
    }
    setSelectorOpen(false);
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getStatusColor = (status: BroadcastMessage['status']) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500';
      case 'scheduled': return 'bg-purple-500';
      case 'sending': return 'bg-blue-500 animate-pulse';
      case 'delivered': return 'bg-green-500';
      case 'partial': return 'bg-orange-500';
      case 'failed': return 'bg-red-500';
      case 'expired': return 'bg-gray-500';
      case 'cancelled': return 'bg-gray-400';
    }
  };

  const getStatusIcon = (status: BroadcastMessage['status']) => {
    switch (status) {
      case 'pending': return Clock;
      case 'scheduled': return Calendar;
      case 'sending': return RefreshCw;
      case 'delivered': return CheckCircle;
      case 'partial': return AlertTriangle;
      case 'failed': return XCircle;
      case 'expired': return XCircle;
      case 'cancelled': return X;
    }
  };

  const getPriorityColor = (priority: BroadcastMessage['priority']) => {
    switch (priority) {
      case 'low': return 'bg-gray-500';
      case 'normal': return 'bg-blue-500';
      case 'high': return 'bg-orange-500';
      case 'urgent': return 'bg-red-500';
      case 'critical': return 'bg-red-700 animate-pulse';
    }
  };

  const getDeviceTypeIcon = (type: DeviceStatus['deviceType']) => {
    switch (type) {
      case 'pos': return Monitor;
      case 'mobile': return Monitor;
      case 'tablet': return Monitor;
      case 'kiosk': return Monitor;
      case 'server': return Server;
      case 'warehouse': return Box;
      case 'office': return Layout;
      default: return Monitor;
    }
  };

  // Filtreleme
  const filteredQueue = queue.filter(msg => {
    if (filterType !== 'all' && msg.type !== filterType) return false;
    if (filterStatus !== 'all' && msg.status !== filterStatus) return false;
    if (searchTerm && !msg.id.includes(searchTerm) && !JSON.stringify(msg.data).toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const filteredHistory = history.filter(msg => {
    if (filterType !== 'all' && msg.type !== filterType) return false;
    if (filterStatus !== 'all' && msg.status !== filterStatus) return false;
    if (searchTerm && !msg.id.includes(searchTerm) && !JSON.stringify(msg.data).toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const uniqueStores = [...new Set(devices.map(d => d.storeName).filter(Boolean))];
  const uniqueRegions = [...new Set(devices.map(d => d.region).filter(Boolean))];

  return (
    <div className={`h-full overflow-y-auto p-6 ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-[1800px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-3 rounded-xl">
              <Radio className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl">Merkezi Veri Yönetim Sistemi</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Merkez ↔ kasa senkron (malzeme, cari, satış, günsonu)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button
              onClick={() => void refreshEnterpriseData()}
              variant="outline"
              size="sm"
              disabled={isSyncBusy}
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Yenile
            </Button>

            <Button
              onClick={() => void handleManualBroadcast()}
              disabled={isSyncBusy || isBroadcasting}
              size="sm"
              className="gap-2 bg-gradient-to-r from-blue-600 to-blue-700"
            >
              {isSyncBusy || isBroadcasting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {isSyncBusy || isBroadcasting ? 'Senkron...' : 'Kuyruğu İşle'}
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          <Card className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Toplam Kasa</p>
                <p className="text-2xl mt-1">{stats.totalDevices}</p>
              </div>
              <Monitor className="w-8 h-8 text-blue-600" />
            </div>
          </Card>

          <Card className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Çevrimiçi</p>
                <p className="text-2xl text-green-600 mt-1">{stats.onlineDevices}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </Card>

          <Card className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Bekleyen</p>
                <p className="text-2xl text-yellow-600 mt-1">{stats.pendingBroadcasts}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>
          </Card>

          <Card className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Zamanlanmış</p>
                <p className="text-2xl text-purple-600 mt-1">{stats.scheduledBroadcasts}</p>
              </div>
              <Calendar className="w-8 h-8 text-purple-600" />
            </div>
          </Card>

          <Card className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Başarı Oranı</p>
                <p className="text-2xl text-green-600 mt-1">{stats.successRate.toFixed(1)}%</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-600" />
            </div>
          </Card>

          <Card className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">24 Saat</p>
                <p className="text-2xl text-blue-600 mt-1">{stats.last24hSuccess}/{stats.last24hBroadcasts}</p>
              </div>
              <BarChart3 className="w-8 h-8 text-blue-600" />
            </div>
          </Card>

          <Card className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Veri Transfer</p>
                <p className="text-xl mt-1">{formatBytes(stats.totalDataTransferred)}</p>
              </div>
              <Zap className="w-8 h-8 text-yellow-600" />
            </div>
          </Card>
        </div>

        {/* MPOS sekmeleri — gruplu, kaydırmalı */}
        <Tabs defaultValue="send" className="w-full space-y-4">
          <Card className={`p-3 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              Kasa veri akışı
            </p>
            <TabsList
              className={`w-full h-auto flex flex-wrap gap-1 p-1 rounded-lg border ${
                theme === 'dark' ? 'bg-gray-900/60 border-gray-700' : 'bg-gray-100 border-gray-200'
              }`}
            >
              {(
                [
                  { value: 'send', icon: Upload, label: 'Bilgi Gönder' },
                  { value: 'receive', icon: Download, label: 'Bilgi Al' },
                  { value: 'dayend', icon: Calendar, label: `Günsonu (${dayEndStatus.filter((d) => !d.isOnline).length})` },
                ] as const
              ).map(({ value, icon: Icon, label }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className={`gap-2 px-3 py-2 rounded-md text-sm font-medium flex-shrink-0 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm ${
                    theme === 'dark'
                      ? 'text-gray-300 hover:text-white'
                      : 'text-gray-700 hover:text-gray-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            <p className={`text-xs font-semibold uppercase tracking-wider mt-4 mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              Yönetim ve raporlar
            </p>
            <TabsList
              className={`w-full h-auto flex flex-nowrap overflow-x-auto gap-1 p-1 rounded-lg border scrollbar-thin ${
                theme === 'dark' ? 'bg-gray-900/60 border-gray-700' : 'bg-gray-100 border-gray-200'
              }`}
            >
              {(
                [
                  { value: 'reports', icon: FileText, label: 'Kasa Raporları' },
                  { value: 'queue', icon: Clock, label: `Kuyruk (${queue.length})` },
                  { value: 'devices', icon: Monitor, label: `Kasalar (${approvedTerminals.length || devices.length})` },
                  { value: 'service', icon: Settings, label: 'Servis Ayarları' },
                  { value: 'groups', icon: Layers, label: `Gruplar (${deviceGroups.length})` },
                  { value: 'history', icon: BarChart3, label: 'Geçmiş' },
                ] as const
              ).map(({ value, icon: Icon, label }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className={`gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap flex-shrink-0 data-[state=active]:bg-slate-700 data-[state=active]:text-white dark:data-[state=active]:bg-slate-600 ${
                    theme === 'dark'
                      ? 'text-gray-400 hover:text-gray-200'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Card>

          {/* Bilgi Gönder */}
          <TabsContent value="send" className="mt-0 space-y-4">
            <MposKalemTargetBar
              firms={mposFirmOptions}
              selectedFirmNr={selectedFirmNr}
              onFirmChange={handleFirmChange}
              selectedTerminalDeviceId={selectedTerminalDeviceId}
              onTerminalChange={handleTerminalChange}
              selectedTerminalDeviceIds={selectedTerminalDeviceIds}
              onTerminalSelectionChange={handleTerminalSelectionChange}
              filteredTerminals={filteredTerminalsForFirm}
              targetLabel={mposTargetLabel()}
              theme={theme}
              onBulkSendAll={() => void handleMposBulkAllKasas()}
              bulkSendDisabled={isSyncBusy || !selectedFirmNr || filteredTerminalsForFirm.length === 0}
              onOpenTransfer={() => {
                setSendDeviceStatuses([]);
                setMposTransferModalOpen(true);
              }}
              transferDisabled={isSyncBusy || !selectedFirmNr || selectedTerminalDeviceIds.length === 0}
              transferHint={
                mposTransferBlockReason() && selectedTerminalDeviceIds.length > 0
                  ? mposTransferBlockReason()!
                  : 'Müşteri seçim penceresi gibi özet ve adım adım aktarım modalı açılır.'
              }
            />

            <MposSyncLogPanel
              storeId={selectedBranchStoreId || undefined}
              terminalName={selectedTerminal()?.terminalName}
              theme={theme}
            />

            <details className={`rounded-lg border ${theme === 'dark' ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-white'}`}>
              <summary className="cursor-pointer p-4 text-sm font-medium flex items-center gap-2 text-gray-800 dark:text-gray-200">
                <ChevronRight className="w-4 h-4" />
                Toplu gönderim ve detaylı kayıt (gelişmiş)
              </summary>
              <div className="p-4 pt-0 space-y-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500">
                  Hedef cihaz: <strong>{mposTargetLabel()}</strong> — gelişmiş işlemler de aynı firma/cihazı kullanır.
                </p>
            <Card className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-600" />
                Bilgi Gönder (Merkez → Kasa)
              </h3>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={isSyncBusy} onClick={() => void handleMposQuickSend('product')}>
                  Malzeme Gönder
                </Button>
                <Button size="sm" variant="outline" disabled={isSyncBusy} onClick={() => void handleMposQuickSend('customer')}>
                  Cari Gönder
                </Button>
                <Button size="sm" variant="outline" disabled={isSyncBusy} onClick={() => void handleMposQuickSend('all')}>
                  Tüm Master Veri
                </Button>
                <Button size="sm" disabled={isSyncBusy} onClick={() => void handlePushAll()} className="gap-2">
                  <Upload className="w-4 h-4" />
                  Kuyruğu Kasalara Gönder
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Önce malzeme/cari merkezden kasaya gönderilir; kasa satış yaptıktan sonra «Bilgi Al» sekmesinden veri çekilir.
              </p>
            </Card>
            {/* MPOS toplu gönderim + filtre (KLR-2234) */}
            <Card className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Toplu Gönderim (Malzeme / Cari + Filtre)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                <div>
                  <label className="block text-xs mb-1">Veri tipi</label>
                  <select
                    value={bulkType}
                    onChange={(e) => setBulkType(e.target.value as 'product' | 'customer')}
                    className={`w-full p-2 rounded border text-sm ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'}`}
                  >
                    <option value="product">Malzeme (Ürün)</option>
                    <option value="customer">Cari</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs mb-1">Arama (ad/barkod/kod)</label>
                  <Input value={bulkSearch} onChange={(e) => setBulkSearch(e.target.value)} placeholder="Filtre..." />
                </div>
                <div>
                  <label className="block text-xs mb-1">Kategori kodu</label>
                  <Input value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} placeholder="Opsiyonel" />
                </div>
                <label className="flex items-center gap-2 text-sm pb-2 cursor-pointer">
                  <input type="checkbox" checked={bulkOnlyChanged} onChange={(e) => setBulkOnlyChanged(e.target.checked)} />
                  Yalnız değişenler (7 gün)
                </label>
                <Button onClick={() => void handleBulkEnqueue()} disabled={isSyncBusy} className="gap-2">
                  <Upload className="w-4 h-4" />
                  Kuyruğa Ekle
                </Button>
              </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Sol — veri tipi + giriş + gönder */}
              <Card className={`lg:col-span-2 p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
                <h3 className="text-lg mb-1 flex items-center gap-2">
                  <Send className="w-5 h-5" />
                  Bilgi Gönder
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                  Hedef: {mposTargetLabel()} — malzeme veya cari kaydını kuyruğa ekleyip kasaya iletin.
                </p>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm mb-2">Veri Tipi</label>
                      <select
                        value={broadcastType === 'customer' ? 'customer' : 'product'}
                        onChange={(e) => setBroadcastType(e.target.value as 'product' | 'customer')}
                        className={`w-full p-2 rounded border ${theme === 'dark'
                          ? 'bg-gray-700 border-gray-600'
                          : 'bg-white border-gray-300'
                          }`}
                      >
                        <option value="product">Malzeme (Ürün)</option>
                        <option value="customer">Cari (Müşteri)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm mb-2">İşlem</label>
                      <select
                        value={broadcastAction}
                        onChange={(e) => setBroadcastAction(e.target.value as any)}
                        className={`w-full p-2 rounded border ${theme === 'dark'
                          ? 'bg-gray-700 border-gray-600'
                          : 'bg-white border-gray-300'
                          }`}
                      >
                        <option value="sync">Senkronizasyon</option>
                        <option value="update">Güncelleme</option>
                        <option value="create">Yeni Kayıt</option>
                        <option value="delete">Silme</option>
                      </select>
                    </div>
                  </div>

                  <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50">
                    <h4 className="text-sm mb-3 flex items-center gap-2">
                      <Edit className="w-4 h-4" />
                      Veri Girişi
                    </h4>
                    <BroadcastFormFields
                      type={broadcastType === 'customer' ? 'customer' : 'product'}
                      action={broadcastAction}
                      formData={formData}
                      setFormData={setFormData}
                      theme={theme}
                      onRequestSelect={handleOpenSelector}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handleSendBroadcast} className="flex-1 gap-2">
                      <Send className="w-4 h-4" />
                      Kuyruğa Ekle
                    </Button>
                    <Button
                      onClick={() => setShowTemplateModal(true)}
                      variant="outline"
                      className="gap-2"
                    >
                      <Save className="w-4 h-4" />
                      Şablon Kaydet
                    </Button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAdvancedSend((v) => !v)}
                    className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    {showAdvancedSend ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    Gelişmiş seçenekler (öncelik, kanal, zamanlama, koşullar)
                  </button>

                  {showAdvancedSend && (
                    <div className="space-y-4 border-t pt-4 border-gray-200 dark:border-gray-700">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm mb-2">Öncelik</label>
                          <select
                            value={broadcastPriority}
                            onChange={(e) => setBroadcastPriority(e.target.value as any)}
                            className={`w-full p-2 rounded border ${theme === 'dark'
                              ? 'bg-gray-700 border-gray-600'
                              : 'bg-white border-gray-300'
                              }`}
                          >
                            <option value="low">Düşük</option>
                            <option value="normal">Normal</option>
                            <option value="high">Yüksek</option>
                            <option value="urgent">Acil</option>
                            <option value="critical">Kritik</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm mb-2">Kanal</label>
                          <select
                            value={broadcastChannel}
                            onChange={(e) => setBroadcastChannel(e.target.value as any)}
                            className={`w-full p-2 rounded border ${theme === 'dark'
                              ? 'bg-gray-700 border-gray-600'
                              : 'bg-white border-gray-300'
                              }`}
                          >
                            <option value="auto">Otomatik</option>
                            <option value="websocket">WebSocket</option>
                            <option value="api">REST API</option>
                            <option value="mqtt">MQTT</option>
                            <option value="signalr">SignalR</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isScheduled}
                            onChange={(e) => setIsScheduled(e.target.checked)}
                            className="w-4 h-4"
                          />
                          <span className="text-sm">Zamanla</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isRecurring}
                            onChange={(e) => setIsRecurring(e.target.checked)}
                            className="w-4 h-4"
                          />
                          <span className="text-sm">Tekrarlayan</span>
                        </label>
                      </div>
                      {isScheduled && (
                        <div>
                          <label className="block text-sm mb-2">Gönderim Zamanı</label>
                          <input
                            type="datetime-local"
                            value={scheduledDate}
                            onChange={(e) => setScheduledDate(e.target.value)}
                            className={`w-full p-2 rounded border ${theme === 'dark'
                              ? 'bg-gray-700 border-gray-600'
                              : 'bg-white border-gray-300'
                              }`}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>

              {/* Sağ — koşullar + son değişiklikler */}
              <div className="space-y-6">
                {showAdvancedSend && (
                <Card className={`p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg flex items-center gap-2">
                      <Settings className="w-5 h-5" />
                      Koşullar ({conditions.length})
                    </h3>
                    <Button onClick={handleAddCondition} size="sm" variant="outline" className="gap-2">
                      <Plus className="w-4 h-4" />
                      Ekle
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {conditions.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">
                        Koşul yok — seçili hedefe gönderilir.
                      </p>
                    ) : (
                      conditions.map((condition, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <select
                            value={condition.field}
                            onChange={(e) => handleUpdateCondition(index, { field: e.target.value })}
                            className={`flex-1 p-2 rounded border text-sm ${theme === 'dark'
                              ? 'bg-gray-700 border-gray-600'
                              : 'bg-white border-gray-300'
                              }`}
                          >
                            <option value="deviceType">Cihaz Tipi</option>
                            <option value="storeId">Mağaza ID</option>
                            <option value="region">Bölge</option>
                            <option value="version">Versiyon</option>
                            <option value="isOnline">Çevrimiçi</option>
                          </select>
                          <select
                            value={condition.operator}
                            onChange={(e) => handleUpdateCondition(index, { operator: e.target.value as any })}
                            className={`flex-1 p-2 rounded border text-sm ${theme === 'dark'
                              ? 'bg-gray-700 border-gray-600'
                              : 'bg-white border-gray-300'
                              }`}
                          >
                            <option value="equals">Eşittir</option>
                            <option value="notEquals">Eşit Değildir</option>
                            <option value="contains">İçerir</option>
                            <option value="greaterThan">Büyüktür</option>
                            <option value="lessThan">Küçüktür</option>
                          </select>
                          <input
                            type="text"
                            value={condition.value}
                            onChange={(e) => handleUpdateCondition(index, { value: e.target.value })}
                            placeholder="Değer"
                            className={`flex-1 p-2 rounded border text-sm ${theme === 'dark'
                              ? 'bg-gray-700 border-gray-600'
                              : 'bg-white border-gray-300'
                              }`}
                          />
                          <Button onClick={() => handleRemoveCondition(index)} size="sm" variant="destructive">
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
                )}

                <BroadcastChangesTimeline theme={theme} />
              </div>
            </div>

            {/* Gönderilmiş Mesajlar Listesi */}
            <SentMessagesList theme={theme} />
              </div>
            </details>
          </TabsContent>

          {/* Bilgi Al */}
          <TabsContent value="receive" className="mt-0 space-y-4">
            <MposKalemTargetBar
              firms={mposFirmOptions}
              selectedFirmNr={selectedFirmNr}
              onFirmChange={handleFirmChange}
              selectedTerminalDeviceId={selectedTerminalDeviceId}
              onTerminalChange={handleTerminalChange}
              selectedTerminalDeviceIds={selectedTerminalDeviceIds}
              onTerminalSelectionChange={handleTerminalSelectionChange}
              filteredTerminals={filteredTerminalsForFirm}
              targetLabel={mposTargetLabel()}
              theme={theme}
              onOpenTransfer={() => {
                setSendDeviceStatuses([]);
                setMposTransferModalOpen(true);
              }}
              transferDisabled={isSyncBusy || !selectedFirmNr || selectedTerminalDeviceIds.length === 0}
              transferHint={
                mposTransferBlockReason() && selectedTerminalDeviceIds.length > 0
                  ? mposTransferBlockReason()!
                  : 'Özet ve adım adım aktarım modalı açılır.'
              }
            />

            <MposSyncLogPanel
              storeId={selectedBranchStoreId || undefined}
              terminalName={selectedTerminal()?.terminalName}
              theme={theme}
            />

            <details className={`rounded-lg border ${theme === 'dark' ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-white'}`}>
              <summary className="cursor-pointer p-4 text-sm font-medium flex items-center gap-2">
                <ChevronRight className="w-4 h-4" />
                Hızlı alım (toplu)
              </summary>
              <div className="p-4 pt-0 flex flex-wrap gap-2 border-t border-gray-200 dark:border-gray-700">
                <Button size="sm" disabled={isSyncBusy} onClick={() => void handlePullAll()} className="gap-2">
                  Tüm Satışları Al
                </Button>
                <Button size="sm" variant="outline" disabled={isSyncBusy} onClick={() => void runBulkDayEndPull()} className="gap-2 min-h-[44px]">
                  Tüm Günsonu Al
                </Button>
                <Button size="sm" variant="outline" disabled={isSyncBusy} onClick={() => void handleManualBroadcast()} className="gap-2">
                  Kuyruğu İşle
                </Button>
              </div>
            </details>

            <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {dayEndStatus.map((store) => (
                <Card
                  key={`recv-${store.storeId}`}
                  className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'} ${store.salesPending > 0 ? 'border-l-4 border-l-amber-500' : 'border-l-4 border-l-green-500'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{store.storeName}</span>
                    <Badge variant={store.salesPending > 0 ? 'destructive' : 'default'}>
                      {store.salesPending > 0 ? `${store.salesPending} bekleyen` : 'Güncel'}
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                    <div>Kod: {store.storeCode}</div>
                    <div>Bugün alınan: {store.salesSyncedToday}</div>
                    {store.lastSyncAt && (
                      <div>Son alma: {formatTimestamp(store.lastSyncAt)}</div>
                    )}
                  </div>
                </Card>
              ))}
              {dayEndStatus.length === 0 && (
                <Card className={`p-8 text-center col-span-full ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
                  <Download className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p className="text-gray-500">Alınacak şube/kasa kaydı bulunamadı.</p>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Kasa Servis Ayarları — MPOS mesaj kontrol süresi */}
          <TabsContent value="service" className="space-y-4">
            <Card className={`p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
              <h3 className="text-lg mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Kasa servis ayarları
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Videodaki «Servis ayarları»: kasanın merkez mesajlarını kontrol etme aralığı. Otomatik kanalda kuyruk periyodik işlenir.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
                <div>
                  <label className="block text-sm mb-2">Mesaj Kontrol Süresi (sn)</label>
                  <Input
                    type="number"
                    min="5"
                    max="300"
                    value={messageCheckInterval}
                    onChange={(e) => handleIntervalChange(parseInt(e.target.value) || 30)}
                    className={`w-full p-2 rounded border ${theme === 'dark'
                      ? 'bg-gray-700 border-gray-600'
                      : 'bg-white border-gray-300'
                      }`}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Kasa servis ekranındaki «mesaj gönderim kontrol aralığı» ile aynı mantık.
                  </p>
                </div>
                <div>
                  <label className="block text-sm mb-2">Senkron Kanalı</label>
                  <select
                    value={broadcastChannel}
                    onChange={(e) => setBroadcastChannel(e.target.value as any)}
                    className={`w-full p-2 rounded border ${theme === 'dark'
                      ? 'bg-gray-700 border-gray-600'
                      : 'bg-white border-gray-300'
                      }`}
                  >
                    <option value="auto">Otomatik (periyodik kuyruk)</option>
                    <option value="websocket">WebSocket</option>
                    <option value="api">REST API</option>
                    <option value="mqtt">MQTT</option>
                    <option value="signalr">SignalR</option>
                  </select>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={isSyncBusy} onClick={() => void handleManualBroadcast()} className="gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Şimdi Kuyruğu İşle
                </Button>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 max-w-xl">
                <h4 className="text-sm font-medium mb-3">Otomatik Günsonu Alımı</h4>
                <label className="flex items-center gap-2 text-sm cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={dayEndAutoEnabled}
                    onChange={(e) => {
                      setDayEndAutoEnabled(e.target.checked);
                      localStorage.setItem('retailex_mpos_dayend_auto', e.target.checked ? '1' : '0');
                    }}
                  />
                  Her gün belirtilen saatte günsonu verisi al
                </label>
                <div className="flex items-center gap-2">
                  <label className="text-sm">Saat</label>
                  <Input
                    type="time"
                    value={dayEndAutoTime}
                    onChange={(e) => {
                      setDayEndAutoTime(e.target.value);
                      localStorage.setItem('retailex_mpos_dayend_time', e.target.value);
                    }}
                    disabled={!dayEndAutoEnabled}
                    className="w-36"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Merkez açıkken çalışır; eğitim 1 günsonu adımını otomatikleştirir.
                </p>
              </div>
            </Card>

            <Card className={`p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Broadcast Şablonları ({templates.length})
                </h3>
                <Button onClick={() => setShowTemplateModal(true)} size="sm" variant="outline" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Yeni Şablon
                </Button>
              </div>
              <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                {templates.slice(0, 6).map((template) => (
                  <div
                    key={template.id}
                    className={`p-3 rounded-lg border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">{template.name}</span>
                      <div className="flex gap-1 shrink-0">
                        <Button onClick={() => handleUseTemplate(template.id)} size="sm" variant="outline" title="Kullan">
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button onClick={() => centralBroadcast.deleteTemplate(template.id)} size="sm" variant="destructive" title="Sil">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{template.type} · {template.action}</div>
                  </div>
                ))}
                {templates.length === 0 && (
                  <p className="text-sm text-gray-500 col-span-full">Henüz şablon yok.</p>
                )}
              </div>
            </Card>
          </TabsContent>

          {/* Queue Tab */}
          <TabsContent value="queue" className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className={`p-2 rounded border text-sm ${theme === 'dark'
                      ? 'bg-gray-700 border-gray-600'
                      : 'bg-white border-gray-300'
                      }`}
                  >
                    <option value="all">Tüm Tipler</option>
                    <option value="product">Ürün</option>
                    <option value="price">Fiyat</option>
                    <option value="customer">Müşteri</option>
                    <option value="campaign">Kampanya</option>
                    <option value="config">Konfigürasyon</option>
                    <option value="inventory">Envanter</option>
                  </select>

                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className={`p-2 rounded border text-sm ${theme === 'dark'
                      ? 'bg-gray-700 border-gray-600'
                      : 'bg-white border-gray-300'
                      }`}
                  >
                    <option value="all">Tüm Durumlar</option>
                    <option value="pending">Bekleyen</option>
                    <option value="scheduled">Zamanlanmış</option>
                    <option value="sending">Gönderiliyor</option>
                    <option value="delivered">Teslim Edildi</option>
                    <option value="failed">Başarısız</option>
                  </select>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="ID veya içerik ara..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-64"
                  />
                </div>

                <label className="flex items-center gap-2 text-sm cursor-pointer whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={filterQueueByKasa}
                    onChange={(e) => setFilterQueueByKasa(e.target.checked)}
                  />
                  Seçili kasa/ işyeri
                </label>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => void handleClearQueue('completed')}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Tamamlananları Temizle
                </Button>
                <Button
                  onClick={() => void handleClearQueue('all')}
                  variant="destructive"
                  size="sm"
                  className="gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Tümünü Temizle
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {filteredQueue.length === 0 ? (
                <Card className={`p-8 text-center ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                  <p className="text-gray-500">Kuyrukta bekleyen mesaj yok</p>
                </Card>
              ) : (
                filteredQueue.map(message => {
                  const StatusIcon = getStatusIcon(message.status);
                  return (
                    <Card
                      key={message.id}
                      className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'} hover:shadow-lg transition-shadow`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4 flex-1">
                          <div className={`w-3 h-3 rounded-full mt-1 ${getStatusColor(message.status)}`} />

                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="capitalize">
                                {message.type}
                              </Badge>
                              <Badge variant="secondary" className="capitalize">
                                {message.action}
                              </Badge>
                              <div className={`px-2 py-0.5 rounded text-xs text-white ${getPriorityColor(message.priority)}`}>
                                {message.priority}
                              </div>
                              <Badge variant="outline">
                                {message.channel}
                              </Badge>
                              {typeof message.data?._syncTerminalName === 'string' && (
                                <Badge variant="outline" className="font-normal">
                                  Kasa: {String(message.data._syncTerminalName)}
                                </Badge>
                              )}
                              {message.isRecurring && (
                                <Badge variant="default" className="bg-purple-600">
                                  <RefreshCw className="w-3 h-3 mr-1" />
                                  Tekrarlayan
                                </Badge>
                              )}
                              {message.tags && message.tags.map(tag => (
                                <Badge key={tag} variant="outline" className="gap-1">
                                  <Tag className="w-3 h-3" />
                                  {tag}
                                </Badge>
                              ))}
                            </div>

                            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                              <div className="font-mono text-xs">{message.id}</div>
                              <div>Oluşturulma: {formatTimestamp(message.createdAt)}</div>
                              {message.scheduledAt && (
                                <div>Zamanlanmış: {formatTimestamp(message.scheduledAt)}</div>
                              )}
                              <div>
                                Hedef: {' '}
                                {message.targetDevices.includes('all')
                                  ? 'Tüm Cihazlar'
                                  : `${message.targetDevices.length} Cihaz`}
                                {message.targetGroups && message.targetGroups.length > 0 && `, ${message.targetGroups.length} Grup`}
                                {message.targetStores && message.targetStores.length > 0 && `, ${message.targetStores.length} Mağaza`}
                                {message.conditions && message.conditions.length > 0 && `, ${message.conditions.length} Koşul`}
                              </div>
                              <div className="flex items-center gap-4">
                                <span className="text-green-600">
                                  ✓ {message.deliveredTo.length} Teslim
                                </span>
                                {message.failedTo.length > 0 && (
                                  <span className="text-red-600">
                                    ✗ {message.failedTo.length} Başarısız
                                  </span>
                                )}
                                {message.retryCount > 0 && (
                                  <span className="text-yellow-600">
                                    ↻ {message.retryCount} Deneme
                                  </span>
                                )}
                              </div>
                              {message.error && (
                                <div className="text-red-500 text-xs">⚠ {message.error}</div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <StatusIcon className="w-5 h-5" />
                          {message.status === 'failed' && message.retryCount < 5 && (
                            <Button
                              onClick={() => void retryEnterpriseSyncMessage(message.id).then((r) => {
                                if (r.ok) toast.success(r.message);
                                else toast.error(r.message);
                                void refreshEnterpriseData();
                              })}
                              size="sm"
                              variant="outline"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </Button>
                          )}
                          {(message.status === 'pending' || message.status === 'scheduled') && (
                            <Button
                              onClick={() => void cancelEnterpriseSyncMessage(message.id).then((r) => {
                                if (r.ok) toast.success(r.message);
                                else toast.error(r.message);
                                void refreshEnterpriseData();
                              })}
                              size="sm"
                              variant="destructive"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>

          {/* Kasalar — her onaylı POS terminali bir kasa */}
          <TabsContent value="devices" className="space-y-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Her kayıtlı cihaz bir kasadır. Onaylı terminaller burada listelenir; kuyruk sayıları kasa bazında gösterilir.
            </p>
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {devices.map(device => {
                const DeviceIcon = getDeviceTypeIcon(device.deviceType);
                return (
                  <Card
                    key={device.deviceId}
                    className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'} hover:shadow-lg transition-shadow`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded ${device.isOnline ? 'bg-green-100 dark:bg-green-900' : 'bg-gray-100 dark:bg-gray-700'}`}>
                        <DeviceIcon className={`w-6 h-6 ${device.isOnline ? 'text-green-600' : 'text-gray-500'}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="truncate font-medium">{device.deviceName}</span>
                          <div className={`w-2 h-2 rounded-full shrink-0 ${
                            device.onlineSource === 'websocket' && device.isOnline
                              ? 'bg-green-500 animate-pulse'
                              : device.isOnline
                                ? 'bg-amber-500'
                                : 'bg-gray-400'
                          }`} />
                          {device.onlineLabel ? (
                            <span className="text-[10px] text-gray-500 shrink-0">{device.onlineLabel}</span>
                          ) : null}
                        </div>

                        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                          <div className="text-gray-500">M-POS Kasa</div>
                          {device.region && (
                            <div className="text-gray-500">{device.region}</div>
                          )}
                          {device.storeName && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 shrink-0" />
                              {device.storeName}
                            </div>
                          )}
                          {!device.storeName && (
                            <div className="text-amber-600 dark:text-amber-400">Mağaza atanmamış</div>
                          )}
                          {device.version && (
                            <div className="text-gray-500">v{device.version}</div>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                          <div className="text-center">
                            <div className="text-yellow-600">{device.pendingMessages}</div>
                            <div className="text-gray-600 dark:text-gray-400">Bekleyen</div>
                          </div>
                          <div className="text-center">
                            <div className="text-green-600">{device.deliveredMessages}</div>
                            <div className="text-gray-600 dark:text-gray-400">Teslim</div>
                          </div>
                          <div className="text-center">
                            <div className="text-red-600">{device.failedMessages}</div>
                            <div className="text-gray-600 dark:text-gray-400">Hata</div>
                          </div>
                        </div>

                        {device.groups && device.groups.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {device.groups.slice(0, 2).map(groupId => {
                              const group = deviceGroups.find(g => g.id === groupId);
                              return group && (
                                <Badge key={groupId} variant="outline" className="text-xs">
                                  {group.name}
                                </Badge>
                              );
                            })}
                            {device.groups.length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{device.groups.length - 2}
                              </Badge>
                            )}
                          </div>
                        )}

                        <div className="mt-2 text-xs text-gray-500">
                          Son görülme: {formatTimestamp(device.lastSeen)}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}

              {devices.length === 0 && (
                <Card className={`p-8 text-center col-span-full ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
                  <Monitor className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p className="text-gray-500">Henüz onaylı kasa yok</p>
                  <p className="text-xs text-gray-400 mt-2">
                    Masaüstü uygulama kayıt olduktan sonra Sistem Yönetimi → Kasa Cihazları → Onaylı sekmesinden onaylayın.
                  </p>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Groups Tab */}
          <TabsContent value="groups" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg">Cihaz Grupları</h3>
              <Button
                onClick={() => setShowGroupModal(true)}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                Yeni Grup Oluştur
              </Button>
            </div>

            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {deviceGroups.map(group => (
                <Card
                  key={group.id}
                  className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}
                  style={{ borderLeftColor: group.color, borderLeftWidth: '4px' }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Layers className="w-5 h-5" style={{ color: group.color }} />
                      <span>{group.name}</span>
                    </div>
                    <Button
                      onClick={() => centralBroadcast.deleteDeviceGroup(group.id)}
                      size="sm"
                      variant="destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {group.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      {group.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      {group.deviceIds.length} cihaz
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatTimestamp(group.updatedAt)}
                    </span>
                  </div>
                </Card>
              ))}

              {deviceGroups.length === 0 && (
                <Card className={`p-8 text-center col-span-full ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
                  <Layers className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p className="text-gray-500 mb-4">Henüz grup oluşturulmamış</p>
                  <Button onClick={() => setShowGroupModal(true)} className="gap-2">
                    <Plus className="w-4 h-4" />
                    İlk Grubu Oluştur
                  </Button>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Günsonu Tab — MPOS günsonu işlem kontrolü (KLR-2273) kasa bazlı */}
          <TabsContent value="dayend" className="space-y-4">
            <MposKalemTargetBar
              firms={mposFirmOptions}
              selectedFirmNr={selectedFirmNr}
              onFirmChange={handleFirmChange}
              selectedTerminalDeviceId={selectedTerminalDeviceId}
              onTerminalChange={handleTerminalChange}
              selectedTerminalDeviceIds={selectedTerminalDeviceIds}
              onTerminalSelectionChange={handleTerminalSelectionChange}
              filteredTerminals={filteredTerminalsForFirm}
              targetLabel={mposTargetLabel()}
              theme={theme}
              className="max-w-xl"
            />
            <div className="flex justify-between items-center flex-wrap gap-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Günsonu işlem kontrolü: bugün veri alınmayan kasalar «Veri alınmadı» (KLR-2273 — yalnızca günlük durum).
              </p>
              <Button size="sm" disabled={isSyncBusy} onClick={() => setDayEndDialogOpen(true)} className="gap-2 min-h-[44px]">
                <Download className="w-4 h-4" />
                Günsonu Al
              </Button>
            </div>

            {dayEndProgress && dayEndProgress.total > 0 ? (
              <div className="text-xs text-gray-500 max-w-md">
                <div className="flex justify-between mb-1">
                  <span>{dayEndProgress.label}</span>
                  <span>
                    {dayEndProgress.current}/{dayEndProgress.total}
                  </span>
                </div>
                <div className={`h-1.5 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}>
                  <div
                    className="h-full bg-sky-600 transition-all"
                    style={{ width: `${Math.round((dayEndProgress.current / dayEndProgress.total) * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}

            <MposSyncLogPanel
              storeId={selectedBranchStoreId || undefined}
              theme={theme}
            />

            {terminalDailyStatus.length > 0 && (
              <>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Kasa bazlı durum</h4>
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                  {terminalDailyStatus.map((term) => (
                    <Card
                      key={term.deviceId}
                      className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'} ${term.status === 'ok' ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-amber-500'}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{term.terminalName}</span>
                        <Badge variant={term.status === 'ok' ? 'default' : 'destructive'}>
                          {term.status === 'ok' ? 'Veri alındı' : 'Veri alınmadı'}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                        <div>{term.storeName} ({term.storeCode})</div>
                        <div>Bugün gönderim: {term.sendCompletedToday}</div>
                        <div>Bugün alım: {term.receiveCompletedToday}</div>
                        <div>Bekleyen satış: {term.salesPending}</div>
                        {term.lastReceiveAt && (
                          <div>Son alım: {formatTimestamp(term.lastReceiveAt)}</div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}

            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">İşyeri özeti</h4>
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {dayEndStatus.map((store) => (
                <Card
                  key={store.storeId}
                  className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'} ${!store.isOnline ? 'border-l-4 border-l-amber-500' : 'border-l-4 border-l-green-500'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{store.storeName}</span>
                    <Badge variant={store.isOnline ? 'default' : 'destructive'}>
                      {store.isOnline ? 'Veri alındı' : 'Veri alınmadı'}
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                    <div>Kod: {store.storeCode}</div>
                    <div>Bekleyen satış: {store.salesPending}</div>
                    <div>Bugün eşlenen: {store.salesSyncedToday}</div>
                    {store.lastSyncAt && (
                      <div>Son senkron: {formatTimestamp(store.lastSyncAt)}</div>
                    )}
                  </div>
                </Card>
              ))}
              {dayEndStatus.length === 0 && (
                <Card className={`p-8 text-center col-span-full ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
                  <Calendar className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p className="text-gray-500">Mağaza/kasa kaydı bulunamadı veya henüz günsonu verisi yok.</p>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Pos Kasa Raporları — eğitim 1 (online satış / yemek çeki özeti) */}
          <TabsContent value="reports" className="space-y-4">
            <Card className={`p-6 max-w-lg ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
              <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Pos Kasa Raporları
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                Hedef: <strong>{mposTargetLabel()}</strong> — bugünkü satış ve yemek çeki özeti (Kalem eğitim 1).
              </p>
              {!selectedBranchStoreId ? (
                <p className="text-sm text-amber-600">Üstteki hedef alanından firma ve cihaz seçin.</p>
              ) : kasaReport ? (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className={`p-3 rounded border ${theme === 'dark' ? 'border-gray-600' : 'border-gray-200'}`}>
                    <p className="text-xs text-gray-500">Bugün fiş adedi</p>
                    <p className="text-xl font-semibold">{kasaReport.salesCountToday}</p>
                  </div>
                  <div className={`p-3 rounded border ${theme === 'dark' ? 'border-gray-600' : 'border-gray-200'}`}>
                    <p className="text-xs text-gray-500">Bugün satış tutarı</p>
                    <p className="text-xl font-semibold">
                      {kasaReport.salesTotalToday.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </p>
                  </div>
                  <div className={`p-3 rounded border ${theme === 'dark' ? 'border-gray-600' : 'border-gray-200'}`}>
                    <p className="text-xs text-gray-500">Yemek çeki adedi</p>
                    <p className="text-xl font-semibold">{kasaReport.mealVoucherCountToday}</p>
                  </div>
                  <div className={`p-3 rounded border ${theme === 'dark' ? 'border-gray-600' : 'border-gray-200'}`}>
                    <p className="text-xs text-gray-500">Yemek çeki tutarı</p>
                    <p className="text-xl font-semibold">
                      {kasaReport.mealVoucherTotalToday.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </p>
                  </div>
                  <div className={`p-3 rounded border col-span-2 ${theme === 'dark' ? 'border-gray-600' : 'border-gray-200'}`}>
                    <p className="text-xs text-gray-500">Merkeze bekleyen satış</p>
                    <p className="text-lg font-semibold text-amber-600">{kasaReport.pendingSyncCount} kayıt</p>
                    {kasaReport.lastSaleAt && (
                      <p className="text-xs text-gray-500 mt-1">
                        Son satış: {formatTimestamp(new Date(kasaReport.lastSaleAt).getTime())}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Rapor yükleniyor…</p>
              )}
              <Button
                size="sm"
                variant="outline"
                className="mt-4 gap-2"
                disabled={!selectedBranchStoreId || isSyncBusy}
                onClick={() => void refreshKasaReport()}
              >
                <RefreshCw className="w-4 h-4" />
                Raporu Yenile
              </Button>
            </Card>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className={`p-2 rounded border text-sm ${theme === 'dark'
                      ? 'bg-gray-700 border-gray-600'
                      : 'bg-white border-gray-300'
                      }`}
                  >
                    <option value="all">Tüm Tipler</option>
                    <option value="product">Ürün</option>
                    <option value="price">Fiyat</option>
                    <option value="customer">Müşteri</option>
                    <option value="campaign">Kampanya</option>
                  </select>

                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className={`p-2 rounded border text-sm ${theme === 'dark'
                      ? 'bg-gray-700 border-gray-600'
                      : 'bg-white border-gray-300'
                      }`}
                  >
                    <option value="all">Tüm Durumlar</option>
                    <option value="delivered">Teslim Edildi</option>
                    <option value="failed">Başarısız</option>
                    <option value="cancelled">İptal Edildi</option>
                  </select>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Ara..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-64"
                  />
                </div>
              </div>

              <Button
                onClick={() => centralBroadcast.clearHistory()}
                variant="destructive"
                size="sm"
                className="gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Geçmişi Temizle
              </Button>
            </div>

            <div className="space-y-2">
              {filteredHistory.length === 0 ? (
                <Card className={`p-8 text-center ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
                  <BarChart3 className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p className="text-gray-500">Geçmiş kaydı bulunamadı</p>
                </Card>
              ) : (
                filteredHistory.slice(0, 50).map(message => {
                  const StatusIcon = getStatusIcon(message.status);
                  return (
                    <Card
                      key={message.id}
                      className={`p-3 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <StatusIcon className={`w-4 h-4 ${message.status === 'delivered' ? 'text-green-600' :
                            message.status === 'failed' ? 'text-red-600' :
                              'text-gray-500'
                            }`} />

                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs">{message.type}</Badge>
                              <Badge variant="secondary" className="text-xs">{message.action}</Badge>
                              <span className="text-xs font-mono text-gray-500">{message.id}</span>
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                              {formatTimestamp(message.createdAt)} •
                              {message.deliveredTo.length > 0 && ` ✓ ${message.deliveredTo.length}`}
                              {message.failedTo.length > 0 && ` ✗ ${message.failedTo.length}`}
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Group Modal */}
        {showGroupModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowGroupModal(false)}>
            <Card
              className={`w-full max-w-2xl p-6 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg flex items-center gap-2">
                  <Layers className="w-5 h-5" />
                  Yeni Cihaz Grubu Oluştur
                </h3>
                <Button onClick={() => setShowGroupModal(false)} variant="ghost" size="sm">
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm mb-2">Grup Adı *</label>
                  <Input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Örn: POS Cihazları"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2">Açıklama</label>
                  <Input
                    type="text"
                    value={groupDescription}
                    onChange={(e) => setGroupDescription(e.target.value)}
                    placeholder="Grup açıklaması (opsiyonel)"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2">Renk</label>
                  <input
                    type="color"
                    value={groupColor}
                    onChange={(e) => setGroupColor(e.target.value)}
                    className="w-full h-10 rounded border cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2">Cihazlar</label>
                  <div className="border rounded p-3 max-h-64 overflow-y-auto">
                    {devices.map(device => (
                      <label key={device.deviceId} className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedDevicesForGroup.includes(device.deviceId)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDevicesForGroup([...selectedDevicesForGroup, device.deviceId]);
                            } else {
                              setSelectedDevicesForGroup(selectedDevicesForGroup.filter(id => id !== device.deviceId));
                            }
                          }}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">{device.deviceName}</span>
                        <span className="text-xs text-gray-500">({device.deviceType})</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {selectedDevicesForGroup.length} cihaz seçildi
                  </p>
                </div>

                <div className="flex justify-end gap-2">
                  <Button onClick={() => setShowGroupModal(false)} variant="outline">
                    İptal
                  </Button>
                  <Button onClick={handleCreateGroup} disabled={!groupName}>
                    <Plus className="w-4 h-4 mr-2" />
                    Grup Oluştur
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Template Modal */}
        {showTemplateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowTemplateModal(false)}>
            <Card
              className={`w-full max-w-lg p-6 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Şablon Olarak Kaydet
                </h3>
                <Button onClick={() => setShowTemplateModal(false)} variant="ghost" size="sm">
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm mb-2">Şablon Adı *</label>
                  <Input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Örn: Günlük Ürün Senkronizasyonu"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2">Açıklama</label>
                  <Input
                    type="text"
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    placeholder="Şablon açıklaması (opsiyonel)"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button onClick={() => setShowTemplateModal(false)} variant="outline">
                    İptal
                  </Button>
                  <Button onClick={handleCreateTemplate} disabled={!templateName}>
                    <Save className="w-4 h-4 mr-2" />
                    Şablon Oluştur
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>

      <BroadcastDataSelector
        type={selectorType}
        isOpen={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onSelect={handleDataSelected}
        theme={theme}
      />

      <MposDataTransferModal
        open={mposTransferModalOpen}
        onClose={() => {
          if (isSyncBusy) return;
          setMposTransferModalOpen(false);
        }}
        theme={theme}
        targetLabel={mposTargetLabel()}
        firmNr={selectedFirmNr}
        storeId={resolveMposEffectiveStoreId()}
        terminalName={selectedTerminal()?.terminalName}
        selectedTerminals={mposSelectedTerminals()}
        sendDeviceStatuses={sendDeviceStatuses}
        targetBlockReason={mposTransferBlockReason()}
        sendFileTypes={mposFileTypes}
        onSendFileTypesChange={setMposFileTypes}
        receiveFileTypes={mposReceiveFileTypes}
        onReceiveFileTypesChange={setMposReceiveFileTypes}
        syncMode={mposSyncMode}
        onSyncModeChange={setMposSyncMode}
        dateFrom={mposDateFrom}
        dateTo={mposDateTo}
        onDateFromChange={setMposDateFrom}
        onDateToChange={setMposDateTo}
        includeProductImages={includeProductImages}
        onIncludeProductImagesChange={setIncludeProductImages}
        isBusy={isSyncBusy}
        sendProgress={sendProgress}
        onSend={handleMposKalemSend}
        onReceive={async () => {
          await handleMposKalemReceive();
        }}
        onSendAndReceive={async () => {
          await handleMposKalemSend();
          await handleMposKalemReceive();
        }}
      />

      <MposDayEndDialog
        open={dayEndDialogOpen}
        onClose={() => setDayEndDialogOpen(false)}
        branchStores={branchStores}
        filteredTerminals={approvedTerminals}
        initialStoreId={selectedBranchStoreId}
        initialTerminalIds={selectedTerminalDeviceIds}
        isBusy={isSyncBusy}
        onSubmit={(opts) => void handleDayEndDialogSubmit(opts)}
        theme={theme}
      />
    </div>
  );
}

