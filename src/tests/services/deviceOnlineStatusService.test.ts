import { describe, it, expect } from 'vitest';
import {
  resolveDeviceOnlineStatus,
  WS_PRESENCE_STALE_MS,
  FALLBACK_ONLINE_MS,
  isValidStoreUuid,
} from '../../services/deviceOnlineStatusService';

describe('deviceOnlineStatusService', () => {
  const now = Date.now();

  it('resolveDeviceOnlineStatus prefers fresh WS presence', () => {
    const r = resolveDeviceOnlineStatus({
      now,
      wsPresence: {
        deviceId: 'd1',
        storeId: 's1',
        deviceName: 'Kasa',
        status: 'online',
        lastSeen: new Date(now - 60_000).toISOString(),
        appVersion: '0.1.183',
      },
      fallbackLastSeenMs: now - FALLBACK_ONLINE_MS - 1000,
    });
    expect(r.source).toBe('websocket');
    expect(r.state).toBe('online');
    expect(r.label).toBe('Canlı (WS)');
  });

  it('resolveDeviceOnlineStatus falls back when WS stale', () => {
    const r = resolveDeviceOnlineStatus({
      now,
      wsPresence: {
        deviceId: 'd1',
        storeId: 's1',
        deviceName: 'Kasa',
        status: 'online',
        lastSeen: new Date(now - WS_PRESENCE_STALE_MS * 4).toISOString(),
        appVersion: null,
      },
      fallbackLastSeenMs: now - 3600_000,
    });
    expect(r.source).toBe('fallback');
    expect(r.state).toBe('online');
    expect(r.label).toBe('Yedek (24s)');
  });

  it('resolveDeviceOnlineStatus offline when no signals', () => {
    const r = resolveDeviceOnlineStatus({ now, wsPresence: null, fallbackLastSeenMs: null });
    expect(r.state).toBe('offline');
    expect(r.source).toBe('none');
  });

  it('isValidStoreUuid validates UUID', () => {
    expect(isValidStoreUuid('00000000-0000-4000-8000-000000000001')).toBe(true);
    expect(isValidStoreUuid('default_store')).toBe(false);
  });
});
