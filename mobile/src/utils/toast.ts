import Toast from 'react-native-toast-message';

export type ToastKind = 'success' | 'error' | 'info' | 'warn';

const KIND_TO_TYPE: Record<ToastKind, 'success' | 'error' | 'info'> = {
  success: 'success',
  error: 'error',
  info: 'info',
  warn: 'info',
};

export interface ShowToastOptions {
  title?: string;
  message: string;
  kind?: ToastKind;
  duration?: number;
}

export function showToast(opts: ShowToastOptions | string): void {
  const o: ShowToastOptions =
    typeof opts === 'string' ? { message: opts } : opts;
  const kind = o.kind ?? 'info';
  Toast.show({
    type: KIND_TO_TYPE[kind],
    text1: o.title,
    text2: o.message,
    visibilityTime: o.duration ?? 2800,
    autoHide: true,
    topOffset: 56,
  });
}

export const toast = {
  success: (message: string, title?: string) =>
    showToast({ kind: 'success', message, title }),
  error: (message: string, title?: string) =>
    showToast({ kind: 'error', message, title }),
  info: (message: string, title?: string) =>
    showToast({ kind: 'info', message, title }),
  warn: (message: string, title?: string) =>
    showToast({ kind: 'warn', message, title }),
};

export default toast;
