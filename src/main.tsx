/**
 * Giriş noktası — online mağaza ve /mgz admin ERP'den izole bootstrap kullanır.
 * ERP: app-core sync import (production dinamik Module namespace / f.W interop hatasını önler).
 */
import { createRoot } from 'react-dom/client';
import { useLayoutEffect } from 'react';
import { installChunkLoadGlobalRecovery } from './utils/chunkLoadRecovery';
import { isEticaretAdminPath } from '../eticaret/admin/isAdminPath';
import { isEticaretStorefrontPath } from '../eticaret/storefront/isStorefrontPath';
import AppCore from './app-core';

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

/** Sync AppCore — runtime resolve / "kök bileşeni bulunamadı" yolu yok. */
function ErpRoot() {
  useLayoutEffect(() => {
    document.getElementById('rex-boot-placeholder')?.remove();
  }, []);
  return <AppCore />;
}

function mountErp() {
  const rootEl = document.getElementById('root');
  if (!rootEl) {
    showBootstrapFailure(new Error('#root bulunamadı'));
    return;
  }
  try {
    createRoot(rootEl).render(<ErpRoot />);
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
