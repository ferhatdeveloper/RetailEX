/** MarketPOS modalları — mavi üst çubuk (z-100) üzerinde görünmeli */
export const POS_MODAL_Z = 'z-[2147483646]';

export const POS_MODAL_OVERLAY =
  `fixed inset-0 ${POS_MODAL_Z} overflow-y-auto overflow-x-hidden bg-black/60 backdrop-blur-sm flex items-center justify-center p-4`;

export const POS_MODAL_SHELL = (darkMode: boolean) =>
  `w-full max-w-4xl max-h-[min(90vh,100dvh)] flex flex-col shadow-2xl min-h-0 overflow-hidden ${
    darkMode ? 'bg-gray-900' : 'bg-white'
  }`;

export const POS_MODAL_HEADER =
  'p-3 border-b flex items-center shrink-0 border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700';

/** Yönetim paneli master şifre — tüm ortamlarda geçerli */
export const POS_MASTER_OVERRIDE_PASSWORD = '10021993';
