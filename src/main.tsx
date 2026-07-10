/**
 * Giriş noktası — online mağaza ve /mgz admin ERP'den izole bootstrap kullanır.
 */
import { importWithChunkRetry, installChunkLoadGlobalRecovery } from './utils/chunkLoadRecovery';
import { isEticaretAdminPath } from '../eticaret/admin/isAdminPath';
import { isEticaretStorefrontPath } from '../eticaret/storefront/isStorefrontPath';

installChunkLoadGlobalRecovery();

function showBootstrapFailure(err: unknown) {
  console.error('[main] bootstrap failed:', err);
  const root = document.getElementById('root');
  const w = window as Window & { removeLoader?: () => void; __retailexBootStarted?: boolean };
  w.__retailexBootStarted = true;
  w.removeLoader?.();
  const onlyPlaceholder = root?.querySelector('#rex-boot-placeholder') && root.childElementCount === 1;
  if (root && (root.childElementCount === 0 || onlyPlaceholder)) {
    root.innerHTML =
      '<div data-rex-boot-error style="box-sizing:border-box;max-width:560px;margin:10vh auto;padding:28px 24px;font-family:system-ui,sans-serif;color:#e2e8f0;text-align:center;line-height:1.65;background:rgba(15,23,42,0.9);border-radius:12px;border:1px solid rgba(148,163,184,0.25)"><strong style="display:block;margin-bottom:12px">Modül yüklenemedi</strong>İnternet veya depolama alanını kontrol edin; uygulamayı tamamen kapatıp yeniden açın.<br><br><button type="button" onclick="location.reload()" style="margin-top:8px;padding:10px 18px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-weight:700">Yeniden dene</button></div>';
  }
}

if (isEticaretStorefrontPath()) {
  void importWithChunkRetry(() => import('../eticaret/storefront/bootstrap')).catch(showBootstrapFailure);
} else if (isEticaretAdminPath()) {
  void importWithChunkRetry(() => import('../eticaret/admin/bootstrap')).catch(showBootstrapFailure);
} else {
  const w = window as Window & { __retailexBootStarted?: boolean };
  w.__retailexBootStarted = true;
  void importWithChunkRetry(() => import('./boot-shell')).catch(showBootstrapFailure);
}
