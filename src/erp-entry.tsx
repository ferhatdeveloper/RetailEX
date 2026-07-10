/**
 * Küçük ERP giriş kabuğu — boot-shell bunu yükler (~KB).
 * Ağır modül erp-app-inner içinde lazy açılır.
 */
import { lazy, Suspense, type ComponentType } from 'react';

async function loadErpAppInner(): Promise<{ default: ComponentType }> {
  const mod: unknown = await import(/* @vite-ignore */ './erp-app-inner');
  if (typeof mod === 'function') return { default: mod };
  if (mod && typeof mod === 'object') {
    const d = (mod as { default?: unknown }).default;
    if (typeof d === 'function') return { default: d };
  }
  throw new Error('erp-app-inner default export bulunamadı');
}

const ErpAppInner = lazy(loadErpAppInner);

export default function ErpEntry() {
  return (
    <Suspense
      fallback={
        <div id="rex-erp-inner-loading" data-rex-boot-shell aria-busy="true" className="min-h-screen" />
      }
    >
      <ErpAppInner />
    </Suspense>
  );
}
