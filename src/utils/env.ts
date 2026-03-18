/**
 * Environment Detection Utility
 */

export const IS_TAURI = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
export const IS_BROWSER = !IS_TAURI;

/**
 * Safely invoke a Tauri command. 
 * If running in a browser, returns a fallback value or throws a descriptive error.
 */
export async function safeInvoke<T>(command: string, args?: any, fallback?: T): Promise<T> {
  if (IS_TAURI) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke(command, args) as T;
    } catch (error) {
      const msg = String(error ?? '');
      const isCommandNotFound = msg.includes('not found') || msg.includes('Command');
      if (!isCommandNotFound) console.error(`[Tauri Invoke Error] ${command}:`, error);
      if (fallback !== undefined) return fallback;
      throw error;
    }
  }

  console.warn(`[Browser Mode] Skipping Tauri command: ${command}`);
  if (fallback !== undefined) return fallback;
  
  // Natural fallback logic for common commands
  if (command === 'get_app_config') return { is_configured: false } as any;
  if (command === 'get_app_version') return '0.1.56-web' as any;
  if (command === 'check_pg16') return true as any; // Pretend PG exists for bridge
  
  throw new Error(`Tauri command "${command}" is not available in browser mode.`);
}

/**
 * Get the appropriate API/Bridge URL based on environment
 */
export const getBridgeUrl = () => {
  if (typeof window === 'undefined') return 'http://localhost:3001';
  
  const isProduction = window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1');
  return isProduction ? 'https://api.retailex.app' : 'http://localhost:3001';
};
