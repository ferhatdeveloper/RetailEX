import { useEffect, useState } from 'react';
import { Database, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { IS_TAURI } from '../../utils/env';
import {
  fetchLogoFirmsFromMssql,
  fetchLogoPeriodsFromMssql,
  importLogoFirmData,
} from '../../services/logoMssqlSyncService';
import { LogoMssqlDatabaseSelect } from '../integrations/LogoMssqlDatabaseSelect';
import { provisionFirmEverywhere } from '../../services/firmProvisionService';
import { organizationAPI } from '../../services/api';
import { emitInvalidate } from '../../services/retailexDataSync';

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: (firm: { firma_adi: string; firma_kodu: string; periodNr: string }) => void;
};

export function LogoFirmImportModal({ open, onClose, onImported }: Props) {
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [firms, setFirms] = useState<Array<{ id: string; name: string }>>([]);
  const [periods, setPeriods] = useState<Array<{ nr: number; start_date: string; end_date: string }>>([]);
  const [firmId, setFirmId] = useState('');
  const [periodNr, setPeriodNr] = useState('');
  const [erpDb, setErpDb] = useState('');

  const loadFirms = (db: string) => {
    if (!db || !IS_TAURI) return;
    setLoading(true);
    void fetchLogoFirmsFromMssql(db)
      .then((list) => {
        setFirms(list);
        setFirmId(list.length === 1 ? list[0].id : '');
      })
      .catch((e) => toast.error(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open || !IS_TAURI || !erpDb) return;
    loadFirms(erpDb);
  }, [open, erpDb]);

  useEffect(() => {
    if (!firmId || !IS_TAURI || !erpDb) {
      setPeriods([]);
      return;
    }
    void fetchLogoPeriodsFromMssql(firmId, erpDb)
      .then((list) => {
        setPeriods(list);
        if (list.length > 0) {
          const active = list.find((p) => p.nr > 0) ?? list[0];
          setPeriodNr(String(active.nr).padStart(2, '0'));
        }
      })
      .catch((e) => toast.error(String(e)));
  }, [firmId, erpDb]);

  const selectedFirm = firms.find((f) => f.id === firmId);

  const handleImport = async () => {
    if (!firmId || !periodNr) {
      toast.error('Logo firma ve dönem seçin.');
      return;
    }
    const firmNr = firmId.replace(/\D/g, '').padStart(3, '0');
    const per = periodNr.replace(/\D/g, '').padStart(2, '0');
    const firmaAdi = selectedFirm?.name || `Logo Firma ${firmNr}`;

    setImporting(true);
    try {
      await organizationAPI.saveFirm({
        firma_adi: firmaAdi,
        firma_kodu: firmNr,
        firma_nr: firmNr,
        ana_para_birimi: 'TRY',
        raporlama_para_birimi: 'TRY',
        regulatory_region: 'TR',
      });
      await provisionFirmEverywhere(firmNr, per);
      emitInvalidate('firms');

      const sync = await importLogoFirmData(firmNr, per, erpDb);
      if (!sync.ok) {
        toast.warning(`Firma kaydedildi; Logo veri aktarımı kısmen başarısız: ${sync.message}`);
      } else {
        toast.success('Logo firması ve verileri içe aktarıldı.');
      }

      onImported({ firma_adi: firmaAdi, firma_kodu: firmNr, periodNr: per });
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;
  if (!IS_TAURI) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-lg p-6 max-w-md text-sm">
          Logo MSSQL firma içe aktarma yalnızca masaüstü uygulamasında kullanılabilir.
          <button type="button" className="mt-4 w-full py-2 bg-gray-200 rounded" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-800 text-white">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <h3 className="font-semibold">Logo&apos;dan firma çek</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 hover:bg-white/10 rounded">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-600">
            MSSQL sunucusundaki Logo veritabanını seçin; ardından firma ve dönem seçerek RetailEX&apos;e aktarın.
          </p>
          <LogoMssqlDatabaseSelect
            value={erpDb || null}
            allowManual
            onChange={(db) => {
              setErpDb(db);
              setFirmId('');
              setPeriodNr('');
              setFirms([]);
              setPeriods([]);
            }}
          />
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-600 py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Logo firmaları yükleniyor…
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Logo firma</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={firmId}
                  onChange={(e) => setFirmId(e.target.value)}
                >
                  <option value="">Seçin…</option>
                  {firms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.id} — {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Dönem</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={periodNr}
                  onChange={(e) => setPeriodNr(e.target.value)}
                  disabled={!firmId}
                >
                  <option value="">Seçin…</option>
                  {periods.map((p) => (
                    <option key={p.nr} value={String(p.nr).padStart(2, '0')}>
                      {p.nr} ({p.start_date} — {p.end_date})
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
        <div className="px-4 py-3 border-t bg-gray-50 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-2 text-sm border rounded-lg hover:bg-white">
            Vazgeç
          </button>
          <button
            type="button"
            disabled={importing || !firmId || !periodNr || !erpDb}
            onClick={() => void handleImport()}
            className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            İçe aktar
          </button>
        </div>
      </div>
    </div>
  );
}
