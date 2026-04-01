/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REGULATORY_REGION?: string;
  /** Varsayılan true: GİB’e gerçek istek yok; false iken iskelet mod (henüz üretim yok) */
  readonly VITE_GIB_MOCK_TRANSPORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
