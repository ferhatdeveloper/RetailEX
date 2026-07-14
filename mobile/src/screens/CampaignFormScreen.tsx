import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
  Text,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ScreenHeader, ErrorBanner } from '../components/ScreenChrome';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  createCampaign,
  fetchCampaignById,
  updateCampaign,
  type CampaignDetail,
} from '../api/campaignsApi';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type DiscountType = 'percentage' | 'fixed' | 'buyXgetY' | 'priceOverride';

function todayIsoDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function plusDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDateToIso(dateStr: string, endOfDay: boolean): string | null {
  const t = dateStr.trim();
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    throw new Error('Tarih YYYY-MM-DD formatında olmalı');
  }
  return endOfDay ? `${t}T23:59:59` : `${t}T00:00:00`;
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useThemeStore();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? palette.blue600 : colors.card,
          borderColor: selected ? palette.blue600 : colors.cardBorder,
        },
      ]}
    >
      <Text style={{ color: selected ? palette.white : colors.text, fontWeight: '700', fontSize: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function CampaignFormScreen() {
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'CampaignForm'>>();
  const campaignId = route.params?.campaignId;

  const [loading, setLoading] = useState(!!campaignId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<DiscountType>('percentage');
  const [discountValue, setDiscountValue] = useState('10');
  const [startDate, setStartDate] = useState(todayIsoDate());
  const [endDate, setEndDate] = useState(plusDaysIso(30));
  const [minPurchase, setMinPurchase] = useState('0');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [priority, setPriority] = useState('0');
  const [categoryId, setCategoryId] = useState('');
  const [active, setActive] = useState(true);

  const fillFrom = useCallback((c: CampaignDetail) => {
    setName(c.name);
    setDescription(c.description || '');
    const dt =
      c.discountType === 'fixed' || c.type === 'fixed' ? 'fixed' : 'percentage';
    setDiscountType(dt);
    setDiscountValue(String(c.discountValue || 0));
    setStartDate(toDateInput(c.startDate) || todayIsoDate());
    setEndDate(toDateInput(c.endDate) || plusDaysIso(30));
    setMinPurchase(String(c.minPurchaseAmount || 0));
    setMaxDiscount(
      c.maxDiscountAmount != null && c.maxDiscountAmount > 0
        ? String(c.maxDiscountAmount)
        : '',
    );
    setPriority(String(c.priority || 0));
    setCategoryId(c.categoryId || '');
    setActive(c.active);
  }, []);

  useEffect(() => {
    if (!campaignId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setError(null);
      setLoading(true);
      try {
        const c = await fetchCampaignById(campaignId);
        if (cancelled) return;
        if (!c) {
          setError('Kampanya bulunamadı');
          return;
        }
        fillFrom(c);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId, fillFrom]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert(t('alert.missingField'), t('formValidation.campaignNameRequired'));
      return;
    }
    const value = Number(String(discountValue).replace(',', '.'));
    if (!Number.isFinite(value) || value < 0) {
      Alert.alert(t('alert.invalid'), t('formValidation.discountValueNumber'));
      return;
    }
    if (discountType === 'percentage' && value > 100) {
      Alert.alert(t('alert.invalid'), t('formValidation.discountPercentMax'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const startIso = parseDateToIso(startDate, false);
      const endIso = parseDateToIso(endDate, true);
      if (!startIso || !endIso) {
        Alert.alert(t('alert.missingField'), t('formValidation.dateRangeRequired'));
        setSaving(false);
        return;
      }

      const payload = {
        name: trimmed,
        description: description.trim() || null,
        type: discountType,
        discountType,
        discountValue: value,
        startDate: startIso,
        endDate: endIso,
        active,
        minPurchaseAmount: Number(String(minPurchase).replace(',', '.')) || 0,
        maxDiscountAmount: maxDiscount.trim()
          ? Number(String(maxDiscount).replace(',', '.')) || null
          : null,
        categoryId: categoryId.trim() || null,
        priority: Number(priority) || 0,
      };

      if (campaignId) {
        await updateCampaign(campaignId, payload);
        navigation.goBack();
      } else {
        const created = await createCampaign(payload);
        navigation.replace('CampaignDetail', { campaignId: created.id });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={campaignId ? 'Kampanya Düzenle' : 'Yeni Kampanya'}
        subtitle="Fiyat & kampanya"
      />
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <FormField label="Ad" value={name} onChangeText={setName} placeholder="Yaz sezonu %" />
            <FormField
              label="Açıklama"
              value={description}
              onChangeText={setDescription}
              multiline
              placeholder="İsteğe bağlı"
            />

            <Text style={[styles.section, { color: colors.textMuted }]}>İndirim tipi</Text>
            <View style={styles.chipRow}>
              <Chip
                label="Yüzde %"
                selected={discountType === 'percentage'}
                onPress={() => setDiscountType('percentage')}
              />
              <Chip
                label="Sabit tutar"
                selected={discountType === 'fixed'}
                onPress={() => setDiscountType('fixed')}
              />
              <Chip
                label="Al X Öde Y"
                selected={discountType === 'buyXgetY'}
                onPress={() => setDiscountType('buyXgetY')}
              />
              <Chip
                label="Fiyat override"
                selected={discountType === 'priceOverride'}
                onPress={() => setDiscountType('priceOverride')}
              />
            </View>

            <FormField
              label={
                discountType === 'percentage'
                  ? 'İndirim %'
                  : discountType === 'buyXgetY'
                    ? 'Alınacak adet (X; Y=1)'
                    : discountType === 'priceOverride'
                      ? 'Kampanya birim fiyatı'
                      : 'İndirim tutarı'
              }
              value={discountValue}
              onChangeText={setDiscountValue}
              keyboardType="decimal-pad"
            />
            <FormField
              label="Başlangıç (YYYY-MM-DD)"
              value={startDate}
              onChangeText={setStartDate}
              autoCapitalize="none"
              placeholder="2026-01-01"
            />
            <FormField
              label="Bitiş (YYYY-MM-DD)"
              value={endDate}
              onChangeText={setEndDate}
              autoCapitalize="none"
              placeholder="2026-12-31"
            />
            <FormField
              label="Min. alış tutarı"
              value={minPurchase}
              onChangeText={setMinPurchase}
              keyboardType="decimal-pad"
            />
            <FormField
              label="Maks. indirim (boş = sınırsız)"
              value={maxDiscount}
              onChangeText={setMaxDiscount}
              keyboardType="decimal-pad"
            />
            <FormField
              label="Öncelik (düşük = önce)"
              value={priority}
              onChangeText={setPriority}
              keyboardType="number-pad"
            />
            <FormField
              label="Kategori kodu (opsiyonel)"
              value={categoryId}
              onChangeText={setCategoryId}
              autoCapitalize="characters"
              placeholder="Boş = tüm ürünler"
            />

            <Pressable
              onPress={() => setActive((v) => !v)}
              style={[
                styles.toggle,
                {
                  backgroundColor: colors.card,
                  borderColor: active ? palette.green600 : colors.cardBorder,
                },
              ]}
            >
              <Text style={{ color: colors.text, fontWeight: '600' }}>Aktif</Text>
              <Text
                style={{
                  color: active ? palette.green600 : colors.textMuted,
                  fontWeight: '700',
                }}
              >
                {active ? 'Evet' : 'Hayır'}
              </Text>
            </Pressable>

            <PrimaryButton
              label={campaignId ? 'Güncelle' : 'Kaydet'}
              onPress={() => void handleSave()}
              loading={saving}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  form: { padding: 16, gap: 12, paddingBottom: 40 },
  section: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    paddingHorizontal: 4,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  toggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
});
