/**
 * PostgreSQL sunucusunda var olabilir ancak RetailEX ERP migration / kiracı migrate
 * zincirine DAHIL EDILMEYEN veritabanları.
 *
 * Shell: berqenas-cloud-dbs.inc.sh ile senkron tutun.
 */

export const NON_RETAILEX_DATABASES = Object.freeze([
  'ilsasupport',   // ayrı destek / ILSA ürünü
  'pagetin_kurye', // kurye uygulaması (RetailEX ERP değil)
  'siti_pdks',     // bağımsız PDKS kiracısı — RetailEX şema/migration zinciri yok
  'aram',          // PDKS/İK şeması (employees/attendance) — RetailEX ERP değil
  'naw',           // PDKS/İK şeması (employees/attendance) — RetailEX ERP değil
]);

const NON_RETAILEX_SET = new Set(NON_RETAILEX_DATABASES);

export function isNonRetailExDatabase(dbName) {
  return NON_RETAILEX_SET.has(String(dbName || '').trim());
}

export function filterRetailExDatabases(dbNames) {
  return dbNames.filter((name) => !isNonRetailExDatabase(name));
}

export function nonRetailExSkipReason(dbName) {
  if (!isNonRetailExDatabase(dbName)) return null;
  return 'RetailEX kiracı veritabanı değil (hariç liste)';
}
