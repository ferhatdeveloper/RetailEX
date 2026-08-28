/**
 * PartnerDetailReportModal — Şirket ortakları detaylı muhasebe raporu
 *
 * 50 yıllık muhasebeci gözüyle:
 *   - Partner başına tüm ledger hareketleri (tarih sıralı)
 *   - Mutabakat: Σ(amount × sign) = DB balance
 *   - Tür kırılımı (KAR_DAGITIMI, ZARAR_DAGITIMI, SERMAYE_TAHSILAT, CH_ODEME_PARTNER, vb.)
 *   - Footer: toplam giriş/çıkış/net, kümülatif bakiye
 *   - Çalışma mantığı açıklaması (ledger mantığı + işaret kuralları)
 *
 * Veri kaynağı:
 *   - partnerAPI.getLedger(id) → rex_{firm}_{period}_party_ledger_movements
 *   - partnerAPI.getById(id)  → rex_{firm}_parties (mevcut bakiye)
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  PercentBodyModal,
  PercentBodyModalScrollBody,
} from '../shared/PercentBodyModal';
import { Loader2, AlertCircle, CheckCircle2, Calculator, TrendingUp, TrendingDown, Wallet, Info } from 'lucide-react';
import { partnerAPI } from '../../services/api/partiesPartners';
import type { PartyLedgerMovement, PartyPartner } from '../../core/types/models';

interface Props {
  partner: PartyPartner;
  periodStart: string;
  periodEnd: string;
  currency: string;
  onClose: () => void;
}

const TX_LABELS: Record<string, { tr: string; sign: number; group: 'profit' | 'capital' | 'expense' | 'other' }> = {
  KAR_DAGITIMI: { tr: 'Kâr Dağıtımı', sign: 1, group: 'profit' },
  ZARAR_DAGITIMI: { tr: 'Zarar Dağıtımı', sign: -1, group: 'profit' },
  SERMAYE_TAHSILAT: { tr: 'Sermaye Tahsilatı (ortağın kasaya koyması)', sign: 1, group: 'capital' },
  ORTAK_SERMAYE_TAHSILAT: { tr: 'Sermaye Tahsilatı', sign: 1, group: 'capital' },
  ORTAK_SERMAYE_ODEME: { tr: 'Sermaye Ödeme', sign: -1, group: 'capital' },
  ORTAK_PARA_GIRIS: { tr: 'Ortak Para Girişi', sign: 1, group: 'capital' },
  ORTAK_PARA_CIKIS: { tr: 'Ortak Para Çıkışı', sign: -1, group: 'capital' },
  ORTAK_SERMAYE_CIKIS: { tr: 'Sermaye Çıkışı', sign: -1, group: 'capital' },
  CH_ODEME_PARTNER: { tr: 'Tedarikçi Ödeme (ortak adına)', sign: -1, group: 'expense' },
  CANCELLED_CH_ODEME_PARTNER: { tr: 'İptal: Tedarikçi Ödeme', sign: 1, group: 'expense' },
  CANCELLED_ORTAK_SERMAYE_TAHSILAT: { tr: 'İptal: Sermaye Tahsilatı', sign: -1, group: 'capital' },
};

function fmt(v: number, currency: string): string {
  const abs = Math.abs(v).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const sign = v < 0 ? '−' : v > 0 ? '+' : '';
  return `${sign}${abs} ${currency}`;
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

export function PartnerDetailReportModal({
  partner,
  periodStart,
  periodEnd,
  currency,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ledger, setLedger] = useState<PartyLedgerMovement[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await partnerAPI.getLedger(partner.id, {
          startDate: periodStart,
          endDate: periodEnd,
          limit: 2000,
        });
        if (active) setLedger(rows || []);
      } catch (e: any) {
        if (active) setError(e?.message || 'Ledger yüklenemedi');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [partner.id, periodStart, periodEnd]);

  // Mutabakat + kümülatif bakiye
  const computed = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    let cumulative = 0;
    const withRunning: Array<PartyLedgerMovement & { running: number }> = [];
    for (const r of ledger) {
      const signed = Number(r.amount) * Number(r.sign);
      if (signed > 0) totalIn += signed;
      else if (signed < 0) totalOut += Math.abs(signed);
      cumulative += signed;
      withRunning.push({ ...r, running: cumulative });
    }
    const dbBalance = Number(partner.balance || 0);
    const matches = Math.abs(cumulative - dbBalance) < 0.01;

    // Tür kırılımı
    const byType: Record<string, { count: number; signedTotal: number }> = {};
    for (const r of ledger) {
      const key = r.transaction_type || 'UNKNOWN';
      const signed = Number(r.amount) * Number(r.sign);
      if (!byType[key]) byType[key] = { count: 0, signedTotal: 0 };
      byType[key].count += 1;
      byType[key].signedTotal += signed;
    }

    return {
      totalIn,
      totalOut,
      net: totalIn - totalOut,
      cumulative,
      dbBalance,
      matches,
      byType,
      withRunning,
    };
  }, [ledger, partner.balance]);

  const dbBalanceNum = Number(partner.balance || 0);
  const isNegative = dbBalanceNum < 0;

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={`Şirket ortağı detaylı rapor — ${partner.name}`}>
      <div className="bg-gradient-to-r from-indigo-50 via-blue-50 to-cyan-50 px-6 py-4 border-b border-slate-200 shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-800">
                Şirket Ortağı Detay Raporu
              </h2>
              <span className="text-xs font-mono text-slate-500">·</span>
              <span className="text-sm font-mono text-slate-600">{partner.code}</span>
            </div>
            <p className="text-base font-semibold text-indigo-700">{partner.name}</p>
            <p className="text-xs text-slate-500 mt-1">
              Pay: <span className="font-semibold">%{Number(partner.share_pct || 0).toFixed(2)}</span>
              {partner.partner_role ? (
                <>
                  {' · Rol: '}
                  <span className="font-semibold">
                    {partner.partner_role === 'major' ? 'Büyük Ortak' : partner.partner_role === 'minor' ? 'Küçük Ortak' : partner.partner_role}
                  </span>
                </>
              ) : null}
              {partner.partner_since ? (
                <>
                  {' · Ortaklık Başlangıcı: '}
                  <span className="font-semibold">{fmtDate(partner.partner_since)}</span>
                </>
              ) : null}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Mevcut Bakiye</p>
            <p className={`text-3xl font-black ${isNegative ? 'text-red-600' : 'text-emerald-600'}`}>
              {fmt(dbBalanceNum, currency)}
            </p>
            {computed.matches ? (
              <p className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center gap-1 justify-end">
                <CheckCircle2 className="w-3 h-3" /> Ledger mutabık
              </p>
            ) : (
              <p className="text-[11px] text-red-700 font-semibold mt-1 flex items-center gap-1 justify-end">
                <AlertCircle className="w-3 h-3" /> Fark: {fmt(computed.cumulative - dbBalanceNum, currency)}
              </p>
            )}
          </div>
        </div>
      </div>

      <PercentBodyModalScrollBody className="p-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Ledger yükleniyor…
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            <AlertCircle className="w-5 h-5 inline mr-2" />
            {error}
          </div>
        ) : (
          <>
            {/* Özet Kartları */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard
                title="Toplam Giriş"
                value={fmt(computed.totalIn, currency)}
                color="emerald"
                icon={<TrendingUp className="w-4 h-4" />}
              />
              <SummaryCard
                title="Toplam Çıkış"
                value={fmt(-computed.totalOut, currency)}
                color="red"
                icon={<TrendingDown className="w-4 h-4" />}
              />
              <SummaryCard
                title="Net (Giriş − Çıkış)"
                value={fmt(computed.net, currency)}
                color={computed.net >= 0 ? 'emerald' : 'red'}
                icon={<Calculator className="w-4 h-4" />}
              />
              <SummaryCard
                title="İşlem Sayısı"
                value={`${ledger.length} adet`}
                color="slate"
              />
            </div>

            {/* Tür Kırılımı */}
            {Object.keys(computed.byType).length > 0 ? (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-slate-500" />
                  Hareket Türü Kırılımı
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {Object.entries(computed.byType)
                    .sort((a, b) => Math.abs(b[1].signedTotal) - Math.abs(a[1].signedTotal))
                    .map(([type, info]) => {
                      const meta = TX_LABELS[type] || { tr: type, group: 'other' as const };
                      return (
                        <div
                          key={type}
                          className={`flex items-center justify-between gap-2 px-3 py-2 rounded-md border ${
                            info.signedTotal >= 0
                              ? 'bg-emerald-50 border-emerald-200'
                              : 'bg-red-50 border-red-200'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-700 truncate">{meta.tr}</p>
                            <p className="text-[10px] font-mono text-slate-500">{type}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p
                              className={`text-sm font-bold ${
                                info.signedTotal >= 0 ? 'text-emerald-700' : 'text-red-700'
                              }`}
                            >
                              {fmt(info.signedTotal, currency)}
                            </p>
                            <p className="text-[10px] text-slate-500">{info.count} adet</p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ) : null}

            {/* Detay Tablosu */}
            <div>
              <h3 className="text-sm font-bold text-slate-700 mb-2">
                Hareket Detayı ({computed.withRunning.length} satır)
              </h3>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold">Tarih</th>
                      <th className="px-3 py-2 text-left font-bold">İşlem Türü</th>
                      <th className="px-3 py-2 text-left font-bold">Açıklama</th>
                      <th className="px-3 py-2 text-left font-bold">Fiş No</th>
                      <th className="px-3 py-2 text-right font-bold">Tutar</th>
                      <th className="px-3 py-2 text-center font-bold">İşaret</th>
                      <th className="px-3 py-2 text-right font-bold">Kümülatif</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {computed.withRunning.map((r, idx) => {
                      const signed = Number(r.amount) * Number(r.sign);
                      const meta = TX_LABELS[r.transaction_type] || { tr: r.transaction_type, group: 'other' as const };
                      return (
                        <tr key={r.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                          <td className="px-3 py-2 font-mono text-slate-600">{fmtDate(r.date)}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                signed > 0
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : signed < 0
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {meta.tr}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-700 max-w-[280px] truncate" title={r.definition || ''}>
                            {r.definition || '—'}
                          </td>
                          <td className="px-3 py-2 font-mono text-[10px] text-slate-500">
                            {r.fiche_no || '—'}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono font-bold ${signed > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                            {fmt(signed, currency)}
                          </td>
                          <td className="px-3 py-2 text-center font-mono text-slate-600">
                            {r.sign > 0 ? '+' : r.sign < 0 ? '−' : '0'}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono font-semibold ${r.running < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                            {fmt(r.running, currency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* FOOTER */}
                  <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                    <tr>
                      <td colSpan={4} className="px-3 py-3 text-right text-slate-700 uppercase tracking-wider text-[10px]">
                        TOPLAM
                      </td>
                      <td className="px-3 py-3 text-right font-mono">
                        <span className="text-emerald-700 block">+{fmt(computed.totalIn, currency).replace('+', '')}</span>
                        <span className="text-red-700 block">−{fmt(computed.totalOut, currency).replace('+', '').replace('−', '')}</span>
                      </td>
                      <td className="px-3 py-3 text-center text-[10px] text-slate-600">net</td>
                      <td className={`px-3 py-3 text-right font-mono text-sm ${computed.cumulative < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                        {fmt(computed.cumulative, currency)}
                      </td>
                    </tr>
                    <tr className="bg-amber-50 border-t border-amber-200">
                      <td colSpan={4} className="px-3 py-2 text-right text-amber-900 font-bold text-[11px]">
                        MUTABAKAT KONTROLÜ
                      </td>
                      <td colSpan={2} className="px-3 py-2 text-center text-[11px]">
                        <span className="text-slate-600">Ledger net:</span>{' '}
                        <span className="font-mono font-bold">{fmt(computed.cumulative, currency)}</span>
                      </td>
                      <td className={`px-3 py-2 text-right text-[11px] ${computed.matches ? 'text-emerald-700' : 'text-red-700'}`}>
                        {computed.matches ? (
                          <span className="flex items-center justify-end gap-1">
                            <CheckCircle2 className="w-3 h-3" /> DB eşit
                          </span>
                        ) : (
                          <span className="flex items-center justify-end gap-1">
                            <AlertCircle className="w-3 h-3" /> Fark: {fmt(computed.cumulative - dbBalanceNum, currency)}
                          </span>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Çalışma Mantığı (Muhasebeci Notu) */}
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
              <h3 className="text-sm font-bold text-blue-900 mb-2 flex items-center gap-2">
                <Info className="w-4 h-4" />
                Çalışma Mantığı (50 Yıllık Muhasebeci Gözüyle)
              </h3>
              <div className="text-xs text-blue-900 space-y-2 leading-relaxed">
                <p>
                  <strong>Bakiye Yönü:</strong> Pozitif değer = ortağın işletmeden <em>alacağı</em> (dağıtılmamış kâr payı).
                  Negatif değer = ortağın işletmeye <em>sermaye borcu</em> ya da işletmeden çektiği tutar.
                </p>
                <p>
                  <strong>İşaret Kuralları:</strong> Sign kolonu <code className="bg-blue-100 px-1 rounded">+1</code> ortak alacağını artırır
                  (kâr dağıtımı, sermaye tahsilatı), <code className="bg-blue-100 px-1 rounded">−1</code> azaltır
                  (zarar dağıtımı, tedarikçi ödeme, ortak para çıkışı). Tüm kayıt çift-ayaklı muhasebe defterine yazılır.
                </p>
                <p>
                  <strong>Kaynak Doğrulama:</strong> Ledger Σ(amount × sign) = parties.balance.
                  Bu rapor bu eşitliği otomatik kontrol eder; sapma varsa kırmızı uyarı gösterir.
                </p>
                <p>
                  <strong>Kâr Dağıtımı vs Kasa Hareketi:</strong> Kâr dağıtımı ({`KAR_DAGITIMI`}) kasa yazmaz — sadece
                  ortağın alacağını artırır. Para fiilen çekilince <code>ORTAK_PARA_CIKIS</code> veya
                  <code> SERMAYE_ODEME</code> ayrıca kasa üzerinden işlenir.
                </p>
                <p>
                  <strong>CH_ODEME_PARTNER:</strong> Tedarikçi ödemesi firma ortağı adına yapıldığında yazılır;
                  ortağın firmadan alacağını azaltır (işletme adına ödediği için).
                </p>
                <p>
                  <strong>İptal Mantığı:</strong> Silinen işlemler için <code>CANCELLED_*</code> ters işaretli yeni
                  ledger satırı açılır — audit trail korunur, orijinal kayıt silinmez.
                </p>
              </div>
            </div>
          </>
        )}
      </PercentBodyModalScrollBody>
    </PercentBodyModal>
  );
}

function SummaryCard({
  title,
  value,
  color,
  icon,
}: {
  title: string;
  value: string;
  color: 'emerald' | 'red' | 'slate' | 'blue';
  icon?: React.ReactNode;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
  };
  return (
    <div className={`border rounded-lg p-3 ${colorMap[color]}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <p className="text-[10px] uppercase tracking-wider font-bold opacity-80">{title}</p>
      </div>
      <p className="text-base font-black font-mono">{value}</p>
    </div>
  );
}
