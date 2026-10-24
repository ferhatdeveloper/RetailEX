/**
 * Kasa satırındaki ekleyen kişi.
 * Satış fişi ile aynı kaynak: önce yazılı ad (`cashier`), yoksa kimlik.
 * Kimlik ad listesinde çözülür. Alan yoksa ad ve kimlik boş kalır.
 * Tutar, açıklama ve cari unvanı buraya alınmaz.
 */
import {
  currentLoginCashierName,
  currentLoginUserId,
  isCashMovementLabel,
  isPlaceholderCashierName,
  sanitizeStoredCashierName,
} from './loginCashierName';

/** Satıştaki `cashier` ile aynı sırada ad kolonları. */
export const CASH_LINE_ACTOR_NAME_COLUMNS = [
  'cashier',
  'olusturan',
  'kaydeden',
  'username',
  'user_name',
  'kullanici_adi',
  'kullanici',
  'created_by_name',
] as const;

/** Satıştaki `created_by_user_id` ile aynı sırada kimlik kolonları. */
export const CASH_LINE_ACTOR_ID_COLUMNS = [
  'created_by_user_id',
  'user_id',
  'created_by',
  'olusturan_id',
  'kaydeden_id',
] as const;

export const CASH_LINE_ACTOR_COLUMNS = [
  ...CASH_LINE_ACTOR_NAME_COLUMNS,
  ...CASH_LINE_ACTOR_ID_COLUMNS,
] as const;

export type CashLineActorField = (typeof CASH_LINE_ACTOR_COLUMNS)[number];

export type CashLineActor = {
  /** Ad listesinde çözülecek kimlik. Kullanıcı adı buraya yazılmaz. */
  id: string;
  /** Kayıtta yazılı ad. Yoksa boş. */
  name: string;
  /** Adın geldiği kolon. Yoksa boş. */
  nameColumn: string;
  /** Kimliğin geldiği kolon. Yoksa boş. */
  idColumn: string;
  /** Bu satırda boş olan kullanıcı kolonları. */
  emptyColumns: string[];
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** `user-admin` gibi kimlik jetonu. `Ayşe` ve `admin` kullanıcı adıdır. */
function isOpaqueIdentity(value: string): boolean {
  if (isUuid(value)) return true;
  if (/\s/.test(value)) return false;
  if (value.length >= 32) return true;
  if (/^\d+$/.test(value)) return true;
  return /[-_]/.test(value) && value.length >= 6;
}

export function copyCashLineActorFields(
  row: object | null | undefined,
): Partial<Record<CashLineActorField, string>> {
  const src = (row ?? {}) as Record<string, unknown>;
  const out: Partial<Record<CashLineActorField, string>> = {};
  for (const key of CASH_LINE_ACTOR_COLUMNS) {
    const text = String(src[key] ?? '').trim();
    if (text) out[key] = text;
  }
  return out;
}

/**
 * Kasa satırına yazılacak ekleyen kişi.
 * Geçersiz kimlik, yer tutucu ve kasa açıklaması («Kasa giriş») yazılmaz.
 * Bellek oturumu boşsa satış fişinin kullandığı kullanıcı adı kullanılır.
 * O da yoksa ad boş kalır; uydurma ad yazılmaz.
 */
export function resolveCashLineActorWrite(explicit?: {
  cashier?: unknown;
  createdByUserId?: unknown;
}): { cashier: string; createdByUserId: string } {
  const named = sanitizeStoredCashierName(explicit?.cashier);
  const explicitName = named && !isCashMovementLabel(named) ? named : '';
  const cashier = explicitName || currentLoginCashierName();
  const rawId = String(explicit?.createdByUserId ?? '').trim() || String(currentLoginUserId() ?? '').trim();
  const createdByUserId = isUuid(rawId) ? rawId : '';
  return {
    cashier: cashier && !isCashMovementLabel(cashier) ? cashier : '',
    createdByUserId,
  };
}

export function readCashLineActor(row: object | null | undefined): CashLineActor {
  const fields = copyCashLineActorFields(row);
  const emptyColumns = CASH_LINE_ACTOR_COLUMNS.filter((key) => !fields[key]);
  let name = '';
  let nameColumn = '';
  for (const key of CASH_LINE_ACTOR_NAME_COLUMNS) {
    const value = fields[key];
    if (!value || isPlaceholderCashierName(value) || isUuid(value) || isCashMovementLabel(value)) continue;
    name = value;
    nameColumn = key;
    break;
  }
  let id = '';
  let idColumn = '';
  for (const key of CASH_LINE_ACTOR_ID_COLUMNS) {
    const value = fields[key];
    if (!value || isPlaceholderCashierName(value) || isCashMovementLabel(value)) continue;
    if (isOpaqueIdentity(value)) {
      if (!id) {
        id = value;
        idColumn = key;
      }
      continue;
    }
    if (!name) {
      name = value;
      nameColumn = key;
    }
  }
  return { id, name, nameColumn, idColumn, emptyColumns: [...emptyColumns] };
}
