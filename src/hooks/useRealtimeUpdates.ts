// React hook for real-time updates

import { useEffect, useState, useCallback } from 'react';
import { 
  realtimeService, 
  type RealtimeEvent, 
  type RealtimeEventType,
  type TransactionEvent,
  type AlertEvent,
  type StatsUpdateEvent
} from '../services/realtimeService';

export function useRealtimeUpdates(eventType: RealtimeEventType | 'ALL' = 'ALL') {
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    setIsConnected(realtimeService.isActive());

    const handleEvent = (event: RealtimeEvent) => {
      setLastEvent(event);
      setEvents(prev => [event, ...prev].slice(0, 100)); // Keep last 100 events
    };

    const unsubscribe = realtimeService.subscribe(eventType, handleEvent);

    return () => {
      unsubscribe();
    };
  }, [eventType]);

  const clearEvents = useCallback(() => {
    setEvents([]);
    setLastEvent(null);
  }, []);

  return {
    events,
    lastEvent,
    isConnected,
    clearEvents,
    eventCount: events.length
  };
}

/**
 * Hook for real-time statistics updates
 */
export function useRealtimeStats() {
  const [stats, setStats] = useState<StatsUpdateEvent | null>(null);
  const [incrementalRevenue, setIncrementalRevenue] = useState(0);
  const [incrementalTransactions, setIncrementalTransactions] = useState(0);

  useEffect(() => {
    // Subscribe to stats updates
    const unsubscribeStats = realtimeService.subscribe('STATS_UPDATE', (event) => {
      setStats(event.data as StatsUpdateEvent);
    });

    // Subscribe to transactions for incremental updates
    const unsubscribeTransactions = realtimeService.subscribe('TRANSACTION', (event) => {
      const transaction = event.data as TransactionEvent;
      setIncrementalRevenue(prev => prev + transaction.amount);
      setIncrementalTransactions(prev => prev + 1);
    });

    return () => {
      unsubscribeStats();
      unsubscribeTransactions();
    };
  }, []);

  const resetIncrementals = useCallback(() => {
    setIncrementalRevenue(0);
    setIncrementalTransactions(0);
  }, []);

  return {
    stats,
    incrementalRevenue,
    incrementalTransactions,
    resetIncrementals
  };
}

/**
 * Hook for real-time alerts
 */
export function useRealtimeAlerts() {
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const unsubscribeNew = realtimeService.subscribe('ALERT_NEW', (event) => {
      const alert = event.data as AlertEvent;
      setAlerts(prev => [alert, ...prev].slice(0, 50)); // Keep last 50 alerts
      setUnreadCount(prev => prev + 1);
    });

    const unsubscribeResolved = realtimeService.subscribe('ALERT_RESOLVED', (event) => {
      const { alertId } = event.data;
      setAlerts(prev => prev.filter(a => a.alertId !== alertId));
    });

    return () => {
      unsubscribeNew();
      unsubscribeResolved();
    };
  }, []);

  const markAsRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
    setUnreadCount(0);
  }, []);

  return {
    alerts,
    unreadCount,
    markAsRead,
    clearAlerts
  };
}

/**
 * Hook for real-time transaction feed
 */
export function useRealtimeTransactions(limit: number = 20) {
  const [transactions, setTransactions] = useState<TransactionEvent[]>([]);

  useEffect(() => {
    const unsubscribe = realtimeService.subscribe('TRANSACTION', (event) => {
      const transaction = event.data as TransactionEvent;
      setTransactions(prev => [transaction, ...prev].slice(0, limit));
    });

    return () => {
      unsubscribe();
    };
  }, [limit]);

  return {
    transactions,
    count: transactions.length
  };
}



