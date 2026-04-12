import React, { useState, useEffect } from 'react';
import {
  Radio, Wifi, Clock, Calendar, TrendingUp, BarChart3,
  Zap, Send, Database, Users, Package, Banknote,
  Tag, ShoppingCart, Filter, Plus, Play, Pause, Trash2,
  AlertCircle, CheckCircle, XCircle, RefreshCw, Download, Upload
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import { toast } from 'sonner';
import { syncAPI } from '../../services/api/sync';

// Types
interface BroadcastMessage {
  id: string;
  type: 'product' | 'price' | 'campaign' | 'customer' | 'category' | 'stock';
  action: 'sync' | 'update' | 'delete' | 'pull';
  priority: 'low' | 'normal' | 'high' | 'critical';
  channel: 'auto' | 'manual' | 'scheduled';
  status: 'pending' | 'in-progress' | 'completed' | 'failed';

  // Targeting
  target_stores: string[] | 'all';
  target_groups?: string[];
  conditions?: BroadcastCondition[];

  // Data
  payload: any;

  // Timing
  created_at: string;
  scheduled_for?: string;
  sent_at?: string;
  completed_at?: string;

  // Results
  total_devices: number;
  successful: number;
  failed: number;
  pending: number;

  // Control
  message_interval_seconds: number;
  retry_count: number;
  max_retries: number;
}

interface BroadcastCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains';
  value: any;
}

interface StoreDevice {
  id: string;
  store_code: string;
  store_name: string;
  status: 'online' | 'offline' | 'syncing';
  last_seen: string;
  last_sync: string;
  pending_messages: number;
  version: string;
}

