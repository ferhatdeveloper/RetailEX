import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { PrimaryButton } from '../components/PrimaryButton';
import { fetchBeautyServices, type BeautyService } from '../api/beautyApi';
import { fetchProducts, type ProductRow } from '../api/productsApi';
import {
  fetchBeautyDevices,
  fetchBeautyLeads,
  fetchBeautyPackages,
  fetchServiceConsumables,
  saveBeautyDevice,
  saveBeautyLead,
  saveBeautyPackage,
  setServiceConsumable,
  type BeautyConsumableRow,
  type BeautyDeviceRow,
  type BeautyLeadRow,
  type BeautyPackageRow,
} from '../api/beautyCatalogApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import type { BeautyCatalogKind } from '../navigation/opsKinds';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'BeautyCatalog'>;

const TITLES: Record<BeautyCatalogKind, string> = {
  packages: 'Paketler',
  devices: 'Cihazlar',
  leads: 'Adaylar',
  recipes: 'Hizmet reçetesi',
};

export function BeautyCatalogScreen({ route }: Props) {
  const kind = route.params?.kind ?? 'packages';
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const [rows, setRows] = useState<Array<BeautyPackageRow | BeautyDeviceRow | BeautyLeadRow | BeautyConsumableRow>>([]);
  const [services, setServices] = useState<BeautyService[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (kind === 'packages') setRows(await fetchBeautyPackages());
      else if (kind === 'devices') setRows(await fetchBeautyDevices());
      else if (kind === 'leads') setRows(await fetchBeautyLeads());
      else {
        const [svc, prods, lines] = await Promise.all([
          fetchBeautyServices(),
          fetchProducts('', 40),
          fetchServiceConsumables(),
        ]);
        setServices(svc);
        setProducts(prods);
        setRows(lines);
      }
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

  const onSave = async () => {
    if (!name.trim() && kind !== 'recipes') {
      Alert.alert(t('ops.needName', { defaultValue: 'Ad gerekli' }));
      return;
    }
    setBusy(true);
    try {
      if (kind === 'packages') {
        await saveBeautyPackage({
          name: name.trim(),
          price: Number(extra.replace(',', '.')) || 0,
          totalSessions: 1,
        });
      } else if (kind === 'devices') {
        await saveBeautyDevice({ name: name.trim(), serialNumber: extra.trim() || undefined });
      } else if (kind === 'leads') {
        await saveBeautyLead({ name: name.trim(), phone: extra.trim() || undefined });
      } else {
        const service = services.find((s) => s.name.toLocaleLowerCase('tr-TR').includes(name.trim().toLocaleLowerCase('tr-TR'))) || services[0];
        const product = products.find((p) => p.name.toLocaleLowerCase('tr-TR').includes(extra.trim().toLocaleLowerCase('tr-TR'))) || products[0];
        if (!service || !product) throw new Error(t('ops.needRecipe', { defaultValue: 'Hizmet ve malzeme gerekli' }));
        await setServiceConsumable({ serviceId: service.id, productId: product.id, qty: 1 });
      }
      setName('');
      setExtra('');
      await load();
    } catch (e) {
      Alert.alert(t('ops.saveFail', { defaultValue: 'Kayıt hatası' }), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const title = t(`ops.beauty.${kind}`, { defaultValue: TITLES[kind] });

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={title} subtitle={t('ops.beautyHint', { defaultValue: 'Klinik kartları' })} />
      <View style={styles.form}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={kind === 'recipes' ? t('ops.servicePh', { defaultValue: 'Hizmet adı' }) : t('ops.namePh', { defaultValue: 'Ad' })}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, borderColor: colors.cardBorder, backgroundColor: colors.card }]}
        />
        <TextInput
          value={extra}
          onChangeText={setExtra}
          placeholder={
            kind === 'packages'
              ? t('ops.pricePh', { defaultValue: 'Fiyat' })
              : kind === 'recipes'
                ? t('ops.materialPh', { defaultValue: 'Malzeme' })
                : kind === 'leads'
                  ? t('ops.phonePh', { defaultValue: 'Telefon' })
                  : t('ops.serialPh', { defaultValue: 'Seri no' })
          }
          placeholderTextColor={colors.textMuted}
          keyboardType={kind === 'packages' ? 'decimal-pad' : 'default'}
          style={[styles.input, { color: colors.text, borderColor: colors.cardBorder, backgroundColor: colors.card }]}
        />
      </View>
      <PrimaryButton
        label={busy ? '…' : t('save', { defaultValue: 'Kaydet' })}
        onPress={() => void onSave()}
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
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {'price' in item
                  ? `${item.name} · ${formatMoney(item.price)}`
                  : 'device_type' in item
                    ? item.name
                    : 'phone' in item
                      ? item.name
                      : item.product_name || item.product_id}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {'total_sessions' in item
                  ? `${item.total_sessions} seans`
                  : 'serial_number' in item
                    ? item.serial_number || item.device_type || ''
                    : 'phone' in item
                      ? `${item.phone || '—'} · ${item.status || ''}`
                      : `× ${item.qty_per_service}`}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  form: { gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  list: { padding: 12, gap: 8, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
});
