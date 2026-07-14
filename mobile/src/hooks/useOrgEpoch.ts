import { useOrgSessionStore } from '../store/orgSessionStore';

/** Firma/dönem/mağaza invalidate sayacı — load bağımlılıklarına ekleyin */
export function useOrgEpoch(): number {
  return useOrgSessionStore((s) => s.epoch);
}
