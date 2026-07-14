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
  createPurchaseInvoice,
  createReturnInvoice,
  createSalesInvoice,
  createDocumentInvoice,
  fetchInvoiceById,
  invoiceLineNet,
  invoiceTotalsFromLines,
  isInvoiceDocumentKind,
  isPurchaseInvoice,
  updateInvoiceHeader,
  type InvoiceDocumentKind,
  type InvoiceDraftLine,
  type InvoiceFormKind,
} from '../api/invoicesApi';
import { fetchCustomers, type CustomerRow } from '../api/customersApi';
import { fetchSuppliers, type SupplierRow } from '../api/suppliersApi';
import { fetchProducts, type ProductRow } from '../api/productsApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { useAuthStore } from '../store/authStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type DraftLine = InvoiceDraftLine & { key: string };

const STATUS_OPTIONS = ['approved', 'draft', 'completed', 'cancelled'] as const;

const PAYMENT_OPTIONS = ['Nakit', 'Kredi Kartı', 'Veresiye'] as const;

type PartyRow = { id: string; name: string; code: string | null };

function titleForKind(kind: InvoiceFormKind, isEdit: boolean): string {
  if (isEdit) {
    switch (kind) {
      case 'purchase':
        return 'Alış Faturası Düzenle';
      case 'sales-return':
        return 'Satış İade Düzenle';
      case 'purchase-return':
        return 'Alış İade Düzenle';
      case 'service-given':
        return 'Verilen Hizmet Düzenle';
      case 'service-received':
        return 'Alınan Hizmet Düzenle';
      case 'waybill-sales':
        return 'Satış İrsaliyesi Düzenle';
      case 'waybill-purchase':
        return 'Alış İrsaliyesi Düzenle';
      case 'order-sales':
        return 'Satış Siparişi Düzenle';
      case 'order-purchase':
        return 'Satınalma Siparişi Düzenle';
      case 'quote':
        return 'Teklif Düzenle';
      default:
        return 'Satış Faturası Düzenle';
    }
  }
  switch (kind) {
    case 'purchase':
      return 'Yeni Alış Faturası';
    case 'sales-return':
      return 'Yeni Satış İade (TR 3)';
    case 'purchase-return':
      return 'Yeni Alış İade (TR 6)';
    case 'service-given':
      return 'Yeni Verilen Hizmet (TR 9)';
    case 'service-received':
      return 'Yeni Alınan Hizmet (TR 4)';
    case 'waybill-sales':
      return 'Yeni Satış İrsaliyesi (TR 10)';
    case 'waybill-purchase':
      return 'Yeni Alış İrsaliyesi (TR 11)';
    case 'order-sales':
      return 'Yeni Satış Siparişi (TR 20)';
    case 'order-purchase':
      return 'Yeni Satınalma Siparişi (TR 21)';
    case 'quote':
      return 'Yeni Teklif (TR 30)';
    default:
      return 'Yeni Satış Faturası';
  }
}

function defaultPartyName(kind: InvoiceFormKind): string {
  if (
    kind === 'purchase' ||
    kind === 'purchase-return' ||
    kind === 'service-received' ||
    kind === 'waybill-purchase' ||
    kind === 'order-purchase'
  ) {
    return 'Tedarikçi seçin';
  }
  if (kind === 'sales-return') return 'Müşteri (opsiyonel)';
  if (kind === 'quote' || kind === 'order-sales' || kind === 'waybill-sales') {
    return 'Cari seçin';
  }
  return 'Cari seçin';
}

function isSupplierKind(kind: InvoiceFormKind): boolean {
  return (
    kind === 'purchase' ||
    kind === 'purchase-return' ||
    kind === 'service-received' ||
    kind === 'waybill-purchase' ||
    kind === 'order-purchase'
  );
}

function isReturnKind(kind: InvoiceFormKind): boolean {
  return kind === 'sales-return' || kind === 'purchase-return';
}

function isDocumentKind(kind: InvoiceFormKind): kind is InvoiceDocumentKind {
  return isInvoiceDocumentKind(kind);
}

function requiresParty(kind: InvoiceFormKind): boolean {
  if (kind === 'sales-return') return false;
  return true;
}

