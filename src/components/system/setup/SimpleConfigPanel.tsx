import React, { useState } from 'react';
import { Database, Loader2, ShieldCheck, Settings2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { safeInvoke, IS_TAURI } from '../../../utils/env';
import { initializeFromSQLite } from '../../../services/postgres';
import ConfigPasswordModal, { type SimpleConfigSubmitPayload } from './ConfigPasswordModal';

type SimpleConfigPanelProps = {
  /** Mevcut config (kullanıcı adı / DB adresi için başlangıç değerleri) */
  initialUser?: string;
  initialLocalDb?: string;
  /** "Gelişmiş" sekmesine geçiş — mevcut tam wizard'ı açar */
  onSwitchToAdvanced: () => void;
  /** Yapılandırma kaydedildi ve panele yönlendirilecek */
  onCompleted: () => void;
};

/**
 * Tauri (masaüstü) için sadeleştirilmiş kurulum ekranı.
 *
 * - Tek buton: "Yapılandırmayı Aç"
 * - Tıklayınca PercentBodyModal ile PG kullanıcı + şifre iste
 * - Kayıt sonrası `is_configured=true` set edilir, panele yönlendirilir
 * - "Gelişmiş Ayarlar" linki tüm mevcut sihirbazı açar (PostgREST, Logo/Nebim, hibrit)
 *
 * Bağlantı modu Tauri'de her zaman **direct/local** olur:
 *   db_mode = 'offline', connection_provider = 'db'
 *
 * Bu ekran Web (SaaS) tarafında gösterilmez; orada tam wizard açılır.
 */
const SimpleConfigPanel: React.FC<SimpleConfigPanelProps> = ({
  initialUser = 'postgres',
  initialLocalDb = '127.0.0.1:5432/retailex_local',
  onSwitchToAdvanced,
  onCompleted,
}) => {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleOpen = () => {
    if (!IS_TAURI) {
      // Web'de bu ekranı göstermiyoruz; yine de emniyetli tarafta kal.
      onSwitchToAdvanced();
      return;
    }
    setOpen(true);
  };

  const handleSubmit = async (payload: SimpleConfigSubmitPayload) => {
    if (!IS_TAURI) return;
    setSubmitting(true);
    try {
      // Mevcut config'i al (varsa), PG alanlarını güncelle.
      // connectionProvider direct/local, db_mode offline, is_configured=true.
      let existing: any = {};
      try {
        existing = (await safeInvoke('get_app_config')) || {};
      } catch {
        /* ignore — yeni kurulum olabilir */
      }

      const nextConfig = {
        ...(existing || {}),
        pg_local_user: payload.pg_local_user,
        pg_local_pass: payload.pg_local_pass,
        local_db: payload.local_db,
        connection_provider: 'db',
        db_mode: 'offline',
        // Basit akışta ERP entegrasyonu kapalı; kullanıcı isterse Gelişmiş'ten açabilir
        skip_integration: true,
        is_nebim_migration: false,
        // Masaüstü "merkez" rolünde — kendi PG'si ile çalışır
        role: 'center',
        is_configured: true,
        // Sistem tipi / modüller Tauri varsayılanı
        system_type: existing?.system_type || 'retail',
        enabled_modules:
          Array.isArray(existing?.enabled_modules) && existing.enabled_modules.length > 0
            ? existing.enabled_modules
            : ['pos', 'management'],
        terminal_name: existing?.terminal_name || 'TERMINAL-01',
        device_id: existing?.device_id || '',
      };

      await safeInvoke('save_app_config', { config: nextConfig });

      // JS tarafı postgres singleton'ını yeni config ile başlat
      try {
        await initializeFromSQLite();
      } catch (e) {
        console.warn('[SimpleConfigPanel] initializeFromSQLite uyarısı:', e);
      }

      // localStorage senkronu (web modunda kullanılır)
      try {
        localStorage.setItem('retailex_web_config', JSON.stringify(nextConfig));
        localStorage.setItem('exretail_firma_donem_configured', 'true');
      } catch {
        /* ignore */
      }

      toast.success('Yapılandırma kaydedildi. Ana panele yönlendiriliyorsunuz.');
      setOpen(false);
      // Küçük bir gecikme ile kullanıcıya başarı mesajını gösterme şansı ver
      setTimeout(() => {
        onCompleted();
      }, 350);
    } catch (e: any) {
      const msg = e?.message || String(e);
      toast.error('Yapılandırma kaydedilemedi: ' + msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="mb-6">
        <h2 className="text-3xl font-bold mb-1 text-white tracking-tight">Hoş Geldiniz</h2>
        <p className="text-blue-400/80 font-bold uppercase tracking-widest text-[10px]">
          RetailEX Yerel Kurulum
        </p>
      </div>

      <div className="relative p-10 rounded-[36px] bg-gradient-to-br from-blue-600/20 via-indigo-600/15 to-purple-600/10 border border-white/10 shadow-[0_32px_128px_-32px_rgba(37,99,235,0.45)] overflow-hidden">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-blue-500/20 blur-[100px] rounded-full" />
        <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-indigo-500/20 blur-[100px] rounded-full" />

        <div className="relative z-10 flex flex-col items-start gap-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-200/70">
                Tek Adım Kurulum
              </div>
              <h3 className="text-2xl font-black text-white tracking-tight">
                Yerel PostgreSQL Bağlantısı
              </h3>
            </div>
          </div>

          <p className="text-sm text-slate-300/90 leading-relaxed max-w-xl">
            Bu bilgisayar için tek bir yerel veritabanı yeterlidir. Aşağıdaki butona tıklayın,
            PostgreSQL kullanıcı adı ve şifrenizi girin; sistem otomatik olarak
            <span className="font-mono text-blue-200/90"> config.db</span>'ye kaydedecek ve ana panele geçecek.
          </p>

          <ul className="text-[11px] text-slate-400 space-y-1.5">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>
                Varsayılan: <span className="font-mono text-blue-200/90">127.0.0.1:5432/retailex_local</span>
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Şifreniz base64 ile saklanır (Rust tarafı decode eder).</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>PostgREST / Hibrit / Logo / Nebim için aşağıdan "Gelişmiş Ayarlar"ı açabilirsiniz.</span>
            </li>
          </ul>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleOpen}
              disabled={submitting}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-blue-600/30 flex items-center gap-3 active:scale-95 disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              Yapılandırmayı Aç
            </button>

            <button
              type="button"
              onClick={onSwitchToAdvanced}
              className="px-6 py-4 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all border border-white/10 flex items-center gap-2"
            >
              <Settings2 className="w-4 h-4" />
              Gelişmiş Ayarlar
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Database, label: 'Yerel PostgreSQL', desc: 'Direkt bağlantı' },
          { icon: ShieldCheck, label: 'Güvenli', desc: 'Base64 + Rust decode' },
          { icon: Sparkles, label: 'Anında Hazır', desc: 'Migration + tablo otomatik' },
        ].map((card, i) => (
          <div
            key={i}
            className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition-all"
          >
            <card.icon className="w-5 h-5 text-blue-400 mb-2" />
            <div className="text-[10px] font-black uppercase tracking-widest text-white/90">
              {card.label}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">{card.desc}</div>
          </div>
        ))}
      </div>

      <ConfigPasswordModal
        open={open}
        onCancel={() => (submitting ? null : setOpen(false))}
        onSubmit={handleSubmit}
        submitting={submitting}
        initialUser={initialUser}
        initialLocalDb={initialLocalDb}
      />
    </div>
  );
};

export default SimpleConfigPanel;
