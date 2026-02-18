import React, { useState, useEffect } from 'react';
import { Send, Radio, CheckCircle, XCircle, Clock, RefreshCw, Trash2, Monitor } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Select } from '../ui/select';
import { Input } from '../ui/input';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { centralBroadcast, BroadcastMessage, DeviceStatus } from '../../utils/centralDataBroadcast';
import { logger } from '../../utils/logger';

export function CentralDataBroadcastPanel() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  
  const [queue, setQueue] = useState<BroadcastMessage[]>([]);
  const [devices, setDevices] = useState<DeviceStatus[]>([]);
  const [stats, setStats] = useState(centralBroadcast.getStats());
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  
  // Form state
  const [broadcastType, setBroadcastType] = useState<BroadcastMessage['type']>('product');
  const [broadcastAction, setBroadcastAction] = useState<BroadcastMessage['action']>('sync');
  const [broadcastData, setBroadcastData] = useState('');
  const [targetDevices, setTargetDevices] = useState<string[]>(['all']);

  // Update data
  useEffect(() => {
    const updateData = () => {
      setQueue(centralBroadcast.getQueue());
      setDevices(centralBroadcast.getDevices());
      setStats(centralBroadcast.getStats());
    };

    updateData();
    const interval = setInterval(updateData, 2000);

    const unsubscribeBroadcast = centralBroadcast.onBroadcast((status, updatedQueue) => {
      setIsBroadcasting(status === 'started' || status === 'progress');
      setQueue(updatedQueue);
      setStats(centralBroadcast.getStats());
    });

    const unsubscribeDevices = centralBroadcast.onDeviceUpdate((updatedDevices) => {
      setDevices(updatedDevices);
      setStats(centralBroadcast.getStats());
    });

    return () => {
      clearInterval(interval);
      unsubscribeBroadcast();
      unsubscribeDevices();
    };
  }, []);

  const handleSendBroadcast = async () => {
    try {
      let data: any;
      try {
        data = JSON.parse(broadcastData || '{}');
      } catch {
        data = { value: broadcastData };
      }

      await centralBroadcast.addBroadcast(broadcastType, broadcastAction, data, {
        targetDevices,
        priority: 'normal'
      });

      setBroadcastData('');
      logger.log('broadcast-ui', 'Broadcast added to queue');
    } catch (error) {
      logger.error('broadcast-ui', 'Failed to add broadcast', error);
      alert('Broadcast gönderilemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  const handleManualBroadcast = () => {
    centralBroadcast.startBroadcast();
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getStatusColor = (status: BroadcastMessage['status']) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500';
      case 'sending': return 'bg-blue-500 animate-pulse';
      case 'delivered': return 'bg-green-500';
      case 'failed': return 'bg-red-500';
      case 'expired': return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: BroadcastMessage['status']) => {
    switch (status) {
      case 'pending': return Clock;
      case 'sending': return RefreshCw;
      case 'delivered': return CheckCircle;
      case 'failed': return XCircle;
      case 'expired': return XCircle;
    }
  };

  return (
    <div className={`h-full p-6 ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Radio className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold">Merkezi Veri Gönderim Kuyruğu</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Ana merkezden cihazlara veri broadcast sistemi
              </p>
            </div>
          </div>

          <Button
            onClick={handleManualBroadcast}
            disabled={isBroadcasting || queue.length === 0}
            className="gap-2"
          >
            {isBroadcasting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {isBroadcasting ? 'Gönderiliyor...' : 'Şimdi Gönder'}
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4">
          <Card className={`p-4 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Toplam Cihaz</p>
                <p className="text-2xl font-bold">{stats.totalDevices}</p>
              </div>
              <Monitor className="w-8 h-8 text-blue-600" />
            </div>
          </Card>

          <Card className={`p-4 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Çevrimiçi</p>
                <p className="text-2xl font-bold text-green-600">{stats.onlineDevices}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </Card>

          <Card className={`p-4 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Bekleyen</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pendingBroadcasts}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>
          </Card>

          <Card className={`p-4 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Teslim Edildi</p>
                <p className="text-2xl font-bold text-blue-600">{stats.deliveredBroadcasts}</p>
              </div>
              <Send className="w-8 h-8 text-blue-600" />
            </div>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="send" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="send">Veri Gönder</TabsTrigger>
            <TabsTrigger value="queue">Kuyruk ({queue.length})</TabsTrigger>
            <TabsTrigger value="devices">Cihazlar ({devices.length})</TabsTrigger>
          </TabsList>

          {/* Send Tab */}
          <TabsContent value="send" className="space-y-4">
            <Card className={`p-6 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
              <h3 className="text-lg font-semibold mb-4">Yeni Broadcast Gönder</h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Veri Tipi</label>
                    <select
                      value={broadcastType}
                      onChange={(e) => setBroadcastType(e.target.value as any)}
                      className={`w-full p-2 rounded border ${
                        theme === 'dark'
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
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">İşlem</label>
                    <select
                      value={broadcastAction}
                      onChange={(e) => setBroadcastAction(e.target.value as any)}
                      className={`w-full p-2 rounded border ${
                        theme === 'dark'
                          ? 'bg-gray-700 border-gray-600'
                          : 'bg-white border-gray-300'
                      }`}
                    >
                      <option value="create">Yeni Kayıt (Create)</option>
                      <option value="update">Güncelleme (Update)</option>
                      <option value="delete">Silme (Delete)</option>
                      <option value="sync">Senkronizasyon (Sync)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Hedef Cihazlar</label>
                  <select
                    value={targetDevices[0]}
                    onChange={(e) => setTargetDevices([e.target.value])}
                    className={`w-full p-2 rounded border ${
                      theme === 'dark'
                        ? 'bg-gray-700 border-gray-600'
                        : 'bg-white border-gray-300'
                    }`}
                  >
                    <option value="all">Tüm Cihazlar</option>
                    {devices.map(device => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.deviceName} ({device.isOnline ? 'Çevrimiçi' : 'Çevrimdışı'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Veri (JSON)</label>
                  <textarea
                    value={broadcastData}
                    onChange={(e) => setBroadcastData(e.target.value)}
                    placeholder='{"productId": "123", "name": "Ürün Adı", "price": 100}'
                    rows={6}
                    className={`w-full p-3 rounded border font-mono text-sm ${
                      theme === 'dark'
                        ? 'bg-gray-700 border-gray-600'
                        : 'bg-white border-gray-300'
                    }`}
                  />
                </div>

                <Button onClick={handleSendBroadcast} className="w-full gap-2">
                  <Send className="w-4 h-4" />
                  Kuyruğa Ekle ve Gönder
                </Button>
              </div>
            </Card>
          </TabsContent>

          {/* Queue Tab */}
          <TabsContent value="queue" className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Gönderim Kuyruğu</h3>
              <Button
                onClick={() => centralBroadcast.clearQueue('delivered')}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Tamamlananları Temizle
              </Button>
            </div>

            <div className="space-y-2">
              {queue.length === 0 ? (
                <Card className={`p-8 text-center ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                  <p className="text-gray-500">Kuyrukta bekleyen mesaj yok</p>
                </Card>
              ) : (
                queue.map(message => {
                  const StatusIcon = getStatusIcon(message.status);
                  return (
                    <Card
                      key={message.id}
                      className={`p-4 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          <div className={`w-3 h-3 rounded-full mt-1 ${getStatusColor(message.status)}`} />
                          
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="capitalize">
                                {message.type}
                              </Badge>
                              <Badge variant="secondary" className="capitalize">
                                {message.action}
                              </Badge>
                              {message.priority !== 'normal' && (
                                <Badge variant="destructive" className="capitalize">
                                  {message.priority}
                                </Badge>
                              )}
                            </div>

                            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                              <div>ID: {message.id}</div>
                              <div>Oluşturulma: {formatTimestamp(message.createdAt)}</div>
                              <div>
                                Hedef: {message.targetDevices.includes('all') 
                                  ? 'Tüm Cihazlar' 
                                  : `${message.targetDevices.length} Cihaz`}
                              </div>
                              <div>
                                Durum: {message.deliveredTo.length}/{
                                  message.targetDevices.includes('all') 
                                    ? devices.length 
                                    : message.targetDevices.length
                                } teslim edildi
                              </div>
                              {message.error && (
                                <div className="text-red-500">Hata: {message.error}</div>
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
                              Tekrar Dene
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
            <h3 className="text-lg font-semibold mb-4">Bağlı Cihazlar</h3>

            <div className="grid gap-4">
              {devices.map(device => (
                <Card
                  key={device.deviceId}
                  className={`p-4 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${
                        device.isOnline ? 'bg-green-500' : 'bg-gray-400'
                      }`} />
                      <div>
                        <div className="font-semibold">{device.deviceName}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {device.deviceId}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-center">
                        <div className="text-yellow-600 font-semibold">{device.pendingMessages}</div>
                        <div className="text-gray-600 dark:text-gray-400">Bekleyen</div>
                      </div>
                      <div className="text-center">
                        <div className="text-green-600 font-semibold">{device.deliveredMessages}</div>
                        <div className="text-gray-600 dark:text-gray-400">Teslim</div>
                      </div>
                      <div className="text-center">
                        <div className="text-red-600 font-semibold">{device.failedMessages}</div>
                        <div className="text-gray-600 dark:text-gray-400">Başarısız</div>
                      </div>
                      <div className="text-center min-w-[100px]">
                        <div className="text-gray-600 dark:text-gray-400 text-xs">
                          Son Görülme:
                        </div>
                        <div className="font-mono text-xs">
                          {formatTimestamp(device.lastSeen)}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}

              {devices.length === 0 && (
                <Card className={`p-8 text-center ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
                  <Monitor className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p className="text-gray-500">Henüz kayıtlı cihaz yok</p>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