function saveButtonLabel(kind: InvoiceFormKind, isEdit: boolean): string {
  if (isEdit) return 'Güncelle';
  if (isReturnKind(kind)) return 'İadeyi Kaydet';
  if (kind === 'quote') return 'Teklifi Kaydet';
  if (kind === 'order-sales' || kind === 'order-purchase') return 'Siparişi Kaydet';
  if (kind === 'waybill-sales' || kind === 'waybill-purchase') return 'İrsaliyeyi Kaydet';
  if (kind === 'service-given' || kind === 'service-received') return 'Hizmeti Kaydet';
  return 'Faturayı Kaydet';
}

function showPaymentChips(kind: InvoiceFormKind): boolean {
  // Sipariş / teklif / irsaliye: opsiyonel ödeme bilgisi (web formunda da var)
  return true;
}

function kindAccent(kind: InvoiceFormKind): string {
  if (kind === 'purchase' || kind === 'purchase-return' || kind === 'service-received') {
    return palette.orange500;
  }
  if (kind === 'waybill-sales' || kind === 'waybill-purchase') return '#0d9488';
  if (kind === 'order-sales' || kind === 'order-purchase') return '#7c3aed';
  if (kind === 'quote') return '#4f46e5';
  if (kind === 'service-given') return '#6366f1';
  if (isReturnKind(kind)) return palette.red500;
  return palette.blue600;
}

