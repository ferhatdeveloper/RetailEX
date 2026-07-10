/**
 * Giriş noktası — online mağaza ve /mgz admin ERP'den izole bootstrap kullanır.
 * ERP: anında createRoot + görünür yükleme; tek dinamik import (app-core).
 */
import { createRoot } from 'react-dom/client';
import { useEffect, useState, type ComponentType } from 'react';
import {
  installChunkLoadGlobalRecovery,
  resolveLazyModuleDefault,
} from './utils/chunkLoadRecovery';
import { isEticaretAdminPath } from '../eticaret/admin/isAdminPath';
import { isEticaretStorefrontPath } from '../eticaret/storefront/isStorefrontPath';

installChunkLoadGlobalRecovery();

function showBootstrapFailure(err: unknown) {
  console.error('[main] bootstrap failed:', err);
  const root = document.getElementById('root');
  const w = window as Window & { removeLoader?: () => void };
  w.removeLoader?.();
  if (root) {
    const msg = err instanceof Error ? err.message : String(err);
    root.innerHTML =
      '<div style="box-sizing:border-box;max-width:560px;margin:10vh auto;padding:28px 24px;font-family:system-ui,sans-serif;color:#e2e8f0;text-align:center;line-height:1.65;background:rgba(15,23,42,0.9);border-radius:12px;border:1px solid rgba(148,163,184,0.25)"><strong style="display:block;margin-bottom:12px">Modül yüklenemedi</strong><p style="font-size:13px;margin:0 0 16px">' +
      msg.replace(/</g, '&lt;') +
      '</p><button type="button" onclick="location.reload()" style="margin-top:8px;padding:10px 18px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-weight:700">Yeniden dene</button></div>';
  }
}

/** Vite/Rollup production: bazen `mod.default.default` (çift sarmalama). */
function resolveAppCoreExport(mod: unknown): ComponentType {
  try {
    return resolveLazyModuleDefault(
      mod as Record<string, unknown>,
      'ErpAppInner',
    ).default;
  } catch {
    throw new Error('Uygulama kök bileşeni bulunamadı');
  }
}

/** Görünür yükleme — boş div yok; splash zaman aşımı tetiklenmez. */
function BootLoading({ label }: { label: string }) {
  return (
    <div
      id="rex-boot-shell"
      data-rex-boot-shell
      aria-busy="true"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        background: 'linear-gradient(145deg,#0f172a 0%,#1e293b 50%,#0f172a 100%)',
        color: '#e2e8f0',
        fontFamily: 'system-ui,sans-serif',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.04em' }}>
        Retail<span style={{ color: '#3b82f6', fontStyle: 'italic' }}>Ex</span>
      </div>
      <div
        style={{
          width: 36,
          height: 36,
          border: '3px solid rgba(59,130,246,0.25)',
          borderTopColor: '#3b82f6',
          borderRadius: '50%',
          animation: 'rex-spin 0.8s linear infinite',
        }}
      />
      <p style={{ margin: 0, fontSize: 14, opacity: 0.85 }}>{label}</p>
      <style>{`@keyframes rex-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function ErpBoot() {
  const [AppCore, setAppCore] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('Uygulama yükleniyor…');

  useEffect(() => {
    document.getElementById('rex-boot-placeholder')?.remove();
    const t1 = window.setTimeout(() => setLabel('Modüller hazırlanıyor…'), 4000);
    const t2 = window.setTimeout(() => setLabel('İlk açılış biraz sürebilir, lütfen bekleyin…'), 15000);

    let cancelled = false;
    (async () => {
      try {
        // Tek dinamik sınır — boot-shell/erp-entry yok (Vite d0 + döngüsel chunk hatası önlenir)
        const mod = await import('./app-core');
        if (cancelled) return;
        // Resolve try/catch içinde; setState updater'ında throw edilmesin
        const Comp = resolveAppCoreExport(mod);
        setAppCore(() => Comp);
      } catch (err: unknown) {
        if (cancelled) return;
        console.error('[ErpBoot] app-core yüklenemedi:', err);
        setError(err instanceof Error ? err.message : String(err));
        const w = window as Window & { removeLoader?: () => void };
        w.removeLoader?.();
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  if (error) {
    return (
      <div
        style={{
          boxSizing: 'border-box',
          maxWidth: 560,
          margin: '10vh auto',
          padding: '28px 24px',
          fontFamily: 'system-ui,sans-serif',
          color: '#e2e8f0',
          textAlign: 'center',
          lineHeight: 1.65,
          background: 'rgba(15,23,42,0.9)',
          borderRadius: 12,
          border: '1px solid rgba(148,163,184,0.25)',
        }}
      >
        <strong style={{ display: 'block', marginBottom: 12 }}>Modül yüklenemedi</strong>
        <p style={{ fontSize: 13, margin: '0 0 16px' }}>{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 18px',
            border: 0,
            borderRadius: 8,
            background: '#2563eb',
            color: '#fff',
            fontWeight: 700,
          }}
        >
          Yeniden dene
        </button>
      </div>
    );
  }

  if (!AppCore) return <BootLoading label={label} />;
  return <AppCore />;
}

function mountErp() {
  const rootEl = document.getElementById('root');
  if (!rootEl) {
    showBootstrapFailure(new Error('#root bulunamadı'));
    return;
  }
  try {
    createRoot(rootEl).render(<ErpBoot />);
  } catch (err) {
    showBootstrapFailure(err);
  }
}

if (isEticaretStorefrontPath()) {
  void import('../eticaret/storefront/bootstrap').catch(showBootstrapFailure);
} else if (isEticaretAdminPath()) {
  void import('../eticaret/admin/bootstrap').catch(showBootstrapFailure);
} else {
  mountErp();
}
