// Notification Hook using Sonner
import { toast } from 'sonner@2.0.3';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

interface NotificationOptions {
  title?: string;
  description?: string;
  duration?: number;
}

export const useNotification = () => {
  const notify = (
    type: NotificationType,
    message: string,
    options?: NotificationOptions
  ) => {
    const config = {
      description: options?.description,
      duration: options?.duration || 3000,
    };

    switch (type) {
      case 'success':
        toast.success(message, config);
        break;
      case 'error':
        toast.error(message, config);
        break;
      case 'warning':
        toast.warning(message, config);
        break;
      case 'info':
        toast.info(message, config);
        break;
    }
  };

  return {
    success: (message: string, options?: NotificationOptions) => 
      notify('success', message, options),
    error: (message: string, options?: NotificationOptions) => 
      notify('error', message, options),
    warning: (message: string, options?: NotificationOptions) => 
      notify('warning', message, options),
    info: (message: string, options?: NotificationOptions) => 
      notify('info', message, options),
  };
};


