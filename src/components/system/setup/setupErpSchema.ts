import { postgres } from '../../../services/postgres';
import { safeInvoke } from '../../../utils/env';
import {
  resolveFirmSchemaTargets,
  resolvePrimaryMigrationTarget,
} from './setupDbTargets';
import type { SetupAppConfig, SetupDbTarget } from './setupTypes';

export async function initErpFirmSchemas(
  config: SetupAppConfig,
  firmNr: string,
  options?: { primaryTarget?: SetupDbTarget },
): Promise<void> {
  const primary = options?.primaryTarget ?? resolvePrimaryMigrationTarget(config.db_mode as any);
  const targets = resolveFirmSchemaTargets(config, primary);

  for (const schemaTarget of targets) {
    await safeInvoke('init_firm_schema', {
      config,
      firmNr,
      target: schemaTarget,
    });
  }
}

export async function initErpPeriodSchema(
  config: SetupAppConfig,
  firmNr: string,
  periodNr: string,
  options?: { targets?: SetupDbTarget[] },
): Promise<void> {
  const primary = resolvePrimaryMigrationTarget(config.db_mode as any);
  const targets = options?.targets ?? resolveFirmSchemaTargets(config, primary);

  for (const schemaTarget of targets) {
    await safeInvoke('init_period_schema', {
      config,
      firmNr,
      periodNr,
      target: schemaTarget,
    });
  }
}

export async function initOptionalModuleSchemas(
  config: SetupAppConfig,
  firmNr: string,
  periodNr: string,
): Promise<void> {
  if (config.system_type === 'restaurant') {
    await postgres.query('SELECT INIT_RESTAURANT_FIRM_TABLES($1::varchar)', [firmNr]);
    await postgres.query('SELECT INIT_RESTAURANT_PERIOD_TABLES($1::varchar, $2::varchar)', [
      firmNr,
      periodNr,
    ]);
  }

  await postgres.query('SELECT INIT_BEAUTY_FIRM_TABLES($1::varchar)', [firmNr]);
  await postgres.query('SELECT INIT_BEAUTY_PERIOD_TABLES($1::varchar, $2::varchar)', [
    firmNr,
    periodNr,
  ]);
}
