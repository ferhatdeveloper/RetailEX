import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Shield, X } from 'lucide-react';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { useLanguage } from '../../../contexts/LanguageContext';
import { ERP_SETTINGS } from '../../../services/postgres';
import { beautyService } from '../../../services/beautyService';
import { logger } from '../../../services/loggingService';
import { toast } from 'sonner';

interface BeautyManagerAuthModalProps {
    /** Modal kapatma (iptal veya başarı sonrası) */
    onClose: () => void;
    /** Şifre doğrulandıktan sonra çağrılır */
    onAuthorized: (authorizedByUserId: string | null) => void;
    /** İşlem bağlamı (örn. "ödemesi alınmış randevu düzenleme"); audit log payload'unda kullanılır */
    context?: {
        appointmentId?: string | null;
        action?: string;
        payload?: Record<string, unknown>;
    };
}

/**
 * Güzellik modülü için yönetici şifresi doğrulama dialog'u.
 *
 * - PercentBodyModal (body portal + flat modal standardı) kullanır.
 * - `beautyService.verifyManagerPassword` ile `public.users` üzerinde admin/manager
 *   şifresini doğrular (bcrypt veya düz metin).
 * - 3 başarısız deneme sonrası 5 sn bekletir.
 * - Başarılı doğrulamada `appendAuditLog` ile `beauty_audit_log`'a kayıt yazar.
 */
export function BeautyManagerAuthModal({ onClose, onAuthorized, context }: BeautyManagerAuthModalProps) {
    const { tm } = useLanguage();
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [cooldownUntil, setCooldownUntil] = useState<number>(0);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        // Modal açılınca input'a odaklan
        const t = window.setTimeout(() => inputRef.current?.focus(), 60);
        return () => window.clearTimeout(t);
    }, []);

    useEffect(() => {
        if (cooldownUntil <= Date.now()) return;
        const remain = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
        setError(tm('bManagerAuthCooldown').replace('{n}', String(remain)));
        const t = window.setInterval(() => {
            const r = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
            if (r <= 0) {
                setError(null);
                window.clearInterval(t);
            } else {
                setError(tm('bManagerAuthCooldown').replace('{n}', String(r)));
            }
        }, 1000);
        return () => window.clearInterval(t);
    }, [cooldownUntil, tm]);

    const submit = async () => {
        if (busy) return;
        const pw = password;
        if (!pw.trim()) {
            setError(tm('bManagerAuthEmpty'));
            return;
        }
        if (cooldownUntil > Date.now()) return;
        setBusy(true);
        setError(null);
        try {
            const firmNr = String(ERP_SETTINGS.firmNr ?? '').trim() || '001';
            const ok = await beautyService.verifyManagerPassword({ firmNr, password: pw });
            if (!ok) {
                const nextAttempt = attempt + 1;
                setAttempt(nextAttempt);
                setPassword('');
                if (nextAttempt >= 3) {
                    const until = Date.now() + 5_000;
                    setCooldownUntil(until);
                    setError(tm('bManagerAuthCooldown').replace('{n}', '5'));
                    setAttempt(0);
                } else {
                    setError(tm('bManagerAuthWrong'));
                }
                logger.warn('BeautyManagerAuthModal', 'manager_password_rejected', {
                    attempt: nextAttempt,
                    context,
                });
                return;
            }
            // Başarılı: audit log yaz, parent'a bildir.
            try {
                await beautyService.appendAuditLog(
                    'beauty_appointments',
                    context?.action ?? 'edit_paid_appointment',
                    context?.appointmentId ?? null,
                    null,
                    { reason: 'manager_authorization', ...(context?.payload ?? {}) }
                );
            } catch (auditErr) {
                console.warn('[BeautyManagerAuthModal] audit log write failed:', auditErr);
            }
            toast.success(tm('bManagerAuthOk'));
            onAuthorized(null);
            onClose();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg || tm('bManagerAuthError'));
            logger.error('BeautyManagerAuthModal', 'verifyManagerPassword threw', e);
        } finally {
            setBusy(false);
        }
    };

    const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            void submit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        }
    };

    return (
        <PercentBodyModal onClose={onClose} size="compact" ariaLabel={tm('bManagerAuthTitle')}>
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 text-white shrink-0 flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                    <Shield className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-base font-black uppercase tracking-tight">
                        {tm('bManagerAuthTitle')}
                    </h3>
                    <p className="text-[10px] text-blue-100 font-bold uppercase tracking-widest mt-1 opacity-90">
                        {tm('bManagerAuthSubtitle')}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={tm('close')}
                    className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 flex items-center justify-center shrink-0"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <PercentBodyModalScrollBody className="p-6 bg-white">
                <p className="text-sm font-semibold text-slate-700 leading-relaxed mb-4">
                    {tm('bManagerAuthBody')}
                </p>
                <label className="block">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                        {tm('bManagerAuthPassword')}
                    </span>
                    <input
                        ref={inputRef}
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => {
                            setPassword(e.target.value);
                            if (error) setError(null);
                        }}
                        onKeyDown={handleKey}
                        disabled={busy || cooldownUntil > Date.now()}
                        className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none text-base font-semibold text-slate-900 disabled:bg-slate-50 disabled:text-slate-400"
                    />
                </label>
                {error && (
                    <p className="mt-3 text-xs font-bold text-red-600 uppercase">
                        {error}
                    </p>
                )}
                <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
                    {tm('bManagerAuthHint')}
                </p>
            </PercentBodyModalScrollBody>

            <div className="p-5 border-t border-slate-100 bg-slate-50/60 flex gap-3 shrink-0">
                <button
                    type="button"
                    onClick={onClose}
                    disabled={busy}
                    className="flex-1 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider py-3 hover:bg-slate-100 active:scale-[0.98] disabled:opacity-50"
                >
                    {tm('cancel')}
                </button>
                <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={busy || !password.trim() || cooldownUntil > Date.now()}
                    className="flex-1 rounded-2xl bg-blue-600 text-white font-bold uppercase text-sm tracking-wider py-3 shadow-lg shadow-blue-200/50 hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
                >
                    {busy ? '...' : tm('bManagerAuthConfirm')}
                </button>
            </div>
        </PercentBodyModal>
    );
}

export default BeautyManagerAuthModal;
