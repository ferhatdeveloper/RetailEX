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
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ScreenHeader, ErrorBanner, SearchBar } from '../components/ScreenChrome';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  createPurchaseInvoice,
  createReturnInvoice,
  createSalesInvoice,
  createDocumentInvoice,
  fetchInvoiceById,
  invoiceAllowsLineEdit,
  invoiceFormKindFromTrcode,
  invoiceLineNet,
  invoiceTotalsFromLines,
  isInvoiceDocumentKind,
  updateInvoiceHeader,
  type InvoiceDocumentKind,
  type InvoiceDraftLine,
  type InvoiceFormKind,
} from '../api/invoicesApi';
import { fetchCustomers, type CustomerRow } from '../api/customersApi';
import { fetchSuppliers, type SupplierRow } from '../api/suppliersApi';
import { fetchProducts, type ProductRow } from '../api/productsApi';
import { fetchServices, type ServiceRow } from '../api/servicesApi';
import { fetchCashRegisters, type CashRegisterRow } from '../api/financeApi';
import { firmNr, formatMoney, storeId as sessionStoreId } from '../api/erpTables';
import { fetchStores, type StoreRow } from '../api/pgClient';
import { useThemeStore } from '../store/themeStore';
import { useAuthStore } from '../store/authStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type DraftLine = InvoiceDraftLine & { key: string };

const STATUS_OPTIONS = ['approved', 'draft', 'completed', 'cancelled'] as const;

const PAYMENT_OPTIONS = ['Nakit', 'Kredi Kartı', 'Veresiye'] as const;

const CURRENCY_OPTIONS = ['TRY', 'IQD', 'USD', 'EUR'] as const;

type PartyRow = { id: string; name: string; code: string | null };

function todayYmd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

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

