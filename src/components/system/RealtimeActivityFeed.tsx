// Real-time activity feed component

import { useState, useEffect } from 'react';
import { 
  Activity, 
  TrendingUp,
  AlertCircle,
  Store,
  Banknote,
  ShoppingCart,
  Zap,
  Radio
} from 'lucide-react';
import { 
  useRealtimeUpdates, 
  useRealtimeStats, 
  useRealtimeAlerts,
  useRealtimeTransactions
} from '../../hooks/useRealtimeUpdates';
import type { RealtimeEvent } from '../../services/realtimeService';

export function RealtimeActivityFeed() {
  const { events, isConnected, eventCount } = useRealtimeUpdates('ALL');
  const { incrementalRevenue, incrementalTransactions } = useRealtimeStats();
  const { alerts, unreadCount } = useRealtimeAlerts();
  const { transactions } = useRealtimeTransactions(10);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value) + ' IQD';
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'TRANSACTION':
        return <ShoppingCart className="h-4 w-4 text-green-600" />;
      case 'ALERT_NEW':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'STORE_STATUS_CHANGE':
        return <Store className="h-4 w-4 text-blue-600" />;
      case 'STATS_UPDATE':
        return <TrendingUp className="h-4 w-4 text-purple-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'TRANSACTION':
        return 'bg-green-50 border-green-200';
      case 'ALERT_NEW':
        return 'bg-red-50 border-red-200';
      case 'STORE_STATUS_CHANGE':
        return 'bg-blue-50 border-blue-200';
      case 'STATS_UPDATE':
        return 'bg-purple-50 border-purple-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const formatEventData = (event: RealtimeEvent) => {
    switch (event.type) {
      case 'TRANSACTION':
        return (
          <div className="text-sm">
            <span className="font-medium">{event.data.storeName}</span>
            <span className="text-gray-600"> - </span>
            <span className="font-semibold text-green-600">{formatCurrency(event.data.amount)}</span>
            <span className="text-gray-500 text-xs ml-2">({event.data.items} ürün)</span>
          </div>
        );
      case 'ALERT_NEW':
        return (
          <div className="text-sm">
            <span className="font-medium">{event.data.storeName}</span>
            <span className="text-gray-600"> - </span>
            <span className="text-red-600">{event.data.message}</span>
          </div>
        );
      case 'STORE_STATUS_CHANGE':
        return (
          <div className="text-sm">
            <span className="font-medium">{event.data.storeName}</span>
            <span className="text-gray-600"> - Durum: </span>
            <span className="line-through text-gray-400">{event.data.oldStatus}</span>
            <span className="text-gray-600"> → </span>
            <span className="font-medium text-blue-600">{event.data.newStatus}</span>
          </div>
        );
      case 'STATS_UPDATE':
        return (
          <div className="text-sm text-gray-600">
            Sistem istatistikleri güncellendi
          </div>
        );
      default:
        return <div className="text-sm text-gray-600">Bilinmeyen olay</div>;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b bg-gradient-to-r from-purple-50 to-purple-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-purple-600" />
            <h3 className="font-semibold text-gray-900">Canlı Aktivite</h3>
          </div>
          <div className="flex items-center gap-3">
            {/* Connection Status */}
            <div className="flex items-center gap-2">
              {isConnected ? (
                <>
                  <div className="relative">
                    <Radio className="h-4 w-4 text-green-600" />
                    <div className="absolute -top-1 -right-1 h-2 w-2 bg-green-500 rounded-full animate-ping"></div>
                  </div>
                  <span className="text-sm text-green-600 font-medium">Bağlı</span>
                </>
              ) : (
                <>
                  <Radio className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-400">Bağlantı Yok</span>
                </>
              )}
            </div>
            {/* Event Count */}
            <div className="bg-purple-600 text-white px-2 py-1 rounded-full text-xs">
              {eventCount} olay
            </div>
          </div>
        </div>

        {/* Incremental Stats */}
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="bg-white rounded-lg p-2 border">
            <div className="text-xs text-gray-600">Son Güncelleme Ciro</div>
            <div className="text-sm font-semibold text-green-600 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              +{formatCurrency(incrementalRevenue)}
            </div>
          </div>
          <div className="bg-white rounded-lg p-2 border">
            <div className="text-xs text-gray-600">Son Güncelleme İşlem</div>
            <div className="text-sm font-semibold text-blue-600 flex items-center gap-1">
              <ShoppingCart className="h-3 w-3" />
              +{incrementalTransactions}
            </div>
          </div>
        </div>
      </div>

      {/* Event Stream */}
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Zap className="h-12 w-12 mb-2" />
            <p className="text-sm">Canlı olaylar burada görünecek</p>
          </div>
        ) : (
          events.map((event, index) => (
            <div
              key={`${event.type}-${event.timestamp}-${index}`}
              className={`p-3 rounded-lg border ${getEventColor(event.type)} animate-slide-in`}
            >
              <div className="flex items-start gap-2">
                {getEventIcon(event.type)}
                <div className="flex-1 min-w-0">
                  {formatEventData(event)}
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(event.timestamp).toLocaleTimeString('tr-TR')}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Recent Transactions Summary */}
      {transactions.length > 0 && (
        <div className="border-t p-3 bg-gray-50">
          <div className="text-xs text-gray-600 mb-2">Son 10 İşlem Özeti</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-600">Toplam: </span>
              <span className="font-semibold text-green-600">
                {formatCurrency(transactions.reduce((sum, t) => sum + t.amount, 0))}
              </span>
            </div>
            <div>
              <span className="text-gray-600">İşlem: </span>
              <span className="font-semibold text-blue-600">{transactions.length}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Add animation styles
const styles = `
@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-slide-in {
  animation: slide-in 0.3s ease-out;
}
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}
