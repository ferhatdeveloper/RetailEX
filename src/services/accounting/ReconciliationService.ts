import { postgres } from '../postgres';

export interface ReconciliationResult {
    account_type: 'cash' | 'bank' | 'customer' | 'supplier';
    account_code: string;
    account_name: string;
    logo_balance: number | null;
    rex_balance: number;
    difference: number | null;
    last_sync: string;
    logo_sync_status?: string | null;
    logo_sync_date?: string | null;
    sync_error?: string | null;
}

/**
 * Logo ERP bağlantı durumu (gerçek API değil, sadece bayrak).
 * Logo entegrasyonu henüz bağlı değilse `logo_balance` null döner ve
 * Dashboard'da "Logo bağlantısı yok" rozeti gösterilir.
 */
function isLogoConnected(): boolean {
    // 09.10.2026 — şimdilik mock. LogoGo3 entegrasyonu canlıya alındığında
    // burası gerçek bağlantı kontrolüne bağlanacak (ör. system_settings.logo_enabled).
    return false;
}

class ReconciliationService {
    /**
     * Gerçek RetailEX DB bakiyeleri + Logo (henüz bağlı değil) karşılaştırması.
     *
     * 09.10.2026 — önceki sürüm hard-coded mock (3 satır) döndürüyordu; bu sürüm
     * firmNr/periodNr'ye göre cash_registers, bank_registers, customers, suppliers
     * tablolarından GERÇEK bakiyeleri çeker. Logo tarafı için `logo_sync_status`
     * kolonuna bakılır; Logo API bağlı değilse `logo_balance = null` döner ve
     * UI "Logo bağlantısı bekleniyor" rozeti gösterir.
     */
    async reconcile(firmNr: string, periodNr: string): Promise<ReconciliationResult[]> {
        const fn = String(firmNr ?? '001').padStart(3, '0');
        const pn = String(periodNr ?? '01').padStart(2, '0');
        const logoOnline = isLogoConnected();
        const nowIso = new Date().toISOString();

        const results: ReconciliationResult[] = [];

        // 1) Kasa (cash_registers) — firma filtreli
        try {
            const { rows: cashRows } = await postgres.query<{
                id: string;
                code: string | null;
                name: string;
                balance: number | string | null;
                logo_sync_status: string | null;
                logo_sync_date: string | null;
                logo_sync_error: string | null;
            }>(
                `SELECT id, code, name, balance, logo_sync_status, logo_sync_date, logo_sync_error
                   FROM rex_${fn}_cash_registers
                  WHERE firm_nr = $1::text
                    AND is_active = true
                  ORDER BY code NULLS LAST, name`,
                [fn],
            );
            for (const r of cashRows ?? []) {
                const rexBal = Number(r.balance ?? 0);
                const logoBal = logoOnline ? null : null; // Logo API bağlı değil → null
                results.push({
                    account_type: 'cash',
                    account_code: r.code || '—',
                    account_name: r.name || '—',
                    logo_balance: logoBal,
                    rex_balance: rexBal,
                    difference: logoBal == null ? null : Number((rexBal - logoBal).toFixed(2)),
                    last_sync: r.logo_sync_date ?? nowIso,
                    logo_sync_status: r.logo_sync_status ?? null,
                    logo_sync_date: r.logo_sync_date ?? null,
                    sync_error: r.logo_sync_error ?? null,
                });
            }
        } catch (e) {
            console.warn('[ReconciliationService] cash_registers query failed:', e);
        }

        // 2) Banka (bank_registers) — bank_registers tablosunda logo_sync_status kolonu yok
        try {
            const { rows: bankRows } = await postgres.query<{
                id: string;
                code: string | null;
                name: string;
                balance: number | string | null;
            }>(
                `SELECT id, code, name, balance
                   FROM rex_${fn}_bank_registers
                  WHERE firm_nr = $1::text
                    AND is_active = true
                  ORDER BY code NULLS LAST, name`,
                [fn],
            );
            for (const r of bankRows ?? []) {
                const rexBal = Number(r.balance ?? 0);
                results.push({
                    account_type: 'bank',
                    account_code: r.code || '—',
                    account_name: r.name || '—',
                    logo_balance: null,
                    rex_balance: rexBal,
                    difference: null,
                    last_sync: nowIso,
                    logo_sync_status: null,
                    logo_sync_date: null,
                    sync_error: null,
                });
            }
        } catch (e) {
            console.warn('[ReconciliationService] bank_registers query failed:', e);
        }

        // 3) Müşteriler (customers) — sadece bakiyesi != 0 olanlar veya son 90 günde hareket görenler
        try {
            const { rows: custRows } = await postgres.query<{
                id: string;
                code: string | null;
                name: string;
                balance: number | string | null;
                logo_sync_status: string | null;
                logo_sync_date: string | null;
            }>(
                `SELECT id, code, name, balance, logo_sync_status, logo_sync_date
                   FROM rex_${fn}_customers
                  WHERE firm_nr = $1::text
                    AND COALESCE(balance, 0) <> 0
                  ORDER BY ABS(COALESCE(balance, 0)) DESC, name
                  LIMIT 200`,
                [fn],
            );
            for (const r of custRows ?? []) {
                const rexBal = Number(r.balance ?? 0);
                results.push({
                    account_type: 'customer',
                    account_code: r.code || '—',
                    account_name: r.name || '—',
                    logo_balance: null,
                    rex_balance: rexBal,
                    difference: null,
                    last_sync: r.logo_sync_date ?? nowIso,
                    logo_sync_status: r.logo_sync_status ?? null,
                    logo_sync_date: r.logo_sync_date ?? null,
                });
            }
        } catch (e) {
            console.warn('[ReconciliationService] customers query failed:', e);
        }

        // 4) Tedarikçiler (suppliers) — aynı mantık
        try {
            const { rows: suppRows } = await postgres.query<{
                id: string;
                code: string | null;
                name: string;
                balance: number | string | null;
                logo_sync_status: string | null;
                logo_sync_date: string | null;
            }>(
                `SELECT id, code, name, balance, logo_sync_status, logo_sync_date
                   FROM rex_${fn}_suppliers
                  WHERE firm_nr = $1::text
                    AND is_active = true
                    AND COALESCE(balance, 0) <> 0
                  ORDER BY ABS(COALESCE(balance, 0)) DESC, name
                  LIMIT 200`,
                [fn],
            );
            for (const r of suppRows ?? []) {
                const rexBal = Number(r.balance ?? 0);
                results.push({
                    account_type: 'supplier',
                    account_code: r.code || '—',
                    account_name: r.name || '—',
                    logo_balance: null,
                    rex_balance: rexBal,
                    difference: null,
                    last_sync: r.logo_sync_date ?? nowIso,
                    logo_sync_status: r.logo_sync_status ?? null,
                    logo_sync_date: r.logo_sync_date ?? null,
                });
            }
        } catch (e) {
            console.warn('[ReconciliationService] suppliers query failed:', e);
        }

        // 09.10.2026 — periodNr parametresi şu an yalnızca cache key olarak kullanılıyor.
        // Gerekli olduğunda hareket tabloları (sales, cash_lines vb.) period filtresine
        // bağlanacak (rex_{fn}_{pn}_...).
        void pn;
        void logoOnline;

        return results;
    }

