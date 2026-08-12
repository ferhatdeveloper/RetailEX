/** Logo Tiger / MSSQL — kurulum sihirbazı sabit bağlantı (Logo ERP adımı). */
export const LOGO_ERP_DEFAULTS = {
  erp_method: 'sql' as const,
  erp_host: '26.154.3.237',
  erp_db: 'LOGO',
  erp_user: 'sa',
  erp_pass: 'r9hWP3oJoC7cTfr',
};

export function mergeLogoErpDefaults<T extends Record<string, unknown>>(config: T): T {
  return {
    ...config,
    ...LOGO_ERP_DEFAULTS,
  };
}
