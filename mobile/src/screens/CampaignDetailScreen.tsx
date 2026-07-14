import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pencil } from 'lucide-react-native';
import { ScreenHeader, ErrorBanner, EmptyState } from '../components/ScreenChrome';
import { HeaderIconButton } from '../components/GradientHeader';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  fetchCampaignById,
  formatCampaignDiscount,
  formatCampaignPeriod,
  isCampaignInPeriod,
  setCampaignActive,
  type CampaignDetail,
} from '../api/campaignsApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';
const TYPE_LABELS: Record<string, string> = {
  percentage: 'Yüzde indirim',
  fixed: 'Sabit tutar',
  'buy-x-get-y': 'Al X Öde Y',
  category: 'Kategori',
  product: 'Ürün',
  cart: 'Sepet',
  customer: 'Müşteri',
};

const DISCOUNT_TYPE_LABELS: Record<string, string> = {
  percentage: 'Yüzde',
  fixed: 'Sabit tutar',
  buyXgetY: 'Al X Öde Y',
  priceOverride: 'Fiyat değişimi',
};

function Row({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  const { colors } = useThemeStore();
  return (
    <View style={[styles.row, { borderBottomColor: colors.cardBorder }]}>
      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600' }}>{label}</Text>
      <Text
        style={{
          color: valueColor ?? colors.text,
          fontSize: 13,
          fontWeight: '600',
          flex: 1,
          textAlign: 'right',
        }}
        numberOfLines={4}
      >
        {value}
      </Text>
    </View>
  );
}

export function CampaignDetailScreen() {
  const { colors } = useThemeStore();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'CampaignDetail'>>();
  const { campaignId } = route.params;
  const [row, setRow] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const c = await fetchCampaignById(campaignId);
      setRow(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const inPeriod = row ? isCampaignInPeriod(row) : false;
  const statusLabel =
    row == null
      ? '—'
      : row.active && inPeriod
        ? 'Aktif (dönem içi)'
        : row.active
          ? 'Aktif (dönem dışı)'
          : 'Pasif';

  const statusColor =
    row?.active && inPeriod
      ? palette.green600
      : row?.active
        ? palette.orange500
        : palette.gray400;

  const toggleActive = async () => {
    if (!row || toggling) return;
    setToggling(true);
    try {
      const ok = await setCampaignActive(row.id, !row.active);
      if (!ok) throw new Error('Durum güncellenemedi');
      await load();
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : String(e));
    } finally {
      setToggling(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Kampanya Detay"
        subtitle={row?.name?.slice(0, 24) || campaignId.slice(0, 8)}
        right={
          <HeaderIconButton
            accent
            onPress={() => navigation.navigate('CampaignForm', { campaignId })}
          >
            <Pencil size={16} color={palette.white} />
          </HeaderIconButton>
        }
      />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading && !row ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : !row ? (
        <EmptyState message="Kampanya bulunamadı" />
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        >
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.name, { color: colors.text }]}>{row.name}</Text>
            {row.description ? (
              <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 6, lineHeight: 18 }}>
                {row.description}
              </Text>
            ) : null}
            <Text
              style={{
                marginTop: 12,
                fontSize: 22,
                fontWeight: '800',
                color: palette.blue600,
              }}
            >
              {formatCampaignDiscount(row)}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>İndirim</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Row label="Durum" value={statusLabel} valueColor={statusColor} />
            <Row label="Tür" value={TYPE_LABELS[row.type] || row.type} />
            <Row
              label="İndirim tipi"
              value={DISCOUNT_TYPE_LABELS[row.discountType] || row.discountType}
            />
            <Row label="Dönem" value={formatCampaignPeriod(row.startDate, row.endDate)} />
            <Row label="Öncelik" value={String(row.priority)} />
            <Row
              label="Min. alış tutarı"
              value={row.minPurchaseAmount > 0 ? `${formatMoney(row.minPurchaseAmount)} ₺` : '—'}
            />
            <Row
              label="Maks. indirim"
              value={
                row.maxDiscountAmount != null && row.maxDiscountAmount > 0
                  ? `${formatMoney(row.maxDiscountAmount)} ₺`
                  : '—'
              }
            />
            <Row label="Kategori" value={row.categoryId || '—'} />
            <Row label="Ürün sayısı" value={String(row.productIds.length)} />
            <Row
              label="Oluşturma"
              value={row.createdAt ? new Date(row.createdAt).toLocaleString('tr-TR') : '—'}
            />
            <Row
              label="Güncelleme"
              value={row.updatedAt ? new Date(row.updatedAt).toLocaleString('tr-TR') : '—'}
            />
          </View>

          <PrimaryButton
            label={row.active ? 'Pasife al' : 'Aktifleştir'}
            onPress={() => void toggleActive()}
            loading={toggling}
          />

          {row.productIds.length > 0 ? (
            <>
              <Text style={[styles.sec, { color: colors.text }]}>Bağlı ürünler</Text>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                {row.productIds.slice(0, 20).map((pid) => (
                  <Text
                    key={pid}
                    style={{
                      color: colors.textMuted,
                      fontSize: 11,
                      fontFamily: 'monospace',
                      marginBottom: 4,
                    }}
                    numberOfLines={1}
                  >
                    {pid}
                  </Text>
                ))}
                {row.productIds.length > 20 ? (
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                    +{row.productIds.length - 20} ürün daha…
                  </Text>
                ) : null}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 12, gap: 12, paddingBottom: 40 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  name: { fontSize: 18, fontWeight: '800' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sec: { fontSize: 14, fontWeight: '700', marginTop: 4 },
});
