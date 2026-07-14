import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
  FlatList,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Plus, Trash2 } from 'lucide-react-native';
import { ScreenHeader, ErrorBanner, SearchBar } from '../components/ScreenChrome';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  createSalesInvoice,
  fetchInvoiceById,
  updateInvoiceHeader,
  type InvoiceDraftLine,
} from '../api/invoicesApi';
import { fetchCustomers, type CustomerRow } from '../api/customersApi';
import { fetchProducts, type ProductRow } from '../api/productsApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type DraftLine = InvoiceDraftLine & { key: string };

const STATUS_OPTIONS = ['approved', 'draft', 'completed', 'cancelled'] as const;

export function InvoiceFormScreen() {
  const { colors } = useThemeStore();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'InvoiceForm'>>();
  const invoiceId = route.params?.invoiceId;
  const isEdit = Boolean(invoiceId);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState<string | undefined>();
  const [customerName, setCustomerName] = useState('Perakende');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<string>('approved');
  const [paymentMethod, setPaymentMethod] = useState('Nakit');
  const [lines, setLines] = useState<DraftLine[]>([]);

  const [custSearch, setCustSearch] = useState('');
  const [custRows, setCustRows] = useState<CustomerRow[]>([]);
  const [prodSearch, setProdSearch] = useState('');
  const [prodRows, setProdRows] = useState<ProductRow[]>([]);
  const [showCustPicker, setShowCustPicker] = useState(false);
  const [showProdPicker, setShowProdPicker] = useState(false);

  const total = useMemo(
    () => lines.reduce((s, l) => s + l.unitPrice * l.qty, 0),
    [lines],
  );

  const load = useCallback(async () => {
    if (!invoiceId) return;
    setError(null);
    setLoading(true);
    try {
      const doc = await fetchInvoiceById(invoiceId);
      if (!doc) {
        setError('Fatura bulunamadı');
        return;
      }
      setCustomerName(doc.customer_name || 'Perakende');
      setNotes(doc.notes || '');
      setStatus(doc.status || 'approved');
      setPaymentMethod(doc.payment_method || 'Nakit');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!showCustPicker) return;
    const t = setTimeout(async () => {
      try {
        setCustRows(await fetchCustomers(custSearch, 30));
      } catch {
        setCustRows([]);
      }
    }, custSearch ? 280 : 0);
    return () => clearTimeout(t);
  }, [custSearch, showCustPicker]);

  useEffect(() => {
    if (!showProdPicker) return;
    const t = setTimeout(async () => {
      try {
        setProdRows(await fetchProducts(prodSearch, 30));
      } catch {
        setProdRows([]);
      }
    }, prodSearch ? 280 : 0);
    return () => clearTimeout(t);
  }, [prodSearch, showProdPicker]);

  const addProduct = (p: ProductRow) => {
    setLines((prev) => [
      ...prev,
      {
        key: `${p.id}-${Date.now()}`,
        productId: String(p.id),
        code: p.code,
        name: p.name,
        qty: 1,
        unitPrice: p.price,
        unit: p.unit,
      },
    ]);
    setShowProdPicker(false);
    setProdSearch('');
  };

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (isEdit && invoiceId) {
        await updateInvoiceHeader(invoiceId, { notes, status });
        navigation.replace('InvoiceDetail', { invoiceId });
        return;
      }
      if (!lines.length) {
        Alert.alert('Eksik kalem', 'En az bir ürün satırı ekleyin.');
        setSaving(false);
        return;
      }
      const result = await createSalesInvoice({
        customerId,
        customerName,
        notes,
        paymentMethod,
        lines,
      });
      navigation.replace('InvoiceDetail', { invoiceId: result.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={isEdit ? 'Fatura Düzenle' : 'Yeni Satış Faturası'}
        subtitle={isEdit ? 'Not ve durum' : customerName}
      />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {isEdit ? (
              <View style={[styles.info, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Mobil düzenleme: yalnızca not ve durum güncellenir. Kalem ekleme/silme web
                  fatura formunda yapılmalıdır.
                </Text>
              </View>
            ) : (
              <>
                <Pressable
                  onPress={() => setShowCustPicker((v) => !v)}
                  style={[styles.pickerBtn, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700' }}>CARİ</Text>
                  <Text style={{ color: colors.text, fontWeight: '700', marginTop: 4 }}>{customerName}</Text>
                </Pressable>
                {showCustPicker ? (
                  <View style={[styles.pickerPanel, { borderColor: colors.cardBorder }]}>
                    <SearchBar
                      value={custSearch}
                      onChangeText={setCustSearch}
                      placeholder="Cari ara…"
                    />
                    <FlatList
                      data={custRows}
                      keyExtractor={(item) => String(item.id)}
                      scrollEnabled={false}
                      renderItem={({ item }) => (
                        <Pressable
                          onPress={() => {
                            setCustomerId(String(item.id));
                            setCustomerName(item.name);
                            setShowCustPicker(false);
                          }}
                          style={[styles.pickRow, { borderBottomColor: colors.cardBorder }]}
                        >
                          <Text style={{ color: colors.text, fontWeight: '600' }}>{item.name}</Text>
                          <Text style={{ color: colors.textMuted, fontSize: 11 }}>{item.code || '—'}</Text>
                        </Pressable>
                      )}
                    />
                  </View>
                ) : null}
              </>
            )}

            <FormField
              label="Not"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              style={{ minHeight: 72, textAlignVertical: 'top' }}
            />

            {!isEdit ? (
              <FormField
                label="Ödeme"
                value={paymentMethod}
                onChangeText={setPaymentMethod}
              />
            ) : null}

            {isEdit ? (
              <View style={styles.statusWrap}>
                <Text style={[styles.statusLabel, { color: colors.textMuted }]}>DURUM</Text>
                <View style={styles.statusRow}>
                  {STATUS_OPTIONS.map((s) => (
                    <Pressable
                      key={s}
                      onPress={() => setStatus(s)}
                      style={[
                        styles.chip,
                        {
                          borderColor: status === s ? palette.blue600 : colors.cardBorder,
                          backgroundColor: status === s ? palette.blue600 : colors.card,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: status === s ? palette.white : colors.text,
                          fontSize: 11,
                          fontWeight: '700',
                        }}
                      >
                        {s}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {!isEdit ? (
              <>
                <View style={styles.lineHeader}>
                  <Text style={[styles.sec, { color: colors.text }]}>Kalemler ({lines.length})</Text>
                  <Pressable
                    onPress={() => setShowProdPicker((v) => !v)}
                    style={[styles.addBtn, { backgroundColor: palette.blue600 }]}
                  >
                    <Plus size={16} color={palette.white} />
                    <Text style={styles.addBtnText}>Ürün</Text>
                  </Pressable>
                </View>

                {showProdPicker ? (
                  <View style={[styles.pickerPanel, { borderColor: colors.cardBorder }]}>
                    <SearchBar
                      value={prodSearch}
                      onChangeText={setProdSearch}
                      placeholder="Ürün ara…"
                    />
                    <FlatList
                      data={prodRows}
                      keyExtractor={(item) => String(item.id)}
                      scrollEnabled={false}
                      renderItem={({ item }) => (
                        <Pressable
                          onPress={() => addProduct(item)}
                          style={[styles.pickRow, { borderBottomColor: colors.cardBorder }]}
                        >
                          <Text style={{ color: colors.text, fontWeight: '600' }} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={{ color: palette.blue600, fontSize: 11, fontWeight: '700' }}>
                            {formatMoney(item.price)} ₺
                          </Text>
                        </Pressable>
                      )}
                    />
                  </View>
                ) : null}

                {lines.map((line) => (
                  <View
                    key={line.key}
                    style={[styles.lineCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                  >
                    <View style={styles.lineTop}>
                      <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }} numberOfLines={2}>
                        {line.name}
                      </Text>
                      <Pressable onPress={() => removeLine(line.key)} hitSlop={8}>
                        <Trash2 size={16} color={palette.red500} />
                      </Pressable>
                    </View>
                    <View style={styles.lineFields}>
                      <FormField
                        label="Miktar"
                        value={String(line.qty)}
                        onChangeText={(t) => {
                          const n = parseFloat(t.replace(',', '.'));
                          updateLine(line.key, { qty: Number.isFinite(n) && n > 0 ? n : 1 });
                        }}
                        keyboardType="decimal-pad"
                        containerStyle={{ flex: 1 }}
                      />
                      <FormField
                        label="Birim fiyat"
                        value={String(line.unitPrice)}
                        onChangeText={(t) => {
                          const n = parseFloat(t.replace(',', '.'));
                          updateLine(line.key, { unitPrice: Number.isFinite(n) && n >= 0 ? n : 0 });
                        }}
                        keyboardType="decimal-pad"
                        containerStyle={{ flex: 1 }}
                      />
                    </View>
                    <Text style={{ color: palette.blue600, fontWeight: '800', textAlign: 'right' }}>
                      {formatMoney(line.unitPrice * line.qty)} ₺
                    </Text>
                  </View>
                ))}

                <View style={[styles.totalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>Toplam</Text>
                  <Text style={{ color: palette.blue600, fontSize: 22, fontWeight: '800' }}>
                    {formatMoney(total)} ₺
                  </Text>
                </View>
              </>
            ) : null}

            <PrimaryButton
              label={isEdit ? 'Güncelle' : 'Faturayı Kaydet'}
              onPress={() => void handleSave()}
              loading={saving}
              style={{ marginTop: 8 }}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 16, gap: 14, paddingBottom: 48 },
  info: { borderWidth: 1, borderRadius: 10, padding: 12 },
  pickerBtn: { borderWidth: 1, borderRadius: 10, padding: 12 },
  pickerPanel: { borderWidth: 1, borderRadius: 10, padding: 8, gap: 8 },
  pickRow: { paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  statusWrap: { gap: 8 },
  statusLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 2, paddingHorizontal: 4 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  lineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sec: { fontSize: 13, fontWeight: '700' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: { color: palette.white, fontSize: 11, fontWeight: '800' },
  lineCard: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 8 },
  lineTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  lineFields: { flexDirection: 'row', gap: 8 },
  totalCard: { borderWidth: 1, borderRadius: 10, padding: 14, alignItems: 'flex-end' },
});
