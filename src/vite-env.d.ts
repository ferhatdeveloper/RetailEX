/// <reference types="vite/client" />

declare module 'qrcode';

interface ImportMetaEnv {
  readonly VITE_REGULATORY_REGION?: string;
  /** Varsayılan true: GİB’e gerçek istek yok; false iken iskelet mod (henüz üretim yok) */
  readonly VITE_GIB_MOCK_TRANSPORT?: string;
  /** Boş = aynı origin /__grafana; ayrı Grafana alanı için tam URL */
  readonly VITE_GRAFANA_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
