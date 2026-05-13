import { Fragment, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { AppRouter } from "./AppRouter";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import "./index.css";

/** Capacitor Android WebView’da safe-area-inset-top çoğu zaman 0; CSS ile üst boşluk tetiklenir */
function CapacitorAndroidHtmlClass() {
  useLayoutEffect(() => {
    const el = document.documentElement;
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      el.classList.add("rex-capacitor-android");
    }
    return () => el.classList.remove("rex-capacitor-android");
  }, []);
  return null;
}

/**
 * iOS Safari PWA: Home Screen üzerinden açıldığında (standalone modu) CSS sınıfı
 * eklenir — notch/Home Indicator güvenli alanları, splash arka plan vb. CSS bunu kullanır.
 */
function IosPwaHtmlClass() {
  useLayoutEffect(() => {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return;
    const ua = navigator.userAgent || '';
    const isIos = /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1);
    const standaloneNav = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const standaloneCss = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
    if (isIos && (standaloneNav || standaloneCss)) {
      document.documentElement.classList.add('rex-ios-pwa');
    }
    return () => document.documentElement.classList.remove('rex-ios-pwa');
  }, []);
  return null;
}

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <Fragment>
      <CapacitorAndroidHtmlClass />
      <IosPwaHtmlClass />
      <ErrorBoundary>
        <AppRouter />
      </ErrorBoundary>
    </Fragment>
  );
}


