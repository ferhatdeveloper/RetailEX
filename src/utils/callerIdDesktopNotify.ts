import { IS_TAURI } from './env';

/**
 * Caller ID için masaüstü bildirimi.
 * - Tauri (Windows): yerel toast (@tauri-apps/plugin-notification); WebView2'de Notification API çoğu kurulumda çalışmaz.
 * - Tarayıcı: standart Notification API.
 */
export async function showCallerIdDesktopNotification(options: {
  title: string;
  body: string;
  onClick?: () => void;
}): Promise<'native' | 'web' | 'failed'> {
  if (IS_TAURI) {
    try {
      const { isPermissionGranted, requestPermission, sendNotification } = await import(
        '@tauri-apps/plugin-notification'
      );
      let granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        granted = permission === 'granted';
      }
      if (!granted) return 'failed';
      await sendNotification({ title: options.title, body: options.body });
      return 'native';
    } catch {
      // Aşağıda web veya çağıran toast yedeğine düşülür
    }
  }

  try {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'failed';
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    if (Notification.permission !== 'granted') return 'failed';
    const n = new Notification(options.title, {
      body: options.body,
      tag: 'retailex-caller-id-global',
      renotify: true,
    });
    if (options.onClick) {
      n.onclick = () => {
        options.onClick?.();
      };
    }
    return 'web';
  } catch {
    return 'failed';
  }
}