const CentralBroadcastManagement: React.FC = () => {
  // Stats
  const [stats, setStats] = useState({
    totalDevices: 0,
    onlineDevices: 0,
    pendingMessages: 0,
    scheduledMessages: 0,
    successRate: 0,
    last24hSuccess: 0,
    last24hTotal: 0,
    dataTransferred: 0 // in bytes
  });

  // Devices
  const [devices, setDevices] = useState<StoreDevice[]>([]);

  // Broadcasts
  const [broadcasts, setBroadcasts] = useState<BroadcastMessage[]>([]);

  // Form state
  const [newBroadcast, setNewBroadcast] = useState<Partial<BroadcastMessage>>({
    type: 'product',
    action: 'sync',
    priority: 'normal',
    channel: 'auto',
    target_stores: 'all',
    message_interval_seconds: 10,
    retry_count: 0,
    max_retries: 3
  });

  // Product data form (example)
  const [productData, setProductData] = useState({
    product_id: '',
    barcode: '',
    name: ''
  });

  // Filters
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [timeFilter, setTimeFilter] = useState<'today' | '7days' | 'all'>('today');

  // Load data
  useEffect(() => {
    loadStats();
    loadDevices();
    loadBroadcasts();

    // Real-time updates
    const interval = setInterval(() => {
      loadStats();
      loadDevices();
    }, 5000); // Every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    // TODO: Load from API
    setStats({
      totalDevices: 12,
      onlineDevices: 8,
      pendingMessages: 3,
      scheduledMessages: 2,
      successRate: 98.5,
      last24hSuccess: 245,
      last24hTotal: 250,
      dataTransferred: 1024 * 1024 * 15 // 15 MB
    });
  };

  const loadDevices = async () => {
    try {
      const result = await syncAPI.getDevices();
      if (result.success) {
        setDevices(result.devices.map((d: any) => ({
          id: d.id,
          store_code: d.device_id,
          store_name: d.device_name,
          status: d.status,
          last_seen: d.last_seen,
          last_sync: d.last_sync_at,
          pending_messages: d.pending_messages,
          version: d.app_version
        })));
      }
    } catch (error) {
      console.error('[Sync] Failed to load devices:', error);
    }
  };

  const loadBroadcasts = async () => {
    // TODO: Load from API
    const mockBroadcasts: BroadcastMessage[] = [
      {
        id: '1',
        type: 'product',
        action: 'sync',
        priority: 'normal',
        channel: 'auto',
        status: 'completed',
        target_stores: 'all',
        payload: { product_id: 'PRD001' },
        created_at: new Date(Date.now() - 30 * 60000).toISOString(),
        sent_at: new Date(Date.now() - 29 * 60000).toISOString(),
        completed_at: new Date(Date.now() - 25 * 60000).toISOString(),
        total_devices: 12,
        successful: 11,
        failed: 1,
        pending: 0,
        message_interval_seconds: 10,
        retry_count: 0,
        max_retries: 3
      }
    ];

    setBroadcasts(mockBroadcasts);
  };

  const handleCreateBroadcast = async () => {
    try {
      // Validate
      if (newBroadcast.type === 'product' && !productData.product_id) {
        toast.error('Ürün ID gerekli');
        return;
      }

      // Create payload based on type
      let payload: any = {};

      switch (newBroadcast.type) {
        case 'product':
          payload = productData;
          break;
        // Add other types...
      }

      const broadcastPayload = {
        message_type: newBroadcast.type!,
        action: newBroadcast.action!,
        priority: newBroadcast.priority!,
        target_stores: newBroadcast.target_stores === 'all' ? undefined : newBroadcast.target_stores,
        payload
      };

      const result = await syncAPI.createBroadcast(broadcastPayload);

      if (result.success) {
        toast.success('Broadcast oluşturuldu ve gönderiliyor...');
        loadBroadcasts(); // Reload list
      } else {
        toast.error('Hata: ' + result.error);
      }

      // Reset form
      setProductData({ product_id: '', barcode: '', name: '' });

    } catch (error) {
      console.error('Broadcast creation error:', error);
      toast.error('Broadcast oluşturulurken hata oluştu');
    }
  };

  const handlePullData = async (type: 'sales' | 'stock' | 'customers') => {
    try {
      const result = await syncAPI.pullData({
        message_type: type as any,
        target_stores: undefined, // All stores
        since: new Date(Date.now() - 24 * 3600000).toISOString()
      });

      if (result.success) {
        toast.success(`${type} verileri çekiliyor...`);
        loadBroadcasts();
      } else {
        toast.error('Hata: ' + result.error);
      }

    } catch (error) {
      console.error('Pull data error:', error);
      toast.error('Veri çekme başlatılırken hata oluştu');
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatTimeAgo = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return `${seconds} saniye önce`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} dakika önce`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} saat önce`;
    return `${Math.floor(seconds / 86400)} gün önce`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500 rounded-xl">
              <Radio className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Merkezi Veri Yönetim Sistemi
              </h1>
              <p className="text-gray-600">
                Enterprise Senkronizasyon ve Broadcast Yönetimi v2.0
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => loadDevices()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Yenile
            </Button>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Yedekle
            </Button>
            <Button className="bg-blue-500 hover:bg-blue-600">
              <Send className="w-4 h-4 mr-2" />
              Şimdi Gönder
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Toplam Cihaz</span>
                <Database className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-2xl font-bold">{stats.totalDevices}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Çevrimiçi</span>
                <CheckCircle className="w-4 h-4 text-green-500" />
              </div>
              <div className="text-2xl font-bold text-green-600">{stats.onlineDevices}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Bekleyen</span>
                <Clock className="w-4 h-4 text-orange-500" />
              </div>
              <div className="text-2xl font-bold text-orange-600">{stats.pendingMessages}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Zamanlanmış</span>
                <Calendar className="w-4 h-4 text-purple-500" />
              </div>
              <div className="text-2xl font-bold text-purple-600">{stats.scheduledMessages}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Başarı Oranı</span>
                <TrendingUp className="w-4 h-4 text-green-500" />
              </div>
              <div className="text-2xl font-bold text-green-600">{stats.successRate}%</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">24 Saat</span>
                <BarChart3 className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-2xl font-bold">{stats.last24hSuccess}/{stats.last24hTotal}</div>
            </CardContent>
          </Card>

          <Card className="col-span-2">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Veri Transfer</span>
                <Zap className="w-4 h-4 text-yellow-500" />
              </div>
              <div className="text-2xl font-bold">{formatBytes(stats.dataTransferred)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="send" className="w-full">
          <TabsList className="grid w-full grid-cols-6 bg-white">
            <TabsTrigger value="send" className="flex items-center gap-2">
              <Send className="w-4 h-4" />
              Veri Gönder
            </TabsTrigger>
            <TabsTrigger value="devices" className="flex items-center gap-2">
              <Radio className="w-4 h-4" />
              Kuyruk (0)
            </TabsTrigger>
            <TabsTrigger value="devices2" className="flex items-center gap-2">
              <Database className="w-4 h-4" />
              Cihazlar (0)
            </TabsTrigger>
            <TabsTrigger value="groups" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Gruplar (0)
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              Şablonlar (0)
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Geçmiş
            </TabsTrigger>
          </TabsList>

          {/* Send Data Tab */}
          <TabsContent value="send" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Left: Create Broadcast */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Send className="w-5 h-5" />
                      Yeni Broadcast Oluştur
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">

                    {/* Broadcast Config */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Veri Tipi</Label>
                        <Select
                          value={newBroadcast.type}
                          onValueChange={(value: any) => setNewBroadcast({ ...newBroadcast, type: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="product">Ürün</SelectItem>
                            <SelectItem value="price">Fiyat</SelectItem>
                            <SelectItem value="campaign">Kampanya</SelectItem>
                            <SelectItem value="customer">Müşteri</SelectItem>
                            <SelectItem value="category">Kategori</SelectItem>
                            <SelectItem value="stock">Stok</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>İşlem</Label>
                        <Select
                          value={newBroadcast.action}
                          onValueChange={(value: any) => setNewBroadcast({ ...newBroadcast, action: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sync">Senkronizasyon</SelectItem>
                            <SelectItem value="update">Güncelleme</SelectItem>
                            <SelectItem value="delete">Silme</SelectItem>
                            <SelectItem value="pull">Veri Çekme</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Öncelik</Label>
                        <Select
                          value={newBroadcast.priority}
                          onValueChange={(value: any) => setNewBroadcast({ ...newBroadcast, priority: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Düşük</SelectItem>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="high">Yüksek</SelectItem>
                            <SelectItem value="critical">Kritik</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Kanal</Label>
                        <Select
                          value={newBroadcast.channel}
                          onValueChange={(value: any) => setNewBroadcast({ ...newBroadcast, channel: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Otomatik</SelectItem>
                            <SelectItem value="manual">Manuel</SelectItem>
                            <SelectItem value="scheduled">Zamanlanmış</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Message Control */}
                    <div className="space-y-2">
                      <Label>Mesaj Kontrol Süresi (sn)</Label>
                      <Input
                        type="number"
                        value={newBroadcast.message_interval_seconds}
                        onChange={(e) => setNewBroadcast({
                          ...newBroadcast,
                          message_interval_seconds: parseInt(e.target.value)
                        })}
                        placeholder="10"
                      />
                      <p className="text-sm text-gray-500">Mesaj gönderim kontrol aralığı</p>
                    </div>

                    {/* Data Input */}
                    <div className="border-t pt-6">
                      <div className="flex items-center gap-2 mb-4">
                        <Checkbox id="data-entry" defaultChecked />
                        <Label htmlFor="data-entry">Veri Girişi</Label>
                      </div>

                      {newBroadcast.type === 'product' && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Ürün ID *</Label>
                            <Input
                              value={productData.product_id}
                              onChange={(e) => setProductData({ ...productData, product_id: e.target.value })}
                              placeholder="PRD001"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Barkod</Label>
                            <Input
                              value={productData.barcode}
                              onChange={(e) => setProductData({ ...productData, barcode: e.target.value })}
                              placeholder="1234567890123"
                            />
                          </div>

                          <div className="col-span-2 space-y-2">
                            <Label>Ürün Adı *</Label>
                            <Input
                              value={productData.name}
                              onChange={(e) => setProductData({ ...productData, name: e.target.value })}
                              placeholder="Ürün adını girin"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                      <Button
                        className="flex-1 bg-blue-500 hover:bg-blue-600"
                        onClick={handleCreateBroadcast}
                      >
                        <Send className="w-4 h-4 mr-2" />
                        Broadcast Oluştur
                      </Button>
                      <Button variant="outline">
                        <Plus className="w-4 h-4 mr-2" />
                        Şablon Kaydet
                      </Button>
                    </div>

                  </CardContent>
                </Card>

                {/* Quick Pull Actions */}
                <Card className="mt-6">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Download className="w-5 h-5" />
                      Hızlı Veri Çekme
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      <Button
                        variant="outline"
                        onClick={() => handlePullData('sales')}
                      >
                        <ShoppingCart className="w-4 h-4 mr-2" />
                        Satışları Çek
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handlePullData('stock')}
                      >
                        <Package className="w-4 h-4 mr-2" />
                        Stokları Çek
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handlePullData('customers')}
                      >
                        <Users className="w-4 h-4 mr-2" />
                        Müşterileri Çek
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right: Targeting & Recent Changes */}
              <div className="space-y-6">

                {/* Targeting */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Filter className="w-5 h-5" />
                        Hedefleme Seçenekleri
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">

                    <div className="space-y-2">
                      <Label>Hedef Cihazlar</Label>
                      <Select
                        value={newBroadcast.target_stores === 'all' ? 'all' : 'selected'}
                        onValueChange={(value: any) => setNewBroadcast({
                          ...newBroadcast,
                          target_stores: value === 'all' ? 'all' : []
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tüm Cihazlar</SelectItem>
                          <SelectItem value="selected">Seçili Cihazlar</SelectItem>
                          <SelectItem value="group">Grup</SelectItem>
                          <SelectItem value="region">Bölge</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label>Koşullar (0)</Label>
                        <Button variant="ghost" size="sm">
                          <Plus className="w-4 h-4 mr-1" />
                          Ekle
                        </Button>
                      </div>
                      <div className="text-sm text-gray-500 text-center py-8 border rounded-lg">
                        Koşul eklenmemiş. Tüm hedef cihazlara gönderilecek.
                      </div>
                    </div>

                  </CardContent>
                </Card>

                {/* Recent Changes */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="w-5 h-5" />
                      Son Değişiklikler
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2 mb-4">
                      <Button
                        variant={timeFilter === 'today' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setTimeFilter('today')}
                      >
                        Bugün
                      </Button>
                      <Button
                        variant={timeFilter === '7days' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setTimeFilter('7days')}
                      >
                        7 Gün
                      </Button>
                      <Button
                        variant={timeFilter === 'all' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setTimeFilter('all')}
                      >
                        Tümü
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {broadcasts.slice(0, 5).map((broadcast) => (
                        <div
                          key={broadcast.id}
                          className="p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium capitalize">
                              {broadcast.type} - {broadcast.action}
                            </span>
                            <Badge variant={
                              broadcast.status === 'completed' ? 'default' :
                                broadcast.status === 'failed' ? 'destructive' :
                                  'secondary'
                            }>
                              {broadcast.status}
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-600">
                            {formatTimeAgo(broadcast.created_at)}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {broadcast.successful}/{broadcast.total_devices} başarılı
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

              </div>
            </div>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Broadcast Geçmişi</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {broadcasts.map((broadcast) => (
                    <div
                      key={broadcast.id}
                      className="p-4 border rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <Badge variant={
                            broadcast.status === 'completed' ? 'default' :
                              broadcast.status === 'failed' ? 'destructive' :
                                broadcast.status === 'in-progress' ? 'secondary' :
                                  'outline'
                          }>
                            {broadcast.status}
                          </Badge>
                          <span className="font-medium capitalize">
                            {broadcast.type} - {broadcast.action}
                          </span>
                          <Badge variant="outline" className="capitalize">
                            {broadcast.priority}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-600">
                          {formatTimeAgo(broadcast.created_at)}
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-4 mt-3">
                        <div>
                          <div className="text-xs text-gray-500">Toplam</div>
                          <div className="font-medium">{broadcast.total_devices}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Başarılı</div>
                          <div className="font-medium text-green-600">{broadcast.successful}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Başarısız</div>
                          <div className="font-medium text-red-600">{broadcast.failed}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Bekleyen</div>
                          <div className="font-medium text-orange-600">{broadcast.pending}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>

      </div>
    </div>
  );
};

export default CentralBroadcastManagement;

