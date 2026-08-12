/**
 * Kasa / banka — hareket listesi + basit giriş/çıkış.
 * Web: kasa.ts / banka.ts (BankRegisterManagement, CashRegisterManagement).
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Plus, ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { SegmentTabBar } from '../components/SegmentTabBar';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  fetchCashRegisters,
  fetchBankRegisters,
  fetchCashMovements,
  fetchBankMovements,
  createSimpleCashMovement,
  createSimpleBankMovement,
  createCashVirman,
  createBankVirman,
  createCashBankBridge,
  movementTypeLabel,
  type CashRegisterRow,
  type BankRegisterRow,
  type CashMovementRow,
  type BankMovementRow,
} from '../api/cashApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Kind = 'cash' | 'bank';
type TxFormMode = 'in' | 'out' | 'virman' | 'havale' | 'bank_deposit' | 'bank_withdraw';
type Props = NativeStackScreenProps<MainStackParamList, 'Finance'>;

function todayYmd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDate(raw: string | null): string {
  if (!raw) return '—';
  const s = String(raw).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const [y, m, d] = s.split('-');
  return `${d}.${m}.${y}`;
}

export function financeRouteKind(screenId?: string): Kind {
  switch (screenId) {
    case 'banks':
    case 'bank-accounts':
    case 'bank-vouchers':
    case 'financereports-bank':
      return 'bank';
    default:
      return 'cash';
  }
}

export function FinanceScreen({ route }: Props) {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const initialKind = route.params?.initialTab ?? financeRouteKind(route.params?.screenId);
  const [kind, setKind] = useState<Kind>(initialKind);
  const [cashRegs, setCashRegs] = useState<CashRegisterRow[]>([]);
  const [bankRegs, setBankRegs] = useState<BankRegisterRow[]>([]);
  const [cashMovs, setCashMovs] = useState<CashMovementRow[]>([]);
  const [bankMovs, setBankMovs] = useState<BankMovementRow[]>([]);
  const [selectedRegisterId, setSelectedRegisterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(route.params?.openCreate ?? false);
  const [formMode, setFormMode] = useState<TxFormMode>(route.params?.formMode ?? 'in');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [txDate, setTxDate] = useState(todayYmd());
  const [formRegisterId, setFormRegisterId] = useState<string | null>(null);
  const [targetRegisterId, setTargetRegisterId] = useState<string | null>(null);
  const [bankRegisterId, setBankRegisterId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const registers = kind === 'cash' ? cashRegs : bankRegs;
  const movements = kind === 'cash' ? cashMovs : bankMovs;

  const totalBalance = useMemo(
    () => registers.reduce((s, r) => s + (Number(r.balance) || 0), 0),
    [registers],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cr, br, cm, bm] = await Promise.all([
        fetchCashRegisters(),
        fetchBankRegisters(),
        fetchCashMovements({ registerId: kind === 'cash' ? selectedRegisterId : null }),
        fetchBankMovements({ registerId: kind === 'bank' ? selectedRegisterId : null }),
      ]);
      setCashRegs(cr);
      setBankRegs(br);
      setCashMovs(cm);
      setBankMovs(bm);
      setFormRegisterId((prev) => {
        if (prev) return prev;
        const list = kind === 'cash' ? cr : br;
        return list[0]?.id ?? null;
      });
      setTargetRegisterId((prev) => prev ?? cr[1]?.id ?? cr[0]?.id ?? null);
      setBankRegisterId((prev) => prev ?? br[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [kind, selectedRegisterId, orgEpoch]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (route.params?.initialTab) setKind(route.params.initialTab);
  }, [route.params?.initialTab]);

  useEffect(() => {
    if (route.params?.openCreate) setCreateOpen(true);
  }, [route.params?.openCreate]);

  useEffect(() => {
    if (route.params?.formMode) setFormMode(route.params.formMode);
  }, [route.params?.formMode]);

  const onKindChange = (k: Kind) => {
    setKind(k);
    setSelectedRegisterId(null);
    const list = k === 'cash' ? cashRegs : bankRegs;
    setFormRegisterId(list[0]?.id ?? null);
  };

  const openCreate = () => {
    setFormError(null);
    setFormMode('in');
    setAmount('');
    setDescription('');
    setTxDate(todayYmd());
    const list = kind === 'cash' ? cashRegs : bankRegs;
    const selectedId = selectedRegisterId ?? list[0]?.id ?? null;
    setFormRegisterId(selectedId);
    if (kind === 'cash') {
      setTargetRegisterId(
        cashRegs.find((r) => r.id !== selectedId)?.id ?? cashRegs[1]?.id ?? null,
      );
    } else {
      setTargetRegisterId(
        bankRegs.find((r) => r.id !== selectedId)?.id ?? bankRegs[1]?.id ?? null,
      );
    }
    setBankRegisterId(bankRegs[0]?.id ?? null);
    setCreateOpen(true);
  };

  const onSave = async () => {
    setFormError(null);
    const amt = Number(String(amount).replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) {
      setFormError('Geçerli tutar girin');
      return;
    }
    setSaving(true);
    try {
      if (formMode === 'virman' && kind === 'bank') {
        if (!formRegisterId) {
          setFormError('Kaynak banka seçin');
          return;
        }
        if (!targetRegisterId) {
          setFormError('Hedef banka seçin');
          return;
        }
        await createBankVirman({
          sourceRegisterId: formRegisterId,
          targetRegisterId,
          amount: amt,
          date: txDate,
          description,
        });
      } else if (formMode === 'virman') {
        if (!formRegisterId) {
          setFormError('Kaynak kasa seçin');
          return;
        }
        if (!targetRegisterId) {
          setFormError('Hedef kasa seçin');
          return;
        }
        await createCashVirman({
          sourceRegisterId: formRegisterId,
          targetRegisterId,
          amount: amt,
          date: txDate,
          description,
        });
      } else if (formMode === 'havale') {
        if (!formRegisterId) {
          setFormError('Banka hesabı seçin');
          return;
        }
        await createSimpleBankMovement({
          registerId: formRegisterId,
          amount: amt,
          direction: 'out',
          transactionType: 'HAVALE',
          date: txDate,
          description,
        });
      } else if (formMode === 'bank_deposit' || formMode === 'bank_withdraw') {
        if (!formRegisterId) {
          setFormError('Kasa seçin');
          return;
        }
        if (!bankRegisterId) {
          setFormError('Banka hesabı seçin');
          return;
        }
        await createCashBankBridge({
          type: formMode === 'bank_deposit' ? 'BANKA_YATIRILAN' : 'BANKADAN_CEKILEN',
          cashRegisterId: formRegisterId,
          bankRegisterId,
          amount: amt,
          date: txDate,
          description,
        });
      } else if (kind === 'cash') {
        if (!formRegisterId) {
          setFormError('Kasa seçin');
          return;
        }
        await createSimpleCashMovement({
          registerId: formRegisterId,
          amount: amt,
          direction: formMode === 'out' ? 'out' : 'in',
          date: txDate,
          description,
        });
      } else {
        if (!formRegisterId) {
          setFormError('Banka hesabı seçin');
          return;
        }
        await createSimpleBankMovement({
          registerId: formRegisterId,
          amount: amt,
          direction: formMode === 'out' ? 'out' : 'in',
          date: txDate,
          description,
        });
      }
      setCreateOpen(false);
      setLoading(true);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const registerLabel = (id: string | null) => {
    if (!id) return 'Tümü';
    if (kind === 'cash') {
      const r = cashRegs.find((x) => x.id === id);
      return r ? `${r.code || ''} ${r.name}`.trim() : id.slice(0, 8);
    }
    const r = bankRegs.find((x) => x.id === id);
    return r ? `${r.code || ''} ${r.bank_name || r.name || ''}`.trim() : id.slice(0, 8);
  };

  const title = kind === 'cash' ? 'Kasa işlemleri' : 'Banka işlemleri';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={title}
        subtitle={`Toplam bakiye: ${formatMoney(totalBalance)}`}
        right={
          <Pressable onPress={openCreate} style={styles.fabHeader} accessibilityLabel="Yeni hareket">
            <Plus size={22} color={palette.white} />
          </Pressable>
        }
      />

      <SegmentTabBar
        layout="equal"
        value={kind}
        onChange={onKindChange}
        items={[
          { id: 'cash' as const, label: 'Kasa' },
          { id: 'bank' as const, label: 'Banka' },
        ]}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.hScrollShell}
        contentContainerStyle={styles.chips}
      >
        <Pressable
          onPress={() => setSelectedRegisterId(null)}
          style={[
            styles.chip,
            {
              backgroundColor: !selectedRegisterId ? palette.blue600 : colors.card,
              borderColor: colors.cardBorder,
            },
          ]}
        >
          <Text style={{ color: !selectedRegisterId ? palette.white : colors.textMuted, fontSize: 11, fontWeight: '700' }}>
            Tümü
          </Text>
        </Pressable>
        {registers.map((r) => {
          const id = r.id;
          const label =
            kind === 'cash'
              ? `${(r as CashRegisterRow).code || ''} ${(r as CashRegisterRow).name}`.trim()
              : `${(r as BankRegisterRow).code || ''} ${(r as BankRegisterRow).bank_name || (r as BankRegisterRow).name || ''}`.trim();
          const active = selectedRegisterId === id;
          return (
            <Pressable
              key={id}
              onPress={() => setSelectedRegisterId(id)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? palette.blue600 : colors.card,
                  borderColor: colors.cardBorder,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={{ color: active ? palette.white : colors.textMuted, fontSize: 11, fontWeight: '700', maxWidth: 140 }}
              >
                {label || '—'}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.orange500} />
      ) : (
        <FlatList
          data={movements}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          contentContainerStyle={movements.length ? styles.list : styles.listEmpty}
          ListHeaderComponent={
            registers.length ? (
              <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  {selectedRegisterId ? registerLabel(selectedRegisterId) : `${registers.length} hesap`}
                </Text>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 4 }}>
                  {formatMoney(
                    selectedRegisterId
                      ? Number(registers.find((r) => r.id === selectedRegisterId)?.balance) || 0
                      : totalBalance,
                  )}
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              message={
                registers.length
                  ? 'Bu hesapta hareket yok — + ile giriş/çıkış ekleyin'
                  : kind === 'cash'
                    ? 'Aktif kasa kartı yok'
                    : 'Aktif banka hesabı yok'
              }
            />
          }
          renderItem={({ item }) => {
            const isIn = item.sign > 0;
            const amtColor = isIn ? palette.green600 : palette.red500;
            return (
              <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <View style={[styles.rowIcon, { backgroundColor: isIn ? '#dcfce7' : '#fee2e2' }]}>
                  {isIn ? (
                    <ArrowDownLeft size={18} color={palette.green600} />
                  ) : (
                    <ArrowUpRight size={18} color={palette.red500} />
                  )}
                </View>
                <View style={styles.rowBody}>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
                    {movementTypeLabel(item.transaction_type, item.sign)}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {item.definition || item.fiche_no || '—'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    {formatDate(item.date)}
                    {item.register_name ? ` · ${item.register_name}` : ''}
                  </Text>
                </View>
                <Text style={{ color: amtColor, fontWeight: '800', fontSize: 15 }}>
                  {isIn ? '+' : '−'}
                  {formatMoney(item.amount)}
                </Text>
              </View>
            );
          }}
        />
      )}

      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setCreateOpen(false)} />
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {kind === 'cash' ? 'Kasa hareketi' : 'Banka hareketi'}
            </Text>

            {kind === 'cash' ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeRow}>
                {(
                  [
                    { id: 'in' as const, label: 'Giriş' },
                    { id: 'out' as const, label: 'Çıkış' },
                    { id: 'virman' as const, label: 'Virman' },
                    { id: 'bank_deposit' as const, label: 'Bankaya' },
                    { id: 'bank_withdraw' as const, label: 'Bankadan' },
                  ] as const
                ).map((m) => (
                  <Pressable
                    key={m.id}
                    onPress={() => setFormMode(m.id)}
                    style={[
                      styles.modeChip,
                      {
                        backgroundColor: formMode === m.id ? palette.orange500 : colors.inputBg,
                        borderColor: colors.inputBorder,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: formMode === m.id ? palette.white : colors.text,
                        fontWeight: '700',
                        fontSize: 11,
                      }}
                    >
                      {m.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeRow}>
                {(
                  [
                    { id: 'in' as const, label: 'Giriş' },
                    { id: 'out' as const, label: 'Çıkış' },
                    { id: 'virman' as const, label: 'Virman' },
                    { id: 'havale' as const, label: 'Havale' },
                  ] as const
                ).map((m) => (
                  <Pressable
                    key={m.id}
                    onPress={() => {
                      setFormMode(m.id);
                      if (m.id === 'virman') {
                        const src = formRegisterId ?? bankRegs[0]?.id ?? null;
                        setTargetRegisterId(
                          bankRegs.find((r) => r.id !== src)?.id ?? bankRegs[1]?.id ?? null,
                        );
                      }
                    }}
                    style={[
                      styles.modeChip,
                      {
                        backgroundColor: formMode === m.id ? palette.orange500 : colors.inputBg,
                        borderColor: colors.inputBorder,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: formMode === m.id ? palette.white : colors.text,
                        fontWeight: '700',
                        fontSize: 11,
                      }}
                    >
                      {m.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
              {formMode === 'virman'
                ? kind === 'bank'
                  ? 'Kaynak banka'
                  : 'Kaynak kasa'
                : formMode === 'bank_deposit' || formMode === 'bank_withdraw'
                  ? 'Kasa'
                  : kind === 'cash'
                    ? 'Kasa'
                    : 'Banka hesabı'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {(kind === 'cash' || formMode === 'bank_deposit' || formMode === 'bank_withdraw'
                ? cashRegs
                : bankRegs
              ).map((r) => {
                const active = formRegisterId === r.id;
                const label =
                  'bank_name' in r
                    ? `${r.code || ''} ${r.bank_name || r.name || ''}`.trim()
                    : `${(r as CashRegisterRow).code || ''} ${(r as CashRegisterRow).name}`.trim();
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => setFormRegisterId(r.id)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? palette.orange500 : colors.inputBg,
                        borderColor: colors.inputBorder,
                      },
                    ]}
                  >
                    <Text style={{ color: active ? palette.white : colors.text, fontSize: 11, fontWeight: '700' }}>
                      {label || '—'}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {formMode === 'virman' ? (
              <>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
                  {kind === 'bank' ? 'Hedef banka' : 'Hedef kasa'}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  {(kind === 'bank' ? bankRegs : cashRegs)
                    .filter((r) => r.id !== formRegisterId)
                    .map((r) => {
                      const active = targetRegisterId === r.id;
                      const label =
                        'bank_name' in r
                          ? `${r.code || ''} ${r.bank_name || r.name || ''}`.trim()
                          : `${(r as CashRegisterRow).code || ''} ${(r as CashRegisterRow).name}`.trim();
                      return (
                        <Pressable
                          key={r.id}
                          onPress={() => setTargetRegisterId(r.id)}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: active ? palette.blue600 : colors.inputBg,
                              borderColor: colors.inputBorder,
                            },
                          ]}
                        >
                          <Text
                            style={{ color: active ? palette.white : colors.text, fontSize: 11, fontWeight: '700' }}
                          >
                            {label || '—'}
                          </Text>
                        </Pressable>
                      );
                    })}
                </ScrollView>
              </>
            ) : null}

            {formMode === 'bank_deposit' || formMode === 'bank_withdraw' ? (
              <>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Banka hesabı</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  {bankRegs.map((r) => {
                    const active = bankRegisterId === r.id;
                    const label = `${r.code || ''} ${r.bank_name || r.name || ''}`.trim();
                    return (
                      <Pressable
                        key={r.id}
                        onPress={() => setBankRegisterId(r.id)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: active ? palette.blue600 : colors.inputBg,
                            borderColor: colors.inputBorder,
                          },
                        ]}
                      >
                        <Text
                          style={{ color: active ? palette.white : colors.text, fontSize: 11, fontWeight: '700' }}
                        >
                          {label || '—'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}

            <FormField label="Tutar" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" />
            <FormField label="Tarih (YYYY-MM-DD)" value={txDate} onChangeText={setTxDate} placeholder={todayYmd()} />
            <FormField
              label="Açıklama"
              value={description}
              onChangeText={setDescription}
              placeholder="İsteğe bağlı"
              multiline
            />

            {formError ? <Text style={styles.formErr}>{formError}</Text> : null}

            <View style={styles.modalActions}>
              <PrimaryButton label="İptal" variant="ghost" onPress={() => setCreateOpen(false)} />
              <PrimaryButton label={saving ? 'Kaydediliyor…' : 'Kaydet'} onPress={() => void onSave()} disabled={saving} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hScrollShell: { flexGrow: 0, flexShrink: 0 },
  chips: { paddingHorizontal: 12, paddingBottom: 8, gap: 8, alignItems: 'center' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  summary: {
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  listEmpty: { flexGrow: 1, paddingHorizontal: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 10,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, minWidth: 0 },
  fabHeader: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.orange500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 28,
    maxHeight: '88%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 14 },
  modeRow: { gap: 8, paddingBottom: 12 },
  modeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  dirRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  dirBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  formErr: { color: palette.red500, fontSize: 13, marginTop: 8 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
