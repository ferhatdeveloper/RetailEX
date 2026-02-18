import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle, AlertTriangle, TrendingUp, Calendar } from 'lucide-react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { centralBroadcast } from '../../utils/centralDataBroadcast';

interface TimelineChange {
  id: string;
  type: 'sent' | 'received' | 'error' | 'warning';
  title: string;
  description: string;
  timestamp: Date;
  data?: any;
}

interface BroadcastChangesTimelineProps {
  theme: string;
}

export function BroadcastChangesTimeline({ theme }: BroadcastChangesTimelineProps) {
  const [changes, setChanges] = useState<TimelineChange[]>([]);
  const [filter, setFilter] = useState<'all' | 'today' | 'week'>('today');

  useEffect(() => {
    // History'den son değişiklikleri al
    const updateChanges = () => {
      const history = centralBroadcast.getHistory({ limit: 50 });
      const timelineChanges: TimelineChange[] = history.map(item => {
        let type: TimelineChange['type'] = 'sent';
        if (item.status === 'error') type = 'error';
        else if (item.status === 'completed') type = 'received';
        else if (item.status === 'pending') type = 'warning';

        return {
          id: item.id,
          type,
          title: `${item.type} - ${item.action}`,
          description: `${item.deviceTargets.length} cihaza gönderildi`,
          timestamp: item.createdAt,
          data: item.data
        };
      });

      // Filtreleme
      let filtered = timelineChanges;
      const now = new Date();
      if (filter === 'today') {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        filtered = timelineChanges.filter(c => c.timestamp >= today);
      } else if (filter === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filtered = timelineChanges.filter(c => c.timestamp >= weekAgo);
      }

      setChanges(filtered);
    };

    updateChanges();
    const interval = setInterval(updateChanges, 3000);
    return () => clearInterval(interval);
  }, [filter]);

  const getIcon = (type: TimelineChange['type']) => {
    switch (type) {
      case 'sent':
        return <TrendingUp className="w-4 h-4 text-blue-600" />;
      case 'received':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case 'warning':
        return <Clock className="w-4 h-4 text-yellow-600" />;
    }
  };

  const getBadgeColor = (type: TimelineChange['type']) => {
    switch (type) {
      case 'sent':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'received':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} gün önce`;
    if (hours > 0) return `${hours} saat önce`;
    if (minutes > 0) return `${minutes} dakika önce`;
    return `${seconds} saniye önce`;
  };

  return (
    <Card className={`p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Son Değişiklikler
        </h3>
        
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('today')}
            className={`px-3 py-1 text-xs rounded ${
              filter === 'today'
                ? 'bg-blue-600 text-white'
                : theme === 'dark'
                ? 'bg-gray-700 text-gray-300'
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            Bugün
          </button>
          <button
            onClick={() => setFilter('week')}
            className={`px-3 py-1 text-xs rounded ${
              filter === 'week'
                ? 'bg-blue-600 text-white'
                : theme === 'dark'
                ? 'bg-gray-700 text-gray-300'
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            7 Gün
          </button>
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
        </div>
      </div>

      <div className="space-y-3 max-h-[600px] overflow-y-auto">
        {changes.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Henüz değişiklik yok</p>
          </div>
        ) : (
          changes.map((change, index) => (
            <div
              key={change.id}
              className={`flex gap-3 p-3 rounded border ${
                theme === 'dark'
                  ? 'bg-gray-700/50 border-gray-600'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex-shrink-0 mt-1">
                {getIcon(change.type)}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm truncate">{change.title}</p>
                  <Badge className={`text-xs px-2 py-0 ${getBadgeColor(change.type)}`}>
                    {change.type === 'sent' ? 'Gönderildi' :
                     change.type === 'received' ? 'Alındı' :
                     change.type === 'error' ? 'Hata' : 'Bekliyor'}
                  </Badge>
                </div>
                
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  {change.description}
                </p>
                
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {formatTime(change.timestamp)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Özet İstatistikler */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs text-gray-500">Toplam</p>
            <p className="text-lg">{changes.length}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Başarılı</p>
            <p className="text-lg text-green-600">
              {changes.filter(c => c.type === 'received').length}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Hata</p>
            <p className="text-lg text-red-600">
              {changes.filter(c => c.type === 'error').length}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

