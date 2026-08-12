/**
 * Cari tahsilat / ödeme basit fiş — web KasaIslemModal (CH_TAHSILAT / CH_ODEME).
 */

import React, { useCallback, useEffect, useState } from 'react';
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
import { Plus, Wallet, HandCoins } from 'lucide-react-native';
import { ScreenHeader, EmptyState, ErrorBanner, SearchBar } from '../components/ScreenChrome';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  createCariCashSlip,
  fetchCashMovements,
  fetchCashRegisters,
  movementTypeLabel,
  type CariCashSlipType,
  type CashMovementRow,
  type CashRegisterRow,
} from '../api/cashApi';
import { fetchCustomers, fetchCustomerById, type CustomerRow } from '../api/customersApi';
import { fetchSuppliers, type SupplierRow } from '../api/suppliersApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'CashCollection'>;

type PartyKind = 'customer' | 'supplier';

type PartyRow = {
  id: string;
  code: string | null;
  name: string;
  balance: number;
  kind: PartyKind;
};

function toPartyFromCustomer(c: CustomerRow): PartyRow {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    balance: Number(c.balance) || 0,
    kind: 'customer',
  };
}

function toPartyFromSupplier(s: SupplierRow): PartyRow {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    balance: Number(s.balance) || 0,
    kind: 'supplier',
  };
}

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

