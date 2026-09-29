import React, { useEffect, useMemo, useState } from 'react';
import { Database, Eye, EyeOff, Loader2, Lock, ShieldCheck, User, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  PercentBodyModal,
  PercentBodyModalScrollBody,
} from '../../shared/PercentBodyModal';

export type SimpleConfigSubmitPayload = {
  pg_local_user: string;
  pg_local_pass: string;
  local_db: string;
};

type ConfigPasswordModalProps = {
  open: boolean;
  initialUser?: string;
  initialLocalDb?: string;
  /** Şifre alanı kayıt/kontrol sırasında kullanılır; modal kapatıldığında çağrılır. */
  onCancel: () => void;
  /** Doğrulama + kayıt işlemini parent yapar; modal yalnızca UI. */
  onSubmit: (payload: SimpleConfigSubmitPayload) => Promise<void> | void;
  /** Kayıt anında submit butonu disable edilir (üst component'ten). */
  submitting?: boolean;
  /** Tauri / desktop ortamı başlığı */
  title?: string;
  /** Modal alt başlığı */
  subtitle?: string;
};

const ASCII_PRINTABLE_REGEX = /^[\x20-\x7E]+$/;

/**
 * Şifre doğrulama:
 * - Boş olamaz
 * - En az 6 karakter (PG varsayılanlarına yakın)
 * - En fazla 128 karakter
 * - ASCII printable (Türkçe karakterli şifreler için uyarı değil, sadece validasyon)
 */
function validatePassword(raw: string): string | null {
  const value = String(raw || '');
  if (!value.trim()) return 'Şifre boş bırakılamaz.';
  if (value.length < 6) return 'Şifre en az 6 karakter olmalı.';
  if (value.length > 128) return 'Şifre en fazla 128 karakter olabilir.';
  if (!ASCII_PRINTABLE_REGEX.test(value)) {
    return 'Şifre yalnızca İngilizce harf, rakam ve simge içerebilir.';
  }
  return null;
}

function validateUsername(raw: string): string | null {
  const value = String(raw || '').trim();
  if (!value) return 'Kullanıcı adı boş bırakılamaz.';
  if (value.length > 64) return 'Kullanıcı adı en fazla 64 karakter olabilir.';
  if (!ASCII_PRINTABLE_REGEX.test(value)) {
    return 'Kullanıcı adı yalnızca İngilizce harf, rakam ve simge içerebilir.';
  }
  return null;
}

function validateLocalDb(raw: string): string | null {
  const value = String(raw || '').trim();
  if (!value) return 'Bağlantı adresi boş bırakılamaz.';
  // host:port/db_name — basit kalıp
  const m = /^([^:\s]+):(\d+)\/([A-Za-z0-9_]+)$/.exec(value);
  if (!m) {
    return 'Bağlantı adresi "host:port/veritabanı" biçiminde olmalı (örn: 127.0.0.1:5432/retailex_local).';
  }
  const port = Number(m[2]);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return 'Port 1-65535 aralığında olmalı.';
  }
  return null;
}

/**
 * Tauri kurulum sihirbazı "Yapılandırmayı Aç" akışı için
 * tek-alanlı şifre/kullanıcı modalı.
 */
const ConfigPasswordModal: React.FC<ConfigPasswordModalProps> = ({
  open,
  initialUser = 'postgres',
  initialLocalDb = '127.0.0.1:5432/retailex_local',
  onCancel,
  onSubmit,
  submitting = false,
  title = 'Yapılandırmayı Aç',
  subtitle = 'Yerel PostgreSQL bilgilerinizi girin. Şifreniz base64 olarak saklanır.',
}) => {
  const [pgUser, setPgUser] = useState(initialUser);
  const [pgPass, setPgPass] = useState('');
  const [localDb, setLocalDb] = useState(initialLocalDb);
  const [showPass, setShowPass] = useState(false);
  const [touched, setTouched] = useState(false);

  // Modal her açıldığında state'i sıfırla
  useEffect(() => {
    if (open) {
      setPgUser(initialUser);
      setLocalDb(initialLocalDb);
      setPgPass('');
      setShowPass(false);
      setTouched(false);
    }
  }, [open, initialUser, initialLocalDb]);

  const userError = useMemo(() => validateUsername(pgUser), [pgUser]);
  const passError = useMemo(() => validatePassword(pgPass), [pgPass]);
  const dbError = useMemo(() => validateLocalDb(localDb), [localDb]);
  const hasError = Boolean(userError || passError || dbError);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (hasError) {
      toast.error(userError || passError || dbError || 'Alanları kontrol edin.');
      return;
    }
    await onSubmit({
      pg_local_user: pgUser.trim(),
      pg_local_pass: pgPass,
      local_db: localDb.trim(),
    });
  };

  return (
    <PercentBodyModal onClose={onCancel} size="compact" ariaLabel={title}>
      <form onSubmit={handleSubmit} className="contents">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-100/80">
              RetailEX Yapılandırma
            </div>
            <h2 className="text-lg font-black tracking-tight truncate">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Kapat"
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <PercentBodyModalScrollBody className="px-5 py-5 space-y-4 bg-gray-50 dark:bg-gray-900/40">
          <p className="text-[11px] leading-relaxed text-gray-600 dark:text-gray-400">{subtitle}</p>

          {/* Bağlantı adresi */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-300">
              Bağlantı Adresi
            </label>
            <div className="relative">
              <Database className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={localDb}
                onChange={(e) => setLocalDb(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                placeholder="127.0.0.1:5432/retailex_local"
                className={`w-full pl-10 pr-3 py-2.5 rounded-lg border bg-white dark:bg-gray-800 text-sm font-mono text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  touched && dbError
                    ? 'border-amber-500/60'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              />
            </div>
            {touched && dbError && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                {dbError}
              </p>
            )}
          </div>

          {/* Kullanıcı */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-300">
              Kullanıcı Adı
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={pgUser}
                onChange={(e) => setPgUser(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                placeholder="postgres"
                className={`w-full pl-10 pr-3 py-2.5 rounded-lg border bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  touched && userError
                    ? 'border-amber-500/60'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              />
            </div>
            {touched && userError && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                {userError}
              </p>
            )}
          </div>

          {/* Şifre */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-300">
              Şifre
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type={showPass ? 'text' : 'password'}
                value={pgPass}
                onChange={(e) => setPgPass(e.target.value)}
                onFocus={() => {
                  /* maskeleme */
                }}
                spellCheck={false}
                autoComplete="new-password"
                placeholder="••••••••"
                className={`w-full pl-10 pr-10 py-2.5 rounded-lg border bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  touched && passError
                    ? 'border-amber-500/60'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? 'Şifreyi gizle' : 'Şifreyi göster'}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            {touched && passError && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                {passError}
              </p>
            )}
            <p className="text-[10px] text-gray-500 dark:text-gray-500 leading-relaxed">
              Şifreniz config.db’ye base64 olarak yazılır (Rust tarafı decode eder). Minimum 6 karakter.
            </p>
          </div>
        </PercentBodyModalScrollBody>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0 bg-white dark:bg-gray-800">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            İptal
          </button>
          <button
            type="submit"
            disabled={submitting || (touched && hasError)}
            className="px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20 flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Kaydediliyor...
              </>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5" /> Yapılandırmayı Aç
              </>
            )}
          </button>
        </div>
      </form>
    </PercentBodyModal>
  );
};

export default ConfigPasswordModal;
