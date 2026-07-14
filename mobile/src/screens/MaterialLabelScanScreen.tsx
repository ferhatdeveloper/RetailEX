/**
 * Raf / ürün etiketi OCR → malzeme (ürün kartı) oluşturma.
 * Akış: tip → kamera/galeri → onay modalı → createProduct.
 * OCR: scanOcr + shelfLabelOcrParse (kimlik parse'ından ayrı).
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Camera, ImageIcon, Package, ScanLine } from 'lucide-react-native';
import { ScreenHeader, ErrorBanner } from '../components/ScreenChrome';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import { PercentBodySheet } from '../components/PercentBodySheet';
import {
  createProduct,
  generateProductCode,
  type ProductInput,
} from '../api/productsApi';
import {
  extractTextFromImageUri,
  pickImageFromCamera,
  pickImageFromGallery,
} from '../utils/scanOcr';
import {
  parseProductFromOcr,
  type ParsedProductFields,
} from '../utils/shelfLabelOcrParse';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

export type MaterialProductKind = 'stock' | 'weighed';

type FormState = {
  code: string;
  barcode: string;
  name: string;
  unit: string;
  price: string;
  vat_rate: string;
};

const EMPTY_FORM: FormState = {
  code: '',
  barcode: '',
  name: '',
  unit: 'AD',
  price: '',
  vat_rate: '20',
};

function defaultUnitForKind(kind: MaterialProductKind): string {
  return kind === 'weighed' ? 'KG' : 'AD';
}

function parsedToForm(
  fields: ParsedProductFields,
  code: string,
  kind: MaterialProductKind,
): FormState {
  return {
    code: fields.code?.trim() || code,
    barcode: fields.barcode?.trim() || '',
    name: fields.name?.trim() || '',
    unit: (fields.unit?.trim() || defaultUnitForKind(kind)).slice(0, 12),
    price:
      fields.price != null && fields.price > 0
        ? String(Math.round(fields.price * 100) / 100)
        : '',
    vat_rate:
      fields.vatRate != null && fields.vatRate >= 0
        ? String(fields.vatRate)
        : '20',
  };
}

export function MaterialLabelScanScreen() {
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'MaterialLabelScan'>>();

  const [productKind, setProductKind] = useState<MaterialProductKind>(
    route.params?.productKind ?? 'stock',
  );
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrHint, setOcrHint] = useState<string | null>(null);
  const [rawPreview, setRawPreview] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const kindOptions = useMemo(
    () =>
      [
        { id: 'stock' as const, label: t('materialScan.typeStock') },
        { id: 'weighed' as const, label: t('materialScan.typeWeighed') },
      ] as const,
    [t],
  );

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const openConfirmWithParsed = useCallback(
    async (fields: ParsedProductFields, hintKey?: string, hintDetail?: string) => {
      let code = '';
      try {
        code = await generateProductCode();
      } catch {
        code = 'P001';
      }
      setRawPreview(fields.rawText.slice(0, 800));
      setForm(parsedToForm(fields, code, productKind));
      if (hintKey === 'ocrUnsupported') {
        setOcrHint(t('materialScan.ocrUnsupported'));
      } else if (hintKey === 'ocrEmpty') {
        setOcrHint(t('materialScan.ocrEmpty'));
      } else if (hintKey === 'ocrFailed') {
        setOcrHint(
          hintDetail
            ? t('materialScan.ocrFailedDetail', { message: hintDetail })
            : t('materialScan.ocrFailed'),
        );
      } else if (fields.rawText.trim()) {
        setOcrHint(
          t('materialScan.ocrOk', {
            lines: fields.ocrLines.length,
          }),
        );
      } else {
        setOcrHint(t('materialScan.ocrEmpty'));
      }
      setConfirmOpen(true);
    },
    [productKind, t],
  );

  const processUri = useCallback(
    async (uri: string) => {
      setImageUri(uri);
      setOcrBusy(true);
      setError(null);
      setOcrHint(null);
      try {
        const { blocks, ocrAvailable, ocrError } = await extractTextFromImageUri(uri);
        const fields = parseProductFromOcr(blocks);
        if (ocrError === 'ocrUnsupported') {
          await openConfirmWithParsed(fields, 'ocrUnsupported');
        } else if (ocrError) {
          await openConfirmWithParsed(fields, 'ocrFailed', ocrError);
        } else if (ocrAvailable && !fields.rawText.trim()) {
          await openConfirmWithParsed(fields, 'ocrEmpty');
        } else {
          await openConfirmWithParsed(fields);
        }
      } finally {
        setOcrBusy(false);
      }
    },
    [openConfirmWithParsed],
  );

  const pickCamera = async () => {
    setError(null);
    try {
      const res = await pickImageFromCamera(0.9);
      if ('permissionDenied' in res && res.permissionDenied === 'camera') {
        Alert.alert(t('materialScan.permissionTitle'), t('materialScan.cameraPermission'));
        return;
      }
      if (res.canceled || !('uri' in res)) return;
      await processUri(res.uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const pickGallery = async () => {
    setError(null);
    try {
      const res = await pickImageFromGallery(0.9);
      if ('permissionDenied' in res && res.permissionDenied === 'gallery') {
        Alert.alert(t('materialScan.permissionTitle'), t('materialScan.galleryPermission'));
        return;
      }
      if (res.canceled || !('uri' in res)) return;
      await processUri(res.uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const skipManual = async () => {
    setImageUri(null);
    await openConfirmWithParsed(parseProductFromOcr([]), 'ocrEmpty');
    setOcrHint(t('materialScan.manualHint'));
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) {
      Alert.alert(t('alert.missingField'), t('formValidation.productNameRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const priceNum = Number(String(form.price).replace(',', '.'));
      const vatNum = Number(String(form.vat_rate).replace(',', '.'));
      const input: ProductInput = {
        code: form.code.trim() || undefined,
        barcode: form.barcode.trim() || undefined,
        name,
        unit: form.unit.trim() || defaultUnitForKind(productKind),
        price: Number.isFinite(priceNum) && priceNum >= 0 ? priceNum : 0,
        cost: 0,
        stock: 0,
        vat_rate: Number.isFinite(vatNum) && vatNum >= 0 ? vatNum : 20,
      };
      const id = await createProduct(input);
      setConfirmOpen(false);
      navigation.replace('ProductDetail', { productId: id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={t('materialScan.title')} subtitle={t('materialScan.subtitle')} />
      {error ? <ErrorBanner message={error} /> : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
          {t('materialScan.selectType')}
        </Text>
        <View style={styles.chipRow}>
          {kindOptions.map((opt) => {
            const active = productKind === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => {
                  setProductKind(opt.id);
                  setForm((prev) => ({
                    ...prev,
                    unit: prev.unit.trim() ? prev.unit : defaultUnitForKind(opt.id),
                  }));
                }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? palette.blue600 : colors.card,
                    borderColor: active ? palette.blue600 : colors.cardBorder,
                  },
                ]}
              >
                <Text
                  style={{
                    color: active ? palette.white : colors.text,
                    fontWeight: '700',
                    fontSize: 13,
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.hint, { color: colors.textMuted }]}>
          {t('materialScan.captureHint')}
        </Text>

        {ocrBusy ? (
          <View style={styles.busyBox}>
            <ActivityIndicator color={palette.blue600} />
            <Text style={{ color: colors.textMuted, marginTop: 10 }}>
              {t('materialScan.reading')}
            </Text>
          </View>
        ) : (
          <View style={styles.actions}>
            <Pressable
              onPress={() => void pickCamera()}
              style={[styles.captureBtn, { backgroundColor: palette.blue600 }]}
            >
              <Camera size={18} color={palette.white} />
              <Text style={styles.captureBtnLabel}>{t('materialScan.camera')}</Text>
            </Pressable>
            <Pressable
              onPress={() => void pickGallery()}
              style={[
                styles.captureBtn,
                styles.captureBtnGhost,
                { borderColor: colors.cardBorder, backgroundColor: colors.card },
              ]}
            >
              <ImageIcon size={18} color={palette.blue600} />
              <Text style={[styles.captureBtnLabel, { color: colors.text }]}>
                {t('materialScan.gallery')}
              </Text>
            </Pressable>
            <Pressable onPress={() => void skipManual()} style={styles.manualLink}>
              <Text style={{ color: colors.textMuted, fontWeight: '600' }}>
                {t('materialScan.manualEntry')}
              </Text>
            </Pressable>
          </View>
        )}

        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />
        ) : (
          <View
            style={[
              styles.placeholder,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
          >
            <Package size={40} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, marginTop: 8, textAlign: 'center' }}>
              {t('materialScan.placeholder')}
            </Text>
          </View>
        )}
      </ScrollView>

      <PercentBodySheet
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('materialScan.confirmTitle')}
        subtitle={
          productKind === 'weighed'
            ? t('materialScan.typeWeighed')
            : t('materialScan.typeStock')
        }
        size="list"
        footer={
          <View style={{ flex: 1, gap: 8 }}>
            <PrimaryButton
              label={saving ? t('materialScan.saving') : t('materialScan.save')}
              onPress={() => void handleSave()}
              loading={saving}
              disabled={saving}
            />
            <Pressable
              onPress={() => setConfirmOpen(false)}
              style={{ alignItems: 'center', paddingVertical: 6 }}
            >
              <Text style={{ color: colors.textMuted, fontWeight: '600' }}>{t('cancel')}</Text>
            </Pressable>
          </View>
        }
      >
        {ocrHint ? (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{ocrHint}</Text>
        ) : null}
        <View style={styles.modalKindRow}>
          <ScanLine size={16} color={palette.blue600} />
          <Text style={{ color: palette.blue600, fontSize: 11, fontWeight: '700' }}>
            {t('materialScan.labelHint')}
          </Text>
        </View>
        <FormField
          label={t('materialScan.fieldCode')}
          value={form.code}
          onChangeText={(v) => setField('code', v)}
          autoCapitalize="characters"
        />
        <FormField
          label={t('materialScan.fieldBarcode')}
          value={form.barcode}
          onChangeText={(v) => setField('barcode', v)}
          keyboardType="number-pad"
        />
        <FormField
          label={t('materialScan.fieldName')}
          value={form.name}
          onChangeText={(v) => setField('name', v)}
        />
        <FormField
          label={t('materialScan.fieldUnit')}
          value={form.unit}
          onChangeText={(v) => setField('unit', v)}
          autoCapitalize="characters"
        />
        <FormField
          label={t('materialScan.fieldPrice')}
          value={form.price}
          onChangeText={(v) => setField('price', v)}
          keyboardType="decimal-pad"
        />
        <FormField
          label={t('materialScan.fieldVat')}
          value={form.vat_rate}
          onChangeText={(v) => setField('vat_rate', v)}
          keyboardType="decimal-pad"
        />
        {rawPreview ? (
          <Text style={{ color: colors.textMuted, fontSize: 10 }} numberOfLines={6}>
            OCR: {rawPreview}
          </Text>
        ) : null}
      </PercentBodySheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 16, gap: 12, paddingBottom: 48 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  hint: { fontSize: 13, lineHeight: 18 },
  actions: { marginTop: 4, gap: 10 },
  captureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
  },
  captureBtnGhost: {
    borderWidth: 1,
  },
  captureBtnLabel: {
    color: palette.white,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  manualLink: { marginTop: 6, alignItems: 'center' },
  busyBox: { alignItems: 'center', paddingVertical: 28 },
  preview: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginTop: 8,
  },
  placeholder: {
    borderWidth: 1,
    borderRadius: 12,
    borderStyle: 'dashed',
    padding: 28,
    alignItems: 'center',
    marginTop: 8,
  },
  modalKindRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
