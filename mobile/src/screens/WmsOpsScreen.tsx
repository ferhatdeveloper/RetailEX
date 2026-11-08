import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  addDispatchLine,
  addReceivingLine,
  applyAdjustment,
  completePutaway,
  createAdjustment,
  createBin,
  createDispatchSlip,
  createPackingSlip,
  createPutawayFromReceiving,
  createReceivingSlip,
  fetchAdjustments,
  fetchBins,
  fetchDispatchSlips,
  fetchPackingSlips,
  fetchPutawayTasks,
  fetchReceivingSlips,
  setDispatchStatus,
  setPackingStatus,
  setReceivingStatus,
  type AdjustmentRow,
  type PackingRow,
  type PutawayRow,
  type WmsBinRow,
  type WmsSlip,
} from '../api/wmsOpsApi';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import type { WmsOpsKind } from '../navigation/opsKinds';
import type { MainStackParamList } from '../navigation/types';
import { useScreenFieldAllowed } from '../hooks/useScreenFieldGate';

type Props = NativeStackScreenProps<MainStackParamList, 'WmsOps'>;

const TITLES: Record<WmsOpsKind, string> = {
  receiving: 'Mal kabul',
  dispatch: 'Sevkiyat',
  bins: 'Lokasyon',
  putaway: 'Yerleştirme',
  packing: 'Paketleme',
  adjustment: 'Fire / düzeltme',
};

export function WmsOpsScreen({ route }: Props) {
  const kind = route.params.kind;
  const fieldId =
    kind === 'bins' ? 'bin' : kind === 'receiving' ? 'receiving' : kind === 'dispatch' ? 'dispatch' : 'warehouse';
  const opsAllowed = useScreenFieldAllowed(fieldId);
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const [rows, setRows] = useState<Array<WmsSlip | WmsBinRow | PutawayRow | PackingRow | AdjustmentRow>>([]);
  const [bins, setBins] = useState<WmsBinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [party, setParty] = useState('');
  const [qty, setQty] = useState('1');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (kind === 'receiving') setRows(await fetchReceivingSlips());
      else if (kind === 'dispatch') setRows(await fetchDispatchSlips());
      else if (kind === 'bins') setRows(await fetchBins());
      else if (kind === 'putaway') {
        const [tasks, binRows] = await Promise.all([fetchPutawayTasks(), fetchBins()]);
        setRows(tasks);
        setBins(binRows);
      } else if (kind === 'packing') setRows(await fetchPackingSlips());
      else setRows(await fetchAdjustments());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const onCreate = async () => {
    if (kind !== 'packing' && !party.trim()) {
      Alert.alert(t('ops.needName', { defaultValue: 'Ad gerekli' }));
      return;
    }
    setBusy(true);
    try {
      if (kind === 'receiving') await createReceivingSlip(party.trim());
      else if (kind === 'dispatch') await createDispatchSlip(party.trim());
      else if (kind === 'bins') await createBin(party.trim());
      else if (kind === 'putaway') await createPutawayFromReceiving(party.trim());
      else if (kind === 'packing') await createPackingSlip();
      else await createAdjustment(party.trim(), Number(qty.replace(',', '.')), t('ops.fireReason', { defaultValue: 'Fire' }));
      setParty('');
      await load();
    } catch (e) {
      Alert.alert(t('ops.saveFail', { defaultValue: 'Kayıt hatası' }), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onRow = async (item: WmsSlip | WmsBinRow | PutawayRow | PackingRow | AdjustmentRow) => {
    setBusy(true);
    try {
      if (kind === 'receiving' && 'slip_no' in item) {
        if (party.trim()) await addReceivingLine(item.id, party.trim(), Number(qty) || 1);
        else await setReceivingStatus(item.id, item.status === 'draft' ? 'received' : 'draft');
      } else if (kind === 'dispatch' && 'slip_no' in item) {
        if (party.trim()) await addDispatchLine(item.id, party.trim(), Number(qty) || 1);
        else await setDispatchStatus(item.id, item.status === 'draft' ? 'shipped' : 'draft');
      } else if (kind === 'putaway' && 'qty' in item) {
        const bin = bins[0];
        if (!bin) throw new Error(t('ops.needBin', { defaultValue: 'Önce lokasyon tanımlayın' }));
        if (item.status !== 'done') await completePutaway(item, bin.id);
      } else if (kind === 'packing' && 'pack_no' in item) {
        await setPackingStatus(item.id, item.status === 'open' ? 'packed' : 'open');
      } else if (kind === 'adjustment' && 'adj_no' in item && item.status !== 'applied') {
        await applyAdjustment(item.id);
      }
      setParty('');
      await load();
    } catch (e) {
      Alert.alert(t('ops.saveFail', { defaultValue: 'Kayıt hatası' }), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const title = t(`ops.wms.${kind}`, { defaultValue: TITLES[kind] });
  const placeholder =
    kind === 'putaway'
      ? t('ops.slipIdPh', { defaultValue: 'Kabul fiş kimliği' })
      : kind === 'bins'
        ? t('ops.binCodePh', { defaultValue: 'Lokasyon kodu' })
        : kind === 'adjustment'
          ? t('ops.productPh', { defaultValue: 'Ürün adı' })
          : t('ops.partyPh', { defaultValue: 'Taraf / satır adı' });

  if (!opsAllowed) {
    return <View style={[styles.root, { backgroundColor: colors.background }]} />;
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={title} subtitle={t('ops.wmsHint', { defaultValue: 'Web depo fişleriyle aynı kayıt' })} />
      {kind !== 'packing' ? (
        <View style={styles.form}>
          <TextInput
            value={party}
            onChangeText={setParty}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, borderColor: colors.cardBorder, backgroundColor: colors.card }]}
          />
          {kind === 'receiving' || kind === 'dispatch' || kind === 'adjustment' ? (
            <TextInput
              value={qty}
              onChangeText={setQty}
              keyboardType="decimal-pad"
              placeholder={t('ops.qty', { defaultValue: 'Miktar' })}
              placeholderTextColor={colors.textMuted}
              style={[styles.qty, { color: colors.text, borderColor: colors.cardBorder, backgroundColor: colors.card }]}
            />
          ) : null}
        </View>
      ) : null}
      <PrimaryButton
        label={busy ? t('loading', { defaultValue: '…' }) : t('save', { defaultValue: 'Kaydet' })}
        onPress={() => void onCreate()}
        disabled={busy}
      />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<EmptyState message={t('ops.empty', { defaultValue: 'Kayıt yok' })} />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const titleText =
              'slip_no' in item
                ? `${item.slip_no} · ${item.party || '—'}`
                : 'code' in item
                  ? item.code
                  : 'pack_no' in item
                    ? item.pack_no
                    : 'adj_no' in item
                      ? item.adj_no
                      : item.product_name || item.id;
            const sub =
              'status' in item
                ? `${item.status}${'qty' in item ? ` · ${item.qty}` : ''}`
                : 'zone' in item
                  ? item.zone || item.bin_type || ''
                  : '';
            return (
              <Pressable
                onPress={() => void onRow(item)}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>{titleText}</Text>
                {sub ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>{sub}</Text> : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  form: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  qty: { width: 72, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 10 },
  list: { padding: 12, gap: 8, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
});
