import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ImageIcon, ScanLine, Trash2, Plus, FilePlus } from 'lucide-react-native';
import { ScreenHeader, ErrorBanner, SearchBar } from '../components/ScreenChrome';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  createPurchaseInvoice,
  createSalesInvoice,
  createDocumentInvoice,
  invoiceTotalsFromLines,
  isInvoiceDocumentKind,
  type InvoiceDocumentKind,
  type InvoiceDraftLine,
  type InvoiceFormKind,
} from '../api/invoicesApi';
import { fetchCustomers, type CustomerRow } from '../api/customersApi';
import { fetchSuppliers, type SupplierRow } from '../api/suppliersApi';
import { fetchProducts, type ProductRow } from '../api/productsApi';
import { formatMoney, newUuid } from '../api/erpTables';
import { parseInvoiceOcr, type ParsedInvoiceFields } from '../utils/documentOcrParse';
import { runDocumentScanPipeline } from '../utils/documentScanPipeline';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Step = 'capture' | 'review' | 'confirm';

type DraftLine = InvoiceDraftLine & { key: string };

type PartyRow = { id: string; name: string; code: string | null };

const KIND_OPTIONS: { id: InvoiceFormKind; label: string }[] = [
  { id: 'sales', label: 'Satış faturası' },
  { id: 'purchase', label: 'Alış faturası' },
  { id: 'service-given', label: 'Verilen hizmet' },
  { id: 'service-received', label: 'Alınan hizmet' },
];

function isSupplierKind(kind: InvoiceFormKind): boolean {
  return kind === 'purchase' || kind === 'service-received';
}

function fieldsToDraftLines(
  fields: ParsedInvoiceFields,
  matched: ProductRow[],
): DraftLine[] {
  const vat = fields.vatRate ?? 20;
  if (fields.lines.length > 0) {
    return fields.lines.map((l, i) => {
      const hit = matched.find(
        (p) =>
          p.name.toLocaleLowerCase('tr-TR').includes(l.name.toLocaleLowerCase('tr-TR').slice(0, 12)) ||
          (p.code && l.name.includes(p.code)),
      );
      return {
        key: `ocr-${i}-${Date.now()}`,
        productId: hit ? String(hit.id) : newUuid(),
        code: hit?.code ?? null,
        name: hit?.name ?? l.name,
        qty: l.qty > 0 ? l.qty : 1,
        unitPrice: l.unitPrice,
        unit: hit?.unit ?? 'Adet',
        discountPercent: 0,
        vatRate: hit && Number.isFinite(hit.vat_rate) ? Number(hit.vat_rate) : vat,
      };
    });
  }
  if (fields.totalAmount != null && fields.totalAmount > 0) {
    return [
      {
        key: `total-${Date.now()}`,
        productId: newUuid(),
        code: null,
        name: 'Belge tarama — toplam kalem',
        qty: 1,
        unitPrice: fields.totalAmount,
        unit: 'Adet',
        discountPercent: 0,
        vatRate: vat,
      },
    ];
  }
  return [];
}

