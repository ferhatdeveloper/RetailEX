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

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <Fragment>
      <CapacitorAndroidHtmlClass />
      <ErrorBoundary>
        <AppRouter />
      </ErrorBoundary>
    </Fragment>
  );
}


