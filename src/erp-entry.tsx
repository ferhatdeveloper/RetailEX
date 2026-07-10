/**
 * Küçük ERP giriş kabuğu — boot-shell bunu yükler (~KB).
 * Ağır modül erp-app-inner içinde lazy açılır.
 * Not: @vite-ignore kullanma — production chunk hash kırılır.
 */
import { Suspense } from 'react';
import { lazyWithChunkRecovery } from './utils/chunkLoadRecovery';

const ErpAppInner = lazyWithChunkRecovery(() => import('./erp-app-inner'));

export default function ErpEntry() {
  return (
    <Suspense
      fallback={
        <div
          id="rex-erp-inner-loading"
          data-rex-boot-shell
          aria-busy="true"
          className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-900 text-slate-300"
        >
          <div
            className="w-9 h-9 rounded-full border-2 border-blue-500/30 border-t-blue-400 animate-spin"
            aria-hidden
          />
          <p className="text-sm">Uygulama hazırlanıyor…</p>
        </div>
      }
    >
      <ErpAppInner />
    </Suspense>
  );
}
