/**
 * Restoran mutfak yazıcı profilleri ve kategori rotaları — app_settings (firma bazlı).
 */
import { postgres, ERP_SETTINGS } from './postgres';
import type { PrinterProfile, PrinterRouting } from '../components/restaurant/types';

const KEY_RESTAURANT_PRINTERS = 'restaurant_printer_config';

export type RestaurantPrinterConfig = {
  printerProfiles: PrinterProfile[];
  printerRoutes: PrinterRouting[];
  commonPrinterId?: string;
};

export async function getRestaurantPrinterConfig(firmNr?: string): Promise<RestaurantPrinterConfig> {
  const fn = firmNr || ERP_SETTINGS.firmNr || '001';
  const empty: RestaurantPrinterConfig = { printerProfiles: [], printerRoutes: [] };
  try {
    const { rows } = await postgres.query<{ value: RestaurantPrinterConfig }>(
      `SELECT value FROM app_settings WHERE key = $1 AND firm_nr = $2`,
      [KEY_RESTAURANT_PRINTERS, fn]
    );
    if (rows.length > 0 && rows[0].value) {
      const v = rows[0].value as RestaurantPrinterConfig;
      return {
        printerProfiles: Array.isArray(v.printerProfiles) ? v.printerProfiles : [],
        printerRoutes: Array.isArray(v.printerRoutes) ? v.printerRoutes : [],
        commonPrinterId: v.commonPrinterId,
      };
    }
  } catch (e) {
    console.warn('[restaurantPrinterConfig] get failed', e);
  }
  return empty;
}

export async function saveRestaurantPrinterConfig(data: RestaurantPrinterConfig, firmNr?: string): Promise<void> {
  const fn = firmNr || ERP_SETTINGS.firmNr || '001';
  await postgres.query(
    `INSERT INTO app_settings (key, value, firm_nr)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key, firm_nr) DO UPDATE SET value = $2::jsonb`,
    [KEY_RESTAURANT_PRINTERS, JSON.stringify(data), fn]
  );
}
