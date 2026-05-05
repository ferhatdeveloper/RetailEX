import { createRoot } from "react-dom/client";
import { AppRouter } from "./AppRouter";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import "./index.css";

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <ErrorBoundary>
      <AppRouter />
    </ErrorBoundary>
  );
}


