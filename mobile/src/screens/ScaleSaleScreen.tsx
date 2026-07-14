import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Scale, RefreshCw } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ScreenHeader, SearchBar, EmptyState } from '../components/ScreenChrome';
import { PrimaryButton } from '../components/PrimaryButton';
import { useThemeStore } from '../store/themeStore';
import { useScaleStore } from '../store/scaleStore';
import {
  createScaleTransport,
  getSimulateTransport,
  isBleNativeAvailable,
  isSppNativeAvailable,
} from '../services/scale/scaleTransport';
import {
  searchWeighableProducts,
  type ScaleProductRow,
} from '../api/scaleProductsApi';
import { savePosSale } from '../api/posApi';
import { formatMoney } from '../api/erpTables';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'ScaleSale'>;

type WeighLine = {
  productId: string;
  name: string;
  pricePerKg: number;
  weightKg: number;
  unit: string;
  code: string | null;
  vatRate: number;
};

export function ScaleSaleScreen(_props: Props) {
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const settings = useScaleStore((s) => s.settings);
  const devices = useScaleStore((s) => s.devices);
  const getSelectedDevice = useScaleStore((s) => s.getSelectedDevice);
  const pushLog = useScaleStore((s) => s.pushLog);

  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<ScaleProductRow[]>([]);
  const [selected, setSelected] = useState<ScaleProductRow | null>(null);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [stable, setStable] = useState(false);
  const [weightDetail, setWeightDetail] = useState('');
  const [cart, setCart] = useState<WeighLine[]>([]);
  const [searching, setSearching] = useState(false);
  const [reading, setReading] = useState(false);
  const selectedDevice = useMemo(() => getSelectedDevice(), [devices, settings.lastSelectedDeviceId]);
  const bleNative = isBleNativeAvailable();
  const sppNative = isSppNativeAvailable();
  const weighSourceHint = useMemo(() => {
    if (settings.preferSimulateWeigh) return t('scaleUi.weighSourceSim');
    if (!selectedDevice) return t('scaleUi.weighSourceNoDevice');
    if (selectedDevice.transport === 'bluetooth') {
      if (selectedDevice.bluetoothProfile === 'spp') {
        return sppNative
          ? t('scaleUi.weighSourceSpp', { addr: selectedDevice.bluetoothAddress ?? '' })
          : t('scaleUi.weighSourceBleMissing');
      }
      return bleNative
        ? t('scaleUi.weighSourceBle', { addr: selectedDevice.bluetoothAddress ?? '' })
        : t('scaleUi.weighSourceBleMissing');
    }
    if (selectedDevice.transport === 'network') return t('scaleUi.weighSourceTcp');
    return t('scaleUi.weighSourceSimDefault');
  }, [bleNative, sppNative, selectedDevice, settings.preferSimulateWeigh, t]);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCart([]);
    setHits([]);
    setSelected(null);
    setWeightKg(null);
    setSearch('');
  }, [orgEpoch]);

  const lineTotal = useMemo(() => {
    if (!selected || weightKg == null) return 0;
    return (Number(selected.price) || 0) * weightKg;
  }, [selected, weightKg]);

  const cartTotal = useMemo(
    () => cart.reduce((s, l) => s + l.pricePerKg * l.weightKg, 0),
    [cart],
  );

  const runSearch = useCallback(async (q: string) => {
    setSearch(q);
    if (q.trim().length < 1) {
      setHits([]);
      return;
    }
    setSearching(true);
    try {
      setHits(await searchWeighableProducts(q, 30));
    } catch (e) {
      Alert.alert('Arama', e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  }, []);

  const readWeight = useCallback(async () => {
    setReading(true);
    try {
      const device = getSelectedDevice();
      const bleOk = isBleNativeAvailable();
      const sppOk = isSppNativeAvailable();
      const btOk =
        device?.bluetoothProfile === 'spp' ? sppOk : bleOk;
      const useSim =
        settings.preferSimulateWeigh ||
        !device ||
        device.transport === 'simulate' ||
        (device.transport === 'bluetooth' && !btOk);

      if (useSim) {
        const sim = getSimulateTransport();
        await sim.connect();
        const w = await sim.readLiveWeight();
        setWeightKg(w.weightKg);
        setStable(w.stable);
        setWeightDetail(
          device?.transport === 'bluetooth' && !btOk
            ? `${w.detail} · BT native yok (simüle)`
            : w.detail,
        );
        pushLog(`Tartım (sim): ${w.weightKg?.toFixed(3)} kg`);
        return;
      }

      const transport = createScaleTransport(device);
      await transport.connect();
      const w = await transport.readLiveWeight();
      if (w.weightKg == null && device.transport === 'network') {
        const sim = getSimulateTransport();
        await sim.connect();
        const sw = await sim.readLiveWeight();
        setWeightKg(sw.weightKg);
        setStable(sw.stable);
        setWeightDetail(`${w.detail} · simüle yedek: ${sw.weightKg?.toFixed(3)} kg`);
        pushLog(`Tartım yedek sim: ${sw.weightKg?.toFixed(3)} kg`);
        return;
      }
      setWeightKg(w.weightKg);
      setStable(w.stable);
      setWeightDetail(w.detail);
      pushLog(
        `Tartım (${device.transport}): ${w.weightKg != null ? w.weightKg.toFixed(3) : 'null'} kg`,
      );
    } catch (e) {
      Alert.alert(t('scaleUi.alertTitle'), e instanceof Error ? e.message : String(e));
    } finally {
      setReading(false);
    }
  }, [getSelectedDevice, pushLog, settings.preferSimulateWeigh, t]);

  // BLE/SPP seçiliyse (ve simüle tercih kapalıysa) canlı kg poll
  useEffect(() => {
    const device = getSelectedDevice();
    const btNative =
      device?.bluetoothProfile === 'spp'
        ? isSppNativeAvailable()
        : isBleNativeAvailable();
    if (
      settings.preferSimulateWeigh ||
      !device ||
      device.transport !== 'bluetooth' ||
      !btNative
    ) {
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const transport = createScaleTransport(device);
        const w = await transport.readLiveWeight();
        if (cancelled) return;
        if (w.weightKg != null) {
          setWeightKg(w.weightKg);
          setStable(w.stable);
          setWeightDetail(w.detail);
        } else {
          setWeightDetail(w.detail);
        }
      } catch {
        /* poll sessiz */
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 450);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [
    devices,
    getSelectedDevice,
    settings.preferSimulateWeigh,
    settings.lastSelectedDeviceId,
  ]);

  const addToCart = () => {
    if (!selected || weightKg == null || weightKg <= 0) {
      Alert.alert('Tartılı satış', 'Ürün seçin ve tartımı okuyun.');
      return;
    }
    setCart((prev) => [
      ...prev,
      {
        productId: String(selected.id),
        name: selected.name,
        pricePerKg: Number(selected.price) || 0,
        weightKg,
        unit: selected.unit || 'KG',
        code: selected.code,
        vatRate:
          Number.isFinite(selected.vat_rate) && selected.vat_rate >= 0
            ? Number(selected.vat_rate)
            : 20,
      },
    ]);
    setSelected(null);
    setWeightKg(null);
    setSearch('');
    setHits([]);
  };

  const checkout = () => {
    if (cart.length === 0 || saving) return;
    Alert.alert(
      'Ödeme',
      `Nakit — toplam ${formatMoney(cartTotal)} ₺ kaydedilsin mi?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kaydet',
          onPress: () => {
            void (async () => {
              setSaving(true);
              try {
                const posLines = cart.map((l) => ({
                  productId: l.productId,
                  name: l.name,
                  price: l.pricePerKg,
                  qty: l.weightKg,
                  unit: l.unit || null,
                  code: l.code,
                  vatRate: l.vatRate,
                }));
                const res = await savePosSale(posLines, 'Nakit');
                setCart([]);
                Alert.alert(
                  res.queued ? 'Fiş kuyruğa alındı' : 'Fiş kaydedildi',
                  `${res.ficheNo}\nToplam: ${formatMoney(res.total)} ₺`,
                );
              } catch (e) {
                Alert.alert('Kayıt hatası', e instanceof Error ? e.message : String(e));
              } finally {
                setSaving(false);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={t('scaleUi.saleTitle')}
        subtitle="PLU / kg ürün · tartım → sepet"
      />

      <View
        style={[
          styles.weightCard,
          { backgroundColor: colors.card, borderColor: colors.cardBorder },
        ]}
      >
        <View style={styles.weightHead}>
          <Scale size={22} color={palette.amber600} />
          <Text style={{ color: colors.text, fontWeight: '800', flex: 1 }}>Canlı tartım</Text>
          <Pressable
            onPress={() => void readWeight()}
            style={[styles.iconBtn, { backgroundColor: palette.blue600 }]}
            disabled={reading}
          >
            {reading ? (
              <ActivityIndicator color={palette.white} size="small" />
            ) : (
              <RefreshCw size={18} color={palette.white} />
            )}
          </Pressable>
        </View>
        <Text style={[styles.kg, { color: colors.text }]}>
          {weightKg != null ? `${weightKg.toFixed(3)} kg` : '— · — — kg'}
        </Text>
        <Text style={{ color: stable ? palette.green600 : colors.textMuted, fontSize: 12 }}>
          {stable ? 'Stabil' : 'Kararsız / bekleniyor'} · {weightDetail}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>{weighSourceHint}</Text>
        {selected ? (
          <Text style={{ color: colors.text, marginTop: 8, fontWeight: '600' }}>
            {selected.name} · {formatMoney(selected.price)} ₺/kg
            {weightKg != null ? ` → ${formatMoney(lineTotal)} ₺` : ''}
          </Text>
        ) : (
          <Text style={{ color: colors.textMuted, marginTop: 8 }}>Ürün seçilmedi</Text>
        )}
        <PrimaryButton
          label="Sepete Ekle"
          onPress={addToCart}
          disabled={!selected || weightKg == null}
          style={{ marginTop: 10 }}
        />
      </View>

      <SearchBar
        value={search}
        onChangeText={(t) => void runSearch(t)}
        placeholder="Tartı ürünü / PLU / barkod…"
      />

      {hits.length > 0 ? (
        <View style={[styles.hits, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          {hits.slice(0, 8).map((p) => (
            <Pressable
              key={String(p.id)}
              onPress={() => {
                setSelected(p);
                setHits([]);
                setSearch(p.name);
                void readWeight();
              }}
              style={styles.hit}
            >
              <Text style={{ color: colors.text, flex: 1 }} numberOfLines={1}>
                {p.is_scale_product ? '⚖ ' : ''}
                {p.name}
              </Text>
              <Text style={{ color: palette.blue600, fontWeight: '700' }}>
                {formatMoney(p.price)}
              </Text>
            </Pressable>
          ))}
          {searching ? (
            <Text style={{ color: colors.textMuted, padding: 8 }}>Aranıyor…</Text>
          ) : null}
        </View>
      ) : null}

      <FlatList
        data={cart}
        keyExtractor={(_, i) => `${i}`}
        ListEmptyComponent={<EmptyState message="Sepet boş — ürün seçip tartın" />}
        contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 140 }}
        renderItem={({ item, index }) => (
          <View
            style={[styles.line, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                {item.weightKg.toFixed(3)} kg × {formatMoney(item.pricePerKg)}
              </Text>
            </View>
            <Text style={{ color: colors.text, fontWeight: '800' }}>
              {formatMoney(item.pricePerKg * item.weightKg)}
            </Text>
            <Pressable
              onPress={() => setCart((prev) => prev.filter((_, i) => i !== index))}
              style={{ marginLeft: 8 }}
            >
              <Text style={{ color: palette.red500, fontWeight: '700' }}>Sil</Text>
            </Pressable>
          </View>
        )}
      />

      <View style={[styles.footer, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Text style={[styles.total, { color: colors.text }]}>
          Toplam: {formatMoney(cartTotal)} ₺
        </Text>
        {saving ? (
          <ActivityIndicator color={palette.blue600} />
        ) : (
          <PrimaryButton
            label="Nakit ile Kaydet"
            disabled={cart.length === 0}
            onPress={checkout}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  weightCard: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  weightHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kg: { fontSize: 32, fontWeight: '900', marginTop: 8 },
  hits: {
    marginHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    maxHeight: 200,
    overflow: 'hidden',
  },
  hit: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    gap: 8,
  },
  line: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    padding: 16,
    gap: 10,
  },
  total: { fontSize: 18, fontWeight: '800' },
});