export function CashCollectionScreen({ route }: Props) {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const presetCustomerId = route.params?.customerId;

  const [registers, setRegisters] = useState<CashRegisterRow[]>([]);
  const [slips, setSlips] = useState<CashMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(route.params?.openCreate ?? false);
  const [slipType, setSlipType] = useState<CariCashSlipType>('CH_TAHSILAT');
  const [registerId, setRegisterId] = useState<string | null>(null);
  const [partyKind, setPartyKind] = useState<PartyKind>('customer');
  const [partyId, setPartyId] = useState<string | null>(presetCustomerId ?? null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [txDate, setTxDate] = useState(todayYmd());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [partySearch, setPartySearch] = useState('');
  const [parties, setParties] = useState<PartyRow[]>([]);
  const [partyLoading, setPartyLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [regs, rows] = await Promise.all([
        fetchCashRegisters(),
        fetchCashMovements({ cariOnly: true, limit: 150 }),
      ]);
      setRegisters(regs);
      setSlips(rows);
      setRegisterId((prev) => prev ?? regs[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (route.params?.openCreate) setCreateOpen(true);
  }, [route.params?.openCreate]);

  useEffect(() => {
    if (!presetCustomerId) return;
    let cancelled = false;
    void (async () => {
      const row = await fetchCustomerById(presetCustomerId);
      if (cancelled || !row) return;
      setPartyKind('customer');
      setPartyId(row.id);
      setParties((prev) => {
        const mapped = toPartyFromCustomer(row);
        if (prev.some((c) => c.id === mapped.id)) return prev;
        return [mapped, ...prev];
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [presetCustomerId]);

  useEffect(() => {
    if (!createOpen) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setPartyLoading(true);
      try {
        if (partyKind === 'supplier') {
          const rows = await fetchSuppliers(partySearch, 40);
          if (!cancelled) setParties(rows.map(toPartyFromSupplier));
        } else {
          const rows = await fetchCustomers(partySearch, 40);
          if (!cancelled) {
            setParties((prev) => {
              const mapped = rows.map(toPartyFromCustomer);
              const preset =
                partyKind === 'customer' && presetCustomerId
                  ? prev.find((c) => c.id === presetCustomerId && c.kind === 'customer')
                  : null;
              if (preset && !mapped.some((c) => c.id === preset.id)) {
                return [preset, ...mapped];
              }
              return mapped;
            });
          }
        }
      } catch {
        if (!cancelled) setParties([]);
      } finally {
        if (!cancelled) setPartyLoading(false);
      }
    }, partySearch ? 280 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [createOpen, partySearch, partyKind, presetCustomerId]);

  const visibleSlips = presetCustomerId
    ? slips.filter((s) => s.customer_id === presetCustomerId)
    : slips;

  const openCreate = () => {
    setFormError(null);
    setSlipType('CH_TAHSILAT');
    setAmount('');
    setDescription('');
    setTxDate(todayYmd());
    setPartyKind('customer');
    setPartyId(presetCustomerId ?? null);
    setRegisterId(registers[0]?.id ?? null);
    setPartySearch('');
    setCreateOpen(true);
  };

  const onSave = async () => {
    setFormError(null);
    const amt = Number(String(amount).replace(',', '.'));
    if (!registerId) {
      setFormError('Kasa seçin');
      return;
    }
    if (!partyId) {
      setFormError(partyKind === 'supplier' ? 'Tedarikçi seçin' : 'Cari hesap seçin');
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setFormError('Geçerli tutar girin');
      return;
    }
    setSaving(true);
    try {
      await createCariCashSlip({
        registerId,
        customerId: partyId,
        amount: amt,
        type: slipType,
        date: txDate,
        description,
      });
      setCreateOpen(false);
      setLoading(true);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const selectedParty = parties.find((c) => c.id === partyId && c.kind === partyKind);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Tahsilat / Ödeme"
        subtitle={
          presetCustomerId && selectedParty
            ? selectedParty.name
            : presetCustomerId
              ? `${visibleSlips.length} fiş`
              : `${slips.length} cari fiş`
        }
        right={
          <Pressable onPress={openCreate} style={styles.fabHeader} accessibilityLabel="Yeni fiş">
            <Plus size={22} color={palette.white} />
          </Pressable>
        }
      />

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.green600} />
      ) : (
        <FlatList
          data={visibleSlips}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          contentContainerStyle={visibleSlips.length ? styles.list : styles.listEmpty}
          ListEmptyComponent={
            <EmptyState
              message={
                registers.length
                  ? 'Henüz cari tahsilat/ödeme yok — + ile yeni fiş ekleyin'
                  : 'Aktif kasa kartı yok — önce kasa tanımlayın'
              }
            />
          }
          renderItem={({ item }) => {
            const isTahsilat = String(item.transaction_type || '').toUpperCase() === 'CH_TAHSILAT';
            const amtColor = isTahsilat ? palette.green600 : palette.orange500;
            return (
              <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <View
                  style={[
                    styles.rowIcon,
                    { backgroundColor: isTahsilat ? '#dcfce7' : '#ffedd5' },
                  ]}
                >
                  {isTahsilat ? (
                    <HandCoins size={18} color={palette.green600} />
                  ) : (
                    <Wallet size={18} color={palette.orange500} />
                  )}
                </View>
                <View style={styles.rowBody}>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
                    {movementTypeLabel(item.transaction_type, item.sign)}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {item.customer_name || item.customer_code || 'Cari'}
                    {item.customer_code ? ` · ${item.customer_code}` : ''}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                    {formatDate(item.date)}
                    {item.register_name ? ` · ${item.register_name}` : ''}
                    {item.fiche_no ? ` · ${item.fiche_no}` : ''}
                  </Text>
                </View>
                <Text style={{ color: amtColor, fontWeight: '800', fontSize: 15 }}>
                  {formatMoney(item.amount)}
                </Text>
              </View>
            );
          }}
        />
      )}

      <Modal
        visible={createOpen}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setCreateOpen(false);
          if (presetCustomerId) {
            setPartyKind('customer');
            setPartyId(presetCustomerId);
          }
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              setCreateOpen(false);
              if (presetCustomerId) {
                setPartyKind('customer');
                setPartyId(presetCustomerId);
              }
            }}
          />
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Cari tahsilat / ödeme</Text>

              <View style={styles.dirRow}>
                {(
                  [
                    { id: 'CH_TAHSILAT' as const, label: 'Tahsilat' },
                    { id: 'CH_ODEME' as const, label: 'Ödeme' },
                  ] as const
                ).map((d) => (
                  <Pressable
                    key={d.id}
                    onPress={() => setSlipType(d.id)}
                    style={[
                      styles.dirBtn,
                      {
                        backgroundColor: slipType === d.id ? palette.green600 : colors.inputBg,
                        borderColor: colors.inputBorder,
                      },
                    ]}
                  >
                    <Text style={{ color: slipType === d.id ? palette.white : colors.text, fontWeight: '700' }}>
                      {d.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Kasa</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {registers.map((r) => {
                  const active = registerId === r.id;
                  const label = `${r.code || ''} ${r.name}`.trim();
                  return (
                    <Pressable
                      key={r.id}
                      onPress={() => setRegisterId(r.id)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: active ? palette.green600 : colors.inputBg,
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

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Cari türü</Text>
              <View style={styles.dirRow}>
                {(
                  [
                    { id: 'customer' as const, label: 'Müşteri' },
                    { id: 'supplier' as const, label: 'Tedarikçi' },
                  ] as const
                ).map((d) => (
                  <Pressable
                    key={d.id}
                    onPress={() => {
                      if (partyKind === d.id) return;
                      setPartyKind(d.id);
                      setPartyId(null);
                      setPartySearch('');
                      setParties([]);
                    }}
                    style={[
                      styles.dirBtn,
                      {
                        backgroundColor: partyKind === d.id ? palette.blue600 : colors.inputBg,
                        borderColor: colors.inputBorder,
                      },
                    ]}
                  >
                    <Text style={{ color: partyKind === d.id ? palette.white : colors.text, fontWeight: '700' }}>
                      {d.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
                {partyKind === 'supplier' ? 'Tedarikçi' : 'Müşteri'}
              </Text>
              {selectedParty ? (
                <Pressable
                  onPress={() => setPartyId(null)}
                  style={[styles.selectedCari, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}
                >
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{selectedParty.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    {selectedParty.code || '—'} · Bakiye: {formatMoney(selectedParty.balance)}
                    {partyKind === 'supplier' ? ' · Tedarikçi' : ''}
                  </Text>
                  <Text style={{ color: palette.blue600, fontSize: 11, marginTop: 4 }}>Değiştirmek için dokunun</Text>
                </Pressable>
              ) : (
                <>
                  <SearchBar
                    value={partySearch}
                    onChangeText={setPartySearch}
                    placeholder={partyKind === 'supplier' ? 'Tedarikçi ara…' : 'Müşteri ara…'}
                  />
                  {partyLoading ? (
                    <ActivityIndicator style={{ marginVertical: 12 }} color={palette.green600} />
                  ) : (
                    <View style={styles.cariList}>
                      {parties.slice(0, 8).map((c) => (
                        <Pressable
                          key={`${c.kind}-${c.id}`}
                          onPress={() => setPartyId(c.id)}
                          style={[styles.cariItem, { borderColor: colors.cardBorder }]}
                        >
                          <Text style={{ color: colors.text, fontWeight: '600' }}>{c.name}</Text>
                          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                            {c.code || '—'} · {formatMoney(c.balance)}
                          </Text>
                        </Pressable>
                      ))}
                      {parties.length === 0 ? (
                        <Text style={{ color: colors.textMuted, fontSize: 12, padding: 8 }}>
                          {partyKind === 'supplier' ? 'Tedarikçi bulunamadı' : 'Müşteri bulunamadı'}
                        </Text>
                      ) : null}
                    </View>
                  )}
                </>
              )}

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
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
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
    backgroundColor: palette.green600,
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
    maxHeight: '92%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 14 },
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
    marginTop: 8,
    paddingHorizontal: 4,
  },
  chips: { gap: 8, alignItems: 'center', paddingBottom: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  selectedCari: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  cariList: { gap: 6, marginBottom: 8 },
  cariItem: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  formErr: { color: palette.red500, fontSize: 13, marginTop: 8 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
