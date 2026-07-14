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
import { Plus, Minus, Trash2, ScanBarcode } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader, SearchBar, EmptyState } from '../components/ScreenChrome';
import { PrimaryButton } from '../components/PrimaryButton';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { fetchProducts, fetchProductByBarcode, type ProductRow } from '../api/productsApi';
import { savePosSale } from '../api/posApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { usePrinterSettingsStore } from '../store/printerSettingsStore';
import { printSaleReceiptStub } from '../services/printerService';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type CartLine = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  unit: string | null;
  code: string | null;
};

export function PosScreen() {
  const { colors } = useThemeStore();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const orgEpoch = useOrgEpoch();
  const printerSettings = usePrinterSettingsStore((s) => s.settings);
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<ProductRow[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    setCart([]);
    setHits([]);
    setSearch('');
  }, [orgEpoch]);

  const total = useMemo(
    () => cart.reduce((s, l) => s + l.price * l.qty, 0),
    [cart],
  );

  const addProduct = useCallback((p: ProductRow) => {
    setCart((prev) => {
      const i = prev.findIndex((l) => l.productId === String(p.id));
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i]!, qty: next[i]!.qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          productId: String(p.id),
          name: p.name,
          price: Number(p.price) || 0,
          qty: 1,
          unit: p.unit,
          code: p.code,
        },
      ];
    });
  }, []);

  const runSearch = useCallback(
    async (q: string) => {
      setSearch(q);
      if (q.trim().length < 1) {
        setHits([]);
        return;
      }
      setSearching(true);
      try {
        if (/^\d{8,}$/.test(q.trim())) {
          const byBc = await fetchProductByBarcode(q.trim());
          if (byBc) {
            addProduct(byBc);
            setSearch('');
            setHits([]);
            return;
          }
        }
        setHits(await fetchProducts(q, 30));
      } catch (e) {
        Alert.alert('Arama', e instanceof Error ? e.message : String(e));
      } finally {
        setSearching(false);
      }
    },
    [addProduct],
  );

  const setQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) =>
          l.productId === productId ? { ...l, qty: Math.max(0, l.qty + delta) } : l,
        )
        .filter((l) => l.qty > 0),
    );
  };

  const checkout = (paymentMethod: string) => {
    if (cart.length === 0 || saving) return;
    Alert.alert(
      'Ödeme',
      `${paymentMethod} — toplam ${formatMoney(total)} ₺ kaydedilsin mi?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kaydet',
          onPress: () => {
            void (async () => {
              setSaving(true);
              try {
                const res = await savePosSale(cart, paymentMethod);
                setCart([]);
                if (res.queued) {
                  Alert.alert(
                    'Fiş kuyruğa alındı',
                    `${res.ficheNo}\nToplam: ${formatMoney(res.total)} ₺\n\nBağlantı gelince otomatik senkron edilir.`,
                  );
                  return;
                }
                Alert.alert(
                  'Fiş kaydedildi',
                  `${res.ficheNo}\nToplam: ${formatMoney(res.total)} ₺`,
                  [
                    {
                      text: 'Detay',
                      onPress: () =>
                        navigation.navigate('InvoiceDetail', { invoiceId: res.id }),
                    },
                    { text: 'Tamam' },
                  ],
                );
                if (printerSettings.autoPrint) {
                  const printRes = await printSaleReceiptStub(printerSettings, res.id);
                  if (printRes.ok) {
                    Alert.alert('Yazdırma (stub)', printRes.message);
                  }
                }
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
        title="Satış (POS)"
        subtitle="Sepet + fiş kaydı"
        showBack={false}
        right={
          <Pressable onPress={() => navigation.navigate('ScaleSale')} hitSlop={8}>
            <Text style={{ color: palette.white, fontWeight: '800', fontSize: 12 }}>Terazi</Text>
          </Pressable>
        }
      />
      <View style={styles.searchRow}>
        <View style={styles.searchFlex}>
          <SearchBar
            value={search}
            onChangeText={(t) => void runSearch(t)}
            placeholder="Barkod veya ürün adı…"
          />
        </View>
        <Pressable
          onPress={() => setScannerOpen(true)}
          style={[styles.scanBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          accessibilityLabel="Kamera ile barkod oku"
        >
          <ScanBarcode size={22} color={palette.blue600} />
        </Pressable>
      </View>

      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanned={(data) => void runSearch(data)}
        title="POS barkod"
      />

      {hits.length > 0 ? (
        <View style={[styles.hits, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          {hits.slice(0, 8).map((p) => (
            <Pressable
              key={String(p.id)}
              onPress={() => {
                addProduct(p);
                setHits([]);
                setSearch('');
              }}
              style={styles.hit}
            >
              <Text style={{ color: colors.text, flex: 1 }} numberOfLines={1}>
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
        keyExtractor={(item) => item.productId}
        ListEmptyComponent={<EmptyState message="Sepet boş — ürün arayıp ekleyin" />}
        contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 160 }}
        renderItem={({ item }) => (
          <View style={[styles.line, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                {formatMoney(item.price)} × {item.qty} {item.unit || ''}
              </Text>
            </View>
            <View style={styles.qtyRow}>
              <Pressable onPress={() => setQty(item.productId, -1)} style={styles.qtyBtn}>
                <Minus size={14} color={palette.white} />
              </Pressable>
              <Text
                style={{
                  color: colors.text,
                  fontWeight: '700',
                  minWidth: 24,
                  textAlign: 'center',
                }}
              >
                {item.qty}
              </Text>
              <Pressable onPress={() => setQty(item.productId, 1)} style={styles.qtyBtn}>
                <Plus size={14} color={palette.white} />
              </Pressable>
              <Pressable
                onPress={() => setQty(item.productId, -item.qty)}
                style={[styles.qtyBtn, { backgroundColor: palette.red500 }]}
              >
                <Trash2 size={14} color={palette.white} />
              </Pressable>
            </View>
          </View>
        )}
      />

      <View style={[styles.footer, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Text style={[styles.total, { color: colors.text }]}>
          Toplam: {formatMoney(total)} ₺
        </Text>
        {saving ? (
          <ActivityIndicator color={palette.blue600} />
        ) : (
          <View style={styles.payRow}>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                label="Nakit"
                disabled={cart.length === 0}
                onPress={() => checkout('Nakit')}
              />
            </View>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                label="Kart"
                disabled={cart.length === 0}
                onPress={() => checkout('Kredi Kartı')}
              />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
    gap: 4,
  },
  searchFlex: { flex: 1, minWidth: 0 },
  scanBtn: {
    marginTop: 8,
    marginBottom: 4,
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hits: {
    marginHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    maxHeight: 220,
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
    gap: 8,
  },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: palette.blue600,
    alignItems: 'center',
    justifyContent: 'center',
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
  payRow: { flexDirection: 'row', gap: 8 },
});
