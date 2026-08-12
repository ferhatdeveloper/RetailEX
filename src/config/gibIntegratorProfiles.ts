/**
 * Firma kartı `firms.gib_*` — Nilvera (REST + Bearer) ve QNB eSolutions (SOAP / web servis) semantiği.
 * Veritabanı kolonları ortak; entegratöre göre alan anlamı değişir.
 */

/** `firms.gib_integration_mode` — VARCHAR(20) üst sınırına uygun değerler */
export const GIB_INTEGRATION_MODES = [
  'mock',
  'nilvera',
  'qnb_esolutions',
  'integrator',
  'direct_unconfigured',
] as const;

export type GibIntegrationMode = (typeof GIB_INTEGRATION_MODES)[number];

export const NILVERA_API_TEST_BASE = 'https://apitest.nilvera.com';
export const NILVERA_API_LIVE_BASE = 'https://api.nilvera.com';

export function nilveraDefaultBaseUrl(useTestEnvironment: boolean): string {
  return useTestEnvironment ? NILVERA_API_TEST_BASE : NILVERA_API_LIVE_BASE;
}