function isServiceKind(kind: InvoiceFormKind): boolean {
  return kind === 'service-given' || kind === 'service-received';
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

function validateCreate(
  t: TFunction,
  resolvedKind: InvoiceFormKind,
  lines: DraftLine[],
  customerId: string | undefined,
  customerName: string,
  cashier: string,
): string | null {
  if (!lines.length) {
    return isServiceKind(resolvedKind)
      ? t('invoiceForm.needServiceLine')
      : t('invoiceForm.needLine');
  }
  if (requiresParty(resolvedKind)) {
    if (
      !customerId ||
      !customerName.trim() ||
      customerName === defaultPartyName(resolvedKind)
    ) {
      return isSupplierKind(resolvedKind)
        ? t('invoiceForm.supplierRequired')
        : t('invoiceForm.customerRequired');
    }
  }
  if (resolvedKind === 'sales-return') {
    if (!cashier.trim()) return t('invoiceForm.cashierRequired');
  }
  for (const l of lines) {
    if (!(l.qty > 0)) return t('invoiceForm.qtyPositive', { name: l.name });
    if (isSupplierKind(resolvedKind)) {
      if (l.unitPrice < 0) return t('invoiceForm.unitPriceInvalid', { name: l.name });
    } else if (!(l.unitPrice > 0)) {
      return t('invoiceForm.unitPricePositive', { name: l.name });
    }
  }
  return null;
}

function lineFromDetail(
  l: {
    id: string;
    product_id?: string | null;
    item_code: string | null;
    item_name: string | null;
    quantity: number;
    unit_price: number;
    unit: string | null;
    vat_rate?: number;
    discount_rate?: number;
    item_type?: string | null;
  },
): DraftLine {
  const itemType = l.item_type || 'Malzeme';
  const isService =
    String(itemType).toLowerCase() === 'hizmet' ||
    String(itemType).toLowerCase() === 'service';
  return {
    key: l.id || `${l.item_code}-${Math.random()}`,
    productId: l.product_id || null,
    code: l.item_code,
    name: l.item_name || '—',
    qty: Number(l.quantity) || 1,
    unitPrice: Number(l.unit_price) || 0,
    unit: l.unit,
    discountPercent: Number(l.discount_rate) || 0,
    vatRate: Number(l.vat_rate) || 0,
    lineType: isService ? 'service' : 'product',
    itemType,
  };
}

export function InvoiceFormScreen() {
  const { t } = useTranslation();
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
  const [canEditLines, setCanEditLines] = useState(!isEdit);

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

  const [invoiceDate, setInvoiceDate] = useState(todayYmd());
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState<string>('TRY');
  const [currencyRate, setCurrencyRate] = useState('1');
  const [specialCode, setSpecialCode] = useState('');
  const [salespersonCode, setSalespersonCode] = useState('');
  const [warehouseLabel, setWarehouseLabel] = useState('');
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(
    sessionStoreId(),
  );
  const [cashRegisterId, setCashRegisterId] = useState<string | null>(null);
  const [cashRegisterName, setCashRegisterName] = useState('');

  const [partySearch, setPartySearch] = useState('');
  const [partyRows, setPartyRows] = useState<PartyRow[]>([]);
  const [prodSearch, setProdSearch] = useState('');
  const [prodRows, setProdRows] = useState<ProductRow[]>([]);
  const [svcRows, setSvcRows] = useState<ServiceRow[]>([]);
  const [showPartyPicker, setShowPartyPicker] = useState(false);
  const [showProdPicker, setShowProdPicker] = useState(false);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [cashRegs, setCashRegs] = useState<CashRegisterRow[]>([]);

  const footerDiscountNum = useMemo(() => {
    const n = parseFloat(String(footerDiscount).replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [footerDiscount]);

  const currencyRateNum = useMemo(() => {
    const n = parseFloat(String(currencyRate).replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, [currencyRate]);

  const totals = useMemo(
    () => invoiceTotalsFromLines(lines, footerDiscountNum),
    [lines, footerDiscountNum],
  );

  const accent = useMemo(() => kindAccent(resolvedKind), [resolvedKind]);
  const serviceMode = isServiceKind(resolvedKind);

  useEffect(() => {
    if (!isEdit && routeKind) {
      setResolvedKind(routeKind);
      setCustomerName(defaultPartyName(routeKind));
      setCustomerId(undefined);
      setCanEditLines(true);
    }
  }, [routeKind, isEdit]);

  useEffect(() => {
    void (async () => {
      try {
        const [s, regs] = await Promise.all([
          fetchStores(firmNr()),
          fetchCashRegisters(40),
        ]);
        setStores(s);
        setCashRegs(regs);
        if (!warehouseLabel && s.length) {
          const sid = sessionStoreId();
          const match = sid ? s.find((x) => x.id === sid) : s[0];
          if (match) {
            setWarehouseLabel(match.name);
            setSelectedStoreId(match.id);
          }
        }
        if (!cashRegisterId && regs.length) {
          setCashRegisterId(regs[0].id);
          setCashRegisterName(regs[0].name);
        }
      } catch {
        /* opsiyonel picker */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount bootstrap
  }, []);

  const load = useCallback(async () => {
    if (!invoiceId) return;
    setError(null);
    setLoading(true);
    try {
      const doc = await fetchInvoiceById(invoiceId);
      if (!doc) {
        setError(t('invoiceForm.notFound'));
        return;
      }
      const kind = invoiceFormKindFromTrcode(
        Number(doc.trcode ?? 0),
        doc.fiche_type,
      );
      setResolvedKind(kind);
      setCustomerId(doc.customer_id || undefined);
      setCustomerName(
        doc.customer_name ||
          (isSupplierKind(kind) ? 'Tedarikçi' : 'Perakende'),
      );
      setNotes(doc.notes || '');
      setStatus(doc.status || 'approved');
      setPaymentMethod(doc.payment_method || 'Nakit');
      setDocumentNo(doc.document_no || '');
      const dateStr = String(doc.date || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) setInvoiceDate(dateStr);
      setCurrency((doc.currency || 'TRY').trim() || 'TRY');
      setCurrencyRate(String(doc.currency_rate ?? 1));
      const hf = doc.header_fields || {};
      setSpecialCode(hf.specialCode || '');
      setSalespersonCode(hf.salespersonCode || '');
      setDueDate(hf.dueDate || '');
      if (hf.warehouse) setWarehouseLabel(hf.warehouse);
      if (hf.cashRegisterId) {
        setCashRegisterId(hf.cashRegisterId);
        setCashRegisterName(hf.cashRegisterName || '');
      }
      if (doc.store_id) setSelectedStoreId(doc.store_id);
      const draft = (doc.lines || []).map(lineFromDetail);
      setLines(draft);
      const allow = invoiceAllowsLineEdit(doc.status);
      setCanEditLines(allow);
      if (doc.total_discount != null && doc.total_discount > 0) {
        const lineDisc = draft.reduce((s, l) => {
          const gross = l.unitPrice * l.qty;
          return s + gross * ((l.discountPercent || 0) / 100);
        }, 0);
        const foot = Math.max(0, Number(doc.total_discount) - lineDisc);
        if (foot > 0) setFooterDiscount(String(Math.round(foot * 100) / 100));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [invoiceId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!showPartyPicker) return;
    const timer = setTimeout(async () => {
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
    return () => clearTimeout(timer);
  }, [partySearch, showPartyPicker, resolvedKind]);

  useEffect(() => {
    if (!showProdPicker) return;
    const timer = setTimeout(async () => {
      try {
        if (serviceMode) {
          setSvcRows(await fetchServices(prodSearch, 30));
          setProdRows([]);
        } else {
          setProdRows(await fetchProducts(prodSearch, 30));
          setSvcRows([]);
        }
      } catch {
        setProdRows([]);
        setSvcRows([]);
      }
    }, prodSearch ? 280 : 0);
    return () => clearTimeout(timer);
  }, [prodSearch, showProdPicker, serviceMode]);

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
        lineType: 'product',
        itemType: 'Malzeme',
      },
    ]);
    setShowProdPicker(false);
    setProdSearch('');
  };

  const addService = (s: ServiceRow) => {
    const unitPrice =
      isSupplierKind(resolvedKind)
        ? s.purchase_price > 0
          ? s.purchase_price
          : s.unit_price
        : s.unit_price;
    setLines((prev) => [
      ...prev,
      {
        key: `svc-${s.id}-${Date.now()}`,
        productId: String(s.id),
        code: s.code,
        name: s.name,
        qty: 1,
        unitPrice,
        unit: s.unit || 'Adet',
        discountPercent: 0,
        vatRate: Number.isFinite(s.tax_rate) ? s.tax_rate : 18,
        lineType: 'service',
        itemType: 'Hizmet',
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

  const buildExtras = () => ({
    documentNo: documentNo.trim() || undefined,
    footerDiscountAmount: footerDiscountNum,
    invoiceDate: invoiceDate.trim() || undefined,
    currency,
    currencyRate: currencyRateNum,
    storeId: selectedStoreId,
    cashRegisterId:
      paymentMethod === 'Nakit' || paymentMethod === 'Kredi Kartı'
        ? cashRegisterId
        : null,
    headerFields: {
      documentNo: documentNo.trim() || undefined,
      specialCode: specialCode.trim() || undefined,
      warehouse: warehouseLabel.trim() || undefined,
      salespersonCode: salespersonCode.trim() || undefined,
      dueDate: dueDate.trim() || undefined,
      cashRegisterId: cashRegisterId || undefined,
      cashRegisterName: cashRegisterName || undefined,
    },
  });

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (isEdit && invoiceId) {
        const draftLines = lines.map(({ key: _k, ...rest }) => rest);
        if (canEditLines) {
          const validationError = validateCreate(
            t,
            resolvedKind,
            lines,
            customerId,
            customerName,
            cashier,
          );
          if (validationError) {
            Alert.alert(t('alert.missingInfo'), validationError);
            setSaving(false);
            return;
          }
        }
        await updateInvoiceHeader(invoiceId, {
          notes,
          status,
          documentNo: documentNo.trim() || undefined,
          invoiceDate: invoiceDate.trim() || undefined,
          currency,
          currencyRate: currencyRateNum,
          headerFields: buildExtras().headerFields,
          ...(canEditLines
            ? { lines: draftLines, footerDiscountAmount: footerDiscountNum }
            : {}),
        });
        navigation.replace('InvoiceDetail', { invoiceId });
        return;
      }
      const validationError = validateCreate(
        t,
        resolvedKind,
        lines,
        customerId,
        customerName,
        cashier,
      );
      if (validationError) {
        Alert.alert(t('alert.missingInfo'), validationError);
        setSaving(false);
        return;
      }

      const draftLines = lines.map(({ key: _k, ...rest }) => rest);
      const extras = buildExtras();

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
  const lineButtonLabel = serviceMode ? 'Hizmet' : 'Ürün';
  const showLinesEditor = !isEdit || canEditLines;
  const showCashPicker =
    paymentMethod === 'Nakit' || paymentMethod === 'Kredi Kartı';

  const renderLineEditor = (line: DraftLine, editable: boolean) => (
    <View
      key={line.key}
      style={[
        styles.lineCard,
        { backgroundColor: colors.card, borderColor: colors.cardBorder },
      ]}
    >
      <View style={styles.lineTop}>
        <View style={{ flex: 1 }}>
          <Text
            style={{ color: colors.text, fontWeight: '700' }}
            numberOfLines={2}
          >
            {line.name}
          </Text>
          {line.lineType === 'service' || line.itemType === 'Hizmet' ? (
            <Text style={{ color: accent, fontSize: 10, fontWeight: '800', marginTop: 2 }}>
              HİZMET
            </Text>
          ) : null}
        </View>
        {editable ? (
          <Pressable onPress={() => removeLine(line.key)} hitSlop={8}>
            <Trash2 size={16} color={palette.red500} />
          </Pressable>
        ) : null}
      </View>
      {editable ? (
        <View style={styles.lineFields}>
          <FormField
            label="Miktar"
            value={String(line.qty)}
            onChangeText={(txt) => {
              const n = parseFloat(txt.replace(',', '.'));
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
            onChangeText={(txt) => {
              const n = parseFloat(txt.replace(',', '.'));
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
            onChangeText={(txt) => {
              const n = parseFloat(txt.replace(',', '.'));
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
            onChangeText={(txt) => {
              const n = parseFloat(txt.replace(',', '.'));
              updateLine(line.key, {
                vatRate: Number.isFinite(n) && n >= 0 ? Math.min(100, n) : 0,
              });
            }}
            keyboardType="decimal-pad"
            containerStyle={{ width: 64 }}
          />
        </View>
      ) : (
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          {line.qty} × {formatMoney(line.unitPrice)} · KDV %{line.vatRate ?? 0}
        </Text>
      )}
      <Text style={{ color: accent, fontWeight: '800', textAlign: 'right' }}>
        {formatMoney(invoiceLineNet(line))} {currency}
      </Text>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={titleForKind(resolvedKind, isEdit)}
        subtitle={
          isEdit
            ? canEditLines
              ? 'Taslak — kalem + header'
              : 'Header · kalemler salt okunur'
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
            {isEdit && !canEditLines ? (
              <View
                style={[styles.info, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              >
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Onaylı/tamamlanmış fişte kalem değişimi stok ve cari bakiyeyi etkiler; mobil
                  yalnızca tarih, döviz, depo, vade, özel kod, satış elemanı, not ve durum
                  günceller. Taslak faturalarda kalem düzenlenebilir.
                </Text>
              </View>
            ) : null}

            {!isEdit || canEditLines ? (
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
              </>
            ) : (
              <View
                style={[
                  styles.pickerBtn,
                  { borderColor: colors.cardBorder, backgroundColor: colors.card },
                ]}
              >
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700' }}>
                  {partyLabel}
                </Text>
                <Text style={{ color: colors.text, fontWeight: '700', marginTop: 4 }}>
                  {customerName}
                </Text>
              </View>
            )}

            <FormField
              label="Belge no"
              value={documentNo}
              onChangeText={setDocumentNo}
              placeholder="Opsiyonel belge / irsaliye no"
            />

            <View style={styles.row2}>
              <FormField
                label="Fatura tarihi"
                value={invoiceDate}
                onChangeText={setInvoiceDate}
                placeholder="YYYY-MM-DD"
                containerStyle={{ flex: 1 }}
              />
              <FormField
                label="Vade"
                value={dueDate}
                onChangeText={setDueDate}
                placeholder="YYYY-MM-DD"
                containerStyle={{ flex: 1 }}
              />
            </View>

            <View style={styles.statusWrap}>
              <Text style={[styles.statusLabel, { color: colors.textMuted }]}>DÖVİZ</Text>
              <View style={styles.statusRow}>
                {CURRENCY_OPTIONS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setCurrency(c)}
                    style={[
                      styles.chip,
                      {
                        borderColor: currency === c ? accent : colors.cardBorder,
                        backgroundColor: currency === c ? accent : colors.card,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: currency === c ? palette.white : colors.text,
                        fontSize: 11,
                        fontWeight: '700',
                      }}
                    >
                      {c}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <FormField
              label="Kur"
              value={currencyRate}
              onChangeText={setCurrencyRate}
              keyboardType="decimal-pad"
              placeholder="1"
            />

            <View style={styles.row2}>
              <FormField
                label="Özel kod"
                value={specialCode}
                onChangeText={setSpecialCode}
                placeholder="Opsiyonel"
                containerStyle={{ flex: 1 }}
              />
              <FormField
                label="Satış elemanı"
                value={salespersonCode}
                onChangeText={setSalespersonCode}
                placeholder="Kod / ad"
                containerStyle={{ flex: 1 }}
              />
            </View>

            {stores.length ? (
              <View style={styles.statusWrap}>
                <Text style={[styles.statusLabel, { color: colors.textMuted }]}>DEPO / MAĞAZA</Text>
                <View style={styles.statusRow}>
                  {stores.slice(0, 8).map((s) => {
                    const active = selectedStoreId === s.id;
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => {
                          setSelectedStoreId(s.id);
                          setWarehouseLabel(s.name);
                        }}
                        style={[
                          styles.chip,
                          {
                            borderColor: active ? accent : colors.cardBorder,
                            backgroundColor: active ? accent : colors.card,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: active ? palette.white : colors.text,
                            fontSize: 11,
                            fontWeight: '700',
                          }}
                          numberOfLines={1}
                        >
                          {s.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : (
              <FormField
                label="Depo / ambar"
                value={warehouseLabel}
                onChangeText={setWarehouseLabel}
                placeholder="Merkez"
              />
            )}

            {isReturnKind(resolvedKind) && (!isEdit || canEditLines) ? (
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

            <FormField
              label="Not"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              style={{ minHeight: 72, textAlignVertical: 'top' }}
            />

            {(!isEdit || canEditLines) && showPaymentChips(resolvedKind) ? (
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
                {serviceMode ? (
                  <Text style={{ color: colors.textSubtle, fontSize: 10, paddingHorizontal: 4 }}>
                    Hizmet: stok düşmez · verilen hizmette peşin → kasa; veresiye → cari borç
                  </Text>
                ) : null}
              </View>
            ) : null}

            {showCashPicker && cashRegs.length && (!isEdit || canEditLines) ? (
              <View style={styles.statusWrap}>
                <Text style={[styles.statusLabel, { color: colors.textMuted }]}>KASA</Text>
                <View style={styles.statusRow}>
                  {cashRegs.slice(0, 6).map((r) => {
                    const active = cashRegisterId === r.id;
                    return (
                      <Pressable
                        key={r.id}
                        onPress={() => {
                          setCashRegisterId(r.id);
                          setCashRegisterName(r.name);
                        }}
                        style={[
                          styles.chip,
                          {
                            borderColor: active ? accent : colors.cardBorder,
                            backgroundColor: active ? accent : colors.card,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: active ? palette.white : colors.text,
                            fontSize: 11,
                            fontWeight: '700',
                          }}
                        >
                          {r.name}
                        </Text>
                      </Pressable>
                    );
                  })}
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

            <View style={styles.lineHeader}>
              <Text style={[styles.sec, { color: colors.text }]}>
                Kalemler ({lines.length})
              </Text>
              {showLinesEditor ? (
                <Pressable
                  onPress={() => setShowProdPicker((v) => !v)}
                  style={[styles.addBtn, { backgroundColor: accent }]}
                >
                  <Plus size={16} color={palette.white} />
                  <Text style={styles.addBtnText}>{lineButtonLabel}</Text>
                </Pressable>
              ) : null}
            </View>

            {showLinesEditor && showProdPicker ? (
              <View style={[styles.pickerPanel, { borderColor: colors.cardBorder }]}>
                <SearchBar
                  value={prodSearch}
                  onChangeText={setProdSearch}
                  placeholder={serviceMode ? 'Hizmet ara…' : 'Ürün ara…'}
                />
                {serviceMode ? (
                  <FlatList
                    data={svcRows}
                    keyExtractor={(item) => String(item.id)}
                    scrollEnabled={false}
                    ListEmptyComponent={
                      <Text style={{ color: colors.textMuted, padding: 8, fontSize: 12 }}>
                        Hizmet kartı bulunamadı
                      </Text>
                    }
                    renderItem={({ item }) => (
                      <Pressable
                        onPress={() => addService(item)}
                        style={[styles.pickRow, { borderBottomColor: colors.cardBorder }]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{ color: colors.text, fontWeight: '600' }}
                            numberOfLines={1}
                          >
                            {item.name}
                          </Text>
                          <Text style={{ color: colors.textMuted, fontSize: 10 }}>
                            {item.code || '—'}
                            {item.category ? ` · ${item.category}` : ''}
                          </Text>
                        </View>
                        <Text style={{ color: accent, fontSize: 11, fontWeight: '700' }}>
                          {formatMoney(
                            isSupplierKind(resolvedKind)
                              ? item.purchase_price > 0
                                ? item.purchase_price
                                : item.unit_price
                              : item.unit_price,
                          )}{' '}
                          {currency}
                        </Text>
                      </Pressable>
                    )}
                  />
                ) : (
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
                          {currency}
                        </Text>
                      </Pressable>
                    )}
                  />
                )}
              </View>
            ) : null}

            {lines.map((line) => renderLineEditor(line, showLinesEditor))}

            {showLinesEditor ? (
              <FormField
                label="Dip indirim (tutar)"
                value={footerDiscount}
                onChangeText={setFooterDiscount}
                keyboardType="decimal-pad"
                placeholder="0"
              />
            ) : null}

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
                  {formatMoney(totals.subtotal + totals.lineDiscount)} {currency}
                </Text>
              </View>
              {totals.lineDiscount > 0 ? (
                <View style={styles.summaryRow}>
                  <Text style={{ color: colors.textMuted }}>Satır indirimi</Text>
                  <Text style={{ color: palette.red500, fontWeight: '600' }}>
                    −{formatMoney(totals.lineDiscount)} {currency}
                  </Text>
                </View>
              ) : null}
              {totals.footerDiscount > 0 ? (
                <View style={styles.summaryRow}>
                  <Text style={{ color: colors.textMuted }}>Dip indirim</Text>
                  <Text style={{ color: palette.red500, fontWeight: '600' }}>
                    −{formatMoney(totals.footerDiscount)} {currency}
                  </Text>
                </View>
              ) : null}
              <View style={styles.summaryRow}>
                <Text style={{ color: colors.textMuted }}>KDV (satır)</Text>
                <Text style={{ color: colors.textMuted, fontWeight: '600' }}>
                  {formatMoney(totals.totalVat)} {currency}
                </Text>
              </View>
              {currencyRateNum !== 1 ? (
                <Text style={{ color: colors.textSubtle, fontSize: 10, marginTop: 2 }}>
                  Kur {currencyRateNum} · {currency}
                </Text>
              ) : null}
              <View style={[styles.summaryRow, { marginTop: 8 }]}>
                <Text style={{ color: colors.text, fontWeight: '800' }}>Genel toplam</Text>
                <Text style={{ color: accent, fontSize: 22, fontWeight: '800' }}>
                  {formatMoney(totals.net)} {currency}
                </Text>
              </View>
            </View>

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
  row2: { flexDirection: 'row', gap: 10 },
});