export function DocumentScanScreen() {
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'DocumentScan'>>();
  const initialKind = route.params?.kind ?? 'purchase';

  const [step, setStep] = useState<Step>('capture');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrHint, setOcrHint] = useState<string | null>(null);
  const [rawPreview, setRawPreview] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveToGallery, setSaveToGallery] = useState(false);

  const [kind, setKind] = useState<InvoiceFormKind>(initialKind);
  const [partyId, setPartyId] = useState<string | undefined>();
  const [partyName, setPartyName] = useState('');
  const [documentNo, setDocumentNo] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Nakit');
  const [lines, setLines] = useState<DraftLine[]>([]);

  const [partySearch, setPartySearch] = useState('');
  const [partyRows, setPartyRows] = useState<PartyRow[]>([]);
  const [showPartyPicker, setShowPartyPicker] = useState(false);
  const [prodSearch, setProdSearch] = useState('');
  const [prodRows, setProdRows] = useState<ProductRow[]>([]);
  const [showProdPicker, setShowProdPicker] = useState(false);

  const totals = useMemo(() => invoiceTotalsFromLines(lines, 0), [lines]);

  useEffect(() => {
    if (route.params?.kind) setKind(route.params.kind);
  }, [route.params?.kind]);

  useEffect(() => {
    if (!showPartyPicker) return;
    const t = setTimeout(async () => {
      try {
        if (isSupplierKind(kind)) {
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
  }, [partySearch, showPartyPicker, kind]);

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

  const applyParsed = useCallback(async (fields: ParsedInvoiceFields) => {
    if (fields.documentNo) setDocumentNo(fields.documentNo);
    if (fields.partyName) {
      setPartyName(fields.partyName);
      setPartyId(undefined);
    }
    setRawPreview(fields.rawText.slice(0, 1200));
    const noteBits = ['Belge taramadan oluşturuldu'];
    if (fields.rawText.trim()) noteBits.push('OCR önizleme eklendi');
    setNotes(noteBits.join(' · '));

    let matched: ProductRow[] = [];
    try {
      matched = await fetchProducts('', 80);
    } catch {
      matched = [];
    }
    setLines(fieldsToDraftLines(fields, matched));
  }, []);

  const runScan = useCallback(
    async (fromGallery: boolean) => {
      setOcrBusy(true);
      setError(null);
      setOcrHint(null);
      try {
        const res = await runDocumentScanPipeline({
          maxPages: 1,
          fromGallery,
          saveToGallery,
          albumName: 'Asin',
        });
        if (res.canceled) return;
        if ('permissionDenied' in res && res.permissionDenied) {
          Alert.alert(
            t('docScan.permissionTitle'),
            res.permissionDenied === 'camera'
              ? t('docScan.cameraPermission')
              : t('docScan.galleryPermission'),
          );
          return;
        }
        if (!('uri' in res)) return;

        setImageUri(res.uri);
        const { blocks, ocrAvailable, ocrError } = res.ocr;
        const used = parseInvoiceOcr(Array.isArray(blocks) ? blocks : []);
        const scanNote =
          res.mode === 'native' ? t('docScan.nativeScanOk') : t('docScan.fallbackScanOk');
        if (ocrError === 'ocrUnsupported') {
          setOcrHint(
            `${scanNote}\nOCR bu ortamda kullanılamıyor (Expo Go veya native derleme gerekir). Alanları elle doldurun.`,
          );
        } else if (ocrError) {
          setOcrHint(`${scanNote}\nOCR açılamadı. Manuel doldurma ile devam edin.`);
        } else if (ocrAvailable && !used.rawText.trim()) {
          setOcrHint(`${scanNote}\n${t('docScan.ocrEmptyInvoice')}`);
        } else if (ocrAvailable) {
          setOcrHint(
            `${scanNote}\n${t('docScan.ocrOkInvoice', { lines: used.ocrLines.length })}`,
          );
        } else {
          setOcrHint(scanNote);
        }
        if (saveToGallery) {
          setOcrHint((prev) =>
            `${prev ?? ''}\n${
              res.savedToGallery ? t('docScan.savedToGallery') : t('docScan.saveFailed')
            }`.trim(),
          );
        }
        await applyParsed(used);
        setStep('review');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setOcrBusy(false);
      }
    },
    [applyParsed, saveToGallery, t],
  );

  const pickCamera = async () => {
    setError(null);
    await runScan(false);
  };

  const pickGallery = async () => {
    setError(null);
    await runScan(true);
  };

  const skipToManual = () => {
    setImageUri(null);
    setOcrHint('Fotoğraf yok — alanları elle doldurun.');
    setRawPreview('');
    setLines([]);
    setDocumentNo('');
    setPartyName('');
    setPartyId(undefined);
    setNotes('Manuel belge girişi');
    setStep('review');
  };

  const addProduct = (p: ProductRow) => {
    const unitPrice = isSupplierKind(kind)
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

  const addBlankLine = () => {
    setLines((prev) => [
      ...prev,
      {
        key: `blank-${Date.now()}`,
        productId: newUuid(),
        code: null,
        name: 'Kalem',
        qty: 1,
        unitPrice: 0,
        unit: 'Adet',
        discountPercent: 0,
        vatRate: 20,
      },
    ]);
  };

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const goConfirm = () => {
    if (!partyName.trim()) {
      Alert.alert('Eksik bilgi', isSupplierKind(kind) ? 'Tedarikçi seçin veya yazın.' : 'Cari seçin veya yazın.');
      return;
    }
    if (!lines.length) {
      Alert.alert('Eksik bilgi', 'En az bir kalem gerekli.');
      return;
    }
    if (lines.some((l) => !(l.unitPrice > 0) || !(l.qty > 0) || !l.name.trim())) {
      Alert.alert('Eksik bilgi', 'Kalem ad, miktar ve birim fiyat kontrol edin.');
      return;
    }
    setStep('confirm');
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const draftLines = lines.map(({ key: _k, ...rest }) => rest);
      const extras = {
        documentNo: documentNo.trim() || undefined,
      };
      const noteFinal = notes.trim() || 'Belge taramadan';

      let result: { id: string; queued?: boolean };
      if (kind === 'purchase') {
        result = await createPurchaseInvoice({
          supplierId: partyId,
          supplierName: partyName.trim(),
          notes: noteFinal,
          paymentMethod,
          lines: draftLines,
          ...extras,
        });
      } else if (isInvoiceDocumentKind(kind)) {
        result = await createDocumentInvoice(kind as InvoiceDocumentKind, {
          accountId: partyId,
          accountName: partyName.trim(),
          notes: noteFinal,
          paymentMethod,
          lines: draftLines,
          ...extras,
        });
      } else {
        result = await createSalesInvoice({
          customerId: partyId,
          customerName: partyName.trim(),
          notes: noteFinal,
          paymentMethod,
          lines: draftLines,
          ...extras,
        });
      }

      Alert.alert(
        result.queued ? 'Kuyruğa alındı' : 'Kaydedildi',
        result.queued
          ? 'Çevrimdışı kuyrukta; bağlantı gelince senkronlanır.'
          : 'Fatura oluşturuldu.',
        [
          {
            text: 'Detaya git',
            onPress: () => navigation.replace('InvoiceDetail', { invoiceId: result.id }),
          },
        ],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep('review');
    } finally {
      setSaving(false);
    }
  };

  const stepLabel =
    step === 'capture' ? '1/3 · Fotoğraf' : step === 'review' ? '2/3 · Alanlar' : '3/3 · Onay';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Belge Tara" subtitle={stepLabel} />

      {error ? <ErrorBanner message={error} /> : null}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {step === 'capture' ? (
          <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
            <View
              style={[
                styles.hero,
                { backgroundColor: colors.card, borderColor: colors.cardBorder },
              ]}
            >
              <ScanLine size={40} color={palette.blue600} />
              <Text style={[styles.heroTitle, { color: colors.text }]}>
                Fatura / irsaliye fotoğrafı
              </Text>
              <Text style={[styles.heroSub, { color: colors.textMuted }]}>
                {t('docScan.invoiceCaptureHint')}
              </Text>
            </View>

            <View
              style={[
                styles.saveRow,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.cardBorder,
                  marginTop: 14,
                },
              ]}
            >
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
                  {t('docScan.saveToGallery')}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                  {t('docScan.saveToGalleryHint')}
                </Text>
              </View>
              <Switch
                value={saveToGallery}
                onValueChange={setSaveToGallery}
                trackColor={{ false: colors.cardBorder, true: palette.blue600 }}
              />
            </View>

            <PrimaryButton
              label={t('docScan.scanDocument')}
              onPress={() => void pickCamera()}
              loading={ocrBusy}
              style={{ marginTop: 16 }}
            />
            <PrimaryButton
              label={t('docScan.gallery')}
              onPress={() => void pickGallery()}
              loading={ocrBusy}
              variant="ghost"
              style={{ marginTop: 10 }}
            />
            <PrimaryButton
              label={t('docScan.manualContinue')}
              onPress={skipToManual}
              variant="ghost"
              style={{ marginTop: 10 }}
            />

            {ocrBusy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator color={palette.blue600} />
                <Text style={{ color: colors.textMuted, marginLeft: 10 }}>
                  {t('docScan.processing')}
                </Text>
              </View>
            ) : null}

            <View style={styles.kindRow}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                Hedef belge türü
              </Text>
              <View style={styles.chips}>
                {KIND_OPTIONS.map((k) => (
                  <Pressable
                    key={k.id}
                    onPress={() => setKind(k.id)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor:
                          kind === k.id ? palette.blue600 : colors.card,
                        borderColor: colors.cardBorder,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: kind === k.id ? palette.white : colors.text,
                        fontSize: 11,
                        fontWeight: '700',
                      }}
                    >
                      {k.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </ScrollView>
        ) : null}

        {step === 'review' ? (
          <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />
            ) : (
              <View
                style={[
                  styles.noImg,
                  { backgroundColor: colors.card, borderColor: colors.cardBorder },
                ]}
              >
                <ImageIcon size={28} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, marginTop: 8 }}>Fotoğraf yok</Text>
              </View>
            )}

            {ocrHint ? (
              <Text style={[styles.hint, { color: colors.textMuted }]}>{ocrHint}</Text>
            ) : null}

            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Belge türü</Text>
            <View style={styles.chips}>
              {KIND_OPTIONS.map((k) => (
                <Pressable
                  key={k.id}
                  onPress={() => setKind(k.id)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: kind === k.id ? palette.blue600 : colors.card,
                      borderColor: colors.cardBorder,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: kind === k.id ? palette.white : colors.text,
                      fontSize: 11,
                      fontWeight: '700',
                    }}
                  >
                    {k.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={() => setShowPartyPicker((v) => !v)}
              style={[
                styles.partyBtn,
                { backgroundColor: colors.card, borderColor: colors.cardBorder },
              ]}
            >
              <Text style={[styles.sectionLabel, { color: colors.textMuted, marginBottom: 4 }]}>
                {isSupplierKind(kind) ? 'Tedarikçi' : 'Cari'}
              </Text>
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {partyName.trim() || (isSupplierKind(kind) ? 'Tedarikçi seç / yaz' : 'Cari seç / yaz')}
              </Text>
            </Pressable>

            {showPartyPicker ? (
              <View style={{ marginTop: 8 }}>
                <SearchBar
                  value={partySearch}
                  onChangeText={setPartySearch}
                  placeholder="Ara…"
                />
                <FormField
                  label="veya serbest ad"
                  value={partyName}
                  onChangeText={(t) => {
                    setPartyName(t);
                    setPartyId(undefined);
                  }}
                />
                <FlatList
                  data={partyRows}
                  keyExtractor={(item) => item.id}
                  style={{ maxHeight: 160, marginTop: 8 }}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => {
                        setPartyId(item.id);
                        setPartyName(item.name);
                        setShowPartyPicker(false);
                      }}
                      style={[
                        styles.listRow,
                        { borderColor: colors.cardBorder, backgroundColor: colors.card },
                      ]}
                    >
                      <Text style={{ color: colors.text, fontWeight: '600' }}>{item.name}</Text>
                      {item.code ? (
                        <Text style={{ color: colors.textMuted, fontSize: 11 }}>{item.code}</Text>
                      ) : null}
                    </Pressable>
                  )}
                />
              </View>
            ) : null}

            <FormField
              label="Belge no"
              value={documentNo}
              onChangeText={setDocumentNo}
              containerStyle={{ marginTop: 12 }}
            />
            <FormField
              label="Not"
              value={notes}
              onChangeText={setNotes}
              multiline
              containerStyle={{ marginTop: 12 }}
            />

            <Text style={[styles.sectionLabel, { color: colors.textMuted, marginTop: 16 }]}>
              Ödeme
            </Text>
            <View style={styles.chips}>
              {(['Nakit', 'Kredi Kartı', 'Havale', 'Veresiye'] as const).map((pm) => (
                <Pressable
                  key={pm}
                  onPress={() => setPaymentMethod(pm)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: paymentMethod === pm ? palette.blue600 : colors.card,
                      borderColor: colors.cardBorder,
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

            <View style={styles.lineHeader}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Kalemler</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => setShowProdPicker((v) => !v)}
                  style={[styles.iconBtn, { backgroundColor: palette.blue600 }]}
                >
                  <Plus size={16} color={palette.white} />
                </Pressable>
                <Pressable
                  onPress={addBlankLine}
                  style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1 }]}
                >
                  <FilePlus size={14} color={colors.text} />
                </Pressable>
              </View>
            </View>

            {showProdPicker ? (
              <View style={{ marginBottom: 8 }}>
                <SearchBar
                  value={prodSearch}
                  onChangeText={setProdSearch}
                  placeholder="Ürün ara…"
                />
                <FlatList
                  data={prodRows}
                  keyExtractor={(item) => String(item.id)}
                  style={{ maxHeight: 140 }}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => addProduct(item)}
                      style={[
                        styles.listRow,
                        { borderColor: colors.cardBorder, backgroundColor: colors.card },
                      ]}
                    >
                      <Text style={{ color: colors.text, fontWeight: '600' }}>{item.name}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                        {formatMoney(isSupplierKind(kind) ? item.cost || item.price : item.price)} ₺
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
                <FormField
                  label="Ad"
                  value={line.name}
                  onChangeText={(t) => updateLine(line.key, { name: t })}
                />
                <View style={styles.lineRow}>
                  <FormField
                    label="Miktar"
                    value={String(line.qty)}
                    keyboardType="decimal-pad"
                    onChangeText={(t) => {
                      const n = parseFloat(t.replace(',', '.'));
                      updateLine(line.key, { qty: Number.isFinite(n) ? n : 0 });
                    }}
                    containerStyle={{ flex: 1 }}
                  />
                  <FormField
                    label="Birim fiyat"
                    value={String(line.unitPrice)}
                    keyboardType="decimal-pad"
                    onChangeText={(t) => {
                      const n = parseFloat(t.replace(',', '.'));
                      updateLine(line.key, { unitPrice: Number.isFinite(n) ? n : 0 });
                    }}
                    containerStyle={{ flex: 1 }}
                  />
                  <Pressable onPress={() => removeLine(line.key)} style={styles.trash}>
                    <Trash2 size={18} color={palette.red500} />
                  </Pressable>
                </View>
              </View>
            ))}

            <View style={[styles.totalBox, { borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.textMuted }}>Özet net</Text>
              <Text style={[styles.totalVal, { color: colors.text }]}>
                {formatMoney(totals.net)} ₺
              </Text>
            </View>

            {rawPreview ? (
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                  OCR önizleme
                </Text>
                <Text style={[styles.raw, { color: colors.textSubtle, backgroundColor: colors.card }]}>
                  {rawPreview}
                </Text>
              </View>
            ) : null}

            <PrimaryButton
              label="Onaya geç"
              onPress={goConfirm}
              style={{ marginTop: 20, marginBottom: 8 }}
            />
            <PrimaryButton
              label="Yeniden fotoğraf"
              onPress={() => {
                setStep('capture');
                setImageUri(null);
              }}
              variant="ghost"
              style={{ marginBottom: 32 }}
            />
          </ScrollView>
        ) : null}

        {step === 'confirm' ? (
          <ScrollView contentContainerStyle={styles.pad}>
            <View
              style={[
                styles.confirmCard,
                { backgroundColor: colors.card, borderColor: colors.cardBorder },
              ]}
            >
              <Text style={[styles.confirmTitle, { color: colors.text }]}>Kayıt özeti</Text>
              <Text style={{ color: colors.textMuted, marginTop: 8 }}>
                Tür: {KIND_OPTIONS.find((k) => k.id === kind)?.label ?? kind}
              </Text>
              <Text style={{ color: colors.textMuted }}>
                {isSupplierKind(kind) ? 'Tedarikçi' : 'Cari'}: {partyName}
              </Text>
              {documentNo ? (
                <Text style={{ color: colors.textMuted }}>Belge no: {documentNo}</Text>
              ) : null}
              <Text style={{ color: colors.textMuted }}>Ödeme: {paymentMethod}</Text>
              <Text style={{ color: colors.textMuted }}>{lines.length} kalem</Text>
              <Text style={[styles.totalVal, { color: colors.text, marginTop: 12 }]}>
                {formatMoney(totals.net)} ₺
              </Text>
            </View>

            <PrimaryButton
              label="Faturayı kaydet"
              onPress={() => void handleSave()}
              loading={saving}
              style={{ marginTop: 16 }}
            />
            <PrimaryButton
              label="Düzenlemeye dön"
              onPress={() => setStep('review')}
              variant="ghost"
              style={{ marginTop: 10, marginBottom: 40 }}
              disabled={saving}
            />
          </ScrollView>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pad: { padding: 16, paddingBottom: 48 },
  hero: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  heroTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  heroSub: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  busyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, justifyContent: 'center' },
  kindRow: { marginTop: 24 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  preview: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#111',
  },
  noImg: {
    height: 100,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  hint: { fontSize: 12, marginBottom: 12, lineHeight: 17 },
  partyBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
  },
  listRow: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 6,
  },
  lineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  lineRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  trash: { paddingBottom: 14, paddingHorizontal: 4 },
  totalBox: {
    marginTop: 8,
    borderTopWidth: 1,
    paddingTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalVal: { fontSize: 20, fontWeight: '800' },
  raw: {
    fontSize: 11,
    lineHeight: 15,
    padding: 10,
    borderRadius: 8,
    maxHeight: 120,
  },
  confirmCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
  },
  confirmTitle: { fontSize: 16, fontWeight: '800' },
});
