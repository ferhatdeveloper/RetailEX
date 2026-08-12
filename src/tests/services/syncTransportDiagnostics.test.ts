import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../services/postgres', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/postgres')>();
  return {
    ...actual,
    DB_SETTINGS: {
      activeMode: 'hybrid',
      remoteRestUrl: 'https://api.retailex.app',
      merkezTenantCode: 'lovan',
      centralWsUrl: '',
      centralApiUrl: '',
      hybridSyncTransport: 'both',
    },
  };
});

import {
  auditSyncTransportConfig,
  formatSyncTransportLabel,
  syncTransportNeedsPolling,
  syncTransportNeedsWebSocket,
} from '../../services/syncTransportDiagnostics';
import { normalizeHybridSyncTransport } from '../../services/postgres';

describe('syncTransportDiagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizeHybridSyncTransport aliases', () => {
    expect(normalizeHybridSyncTransport('ws')).toBe('websocket');
    expect(normalizeHybridSyncTransport('interval')).toBe('polling');
    expect(normalizeHybridSyncTransport('both')).toBe('both');
  });

  it('formatSyncTransportLabel', () => {
    expect(formatSyncTransportLabel('polling')).toBe('Periyodik');
    expect(formatSyncTransportLabel('websocket')).toBe('WebSocket');
    expect(formatSyncTransportLabel('both')).toBe('WS + Periyodik');
  });

  it('transport needs flags', () => {
    expect(syncTransportNeedsWebSocket('both')).toBe(true);
    expect(syncTransportNeedsWebSocket('polling')).toBe(false);
    expect(syncTransportNeedsPolling('websocket')).toBe(false);
    expect(syncTransportNeedsPolling('both')).toBe(true);
  });

  it('audit flags bare api.retailex.app without slug in stored url', () => {
    const audit = auditSyncTransportConfig();
    expect(audit.hybridMode).toBe(true);
    const codes = audit.issues.map((i) => i.code);
    expect(codes).toContain('REST_URL_NO_TENANT');
  });
});
