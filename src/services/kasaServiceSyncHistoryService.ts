/**
 * Windows servisi — uygulama kapalıyken yapılan kasa inbound sync geçmişi.
 * Kaynak: C:\ProgramData\AsinERP\kasa_service_sync_history.json (Tauri)
 * ve terminal_sync_log (file_type = service_background).
 */

import { IS_TAURI, safeInvoke } from '../utils/env';

export type ServiceSyncHistoryEntry = {
  at: string;
  synced: number;
  failed: number;
  inserted: number;
  updated: number;
  skipped: number;
  source: string;
};

export async function listKasaServiceSyncHistoryFromFile(
  limit = 50,
): Promise<ServiceSyncHistoryEntry[]> {
  if (!IS_TAURI) return [];
  try {
    return (
      (await safeInvoke<ServiceSyncHistoryEntry[]>('list_kasa_service_sync_history', {
        limit,
      })) ?? []
    );
  } catch {
    return [];
  }
}

export function formatServiceSyncDetail(entry: ServiceSyncHistoryEntry): string {
  const parts: string[] = [];
  if (entry.inserted > 0) parts.push(`${entry.inserted} yeni`);
  if (entry.updated > 0) parts.push(`${entry.updated} güncelleme`);
  if (entry.skipped > 0) parts.push(`${entry.skipped} tekrar atlandı`);
  if (parts.length === 0 && entry.synced > 0) parts.push(`${entry.synced} işlendi`);
  return parts.join(' · ');
}
