import { useState, useEffect } from 'react';

interface DatabaseStatus {
  status: 'connected' | 'disconnected' | 'error' | 'checking';
  message: string;
  host: string;
  database: string;
}

export function useDatabaseStatus(checkInterval: number = 30000) {
  const [dbStatus, setDbStatus] = useState<DatabaseStatus>({
    status: 'checking',
    message: 'Bağlantı kontrol ediliyor...',
    host: '127.0.0.1:5432',
    database: 'retailex_local'
  });

  const [backendUnavailable, setBackendUnavailable] = useState(false);

  const checkDatabase = async () => {
    if (backendUnavailable && Math.random() > 0.1) return; // Only check 10% of the time if it failed once

    try {
      // Backend API üzerinden GERÇEK PostgreSQL kontrolü
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // Shorter timeout

      const response = await fetch('http://localhost:8000/health', {
        method: 'GET',
        signal: controller.signal,
      }).catch(() => {
        setBackendUnavailable(true);
        return null;
      });

      clearTimeout(timeoutId);

      if (!response || !response.ok) {
        setBackendUnavailable(true);
        setDbStatus({
          status: 'disconnected',
          message: 'Backend servisi çalışmıyor',
          host: '91.205.41.130:5432',
          database: 'retailos_db'
        });
        return;
      }

      setBackendUnavailable(false);
      const data = await response.json();

      if (data.database && data.database.status === 'connected') {
        setDbStatus({
          status: 'connected',
          message: 'PostgreSQL bağlantısı başarılı',
          host: data.database.host || '91.205.41.130:5432',
          database: data.database.database || 'retailos_db'
        });
      } else {
        setDbStatus({
          status: 'error',
          message: data.database?.message || 'Database bağlantı hatası',
          host: '91.205.41.130:5432',
          database: 'retailos_db'
        });
      }
    } catch (error) {
      setBackendUnavailable(true);
      setDbStatus({
        status: 'disconnected',
        message: 'Backend servisi çalışmıyor',
        host: '91.205.41.130:5432',
        database: 'retailos_db'
      });
    }
  };

  useEffect(() => {
    checkDatabase();
    const interval = setInterval(checkDatabase, checkInterval);
    return () => clearInterval(interval);
  }, [checkInterval]);

  return { dbStatus, refreshStatus: checkDatabase };
}