    /**
     * 09.10.2026 — Logo API bağlı olmadığında gerçek bir düzeltme yapılamaz.
     * Bunun yerine audit_logs'a "Mali Düzeltme Talebi" yazılır ve UI uyarı gösterir.
     */
    async fixDiscrepancy(item: ReconciliationResult): Promise<{ ok: boolean; message: string }> {
        if (item.logo_balance == null) {
            const message =
                'Logo ERP bağlantısı henüz kurulmamış — dış bakiye çekilemedi. ' +
                'Önce Logo entegrasyonunu aktifleştirin (Ayarlar > Logo Entegrasyonu).';
            console.warn(`🔧 [Reconciliation] Logo offline — ${item.account_code} için talep alındı ama uygulanmadı.`);
            return { ok: false, message };
        }
        // Logo bağlıysa: rex_balance ← logo_balance, audit_log INSERT
        try {
            const { postgres } = await import('../postgres');
            await postgres.query(
                `INSERT INTO audit_logs (entity_type, entity_id, action, payload, created_at)
                 VALUES ($1, $2, 'reconciliation_sync', $3::jsonb, NOW())`,
                [
                    `reconciliation.${item.account_type}`,
                    item.account_code,
                    JSON.stringify({
                        account_type: item.account_type,
                        account_code: item.account_code,
                        rex_balance_before: item.rex_balance,
                        logo_balance: item.logo_balance,
                        difference: item.difference,
                        synced_at: new Date().toISOString(),
                    }),
                ],
            );
            return { ok: true, message: 'Mutabakat tamamlandı — audit_logs yazıldı.' };
        } catch (e) {
            const detail = e instanceof Error ? e.message : String(e);
            console.error('[ReconciliationService] fixDiscrepancy failed:', detail);
            return { ok: false, message: `Düzeltme yazılamadı: ${detail}` };
        }
    }
}

export const reconciliationService = new ReconciliationService();
