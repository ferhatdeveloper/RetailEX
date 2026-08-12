/**
 * Node / pg_bridge tarafında Logo senkronu için yapılandırma enjeksiyonu.
 * Tarayıcı kapalıyken bridge cron bu bağlamı doldurur.
 */

import { setLogoRestConfigOverride, type LogoRestConfig } from './logoRestApi';
import type { LogoRestSyncModules } from './logoRestSync';
import type { LogoPullWatermarks } from './logoRestIncremental';

export type LogoServerSyncJob = {
  enabled: boolean;
  intervalMinutes: number;
  pullMode: 'incremental' | 'full';
  modules: LogoRestSyncModules;
  logoConfig: LogoRestConfig;
  /** RetailEX firma / dönem (rex_XXX_YY_*) */
  firmNr: string;
  periodNr: string;
  /** PostgREST taban URL (örn. https://api…/rest/v1) — yazım için */
  postgrestUrl?: string;
  postgrestJwt?: string;
  documentTransferDays?: number;
  lastSyncByModule?: LogoPullWatermarks;
  updatedAt: string;
};

let serverJob: LogoServerSyncJob | null = null;

export function setLogoServerSyncJob(job: LogoServerSyncJob | null): void {
  serverJob = job;
  setLogoRestConfigOverride(job?.logoConfig ?? null);
}

export function getLogoServerSyncJob(): LogoServerSyncJob | null {
  return serverJob;
}

export function isLogoServerSyncContext(): boolean {
  return serverJob != null;
}
