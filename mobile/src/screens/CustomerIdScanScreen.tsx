/**
 * Kimlik / kart OCR → cari oluşturma.
 * Akış: tip seçimi → kamera/galeri → onay modalı (düzenlenebilir) → kaydet.
 * OCR: expo-text-extractor + identityCardOcrParse (DocumentScan ile aynı motor).
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
  Switch,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Camera, ImageIcon, ScanLine, UserRound } from 'lucide-react-native';
import { ScreenHeader, ErrorBanner } from '../components/ScreenChrome';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import { PercentBodySheet } from '../components/PercentBodySheet';
import {
  createCustomer,
  generateCustomerCode,
  type CustomerInput,
} from '../api/customersApi';
import { createSupplier, generateSupplierCode } from '../api/suppliersApi';
import {
  parseIdentityCardOcr,
  type IdentityDocKind,
  type ParsedIdentityFields,
} from '../utils/identityCardOcrParse';
import { runDocumentScanPipeline } from '../utils/documentScanPipeline';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

export type CariCardType = 'customer' | 'supplier';

type FormState = {
  code: string;
  name: string;
  tax_nr: string;
  tax_office: string;
  address: string;
  city: string;
  district: string;
  phone: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  code: '',
  name: '',
  tax_nr: '',
  tax_office: '',
  address: '',
  city: '',
  district: '',
  phone: '',
  notes: '',
};

function parsedToForm(fields: ParsedIdentityFields, code: string): FormState {
  const noteBits = ['Kimlik / kart taramadan oluşturuldu'];
  if (fields.docKind !== 'unknown') noteBits.push(`Belge: ${fields.docKind}`);
  if (fields.birthDate) noteBits.push(`Doğum: ${fields.birthDate}`);
  return {
    code,
    name: fields.name || '',
    tax_nr: fields.taxNr || '',
    tax_office: fields.taxOffice || '',
    address: fields.address || '',
    city: fields.city || '',
    district: fields.district || '',
    phone: '',
    notes: noteBits.join(' · '),
  };
}

function docKindLabel(kind: IdentityDocKind, t: (k: string) => string): string {
  switch (kind) {
    case 'tc_kimlik':
      return t('idScan.docTc');
    case 'ehliyet':
      return t('idScan.docLicense');
    case 'vergi_levhasi':
      return t('idScan.docTaxPlate');
    default:
      return t('idScan.docUnknown');
  }
}

export function CustomerIdScanScreen() {
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'CustomerIdScan'>>();

  const [cardType, setCardType] = useState<CariCardType>(
    route.params?.cardType ?? 'customer',
  );
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrHint, setOcrHint] = useState<string | null>(null);
  const [docKind, setDocKind] = useState<IdentityDocKind>('unknown');
  const [rawPreview, setRawPreview] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveToGallery, setSaveToGallery] = useState(false);

  const typeOptions = useMemo(
    () =>
      [
        { id: 'customer' as const, label: t('idScan.typeCustomer') },
        { id: 'supplier' as const, label: t('idScan.typeSupplier') },
      ] as const,
    [t],
  );

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const openConfirmWithParsed = useCallback(
    async (fields: ParsedIdentityFields, hintKey?: string) => {
      let code = '';
      try {
        code =
          cardType === 'supplier'
            ? await generateSupplierCode()
            : await generateCustomerCode();
      } catch {
        code = cardType === 'supplier' ? 'T001' : 'M001';
      }
      setDocKind(fields.docKind);
      setRawPreview(fields.rawText.slice(0, 800));
      setForm(parsedToForm(fields, code));
      if (hintKey === 'ocrUnsupported') {
        setOcrHint(t('idScan.ocrUnsupported'));
      } else if (hintKey === 'ocrEmpty') {
        setOcrHint(t('idScan.ocrEmpty'));
      } else if (hintKey === 'ocrFailed') {
        setOcrHint(t('idScan.ocrFailed'));
      } else if (fields.rawText.trim()) {
        setOcrHint(
          t('idScan.ocrOk', {
            lines: fields.ocrLines.length,
            kind: docKindLabel(fields.docKind, t),
          }),
        );
      } else {
        setOcrHint(t('idScan.ocrEmpty'));
      }
      setConfirmOpen(true);
    },
    [cardType, t],
  );

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
          albumName: 'RetailEX',
        });
        if (res.canceled) return;
        if ('permissionDenied' in res && res.permissionDenied) {
          Alert.alert(
            t('idScan.permissionTitle'),
            res.permissionDenied === 'camera'
              ? t('idScan.cameraPermission')
              : t('idScan.galleryPermission'),
          );
          return;
        }
        if (!('uri' in res)) return;

        setImageUri(res.uri);
        const { blocks, ocrAvailable, ocrError } = res.ocr;
        const fields = parseIdentityCardOcr(Array.isArray(blocks) ? blocks : []);

        if (ocrError === 'ocrUnsupported') {
          await openConfirmWithParsed(fields, 'ocrUnsupported');
        } else if (ocrError) {
          await openConfirmWithParsed(fields, 'ocrFailed');
        } else if (ocrAvailable && !fields.rawText.trim()) {
          await openConfirmWithParsed(fields, 'ocrEmpty');
        } else {
          await openConfirmWithParsed(fields);
        }

        const scanNote =
          res.mode === 'native' ? t('docScan.nativeScanOk') : t('docScan.fallbackScanOk');
        setOcrHint((prev) => `${scanNote}\n${prev ?? ''}`.trim());
        if (saveToGallery) {
          setOcrHint((prev) =>
            `${prev ?? ''}\n${
              res.savedToGallery ? t('docScan.savedToGallery') : t('docScan.saveFailed')
            }`.trim(),
          );
        }
      } catch {
        await openConfirmWithParsed(parseIdentityCardOcr([]), 'ocrFailed');
      } finally {
        setOcrBusy(false);
      }
    },
    [openConfirmWithParsed, saveToGallery, t],
  );

  const pickCamera = async () => {
    setError(null);
    await runScan(false);
  };

  const pickGallery = async () => {
    setError(null);
    await runScan(true);
  };

  const skipManual = async () => {
    setImageUri(null);
    await openConfirmWithParsed(parseIdentityCardOcr([]), 'ocrEmpty');
    setOcrHint(t('idScan.manualHint'));
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) {
      Alert.alert(t('alert.missingField'), t('formValidation.customerNameRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input: CustomerInput = {
        code: form.code.trim() || undefined,
        name,
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        district: form.district.trim() || undefined,
        tax_nr: form.tax_nr.trim() || undefined,
        tax_office: form.tax_office.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };
      if (cardType === 'supplier') {
        await createSupplier(input);
        setConfirmOpen(false);
        navigation.replace('Customers');
        Alert.alert(t('alert.saved'), t('idScan.savedSupplier'));
      } else {
        const id = await createCustomer(input);
        setConfirmOpen(false);
        navigation.replace('CustomerDetail', { customerId: id });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={t('idScan.title')} subtitle={t('idScan.subtitle')} />
      {error ? <ErrorBanner message={error} /> : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
          {t('idScan.selectType')}
        </Text>
        <View style={styles.chipRow}>
          {typeOptions.map((opt) => {
            const active = cardType === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setCardType(opt.id)}
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

        <Text style={[styles.hint, { color: colors.textMuted }]}>{t('idScan.captureHint')}</Text>

        <View
          style={[
            styles.saveRow,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
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

        {ocrBusy ? (
          <View style={styles.busyBox}>
            <ActivityIndicator color={palette.blue600} />
            <Text style={{ color: colors.textMuted, marginTop: 10 }}>{t('idScan.reading')}</Text>
          </View>
        ) : (
          <View style={styles.actions}>
            <Pressable
              onPress={() => void pickCamera()}
              style={[styles.captureBtn, { backgroundColor: palette.blue600 }]}
            >
              <Camera size={18} color={palette.white} />
              <Text style={styles.captureBtnLabel}>{t('docScan.scanDocument')}</Text>
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
                {t('idScan.gallery')}
              </Text>
            </Pressable>
            <Pressable onPress={() => void skipManual()} style={styles.manualLink}>
              <Text style={{ color: colors.textMuted, fontWeight: '600' }}>
                {t('idScan.manualEntry')}
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
            <UserRound size={40} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, marginTop: 8, textAlign: 'center' }}>
              {t('idScan.placeholder')}
            </Text>
          </View>
        )}
      </ScrollView>

      <PercentBodySheet
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('idScan.confirmTitle')}
        subtitle={`${docKindLabel(docKind, t)} · ${
          cardType === 'supplier' ? t('idScan.typeSupplier') : t('idScan.typeCustomer')
        }`}
        size="list"
        footer={
          <View style={{ flex: 1, gap: 8 }}>
            <PrimaryButton
              label={saving ? t('idScan.saving') : t('idScan.save')}
              onPress={() => void handleSave()}
              loading={saving}
              disabled={saving}
            />
            <Pressable onPress={() => setConfirmOpen(false)} style={{ alignItems: 'center', paddingVertical: 6 }}>
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
            {docKindLabel(docKind, t)}
          </Text>
        </View>
        <FormField
          label={t('idScan.fieldCode')}
          value={form.code}
          onChangeText={(v) => setField('code', v)}
          autoCapitalize="characters"
        />
        <FormField
          label={t('idScan.fieldName')}
          value={form.name}
          onChangeText={(v) => setField('name', v)}
        />
        <FormField
          label={t('idScan.fieldTaxNr')}
          value={form.tax_nr}
          onChangeText={(v) => setField('tax_nr', v)}
          keyboardType="number-pad"
        />
        <FormField
          label={t('idScan.fieldTaxOffice')}
          value={form.tax_office}
          onChangeText={(v) => setField('tax_office', v)}
        />
        <FormField
          label={t('idScan.fieldPhone')}
          value={form.phone}
          onChangeText={(v) => setField('phone', v)}
          keyboardType="phone-pad"
        />
        <FormField
          label={t('idScan.fieldCity')}
          value={form.city}
          onChangeText={(v) => setField('city', v)}
        />
        <FormField
          label={t('idScan.fieldDistrict')}
          value={form.district}
          onChangeText={(v) => setField('district', v)}
        />
        <FormField
          label={t('idScan.fieldAddress')}
          value={form.address}
          onChangeText={(v) => setField('address', v)}
          multiline
          numberOfLines={3}
          style={{ minHeight: 72, textAlignVertical: 'top' }}
        />
        <FormField
          label={t('idScan.fieldNotes')}
          value={form.notes}
          onChangeText={(v) => setField('notes', v)}
          multiline
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
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
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
