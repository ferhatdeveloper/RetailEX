/**
 * Cari Devir Fişi — web CariDevirFisiModule ile aynı akış:
 * cari seç → borç/alacak tutarı → toplu kaydet; kayıtlı fiş düzenle/iptal.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Modal,
  ScrollView,
  Switch,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ArrowRightLeft, Pencil, Trash2 } from 'lucide-react-native';
import { ScreenHeader, EmptyState, ErrorBanner, SearchBar } from '../components/ScreenChrome';
import { SegmentTabBar } from '../components/SegmentTabBar';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  cancelCariDevirRecord,
  createCariDevirBatch,
  devirAmountFromNet,
  devirDirectionFromNet,
  fetchCariAccounts,
  getCariDevirMapByAccount,
  listCariDevirRecords,
  updateCariDevirRecord,
  type CariAccountRow,
  type CariDevirDirection,
  type CariDevirRecord,
} from '../api/cariDevirApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';

type TabKey = 'entry' | 'records';
type TypeFilter = 'all' | 'customer' | 'supplier';

type RowDraft = {
  amount: string;
  direction: CariDevirDirection;
  selected: boolean;
  existingDevirId?: string;
};

type EditForm = {
  id: string;
  accountName: string;
  amount: string;
  direction: CariDevirDirection;
  date: string;
  notes: string;
};

function todayYmd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDate(raw: string | null | undefined): string {
  if (!raw) return '—';
  const s = String(raw).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const [y, m, d] = s.split('-');
  return `${d}.${m}.${y}`;
}

function parseAmount(raw: string): number {
  const n = Number(String(raw).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

function formatAmountInput(n: number): string {
  if (!n) return '';
  return n.toFixed(2).replace('.', ',');
}

export function CariDevirScreen() {
  const { colors, darkMode } = useThemeStore();
  const orgEpoch = useOrgEpoch();

  const [tab, setTab] = useState<TabKey>('entry');
  const [accounts, setAccounts] = useState<CariAccountRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [records, setRecords] = useState<CariDevirRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [recordsSearch, setRecordsSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [devirDate, setDevirDate] = useState(todayYmd);
  const [batchNotes, setBatchNotes] = useState('Eski program cari devir bakiyesi');
  const [replaceExisting, setReplaceExisting] = useState(true);

  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const buildDrafts = useCallback(
    (
      rows: CariAccountRow[],
      devirMap: Map<string, CariDevirRecord>,
      prev?: Record<string, RowDraft>,
    ) => {
      const next: Record<string, RowDraft> = { ...(prev || {}) };
      for (const acc of rows) {
        const existing = devirMap.get(acc.id);
        const prevRow = prev?.[acc.id];
        if (existing) {
          const amt = devirAmountFromNet(existing.net_amount);
          next[acc.id] = {
            amount: prevRow?.selected
              ? prevRow.amount
              : amt > 0
                ? formatAmountInput(amt)
                : '',
            direction: prevRow?.selected
              ? prevRow.direction
              : devirDirectionFromNet(existing.net_amount),
            selected: prevRow?.selected ?? false,
            existingDevirId: existing.id,
          };
        } else if (!next[acc.id]) {
          next[acc.id] = {
            amount: prevRow?.amount || '',
            direction: prevRow?.direction || 'borc',
            selected: prevRow?.selected ?? false,
          };
        }
      }
      return next;
    },
    [],
  );

  const loadAccounts = useCallback(async () => {
    setError(null);
    setStatusMsg(null);
    try {
      const [rows, devirMap] = await Promise.all([
        fetchCariAccounts(),
        getCariDevirMapByAccount(),
      ]);
      setAccounts(rows);
      setDrafts((prev) => buildDrafts(rows, devirMap, prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [buildDrafts, orgEpoch]);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    setError(null);
    try {
      setRecords(await listCariDevirRecords());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRecordsLoading(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    setLoading(true);
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    if (tab === 'records') void loadRecords();
  }, [tab, loadRecords]);

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return accounts.filter((a) => {
      if (typeFilter === 'customer' && a.cardType !== 'customer') return false;
      if (typeFilter === 'supplier' && a.cardType !== 'supplier') return false;
      if (!q) return true;
      return (
        (a.name || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (a.code || '').toLocaleLowerCase('tr-TR').includes(q)
      );
    });
  }, [accounts, search, typeFilter]);

  const filteredRecords = useMemo(() => {
    const q = recordsSearch.trim().toLocaleLowerCase('tr-TR');
    if (!q) return records;
    return records.filter(
      (r) =>
        (r.customer_name || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (r.fiche_no || '').toLocaleLowerCase('tr-TR').includes(q),
    );
  }, [records, recordsSearch]);

  const selectedCount = useMemo(
    () =>
      Object.values(drafts).filter((d) => d.selected && parseAmount(d.amount) > 0).length,
    [drafts],
  );

  const updateDraft = (id: string, patch: Partial<RowDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || { amount: '', direction: 'borc', selected: false }), ...patch },
    }));
  };

  const onSaveBatch = async () => {
    setStatusMsg(null);
    const lines = accounts
      .map((acc) => {
        const d = drafts[acc.id];
        if (!d?.selected) return null;
        const amount = parseAmount(d.amount);
        if (amount <= 0) return null;
        return {
          accountId: acc.id,
          cardType: acc.cardType,
          accountCode: acc.code,
          accountName: acc.name,
          amount,
          direction: d.direction,
          existingDevirId: d.existingDevirId,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);

    if (lines.length === 0) {
      setStatusMsg('En az bir cari seçip tutar girin.');
      return;
    }

    setSaving(true);
    try {
      const result = await createCariDevirBatch({
        date: devirDate,
        batchNotes,
        replaceExisting,
        lines,
      });
      if (result.errors.length > 0) {
        setError(`${result.errors.length} satır kaydedilemedi: ${result.errors[0]?.message}`);
      }
      const parts: string[] = [];
      if (result.created > 0) parts.push(`${result.created} oluşturuldu`);
      if (result.updated > 0) parts.push(`${result.updated} güncellendi`);
      if (result.replaced > 0) parts.push(`${result.replaced} değiştirildi`);
      if (parts.length > 0) {
        setStatusMsg(`Devir kaydı: ${parts.join(', ')}`);
        await loadAccounts();
        setDrafts((prev) => {
          const next = { ...prev };
          for (const id of Object.keys(next)) {
            if (next[id].selected) next[id] = { ...next[id], selected: false };
          }
          return next;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (rec: CariDevirRecord) => {
    const amt = devirAmountFromNet(rec.net_amount);
    setEditError(null);
    setEditForm({
      id: rec.id,
      accountName: rec.customer_name,
      amount: amt > 0 ? formatAmountInput(amt) : '',
      direction: devirDirectionFromNet(rec.net_amount),
      date: rec.date ? rec.date.slice(0, 10) : todayYmd(),
      notes: rec.notes || '',
    });
  };

  const onEditSave = async () => {
    if (!editForm) return;
    const amount = parseAmount(editForm.amount);
    if (amount <= 0) {
      setEditError('Geçerli tutar girin');
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await updateCariDevirRecord(editForm.id, {
        amount,
        direction: editForm.direction,
        date: editForm.date,
        notes: editForm.notes || undefined,
      });
      setEditForm(null);
      await Promise.all([loadRecords(), loadAccounts()]);
      setStatusMsg('Devir fişi güncellendi');
    } catch (e) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditSaving(false);
    }
  };

  const onCancelRecord = (rec: CariDevirRecord) => {
    Alert.alert(
      'Devir iptal',
      `${rec.customer_name} için açılış bakiyesi iptal edilsin mi?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'İptal et',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await cancelCariDevirRecord(rec.id);
                await Promise.all([loadRecords(), loadAccounts()]);
                setStatusMsg('Devir fişi iptal edildi');
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            })();
          },
        },
      ],
    );
  };

  const chip = (active: boolean) => [
    styles.chip,
    {
      backgroundColor: active ? palette.indigo600 : darkMode ? palette.gray700 : palette.gray100,
      borderColor: active ? palette.indigo600 : colors.cardBorder,
    },
  ];

  const chipText = (active: boolean) => [
    styles.chipText,
    { color: active ? palette.white : colors.textMuted },
  ];

  const renderAccount = ({ item }: { item: CariAccountRow }) => {
    const draft = drafts[item.id] || {
      amount: '',
      direction: 'borc' as CariDevirDirection,
      selected: false,
    };
    const isCustomer = item.cardType === 'customer';
    const bal = item.balance || 0;

    return (
      <Pressable
        onPress={() => updateDraft(item.id, { selected: !draft.selected })}
        style={[
          styles.accCard,
          {
            backgroundColor: colors.card,
            borderColor: draft.selected ? palette.indigo600 : colors.cardBorder,
          },
        ]}
      >
        <View style={styles.accTop}>
          <View
            style={[
              styles.check,
              {
                borderColor: draft.selected ? palette.indigo600 : colors.cardBorder,
                backgroundColor: draft.selected ? palette.indigo600 : 'transparent',
              },
            ]}
          >
            {draft.selected ? <Text style={styles.checkMark}>✓</Text> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.accCode, { color: palette.blue600 }]}>
              {item.code || '—'}
            </Text>
            <Text style={[styles.accName, { color: colors.text }]} numberOfLines={1}>
              {item.name}
              {draft.existingDevirId ? (
                <Text style={{ color: palette.indigo600, fontSize: 10 }}> · kayıtlı</Text>
              ) : null}
            </Text>
          </View>
          <View
            style={[
              styles.typeBadge,
              { backgroundColor: isCustomer ? palette.blue100 : '#ffedd5' },
            ]}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: '800',
                color: isCustomer ? palette.blue700 : palette.orange500,
              }}
            >
              {isCustomer ? 'MÜŞTERİ' : 'TEDARİKÇİ'}
            </Text>
          </View>
        </View>

        <Text
          style={[
            styles.balance,
            {
              color:
                bal > 0 ? palette.red600 : bal < 0 ? palette.green600 : colors.textSubtle,
            },
          ]}
        >
          Bakiye: {formatMoney(Math.abs(bal))}
        </Text>

        <View style={styles.dirRow}>
          {(['borc', 'alacak'] as CariDevirDirection[]).map((d) => {
            const on = draft.direction === d;
            return (
              <Pressable
                key={d}
                onPress={() => updateDraft(item.id, { direction: d, selected: true })}
                style={[
                  styles.dirBtn,
                  {
                    backgroundColor: on
                      ? d === 'borc'
                        ? palette.red100
                        : '#d1fae5'
                      : darkMode
                        ? palette.gray700
                        : palette.gray100,
                    borderColor: on
                      ? d === 'borc'
                        ? palette.red500
                        : palette.green500
                      : colors.cardBorder,
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '800',
                    color: on
                      ? d === 'borc'
                        ? palette.red600
                        : palette.green600
                      : colors.textMuted,
                  }}
                >
                  {d === 'borc' ? 'Borç' : 'Alacak'}
                </Text>
              </Pressable>
            );
          })}
          <TextInput
            value={draft.amount}
            onChangeText={(t) =>
              updateDraft(item.id, {
                amount: t.replace(/[^0-9.,]/g, ''),
                selected: true,
              })
            }
            onBlur={() => {
              const n = parseAmount(draft.amount);
              if (n > 0) updateDraft(item.id, { amount: formatAmountInput(n) });
            }}
            placeholder="0,00"
            placeholderTextColor={colors.textSubtle}
            keyboardType="decimal-pad"
            style={[
              styles.amountInput,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.inputBorder,
                color: colors.text,
              },
            ]}
          />
        </View>
      </Pressable>
    );
  };

  const renderRecord = ({ item }: { item: CariDevirRecord }) => {
    const amt = devirAmountFromNet(item.net_amount);
    const dir = devirDirectionFromNet(item.net_amount);
    return (
      <View
        style={[styles.accCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
      >
        <View style={styles.accTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.accCode, { color: palette.blue600 }]}>{item.fiche_no}</Text>
            <Text style={[styles.accName, { color: colors.text }]} numberOfLines={1}>
              {item.customer_name}
            </Text>
            <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
              {formatDate(item.date)} · {dir === 'borc' ? 'Borç' : 'Alacak'}
            </Text>
          </View>
          <Text style={[styles.balance, { color: colors.text, marginTop: 0 }]}>
            {formatMoney(amt)}
          </Text>
        </View>
        <View style={styles.recActions}>
          <Pressable
            onPress={() => openEdit(item)}
            style={[styles.iconBtn, { borderColor: colors.cardBorder }]}
          >
            <Pencil size={16} color={palette.indigo600} />
            <Text style={{ color: palette.indigo600, fontWeight: '700', fontSize: 12 }}>
              Düzenle
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onCancelRecord(item)}
            style={[styles.iconBtn, { borderColor: palette.red100 }]}
          >
            <Trash2 size={16} color={palette.red600} />
            <Text style={{ color: palette.red600, fontWeight: '700', fontSize: 12 }}>İptal</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Cari Devir Fişi"
        subtitle="Açılış bakiyesi / eski program devri"
        right={<ArrowRightLeft size={20} color={palette.white} />}
      />

      <SegmentTabBar
        layout="equal"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'entry' as const, label: 'Giriş / Düzenle' },
          { id: 'records' as const, label: 'Kayıtlı Fişler' },
        ]}
      />

      {error ? <ErrorBanner message={error} onRetry={() => setError(null)} /> : null}
      {statusMsg ? (
        <Text style={[styles.status, { color: palette.green600 }]}>{statusMsg}</Text>
      ) : null}

      {tab === 'entry' ? (
        <>
          <View
            style={[
              styles.formBox,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
          >
            <FormField
              label="Devir tarihi"
              value={devirDate}
              onChangeText={setDevirDate}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
            />
            <FormField
              label="Açıklama"
              value={batchNotes}
              onChangeText={setBatchNotes}
              placeholder="Toplu açıklama"
            />
            <View style={styles.switchRow}>
              <Text style={{ flex: 1, color: colors.text, fontSize: 13 }}>
                Mevcut devir varsa önce iptal et (değiştir)
              </Text>
              <Switch
                value={replaceExisting}
                onValueChange={setReplaceExisting}
                trackColor={{ false: palette.gray300, true: palette.indigo600 }}
              />
            </View>
          </View>

          <View style={styles.filterRow}>
            {(
              [
                { key: 'all' as const, label: 'Tümü' },
                { key: 'customer' as const, label: 'Müşteri' },
                { key: 'supplier' as const, label: 'Tedarikçi' },
              ] as const
            ).map((f) => (
              <Pressable
                key={f.key}
                onPress={() => setTypeFilter(f.key)}
                style={chip(typeFilter === f.key)}
              >
                <Text style={chipText(typeFilter === f.key)}>{f.label}</Text>
              </Pressable>
            ))}
          </View>

          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Cari ara (ad / kod)"
          />

          {loading ? (
            <ActivityIndicator style={{ marginTop: 24 }} color={palette.indigo600} />
          ) : (
            <FlatList
              data={filteredAccounts}
              keyExtractor={(item) => `${item.cardType}-${item.id}`}
              renderItem={renderAccount}
              contentContainerStyle={styles.list}
              refreshControl={
                <RefreshControl
                  refreshing={loading}
                  onRefresh={() => {
                    setLoading(true);
                    void loadAccounts();
                  }}
                  tintColor={palette.indigo600}
                />
              }
              ListEmptyComponent={<EmptyState message="Cari bulunamadı — filtreyi veya aramayı değiştirin" />}
            />
          )}

          <View style={[styles.footer, { borderTopColor: colors.cardBorder }]}>
            <PrimaryButton
              label={`Devir kaydet (${selectedCount})`}
              onPress={() => void onSaveBatch()}
              disabled={saving || selectedCount === 0}
              loading={saving}
            />
          </View>
        </>
      ) : (
        <>
          <SearchBar
            value={recordsSearch}
            onChangeText={setRecordsSearch}
            placeholder="Fiş / cari ara"
          />
          {recordsLoading && records.length === 0 ? (
            <ActivityIndicator style={{ marginTop: 24 }} color={palette.indigo600} />
          ) : (
            <FlatList
              data={filteredRecords}
              keyExtractor={(item) => item.id}
              renderItem={renderRecord}
              contentContainerStyle={styles.list}
              refreshControl={
                <RefreshControl
                  refreshing={recordsLoading}
                  onRefresh={() => void loadRecords()}
                  tintColor={palette.indigo600}
                />
              }
              ListEmptyComponent={
                <EmptyState message="Kayıtlı devir yok — giriş sekmesinden fiş oluşturun" />
              }
            />
          )}
        </>
      )}

      <Modal visible={!!editForm} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditForm(null)} />
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
          >
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalTitle, { color: colors.text }]}>Devir düzenle</Text>
              <Text style={{ color: colors.textMuted, marginBottom: 12 }}>
                {editForm?.accountName}
              </Text>
              {editError ? (
                <Text style={{ color: palette.red600, marginBottom: 8 }}>{editError}</Text>
              ) : null}
              <FormField
                label="Tarih"
                value={editForm?.date || ''}
                onChangeText={(t) => setEditForm((f) => (f ? { ...f, date: t } : f))}
                placeholder="YYYY-MM-DD"
              />
              <View style={styles.dirRow}>
                {(['borc', 'alacak'] as CariDevirDirection[]).map((d) => {
                  const on = editForm?.direction === d;
                  return (
                    <Pressable
                      key={d}
                      onPress={() =>
                        setEditForm((f) => (f ? { ...f, direction: d } : f))
                      }
                      style={[
                        styles.dirBtn,
                        {
                          flex: 1,
                          backgroundColor: on ? palette.indigo600 : colors.inputBg,
                          borderColor: on ? palette.indigo600 : colors.inputBorder,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontWeight: '800',
                          fontSize: 12,
                          color: on ? palette.white : colors.textMuted,
                          textAlign: 'center',
                        }}
                      >
                        {d === 'borc' ? 'Borç' : 'Alacak'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <FormField
                label="Tutar"
                value={editForm?.amount || ''}
                onChangeText={(t) =>
                  setEditForm((f) =>
                    f ? { ...f, amount: t.replace(/[^0-9.,]/g, '') } : f,
                  )
                }
                keyboardType="decimal-pad"
                placeholder="0,00"
              />
              <FormField
                label="Not"
                value={editForm?.notes || ''}
                onChangeText={(t) => setEditForm((f) => (f ? { ...f, notes: t } : f))}
              />
              <PrimaryButton
                label="Kaydet"
                onPress={() => void onEditSave()}
                disabled={editSaving}
                loading={editSaving}
              />
              <Pressable onPress={() => setEditForm(null)} style={{ marginTop: 12 }}>
                <Text style={{ textAlign: 'center', color: colors.textMuted, fontWeight: '600' }}>
                  Kapat
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  formBox: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  list: { padding: 16, paddingBottom: 100, gap: 10 },
  accCard: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  accTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { color: '#fff', fontSize: 12, fontWeight: '900' },
  accCode: { fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
  accName: { fontSize: 14, fontWeight: '700', marginTop: 1 },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  balance: { fontSize: 12, fontWeight: '700', marginTop: 8 },
  dirRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  dirBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  amountInput: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: 'right',
    fontWeight: '700',
    fontSize: 14,
  },
  recActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  iconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  status: {
    marginHorizontal: 16,
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    padding: 20,
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
});
