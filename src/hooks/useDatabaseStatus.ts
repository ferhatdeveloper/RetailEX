import { useState, useEffect } from 'react';
import { REMOTE_PG_DEFAULTS, formatRemotePgHostPort } from '../core/remotePgDefaults';

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
      // Üretim web (retailex.app vb.): localhost:8000 yok; gereksiz hata ve konsol gürültüsünü kes.
      if (typeof window !== 'undefined') {
        const h = window.location.hostname;
        if (h !== 'localhost' && h !== '127.0.0.1') {
          setBackendUnavailable(false);
          setDbStatus({
            status: 'connected',
            message: 'Web — veritabanı tenant / köprü yapılandırması ile',
            host: h,
            database: '',
          });
          return;
        }
      }

      // Yerel geliştirme: Backend API üzerinden PostgreSQL kontrolü
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
          host: formatRemotePgHostPort(),
          database: REMOTE_PG_DEFAULTS.database
        });
        return;
      }

      setBackendUnavailable(false);
      const data = await response.json();

      if (data.database && data.database.status === 'connected') {
        setDbStatus({
          status: 'connected',
          message: 'PostgreSQL bağlantısı başarılı',
          host: data.database.host || formatRemotePgHostPort(),
          database: data.database.database || REMOTE_PG_DEFAULTS.database
        });
      } else {
        setDbStatus({
          status: 'error',
          message: data.database?.message || 'Database bağlantı hatası',
          host: formatRemotePgHostPort(),
          database: REMOTE_PG_DEFAULTS.database
        });
      }
    } catch (error) {
      setBackendUnavailable(true);
      setDbStatus({
        status: 'disconnected',
        message: 'Backend servisi çalışmıyor',
        host: formatRemotePgHostPort(),
        database: REMOTE_PG_DEFAULTS.database
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

