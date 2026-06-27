import React, { useState, useEffect } from 'react';
import { CheckCircle, Send, Clock, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import {
  listEnterpriseSyncMessages,
  type EnterpriseSyncMessage,
} from '../../services/enterpriseSyncService';

interface SentMessagesListProps {
  theme: string;
}

export function SentMessagesList({ theme }: SentMessagesListProps) {
  const [messages, setMessages] = useState<EnterpriseSyncMessage[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  type UiFilter = 'all' | 'completed' | 'pending' | 'error';
  const [filter, setFilter] = useState<UiFilter>('all');

  useEffect(() => {
    const updateMessages = async () => {
      try {
        const status =
          filter === 'completed'
            ? 'completed'
            : filter === 'pending'
              ? 'pending'
              : filter === 'error'
                ? 'error'
                : 'all';
        const rows = await listEnterpriseSyncMessages({
          limit: 30,
          status: status === 'all' ? undefined : status,
        });
        setMessages(rows);
      } catch {
        setMessages([]);
      }
    };

    void updateMessages();
    const interval = setInterval(() => void updateMessages(), 4000);
    return () => clearInterval(interval);
  }, [filter]);

  const getStatusIcon = (status: EnterpriseSyncMessage['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'pending':
      case 'processing':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'failed':
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: EnterpriseSyncMessage['status']) => {
    const colors: Record<string, string> = {
      completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    };
    const labels: Record<string, string> = {
      completed: 'Tamamlandı',
      pending: 'Bekliyor',
      processing: 'Gönderiliyor',
      failed: 'Hata',
    };
    return (
      <Badge className={`text-xs ${colors[status] ?? colors.pending}`}>
        {labels[status] ?? status}
      </Badge>
    );
  };

  const formatDate = (value: number) =>
    new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(value));

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      product: 'Ürün Bilgileri',
      price: 'Fiyat Bilgileri',
      customer: 'Müşteri Bilgileri',
      campaign: 'Kampanya',
      sale: 'Satış',
      custom: 'Özel',
    };
    return labels[type] || type;
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      create: 'Yeni Kayıt',
      update: 'Güncelleme',
      delete: 'Silme',
      sync: 'Senkronizasyon',
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
          {(['all', 'completed', 'pending', 'error'] as UiFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded ${
                filter === f
                  ? f === 'completed'
                    ? 'bg-green-600 text-white'
                    : f === 'pending'
                      ? 'bg-yellow-600 text-white'
                      : f === 'error'
                        ? 'bg-red-600 text-white'
                        : 'bg-blue-600 text-white'
                  : theme === 'dark'
                    ? 'bg-gray-700 text-gray-300'
                    : 'bg-gray-200 text-gray-700'
              }`}
            >
              {f === 'all'
                ? 'Tümü'
                : f === 'completed'
                  ? 'Tamamlanan'
                  : f === 'pending'
                    ? 'Bekleyen'
                    : 'Hatalı'}
            </button>
          ))}
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
                theme === 'dark' ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'
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
                      <span className="font-mono truncate">{message.tableName}</span>
                    </div>
                    {message.errorMessage && (
                      <p className="text-xs text-red-500 mt-1 truncate">{message.errorMessage}</p>
                    )}
                  </div>
                </div>

                {expandedId === message.id ? (
                  <ChevronDown className="w-5 h-5 shrink-0" />
                ) : (
                  <ChevronRight className="w-5 h-5 shrink-0" />
                )}
              </div>

              {expandedId === message.id && (
                <div
                  className={`mt-4 pt-4 border-t ${
                    theme === 'dark' ? 'border-gray-600' : 'border-gray-200'
                  }`}
                >
                  <pre
                    className={`text-xs p-2 rounded overflow-x-auto ${
                      theme === 'dark' ? 'bg-gray-900 text-gray-300' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {JSON.stringify(message.data ?? {}, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
