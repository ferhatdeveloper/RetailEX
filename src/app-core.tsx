/**
 * RetailEX ERP — uygulama gövdesi (main.tsx ErpBoot tarafından tek dinamik import).
 */
import { Fragment, useEffect, useLayoutEffect, type ReactNode } from 'react';
import { isCapacitorAndroid } from './utils/capacitorPlatform';
import { AppRouter } from './AppRouter';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import './index.css';
import './styles/dark-mode-global.css';
import './styles/asin-global.css';
import { pwaRefreshConfirmMessage } from './utils/pwaRefreshConfirm';

function BootReady({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const w = window as Window & { removeLoader?: () => void; __retailexAppReady?: boolean };
    w.__retailexAppReady = true;
    document.getElementById('rex-boot-placeholder')?.remove();
    w.removeLoader?.();
  }, []);
  return <div data-rex-app-ready>{children}</div>;
}

function CapacitorAndroidHtmlClass() {
  useLayoutEffect(() => {
    const el = document.documentElement;
    if (isCapacitorAndroid()) {
      el.classList.add('rex-capacitor-android');
    }
    return () => el.classList.remove('rex-capacitor-android');
  }, []);
  return null;
}

function IosPwaHtmlClass() {
  useLayoutEffect(() => {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return;
    const ua = navigator.userAgent || '';
    const isIos =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' &&
        (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1);
    const standaloneNav = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const standaloneCss =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches;
    if (isIos && (standaloneNav || standaloneCss)) {
      document.documentElement.classList.add('rex-ios-pwa');
    }
    return () => document.documentElement.classList.remove('rex-ios-pwa');
  }, []);
  return null;
}

function PwaPullToRefreshReload() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const standaloneNav = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const standaloneCss =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches;
    const urlMarkedPwa =
      typeof window.location !== 'undefined' &&
      new URLSearchParams(window.location.search).get('source') === 'pwa';
    if (!standaloneNav && !standaloneCss && !urlMarkedPwa) return;

    const THRESHOLD_PX = 70;
    let startY = 0;
    let maxDeltaY = 0;
    let tracking = false;
    let pointerTrackingId: number | null = null;

    const getScrollableTop = (target: EventTarget | null): number => {
      if (!(target instanceof HTMLElement)) {
        return document.scrollingElement?.scrollTop ?? window.scrollY ?? 0;
      }
      let node: HTMLElement | null = target;
      while (node && node !== document.body) {
        const style = window.getComputedStyle(node);
        const overflowY = style.overflowY;
        const isScrollable =
          (overflowY === 'auto' || overflowY === 'scroll') &&
          node.scrollHeight > node.clientHeight;
        if (isScrollable) return node.scrollTop;
        node = node.parentElement;
      }
      return document.scrollingElement?.scrollTop ?? window.scrollY ?? 0;
    };

    const beginTracking = (clientY: number, target: EventTarget | null) => {
      startY = clientY;
      maxDeltaY = 0;
      tracking = getScrollableTop(target) <= 2;
    };

    const updateTracking = (clientY: number, preventDefault?: () => void) => {
      if (!tracking) return;
      const deltaY = clientY - startY;
      if (deltaY > 0) {
        maxDeltaY = Math.max(maxDeltaY, deltaY);
        if (maxDeltaY > 12) preventDefault?.();
      }
    };

    const finishTracking = () => {
      if (tracking && maxDeltaY >= THRESHOLD_PX) {
        if (window.confirm(pwaRefreshConfirmMessage())) {
          window.location.reload();
        }
      }
      tracking = false;
      maxDeltaY = 0;
      startY = 0;
      pointerTrackingId = null;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      beginTracking(e.touches[0].clientY, e.target);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!tracking || e.touches.length !== 1) return;
      updateTracking(e.touches[0].clientY, () => e.preventDefault());
    };
    const onTouchEnd = () => finishTracking();
    const onPointerDown = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      pointerTrackingId = e.pointerId;
      beginTracking(e.clientY, e.target);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (pointerTrackingId == null || e.pointerId !== pointerTrackingId) return;
      updateTracking(e.clientY);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pointerTrackingId == null || e.pointerId !== pointerTrackingId) return;
      finishTracking();
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('pointerdown', onPointerDown, { passive: true });
    document.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerup', onPointerUp, { passive: true });
    document.addEventListener('pointercancel', onPointerUp, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  return null;
}

export default function ErpAppInner() {
  return (
    <Fragment>
      <CapacitorAndroidHtmlClass />
      <IosPwaHtmlClass />
      <PwaPullToRefreshReload />
      <ErrorBoundary>
        <BootReady>
          <AppRouter />
        </BootReady>
      </ErrorBoundary>
    </Fragment>
  );
}
