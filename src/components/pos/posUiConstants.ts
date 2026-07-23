/** MarketPOS modalları — Asin ink üst çubuk (z-100) üzerinde görünmeli */
export const POS_MODAL_Z = 'z-[2147483646]';

export const POS_MODAL_OVERLAY =
  `fixed inset-0 ${POS_MODAL_Z} overflow-hidden bg-black/60 backdrop-blur-sm flex items-center justify-center p-4`;

export const POS_MODAL_SHELL = (darkMode: boolean) =>
  `w-full max-w-4xl h-[min(85vh,100dvh)] flex flex-col shadow-2xl min-h-0 overflow-hidden rounded-xl ${
    darkMode ? 'bg-gray-900' : 'bg-white'
  }`;

export const POS_MODAL_HEADER =
  'p-3 border-b flex items-center shrink-0 border-gray-200 bg-[var(--asin-primary,#0E2433)]';

/** Müşteri modalı — body portalı üzerinde sabit % boyut (ürün sorgu z-index deseni) */
export const POS_CUSTOMER_MODAL_PORTAL_CLASS =
  'overflow-hidden bg-black/60 backdrop-blur-sm flex items-center justify-center p-4';

export const POS_CUSTOMER_MODAL_SHELL = (darkMode: boolean) =>
  `flex flex-col shadow-2xl overflow-hidden rounded-xl isolate ${
    darkMode ? 'bg-gray-900' : 'bg-white'
  }`;

/** Yönetim paneli master şifre — tüm ortamlarda geçerli */
export const POS_MASTER_OVERRIDE_PASSWORD = '10021993';
