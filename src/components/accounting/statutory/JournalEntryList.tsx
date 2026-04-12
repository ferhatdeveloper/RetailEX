import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { TableRoutingService } from '../../../services/TableRoutingService';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { Badge } from '../../ui/badge';
import { Search, Filter, FileText, Calendar, Download } from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from 'sonner';

interface JournalHeader {
  logicalref: number;
  fiche_no: string;
  date: string;
  fiche_type: number;
  description: string;
  total_debit: number;
  total_credit: number;
  doc_no?: string;
}

const FICHE_TYPES: Record<number, { label: string; color: string }> = {
  1: { label: 'Mahsup', color: 'bg-blue-100 text-blue-800' },
  2: { label: 'Tahsilat', color: 'bg-green-100 text-green-800' },
  3: { label: 'Tediye', color: 'bg-red-100 text-red-800' },
  4: { label: 'Açılış', color: 'bg-gray-100 text-gray-800' },
};

export function JournalEntryList() {
  const { t } = useLanguage();
  const { selectedFirm, selectedPeriod } = useFirmaDonem();
  const [rows, setRows] = useState<JournalHeader[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!selectedFirm?.nr || selectedPeriod?.nr == null) {
        setRows([]);
        return;
      }
      setLoading(true);
      try {
        const table = TableRoutingService.getTableName(
          { firmNr: selectedFirm.nr, periodNr: selectedPeriod.nr },
          'EMUHFICHE'
        );
        const url = `https://${projectId}.supabase.co/rest/v1/${table}?select=*&order=date.desc&limit=200`;
        const res = await fetch(url, {
          headers: {
            apikey: publicAnonKey,
            Authorization: `Bearer ${publicAnonKey}`,
            Accept: 'application/json',
          },
        });
        if (!res.ok) {
          throw new Error(await res.text());
        }
        const data = (await res.json()) as JournalHeader[];
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch (e: any) {
        console.error(e);
        if (!cancelled) {
          toast.error(t('common.loadError') || 'Liste yüklenemedi');
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedFirm?.nr, selectedPeriod?.nr, t]);

  const filtered = rows.filter((r) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      (r.fiche_no || '').toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q) ||
      (r.doc_no || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Fiş no, açıklama..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled>
            <Filter className="w-4 h-4 mr-1" />
            Filtre
          </Button>
          <Button variant="outline" size="sm" disabled>
            <Download className="w-4 h-4 mr-1" />
            Dışa aktar
          </Button>
        </div>
      </div>

      <div className="flex-1 border rounded-lg overflow-hidden bg-white dark:bg-gray-900">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fiş No</TableHead>
              <TableHead>Tarih</TableHead>
              <TableHead>Tip</TableHead>
              <TableHead>Açıklama</TableHead>
              <TableHead className="text-right">Borç</TableHead>
              <TableHead className="text-right">Alacak</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  Yükleniyor...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  Kayıt bulunamadı.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const ft = FICHE_TYPES[r.fiche_type] ?? {
                  label: String(r.fiche_type),
                  color: 'bg-gray-100 text-gray-800',
                };
                let dateStr = r.date;
                try {
                  dateStr = format(new Date(r.date), 'dd.MM.yyyy', { locale: tr });
                } catch {
                  /* keep raw */
                }
                return (
                  <TableRow key={r.logicalref}>
                    <TableCell className="font-mono font-medium">{r.fiche_no}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-sm">
                        <Calendar className="w-3.5 h-3.5 opacity-60" />
                        {dateStr}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={ft.color} variant="secondary">
                        {ft.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate" title={r.description}>
                      {r.description}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(
                        r.total_debit ?? 0
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(
                        r.total_credit ?? 0
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
