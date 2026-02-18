import React, { useState, useEffect } from 'react';
import {
  Send, Radio, CheckCircle, XCircle, Clock, RefreshCw, Trash2, Monitor,
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
import { BroadcastFormFields } from './BroadcastFormFields';
import { BroadcastChangesTimeline } from './BroadcastChangesTimeline';
import { SentMessagesList } from '../system/SentMessagesList';
import { BroadcastDataSelector } from './BroadcastDataSelector';

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
  const [messageCheckInterval, setMessageCheckInterval] = useState(10); // saniye
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });

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

  // Update data
  useEffect(() => {
    const updateData = () => {
      setQueue(centralBroadcast.getQueue());
      setDevices(centralBroadcast.getDevices());
      setDeviceGroups(centralBroadcast.getDeviceGroups());
      setTemplates(centralBroadcast.getTemplates());
      setStats(centralBroadcast.getAdvancedStats());
      setHistory(centralBroadcast.getHistory({ limit: 100 }));
    };

    updateData();
    const interval = setInterval(updateData, 3000);

    const unsubscribeBroadcast = centralBroadcast.onBroadcast((status, updatedQueue) => {
      setIsBroadcasting(status === 'started' || status === 'progress');
      setQueue(updatedQueue);
      setStats(centralBroadcast.getAdvancedStats());
    });

    const unsubscribeDevices = centralBroadcast.onDeviceUpdate((updatedDevices) => {
      setDevices(updatedDevices);
      setStats(centralBroadcast.getAdvancedStats());
    });

    const unsubscribeStats = centralBroadcast.onStatsUpdate((updatedStats) => {
      setStats(updatedStats);
    });

    return () => {
      clearInterval(interval);
      unsubscribeBroadcast();
      unsubscribeDevices();
      unsubscribeStats();
    };
  }, []);

  const handleSendBroadcast = async () => {
    try {
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

      await centralBroadcast.addBroadcast(broadcastType, broadcastAction, data, options);

      // Reset form
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

  const handleManualBroadcast = () => {
    centralBroadcast.startBroadcast();
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
                Enterprise Senkronizasyon ve Broadcast Yönetimi v2.0
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleExportConfiguration}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              Yedekle
            </Button>

            <label className="cursor-pointer">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                as="span"
              >
                <Upload className="w-4 h-4" />
                İçe Aktar
              </Button>
              <input
                type="file"
                accept=".json"
                onChange={handleImportConfiguration}
                className="hidden"
              />
            </label>

            <Button
              onClick={handleManualBroadcast}
              disabled={isBroadcasting || queue.length === 0}
              className="gap-2 bg-gradient-to-r from-blue-600 to-blue-700"
            >
              {isBroadcasting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {isBroadcasting ? 'Gönderiliyor...' : 'Şimdi Gönder'}
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          <Card className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Toplam Cihaz</p>
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

        {/* Main Tabs */}
        <Tabs defaultValue="send" className="w-full">
          <TabsList className="grid w-full grid-cols-6 h-auto">
            <TabsTrigger value="send" className="gap-2">
              <Send className="w-4 h-4" />
              Veri Gönder
            </TabsTrigger>
            <TabsTrigger value="queue" className="gap-2">
              <Clock className="w-4 h-4" />
              Kuyruk ({queue.length})
            </TabsTrigger>
            <TabsTrigger value="devices" className="gap-2">
              <Monitor className="w-4 h-4" />
              Cihazlar ({devices.length})
            </TabsTrigger>
            <TabsTrigger value="groups" className="gap-2">
              <Layers className="w-4 h-4" />
              Gruplar ({deviceGroups.length})
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <FileText className="w-4 h-4" />
              Şablonlar ({templates.length})
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              Geçmiş
            </TabsTrigger>
          </TabsList>

          {/* Send Tab */}
          <TabsContent value="send" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column - Broadcast Form */}
              <Card className={`lg:col-span-2 p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
                <h3 className="text-lg mb-4 flex items-center gap-2">
                  <Send className="w-5 h-5" />
                  Yeni Broadcast Oluştur
                </h3>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm mb-2">Veri Tipi</label>
                      <select
                        value={broadcastType}
                        onChange={(e) => setBroadcastType(e.target.value as any)}
                        className={`w-full p-2 rounded border ${theme === 'dark'
                          ? 'bg-gray-700 border-gray-600'
                          : 'bg-white border-gray-300'
                          }`}
                      >
                        <option value="product">Ürün</option>
                        <option value="price">Fiyat</option>
                        <option value="customer">Müşteri</option>
                        <option value="campaign">Kampanya</option>
                        <option value="config">Konfigürasyon</option>
                        <option value="inventory">Envanter</option>
                        <option value="user">Kullanıcı</option>
                        <option value="report">Rapor</option>
                        <option value="notification">Bildirim</option>
                        <option value="bulk">Toplu İşlem</option>
                        <option value="custom">Özel</option>
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
                        <option value="create">Yeni Kayıt</option>
                        <option value="update">Güncelleme</option>
                        <option value="delete">Silme</option>
                        <option value="sync">Senkronizasyon</option>
                        <option value="bulk_sync">Toplu Senkronizasyon</option>
                        <option value="partial_sync">Kısmi Senkronizasyon</option>
                        <option value="force_sync">Zorunlu Senkronizasyon</option>
                      </select>
                    </div>
                  </div>

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

                    <div>
                      <label className="block text-sm mb-2">Mesaj Kontrol Süresi (sn)</label>
                      <Input
                        type="number"
                        min="1"
                        max="300"
                        value={messageCheckInterval}
                        onChange={(e) => setMessageCheckInterval(parseInt(e.target.value) || 10)}
                        className={`w-full p-2 rounded border ${theme === 'dark'
                          ? 'bg-gray-700 border-gray-600'
                          : 'bg-white border-gray-300'
                          }`}
                        placeholder="10"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Mesaj gönderim kontrol aralığı
                      </p>
                    </div>
                  </div>

                  {/* Kullanıcı Dostu Form Alanları */}
                  <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50">
                    <h4 className="text-sm mb-3 flex items-center gap-2">
                      <Edit className="w-4 h-4" />
                      Veri Girişi
                    </h4>
                    <BroadcastFormFields
                      type={broadcastType}
                      action={broadcastAction}
                      formData={formData}
                      setFormData={setFormData}
                      theme={theme}
                      onRequestSelect={handleOpenSelector}
                    />
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
                      Şablon Olarak Kaydet
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Right Column - Targeting & Conditions */}
              <div className="space-y-6">
                <Card className={`p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
                  <h3 className="text-lg mb-4 flex items-center gap-2">
                    <Filter className="w-5 h-5" />
                    Hedefleme Seçenekleri
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm mb-2">Hedef Cihazlar</label>
                      <select
                        value={targetDevices[0]}
                        onChange={(e) => setTargetDevices([e.target.value])}
                        className={`w-full p-2 rounded border ${theme === 'dark'
                          ? 'bg-gray-700 border-gray-600'
                          : 'bg-white border-gray-300'
                          }`}
                      >
                        <option value="all">Tüm Cihazlar</option>
                        {devices.map(device => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.deviceName} - {device.deviceType} ({device.isOnline ? 'Çevrimiçi' : 'Çevrimdışı'})
                          </option>
                        ))}
                      </select>
                    </div>

                    {deviceGroups.length > 0 && (
                      <div>
                        <label className="block text-sm mb-2">Cihaz Grupları</label>
                        <select
                          multiple
                          value={targetGroups}
                          onChange={(e) => setTargetGroups(Array.from(e.target.selectedOptions, option => option.value))}
                          className={`w-full p-2 rounded border min-h-[100px] ${theme === 'dark'
                            ? 'bg-gray-700 border-gray-600'
                            : 'bg-white border-gray-300'
                            }`}
                        >
                          {deviceGroups.map(group => (
                            <option key={group.id} value={group.id}>
                              {group.name} ({group.deviceIds.length} cihaz)
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {uniqueStores.length > 0 && (
                      <div>
                        <label className="block text-sm mb-2">Mağazalar</label>
                        <select
                          multiple
                          value={targetStores}
                          onChange={(e) => setTargetStores(Array.from(e.target.selectedOptions, option => option.value))}
                          className={`w-full p-2 rounded border min-h-[80px] ${theme === 'dark'
                            ? 'bg-gray-700 border-gray-600'
                            : 'bg-white border-gray-300'
                            }`}
                        >
                          {uniqueStores.map(store => (
                            <option key={store} value={store}>
                              {store}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {uniqueRegions.length > 0 && (
                      <div>
                        <label className="block text-sm mb-2">Bölgeler</label>
                        <select
                          multiple
                          value={targetRegions}
                          onChange={(e) => setTargetRegions(Array.from(e.target.selectedOptions, option => option.value))}
                          className={`w-full p-2 rounded border min-h-[80px] ${theme === 'dark'
                            ? 'bg-gray-700 border-gray-600'
                            : 'bg-white border-gray-300'
                            }`}
                        >
                          {uniqueRegions.map(region => (
                            <option key={region} value={region}>
                              {region}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </Card>

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
                        Koşul eklenmemiş. Tüm hedef cihazlara gönderilecek.
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
                            <option value="in">İçinde</option>
                            <option value="notIn">İçinde Değil</option>
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

                          <Button
                            onClick={() => handleRemoveCondition(index)}
                            size="sm"
                            variant="destructive"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </Card>

                {/* Son Değişiklikler Timeline */}
                <BroadcastChangesTimeline theme={theme} />
              </div>
            </div>

            {/* Gönderilmiş Mesajlar Listesi */}
            <SentMessagesList theme={theme} />
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
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => centralBroadcast.clearQueue('delivered')}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Tamamlananları Temizle
                </Button>
                <Button
                  onClick={() => centralBroadcast.clearQueue('all')}
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
                              onClick={() => centralBroadcast.retryBroadcast(message.id)}
                              size="sm"
                              variant="outline"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </Button>
                          )}
                          {(message.status === 'pending' || message.status === 'scheduled') && (
                            <Button
                              onClick={() => centralBroadcast.cancelBroadcast(message.id)}
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

          {/* Devices Tab */}
          <TabsContent value="devices" className="space-y-4">
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
                          <span className="truncate">{device.deviceName}</span>
                          <div className={`w-2 h-2 rounded-full ${device.isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                        </div>

                        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                          <div className="font-mono truncate">{device.deviceId}</div>
                          {device.deviceType && (
                            <div className="capitalize">{device.deviceType}</div>
                          )}
                          {device.storeName && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {device.storeName}
                            </div>
                          )}
                          {device.region && (
                            <div className="text-gray-500">{device.region}</div>
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
                  <p className="text-gray-500">Henüz kayıtlı cihaz yok</p>
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

          {/* Templates Tab */}
          <TabsContent value="templates" className="space-y-4">
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
              {templates.map(template => (
                <Card
                  key={template.id}
                  className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'} hover:shadow-lg transition-shadow`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-blue-600" />
                      <div>
                        <div>{template.name}</div>
                        {template.description && (
                          <div className="text-xs text-gray-500">{template.description}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        onClick={() => handleUseTemplate(template.id)}
                        size="sm"
                        variant="outline"
                        title="Şablonu Kullan"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => centralBroadcast.deleteTemplate(template.id)}
                        size="sm"
                        variant="destructive"
                        title="Şablonu Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3">
                    <Badge variant="outline">{template.type}</Badge>
                    <Badge variant="secondary">{template.action}</Badge>
                    <Badge variant="outline">{template.channel}</Badge>
                    <div className={`px-2 py-0.5 rounded text-xs text-white ${getPriorityColor(template.priority)}`}>
                      {template.priority}
                    </div>
                  </div>

                  {template.tags && template.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {template.tags.map(tag => (
                        <Badge key={tag} variant="outline" className="gap-1 text-xs">
                          <Tag className="w-3 h-3" />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                    <div>Kullanım: {template.usageCount} kez</div>
                    <div>Oluşturulma: {formatTimestamp(template.createdAt)}</div>
                  </div>
                </Card>
              ))}

              {templates.length === 0 && (
                <Card className={`p-8 text-center col-span-full ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
                  <FileText className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p className="text-gray-500">Henüz şablon oluşturulmamış</p>
                </Card>
              )}
            </div>
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
    </div>
  );
}

