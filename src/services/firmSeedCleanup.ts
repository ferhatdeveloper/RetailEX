import type { PostgresConnection } from './postgres';

/**
 * Master şema ile gelen şablon firmaları kaldırır (kullanıcının oluşturmadığı kayıtlar).
 * - 001 "RetailEx OS" — kullanıcı firması 001 değilse
 * - 002 "Firma 002" — kullanıcı firması 002 değilse
 */
export async function cleanupMasterSeedFirms(
  postgres: PostgresConnection,
  activeFirmNrs: string[],
): Promise<string[]> {
  const messages: string[] = [];
  const normalized = new Set(
    activeFirmNrs.map((n) => String(n || '').padStart(3, '0')).filter(Boolean),
  );

  const seeds: { firmNr: string; name: string; storeCode?: string }[] = [
    { firmNr: '001', name: 'RetailEx OS' },
    { firmNr: '002', name: 'Firma 002', storeCode: 'BAGHDAD' },
  ];

  for (const seed of seeds) {
    if (normalized.has(seed.firmNr)) continue;

    try {
      await postgres.query(
        `DELETE FROM periods WHERE firm_id IN (SELECT id FROM firms WHERE firm_nr = $1 AND name = $2)`,
        [seed.firmNr, seed.name],
      );
      if (seed.storeCode) {
        await postgres.query(`DELETE FROM stores WHERE firm_nr = $1 AND code = $2`, [
          seed.firmNr,
          seed.storeCode,
        ]);
      } else {
        await postgres.query(`DELETE FROM stores WHERE firm_nr = $1`, [seed.firmNr]);
      }
      const del = await postgres.query<{ id: string }>(
        `DELETE FROM firms WHERE firm_nr = $1 AND name = $2 RETURNING id`,
        [seed.firmNr, seed.name],
      );
      if ((del.rowCount ?? 0) > 0) {
        messages.push(`Şablon firma ${seed.firmNr} (${seed.name}) kaldırıldı.`);
      }
    } catch (e) {
      console.warn('[firmSeedCleanup]', seed.firmNr, e);
    }
  }

  if (messages.length > 0) {
    try {
      const primary = [...normalized][0];
      if (primary) {
        await postgres.query(`UPDATE firms SET "default" = false`);
        await postgres.query(`UPDATE firms SET "default" = true WHERE firm_nr = $1`, [primary]);
      }
    } catch (e) {
      console.warn('[firmSeedCleanup] default flag', e);
    }
  }

  return messages;
}
