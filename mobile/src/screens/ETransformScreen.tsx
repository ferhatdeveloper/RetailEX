import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FileText, Send } from 'lucide-react-native';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import {
  fetchGibQueue,
  fetchGibQueueStats,
  gibStatusLabelTr,
  type GibQueueRow,
  type GibQueueStats,
} from '../api/eTransformApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { useAuthStore } from '../store/authStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'ETransform'>;

function statusColor(status: string): string {
  const s = status.trim();
  if (s === 'Gönderildi' || s === 'sent') return palette.green600;
  if (s === 'Reddedildi' || s === 'rejected' || s === 'failed') return palette.red500;
  return palette.orange500;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.slice(0, 16).replace('T', ' ');
}

export function ETransformScreen(_props: Props) {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const user = useAuthStore((s) => s.user);
  const [rows, setRows] = useState<GibQueueRow[]>([]);
  const [stats, setStats] = useState<GibQueueStats>({ pending: 0, sent: 0, failed: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, st] = await Promise.all([fetchGibQueue(), fetchGibQueueStats()]);
      setRows(list);
      setStats(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
      setStats({ pending: 0, sent: 0, failed: 0, total: 0 });
    } finally {
      setLoading(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="E-Dönüşüm (GİB)"
        subtitle={`Firma ${user?.firmNr ?? '—'} · Dönem ${user?.periodNr ?? '—'}`}
      />
      <View style={[styles.statsRow, { borderColor: colors.cardBorder }]}>
        <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.statN, { color: palette.orange500 }]}>{stats.pending}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>Bekleyen</Text>
        </View>
        <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.statN, { color: palette.green600 }]}>{stats.sent}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>Gönderildi</Text>
        </View>
        <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.statN, { color: palette.red500 }]}>{stats.failed}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>Red</Text>
        </View>
      </View>
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={
            <EmptyState message="GİB e-belge kuyruğu boş (gib_edocument_queue)" />
          }
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.cardTop}>
                <View style={[styles.iconWrap, { backgroundColor: palette.blue100 }]}>
                  <FileText size={16} color={palette.blue600} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>
                    {item.document_no || item.id.slice(0, 8)}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {item.doc_type} · {item.customer_name || '—'}
                  </Text>
                </View>
                <Text style={[styles.status, { color: statusColor(item.status) }]}>
                  {gibStatusLabelTr(item.status)}
                </Text>
              </View>
              <Text style={{ color: colors.text, fontSize: 13, marginTop: 6 }}>
                {formatMoney(item.amount)} · KDV {formatMoney(item.tax_amount)}
              </Text>
              <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 4 }}>
                {item.doc_date?.slice(0, 10) || '—'} · oluşturma {formatWhen(item.created_at)}
                {item.sent_at ? ` · gönderim ${formatWhen(item.sent_at)}` : ''}
              </Text>
              {item.error_message ? (
                <Text style={{ color: palette.red500, fontSize: 11, marginTop: 4 }} numberOfLines={2}>
                  {item.error_message}
                </Text>
              ) : null}
            </View>
          )}
          ListFooterComponent={
            rows.length > 0 ? (
              <View style={[styles.hint, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <Send size={14} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1, lineHeight: 17 }}>
                  Gönderim ve test işlemleri masaüstü E-Dönüşüm modülünden yapılır. Mobil yalnızca kuyruk
                  okuma.
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  stat: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  statN: { fontSize: 18, fontWeight: '800' },
  list: { padding: 12, gap: 8, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: { fontSize: 11, fontWeight: '800' },
  hint: {
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    alignItems: 'flex-start',
  },
});
