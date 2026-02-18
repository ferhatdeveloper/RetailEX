import React, { useState, useEffect } from 'react';
import { CheckCircle, Send, Clock, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { centralBroadcast, BroadcastMessage } from '../../utils/centralDataBroadcast';

interface SentMessagesListProps {
  theme: string;
}

export function SentMessagesList({ theme }: SentMessagesListProps) {
  const [messages, setMessages] = useState<BroadcastMessage[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'completed' | 'pending' | 'error'>('all');

  useEffect(() => {
    const updateMessages = () => {
      const history = centralBroadcast.getHistory({ limit: 20 });
      
      let filtered = history;
      if (filter !== 'all') {
        filtered = history.filter(m => m.status === filter);
      }
      
      setMessages(filtered);
    };

    updateMessages();
    const interval = setInterval(updateMessages, 3000);
    return () => clearInterval(interval);
  }, [filter]);

  const getStatusIcon = (status: BroadcastMessage['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'broadcasting':
        return <Send className="w-4 h-4 text-blue-600 animate-pulse" />;
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
    }
  };

  const getStatusBadge = (status: BroadcastMessage['status']) => {
    const colors = {
      completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      broadcasting: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
    };

    const labels = {
      completed: 'Tamamlandı',
      pending: 'Bekliyor',
      broadcasting: 'Gönderiliyor',
      error: 'Hata'
    };

    return (
      <Badge className={`text-xs ${colors[status]}`}>
        {labels[status]}
      </Badge>
    );
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      product: 'Ürün Bilgileri',
      price: 'Fiyat Bilgileri',
      customer: 'Müşteri Bilgileri',
      campaign: 'Kampanya',
      config: 'Konfigürasyon',
      inventory: 'Envanter',
      user: 'Kullanıcı',
      report: 'Rapor',
      notification: 'Bildirim',
      bulk: 'Toplu İşlem',
      custom: 'Özel'
    };
    return labels[type] || type;
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      create: 'Yeni Kayıt',
      update: 'Güncelleme',
      delete: 'Silme',
      sync: 'Senkronizasyon',
      query: 'Sorgulama'
    };
    return labels[action] || action;
  };

  return (
    <Card className={`p-6 mt-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg flex items-center gap-2">
          <Send className="w-5 h-5" />
          Gönderilmiş Mesajlar ({messages.length})
        </h3>
        
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 text-xs rounded ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : theme === 'dark'
                ? 'bg-gray-700 text-gray-300'
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            Tümü
          </button>
          <button
            onClick={() => setFilter('completed')}
            className={`px-3 py-1 text-xs rounded ${
              filter === 'completed'
                ? 'bg-green-600 text-white'
                : theme === 'dark'
                ? 'bg-gray-700 text-gray-300'
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            Tamamlanan
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-3 py-1 text-xs rounded ${
              filter === 'pending'
                ? 'bg-yellow-600 text-white'
                : theme === 'dark'
                ? 'bg-gray-700 text-gray-300'
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            Bekleyen
          </button>
          <button
            onClick={() => setFilter('error')}
            className={`px-3 py-1 text-xs rounded ${
              filter === 'error'
                ? 'bg-red-600 text-white'
                : theme === 'dark'
                ? 'bg-gray-700 text-gray-300'
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            Hatalı
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {messages.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Send className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Henüz gönderilmiş mesaj yok</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`border rounded-lg p-4 ${
                theme === 'dark'
                  ? 'bg-gray-700/50 border-gray-600'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedId(expandedId === message.id ? null : message.id)}
              >
                <div className="flex items-center gap-3 flex-1">
                  {getStatusIcon(message.status)}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm truncate">
                        {getTypeLabel(message.type)} - {getActionLabel(message.action)}
                      </span>
                      {getStatusBadge(message.status)}
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>{formatDate(message.createdAt)}</span>
                      <span>{message.deviceTargets.length} cihaz</span>
                      <span className="capitalize">{message.priority} öncelik</span>
                    </div>
                  </div>
                </div>

                {expandedId === message.id ? (
                  <ChevronDown className="w-5 h-5 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-5 h-5 flex-shrink-0" />
                )}
              </div>

              {expandedId === message.id && (
                <div className={`mt-4 pt-4 border-t ${
                  theme === 'dark' ? 'border-gray-600' : 'border-gray-200'
                }`}>
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Mesaj ID</p>
                      <p className="text-sm font-mono">{message.id.substring(0, 8)}...</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Kanal</p>
                      <p className="text-sm capitalize">{message.channel}</p>
                    </div>
                  </div>

                  {message.scheduledFor && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 mb-1">Zamanlanmış Gönderim</p>
                      <p className="text-sm">{formatDate(message.scheduledFor)}</p>
                    </div>
                  )}

                  {message.tags && message.tags.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 mb-1">Etiketler</p>
                      <div className="flex gap-1 flex-wrap">
                        {message.tags.map((tag, i) => (
                          <span
                            key={i}
                            className={`px-2 py-1 text-xs rounded ${
                              theme === 'dark'
                                ? 'bg-gray-600 text-gray-300'
                                : 'bg-gray-200 text-gray-700'
                            }`}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-xs text-gray-500 mb-1">Veri</p>
                    <pre className={`text-xs p-2 rounded overflow-x-auto ${
                      theme === 'dark'
                        ? 'bg-gray-900 text-gray-300'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {JSON.stringify(message.data, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