export function InvoiceFormScreen() {
  const { colors } = useThemeStore();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'InvoiceForm'>>();
  const user = useAuthStore((s) => s.user);
  const invoiceId = route.params?.invoiceId;
  const routeKind = route.params?.kind;
  const routeTrcode = route.params?.trcode;
  const isEdit = Boolean(invoiceId);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedKind, setResolvedKind] = useState<InvoiceFormKind>(routeKind ?? 'sales');

  const [customerId, setCustomerId] = useState<string | undefined>();
  const [customerName, setCustomerName] = useState(defaultPartyName(routeKind ?? 'sales'));
  const [documentNo, setDocumentNo] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<string>('approved');
  const [paymentMethod, setPaymentMethod] = useState<string>('Nakit');
  const [cashier, setCashier] = useState(user?.fullName || user?.username || '');
  const [returnReason, setReturnReason] = useState('');
  const [footerDiscount, setFooterDiscount] = useState('0');
  const [lines, setLines] = useState<DraftLine[]>([]);

  const [partySearch, setPartySearch] = useState('');
  const [partyRows, setPartyRows] = useState<PartyRow[]>([]);
  const [prodSearch, setProdSearch] = useState('');
  const [prodRows, setProdRows] = useState<ProductRow[]>([]);
  const [showPartyPicker, setShowPartyPicker] = useState(false);
  const [showProdPicker, setShowProdPicker] = useState(false);

  const footerDiscountNum = useMemo(() => {
    const n = parseFloat(String(footerDiscount).replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [footerDiscount]);

  const totals = useMemo(
    () => invoiceTotalsFromLines(lines, footerDiscountNum),
    [lines, footerDiscountNum],
  );

  const accent = useMemo(() => kindAccent(resolvedKind), [resolvedKind]);

  useEffect(() => {
    if (!isEdit && routeKind) {
      setResolvedKind(routeKind);
      setCustomerName(defaultPartyName(routeKind));
      setCustomerId(undefined);
    }
  }, [routeKind, isEdit]);

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
      const tc = Number(doc.trcode ?? 0);
      if (tc === 3) setResolvedKind('sales-return');
      else if (tc === 6) setResolvedKind('purchase-return');
      else setResolvedKind(isPurchaseInvoice(doc) ? 'purchase' : 'sales');
      setCustomerName(
        doc.customer_name ||
          (isPurchaseInvoice(doc) || tc === 6 ? 'Tedarikçi' : 'Perakende'),
      );
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
    if (!showPartyPicker) return;
    const t = setTimeout(async () => {
      try {
        if (isSupplierKind(resolvedKind)) {
          const rows = await fetchSuppliers(partySearch, 30);
          setPartyRows(
            rows.map((r: SupplierRow) => ({
              id: String(r.id),
              name: r.name,
              code: r.code,
            })),
          );
        } else {
          const rows = await fetchCustomers(partySearch, 30);
          setPartyRows(
            rows.map((r: CustomerRow) => ({
              id: String(r.id),
              name: r.name,
              code: r.code,
            })),
          );
        }
      } catch {
        setPartyRows([]);
      }
    }, partySearch ? 280 : 0);
    return () => clearTimeout(t);
  }, [partySearch, showPartyPicker, resolvedKind]);

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
    const unitPrice =
      isSupplierKind(resolvedKind)
        ? p.cost > 0
          ? p.cost
          : p.price
        : p.price;
    const vatRate =
      Number.isFinite(p.vat_rate) && p.vat_rate >= 0 ? Number(p.vat_rate) : 20;
    setLines((prev) => [
      ...prev,
      {
        key: `${p.id}-${Date.now()}`,
        productId: String(p.id),
        code: p.code,
        name: p.name,
        qty: 1,
        unitPrice,
        unit: p.unit,
        discountPercent: 0,
        vatRate,
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

  const validateCreate = (): string | null => {
    if (!lines.length) return 'En az bir ürün satırı ekleyin.';
    if (requiresParty(resolvedKind)) {
      if (
        !customerId ||
        !customerName.trim() ||
        customerName === defaultPartyName(resolvedKind)
      ) {
        return isSupplierKind(resolvedKind)
          ? 'Tedarikçi seçimi zorunludur.'
          : 'Cari (müşteri) seçimi zorunludur.';
      }
    }
    if (resolvedKind === 'sales-return') {
      if (!cashier.trim()) return 'Satış iadesinde kasiyer zorunludur.';
    }
    for (const l of lines) {
      if (!(l.qty > 0)) return `"${l.name}" için miktar > 0 olmalı.`;
      if (isSupplierKind(resolvedKind)) {
        if (l.unitPrice < 0) return `"${l.name}" birim fiyat geçersiz.`;
      } else if (!(l.unitPrice > 0)) {
        return `"${l.name}" birim fiyat > 0 olmalı.`;
      }
    }
    return null;
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
      const validationError = validateCreate();
      if (validationError) {
        Alert.alert('Eksik bilgi', validationError);
        setSaving(false);
        return;
      }

      const draftLines = lines.map(({ key: _k, ...rest }) => rest);
      const extras = {
        documentNo: documentNo.trim() || undefined,
        footerDiscountAmount: footerDiscountNum,
      };

      let result: { id: string };
      if (resolvedKind === 'purchase') {
        result = await createPurchaseInvoice({
          supplierId: customerId,
          supplierName: customerName,
          notes,
          paymentMethod,
          lines: draftLines,
          ...extras,
        });
      } else if (resolvedKind === 'sales-return') {
        result = await createReturnInvoice({
          trcode: 3,
          accountId: customerId,
          accountName: customerName,
          notes,
          paymentMethod,
          cashier,
          returnReason,
          lines: draftLines,
          ...extras,
        });
      } else if (resolvedKind === 'purchase-return') {
        result = await createReturnInvoice({
          trcode: 6,
          accountId: customerId,
          accountName: customerName,
          notes,
          paymentMethod,
          cashier,
          returnReason,
          lines: draftLines,
          ...extras,
        });
      } else if (isDocumentKind(resolvedKind)) {
        result = await createDocumentInvoice(resolvedKind, {
          accountId: customerId,
          accountName: customerName,
          notes,
          paymentMethod,
          lines: draftLines,
          trcodeOverride: routeTrcode,
          ...extras,
        });
      } else {
        result = await createSalesInvoice({
          customerId,
          customerName,
          notes,
          paymentMethod,
          lines: draftLines,
          ...extras,
        });
      }
      navigation.replace('InvoiceDetail', { invoiceId: result.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const partyLabel = isSupplierKind(resolvedKind) ? 'TEDARİKÇİ' : 'CARİ';
  const partyHint = isSupplierKind(resolvedKind)
    ? 'Tedarikçi ara…'
    : 'Cari / müşteri ara…';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={titleForKind(resolvedKind, isEdit)}
        subtitle={
          isEdit
            ? 'Not ve durum'
            : isReturnKind(resolvedKind)
              ? `TRCODE ${resolvedKind === 'sales-return' ? '3' : '6'} · ${customerName}`
              : isDocumentKind(resolvedKind)
                ? `${titleForKind(resolvedKind, false).replace(/^Yeni /, '')} · ${customerName}`
                : customerName
        }
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
              <View
                style={[styles.info, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              >
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Mobil düzenleme: yalnızca not ve durum güncellenir. Kalem ekleme/silme web
                  fatura formunda yapılmalıdır.
                </Text>
              </View>
            ) : (
              <>
                <Pressable
                  onPress={() => setShowPartyPicker((v) => !v)}
                  style={[
                    styles.pickerBtn,
                    { borderColor: colors.cardBorder, backgroundColor: colors.card },
                  ]}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700' }}>
                    {partyLabel}
                    {resolvedKind === 'sales-return' || !requiresParty(resolvedKind)
                      ? ' (opsiyonel)'
                      : ' *'}
                  </Text>
                  <Text style={{ color: colors.text, fontWeight: '700', marginTop: 4 }}>
                    {customerName}
                  </Text>
                </Pressable>
                {showPartyPicker ? (
                  <View style={[styles.pickerPanel, { borderColor: colors.cardBorder }]}>
                    <SearchBar
                      value={partySearch}
                      onChangeText={setPartySearch}
                      placeholder={partyHint}
                    />
                    <FlatList
                      data={partyRows}
                      keyExtractor={(item) => String(item.id)}
                      scrollEnabled={false}
                      ListEmptyComponent={
                        <Text style={{ color: colors.textMuted, padding: 8, fontSize: 12 }}>
                          Sonuç yok
                        </Text>
                      }
                      renderItem={({ item }) => (
                        <Pressable
                          onPress={() => {
                            setCustomerId(String(item.id));
                            setCustomerName(item.name);
                            setShowPartyPicker(false);
                          }}
                          style={[styles.pickRow, { borderBottomColor: colors.cardBorder }]}
                        >
                          <Text style={{ color: colors.text, fontWeight: '600' }}>{item.name}</Text>
                          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                            {item.code || '—'}
                          </Text>
                        </Pressable>
                      )}
                    />
                  </View>
                ) : null}

                <FormField
                  label="Belge no"
                  value={documentNo}
                  onChangeText={setDocumentNo}
                  placeholder="Opsiyonel belge / irsaliye no"
                />

                {isReturnKind(resolvedKind) ? (
                  <>
                    <FormField
                      label={resolvedKind === 'sales-return' ? 'Kasiyer *' : 'Kasiyer'}
                      value={cashier}
                      onChangeText={setCashier}
                      placeholder="İşlemi yapan"
                    />
                    <FormField
                      label="İade nedeni"
                      value={returnReason}
                      onChangeText={setReturnReason}
                      placeholder="Hasar, yanlış ürün…"
                    />
                  </>
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

            {!isEdit && showPaymentChips(resolvedKind) ? (
              <View style={styles.statusWrap}>
                <Text style={[styles.statusLabel, { color: colors.textMuted }]}>ÖDEME</Text>
                <View style={styles.statusRow}>
                  {PAYMENT_OPTIONS.map((pm) => (
                    <Pressable
                      key={pm}
                      onPress={() => setPaymentMethod(pm)}
                      style={[
                        styles.chip,
                        {
                          borderColor: paymentMethod === pm ? accent : colors.cardBorder,
                          backgroundColor: paymentMethod === pm ? accent : colors.card,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: paymentMethod === pm ? palette.white : colors.text,
                          fontSize: 11,
                          fontWeight: '700',
                        }}
                      >
                        {pm}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
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
                  <Text style={[styles.sec, { color: colors.text }]}>
                    Kalemler ({lines.length})
                  </Text>
                  <Pressable
                    onPress={() => setShowProdPicker((v) => !v)}
                    style={[styles.addBtn, { backgroundColor: accent }]}
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
                          <Text
                            style={{ color: colors.text, fontWeight: '600', flex: 1 }}
                            numberOfLines={1}
                          >
                            {item.name}
                          </Text>
                          <Text style={{ color: accent, fontSize: 11, fontWeight: '700' }}>
                            {formatMoney(
                              isSupplierKind(resolvedKind)
                                ? item.cost > 0
                                  ? item.cost
                                  : item.price
                                : item.price,
                            )}{' '}
                            ₺
                          </Text>
                        </Pressable>
                      )}
                    />
                  </View>
                ) : null}

                {lines.map((line) => (
                  <View
                    key={line.key}
                    style={[
                      styles.lineCard,
                      { backgroundColor: colors.card, borderColor: colors.cardBorder },
                    ]}
                  >
                    <View style={styles.lineTop}>
                      <Text
                        style={{ color: colors.text, fontWeight: '700', flex: 1 }}
                        numberOfLines={2}
                      >
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
                          updateLine(line.key, {
                            qty: Number.isFinite(n) && n > 0 ? n : 1,
                          });
                        }}
                        keyboardType="decimal-pad"
                        containerStyle={{ flex: 1 }}
                      />
                      <FormField
                        label="Birim fiyat"
                        value={String(line.unitPrice)}
                        onChangeText={(t) => {
                          const n = parseFloat(t.replace(',', '.'));
                          updateLine(line.key, {
                            unitPrice: Number.isFinite(n) && n >= 0 ? n : 0,
                          });
                        }}
                        keyboardType="decimal-pad"
                        containerStyle={{ flex: 1 }}
                      />
                      <FormField
                        label="İnd. %"
                        value={String(line.discountPercent ?? 0)}
                        onChangeText={(t) => {
                          const n = parseFloat(t.replace(',', '.'));
                          updateLine(line.key, {
                            discountPercent:
                              Number.isFinite(n) && n >= 0 ? Math.min(100, n) : 0,
                          });
                        }}
                        keyboardType="decimal-pad"
                        containerStyle={{ width: 64 }}
                      />
                      <FormField
                        label="KDV %"
                        value={String(line.vatRate ?? 0)}
                        onChangeText={(t) => {
                          const n = parseFloat(t.replace(',', '.'));
                          updateLine(line.key, {
                            vatRate: Number.isFinite(n) && n >= 0 ? Math.min(100, n) : 0,
                          });
                        }}
                        keyboardType="decimal-pad"
                        containerStyle={{ width: 64 }}
                      />
                    </View>
                    <Text style={{ color: accent, fontWeight: '800', textAlign: 'right' }}>
                      {formatMoney(invoiceLineNet(line))} ₺
                    </Text>
                  </View>
                ))}

                <FormField
                  label="Dip indirim (tutar)"
                  value={footerDiscount}
                  onChangeText={setFooterDiscount}
                  keyboardType="decimal-pad"
                  placeholder="0"
                />

                <View
                  style={[
                    styles.totalCard,
                    { backgroundColor: colors.card, borderColor: colors.cardBorder },
                  ]}
                >
                  <Text style={[styles.summaryTitle, { color: colors.text }]}>Özet</Text>
                  <View style={styles.summaryRow}>
                    <Text style={{ color: colors.textMuted }}>Ara toplam</Text>
                    <Text style={{ color: colors.text, fontWeight: '600' }}>
                      {formatMoney(totals.subtotal + totals.lineDiscount)} ₺
                    </Text>
                  </View>
                  {totals.lineDiscount > 0 ? (
                    <View style={styles.summaryRow}>
                      <Text style={{ color: colors.textMuted }}>Satır indirimi</Text>
                      <Text style={{ color: palette.red500, fontWeight: '600' }}>
                        −{formatMoney(totals.lineDiscount)} ₺
                      </Text>
                    </View>
                  ) : null}
                  {totals.footerDiscount > 0 ? (
                    <View style={styles.summaryRow}>
                      <Text style={{ color: colors.textMuted }}>Dip indirim</Text>
                      <Text style={{ color: palette.red500, fontWeight: '600' }}>
                        −{formatMoney(totals.footerDiscount)} ₺
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.summaryRow}>
                    <Text style={{ color: colors.textMuted }}>KDV (satır)</Text>
                    <Text style={{ color: colors.textMuted, fontWeight: '600' }}>
                      {formatMoney(totals.totalVat)} ₺
                    </Text>
                  </View>
                  <Text style={{ color: colors.textSubtle, fontSize: 10, marginTop: 2 }}>
                    Satır KDV % kaydedilir; header total_vat web ile 0
                  </Text>
                  <View style={[styles.summaryRow, { marginTop: 8 }]}>
                    <Text style={{ color: colors.text, fontWeight: '800' }}>Genel toplam</Text>
                    <Text style={{ color: accent, fontSize: 22, fontWeight: '800' }}>
                      {formatMoney(totals.net)} ₺
                    </Text>
                  </View>
                </View>
              </>
            ) : null}

            <PrimaryButton
              label={saveButtonLabel(resolvedKind, isEdit)}
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
  pickRow: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
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
  totalCard: { borderWidth: 1, borderRadius: 10, padding: 14, gap: 4 },
  summaryTitle: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
