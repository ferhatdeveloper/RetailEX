import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pencil, Share2 } from 'lucide-react-native';
import { ScreenHeader, ErrorBanner, EmptyState } from '../components/ScreenChrome';
import { HeaderIconButton } from '../components/GradientHeader';
import { fetchInvoiceById, invoiceKindLabel, isPurchaseInvoice, type InvoiceDetail } from '../api/invoicesApi';
import { firmCurrency, formatMoney } from '../api/erpTables';
import { formatMoneyWithCode } from '../utils/currency';
import { shareReportPdf } from '../utils/shareReportPdf';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

export function InvoiceDetailScreen() {
  const { colors } = useThemeStore();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'InvoiceDetail'>>();
  const { invoiceId } = route.params;
  const [doc, setDoc] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharingPdf, setSharingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDoc(await fetchInvoiceById(invoiceId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDoc(null);
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const onSharePdf = useCallback(async () => {
    if (!doc) return;
    setSharingPdf(true);
    try {
      const cur = doc.currency || firmCurrency();
      const kind = invoiceKindLabel(doc);
      const result = await shareReportPdf({
        title: `Fatura — ${doc.fiche_no || invoiceId.slice(0, 8)}`,
        subtitle: [
          kind,
          doc.customer_name || (isPurchaseInvoice(doc) ? 'Tedarikçi' : 'Perakende'),
          doc.date?.slice(0, 10) || '',
          `Net ${formatMoneyWithCode(doc.net_amount, cur)}`,
        ]
          .filter(Boolean)
          .join(' · '),
        rows: [
          {
            date: doc.date?.slice(0, 10) || '',
            title: 'Fatura toplamı',
            amount: doc.net_amount,
            meta: [
              doc.total_vat != null ? `KDV ${formatMoney(doc.total_vat)}` : null,
              doc.total_discount != null ? `İndirim ${formatMoney(doc.total_discount)}` : null,
              doc.payment_method || null,
              doc.status || null,
            ]
              .filter(Boolean)
              .join(' · '),
          },
          ...doc.lines.map((line) => ({
            date: '',
            title: line.item_name || line.item_code || 'Kalem',
            amount: line.net_amount,
            meta: [
              line.item_code || null,
              `${line.quantity} ${line.unit || ''}`.trim(),
              `@ ${formatMoney(line.unit_price)}`,
            ]
              .filter(Boolean)
              .join(' · '),
          })),
        ],
        footerNote: 'RetailEX · Fatura PDF',
      });
      Alert.alert(result.ok ? 'PDF' : 'Hata', result.message);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : String(e));
    } finally {
      setSharingPdf(false);
    }
  }, [doc, invoiceId]);

  const isPurchase = doc ? isPurchaseInvoice(doc) : false;
  const accent = isPurchase ? palette.orange500 : palette.blue600;
  const partyLabel = isPurchase ? 'Tedarikçi' : 'Müşteri';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={isPurchase ? 'Alış Fatura Detay' : 'Satış Fatura Detay'}
        subtitle={doc?.fiche_no || invoiceId.slice(0, 8)}
        right={
          doc ? (
            <View style={styles.headerActions}>
              <HeaderIconButton onPress={() => !sharingPdf && void onSharePdf()}>
                <Share2 size={16} color={palette.white} />
              </HeaderIconButton>
              <HeaderIconButton
                accent
                onPress={() => navigation.navigate('InvoiceForm', { invoiceId })}
              >
                <Pencil size={16} color={palette.white} />
              </HeaderIconButton>
            </View>
          ) : (
            <View style={{ width: 36 }} />
          )
        }
      />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading && !doc ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : !doc ? (
        <EmptyState message="Fatura bulunamadı" />
      ) : (
        <FlatList
          data={doc.lines}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListHeaderComponent={
            <View style={{ gap: 10, marginBottom: 8 }}>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <View style={styles.titleRow}>
                  <Text style={[styles.fiche, { color: colors.text }]}>{doc.fiche_no || '—'}</Text>
                  <View style={[styles.kindBadge, { backgroundColor: `${accent}22` }]}>
                    <Text style={{ color: accent, fontSize: 10, fontWeight: '800' }}>
                      {invoiceKindLabel(doc)}
                    </Text>
                  </View>
                </View>
                <Text style={{ color: colors.textMuted, marginTop: 4 }}>
                  {doc.customer_name || (isPurchase ? 'Tedarikçi' : 'Perakende')} ·{' '}
                  {doc.date?.slice(0, 10) || '—'}
                </Text>
                <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 2 }}>
                  {partyLabel}
                </Text>
                <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 4 }}>
                  {[doc.fiche_type, doc.payment_method, doc.status].filter(Boolean).join(' · ')}
                </Text>
                <Text style={[styles.total, { color: accent }]}>
                  {formatMoneyWithCode(doc.net_amount, doc.currency || firmCurrency())}
                </Text>
                <View style={styles.metaRow}>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                    KDV: {formatMoneyWithCode(doc.total_vat, doc.currency || firmCurrency())}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                    İndirim:{' '}
                    {formatMoneyWithCode(doc.total_discount, doc.currency || firmCurrency())}
                  </Text>
                </View>
                {doc.notes ? (
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>
                    Not: {doc.notes}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.sec, { color: colors.text }]}>
                Kalemler ({doc.lines.length})
                {sharingPdf ? ' · PDF hazırlanıyor…' : ''}
              </Text>
            </View>
          }
          ListEmptyComponent={<EmptyState message="Kalem yok veya satır tablosu yok" />}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View
              style={[styles.line, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '600' }} numberOfLines={2}>
                  {item.item_name || '—'}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  {[item.item_code, `${item.quantity} ${item.unit || ''}`]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: accent, fontWeight: '800' }}>
                  {formatMoneyWithCode(item.net_amount, doc?.currency || firmCurrency())}
                </Text>
                <Text style={{ color: colors.textSubtle, fontSize: 10 }}>
                  @{formatMoneyWithCode(item.unit_price, doc?.currency || firmCurrency())}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  kindBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  fiche: { fontSize: 18, fontWeight: '800' },
  total: { fontSize: 22, fontWeight: '800', marginTop: 10 },
  metaRow: { flexDirection: 'row', gap: 12, marginTop: 8, flexWrap: 'wrap' },
  sec: { fontSize: 13, fontWeight: '700' },
  line: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
});
