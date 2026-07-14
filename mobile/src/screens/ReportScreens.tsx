import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import { ScreenHeader, EmptyState, ErrorBanner, SearchBar } from '../components/ScreenChrome';
import {
  fetchSalesByDay,
  fetchTopProducts,
  fetchCariBalances,
  fetchCariExtract,
  defaultExtractRange,
  type SalesDayRow,
  type TopProductRow,
  type CariBalanceRow,
  type CariExtractRow,
} from '../api/reportsApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';

export function ReportSalesScreen() {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const [days, setDays] = useState<SalesDayRow[]>([]);
  const [top, setTop] = useState<TopProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, t] = await Promise.all([fetchSalesByDay(14), fetchTopProducts(15)]);
      setDays(d);
      setTop(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalRev = days.reduce((s, d) => s + d.revenue, 0);
  const totalCnt = days.reduce((s, d) => s + d.count, 0);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Günlük Satış Özeti" subtitle="Son 14 gün" />
      <View style={styles.kpiRow}>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.lbl}>Ciro</Text>
          <Text style={[styles.val, { color: palette.blue600 }]}>{formatMoney(totalRev)}</Text>
        </View>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.lbl}>Fiş</Text>
          <Text style={[styles.val, { color: colors.text }]}>{totalCnt}</Text>
        </View>
      </View>
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={days}
          keyExtractor={(item) => item.day}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Satış verisi yok" />}
          ListHeaderComponent={
            top.length > 0 ? (
              <View style={{ marginBottom: 12 }}>
                <Text style={[styles.sec, { color: colors.text }]}>En çok satanlar</Text>
                {top.slice(0, 5).map((p, i) => (
                  <Text key={`${p.product_name}-${i}`} style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                    {i + 1}. {p.product_name} — {formatMoney(p.amount)} ₺
                  </Text>
                ))}
                <Text style={[styles.sec, { color: colors.text, marginTop: 16 }]}>Günlük</Text>
              </View>
            ) : null
          }
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={[styles.row, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{item.day}</Text>
              <Text style={{ color: colors.textMuted }}>{item.count} fiş</Text>
              <Text style={{ color: palette.blue600, fontWeight: '700' }}>{formatMoney(item.revenue)}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

export function ReportStockScreen() {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof import('../api/reportsApi').fetchCriticalStock>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { fetchCriticalStock } = await import('../api/reportsApi');
      setRows(await fetchCriticalStock());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Kritik Stok" subtitle={`${rows.length} malzeme`} />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Kritik stok yok" />}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{item.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{item.code || '—'}</Text>
              <Text style={{ color: palette.red500, fontWeight: '700', marginTop: 4 }}>
                Stok {item.stock} / Min {item.min_stock} {item.unit || ''}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

type CardFilter = 'all' | 'customer' | 'supplier';

/** Web `CariBalanceSummaryReport` / menü `mizan` — cari bakiye mizanı */
export function ReportMizanScreen() {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const [cardType, setCardType] = useState<CardFilter>('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<CariBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await fetchCariBalances({ cardType, onlyNonZero: true, limit: 500 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [cardType, orgEpoch]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.accountName.toLocaleLowerCase('tr-TR').includes(q) ||
        r.accountCode.toLocaleLowerCase('tr-TR').includes(q),
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    let recv = 0;
    let pay = 0;
    for (const r of rows) {
      if (r.cardType === 'customer') recv += r.balance;
      else pay += r.balance;
    }
    return { recv, pay, net: recv - pay };
  }, [rows]);

  const filters: { id: CardFilter; label: string }[] = [
    { id: 'all', label: 'Tümü' },
    { id: 'customer', label: 'Müşteri' },
    { id: 'supplier', label: 'Tedarikçi' },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Mizan (Cari Bakiye)" subtitle={`${filtered.length} hesap`} />
      <View style={styles.filterRow}>
        {filters.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => setCardType(f.id)}
            style={[
              styles.chip,
              {
                backgroundColor: cardType === f.id ? palette.blue600 : colors.card,
                borderColor: cardType === f.id ? palette.blue600 : colors.cardBorder,
              },
            ]}
          >
            <Text style={{ color: cardType === f.id ? '#fff' : colors.text, fontSize: 12, fontWeight: '700' }}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Kod veya unvan…" />
      <View style={styles.kpiRow}>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.lbl}>Alacak</Text>
          <Text style={[styles.valSm, { color: palette.blue600 }]}>{formatMoney(totals.recv)}</Text>
        </View>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.lbl}>Borç</Text>
          <Text style={[styles.valSm, { color: palette.orange500 }]}>{formatMoney(totals.pay)}</Text>
        </View>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.lbl}>Net</Text>
          <Text style={[styles.valSm, { color: colors.text }]}>{formatMoney(totals.net)}</Text>
        </View>
      </View>
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => `${item.cardType}-${item.accountId}`}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Bakiye kaydı yok" />}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.rowBetween}>
                <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                  {item.accountName}
                </Text>
                <Text
                  style={{
                    color: item.balance >= 0 ? palette.blue600 : palette.red500,
                    fontWeight: '800',
                  }}
                >
                  {formatMoney(item.balance)}
                </Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                {item.accountCode || '—'} · {item.cardType === 'customer' ? 'Müşteri' : 'Tedarikçi'}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

/** Web `CariExtractReport` / menü `customer-extract` */
export function ReportCariExtractScreen() {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const range = useMemo(() => defaultExtractRange(90), []);
  const [cardType, setCardType] = useState<'customer' | 'supplier'>('customer');
  const [accounts, setAccounts] = useState<CariBalanceRow[]>([]);
  const [accountId, setAccountId] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [rows, setRows] = useState<CariExtractRow[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingAccounts(true);
      try {
        const list = await fetchCariBalances({ cardType, onlyNonZero: false, limit: 400 });
        if (cancelled) return;
        setAccounts(list);
        setAccountId((prev) => (list.some((a) => a.accountId === prev) ? prev : list[0]?.accountId || ''));
      } catch (e) {
        if (!cancelled) {
          setAccounts([]);
          setAccountId('');
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoadingAccounts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cardType, orgEpoch]);

  const selected = useMemo(
    () => accounts.find((a) => a.accountId === accountId) ?? null,
    [accounts, accountId],
  );

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.trim().toLocaleLowerCase('tr-TR');
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.accountName.toLocaleLowerCase('tr-TR').includes(q) ||
        a.accountCode.toLocaleLowerCase('tr-TR').includes(q),
    );
  }, [accounts, accountSearch]);

  const load = useCallback(async () => {
    if (!accountId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRows(
        await fetchCariExtract({
          accountId,
          cardType,
          startDate: range.start,
          endDate: range.end,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, cardType, range.start, range.end]);

  useEffect(() => {
    void load();
  }, [load]);

  const closing = rows.length ? rows[rows.length - 1].balance : 0;

  if (picking) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Cari Seç" subtitle={`${filteredAccounts.length} hesap`} />
        <SearchBar value={accountSearch} onChangeText={setAccountSearch} placeholder="Kod veya unvan…" />
        {loadingAccounts ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
        ) : (
          <FlatList
            data={filteredAccounts}
            keyExtractor={(item) => item.accountId}
            ListEmptyComponent={<EmptyState message="Cari bulunamadı" />}
            contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  setAccountId(item.accountId);
                  setPicking(false);
                  setAccountSearch('');
                }}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>{item.accountName}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  {item.accountCode || '—'} · Bakiye {formatMoney(item.balance)}
                </Text>
              </Pressable>
            )}
          />
        )}
        <Pressable
          onPress={() => setPicking(false)}
          style={[styles.footerBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        >
          <Text style={{ color: colors.text, fontWeight: '700' }}>Vazgeç</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Cari Ekstre" subtitle={`${range.start} → ${range.end}`} />
      <View style={styles.filterRow}>
        {(['customer', 'supplier'] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setCardType(t)}
            style={[
              styles.chip,
              {
                backgroundColor: cardType === t ? palette.blue600 : colors.card,
                borderColor: cardType === t ? palette.blue600 : colors.cardBorder,
              },
            ]}
          >
            <Text style={{ color: cardType === t ? '#fff' : colors.text, fontSize: 12, fontWeight: '700' }}>
              {t === 'customer' ? 'Müşteri' : 'Tedarikçi'}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        onPress={() => setPicking(true)}
        style={[styles.picker, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
      >
        <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700' }}>CARİ</Text>
        <Text style={{ color: colors.text, fontWeight: '700', marginTop: 2 }} numberOfLines={1}>
          {selected ? selected.accountName : loadingAccounts ? 'Yükleniyor…' : 'Cari seçin'}
        </Text>
        {selected ? (
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>{selected.accountCode || '—'}</Text>
        ) : null}
      </Pressable>
      <View style={styles.kpiRow}>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.lbl}>Hareket</Text>
          <Text style={[styles.valSm, { color: colors.text }]}>{rows.length}</Text>
        </View>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.lbl}>Kapanış</Text>
          <Text style={[styles.valSm, { color: closing >= 0 ? palette.blue600 : palette.red500 }]}>
            {formatMoney(closing)}
          </Text>
        </View>
      </View>
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading || loadingAccounts ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Hareket yok — cari veya tarih aralığı seçin" />}
          contentContainerStyle={{ padding: 12, gap: 6, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.rowBetween}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>{item.date}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontFamily: 'monospace' }}>
                  {item.ficheNo || '—'}
                </Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={2}>
                {item.definition || item.source}
              </Text>
              <View style={[styles.rowBetween, { marginTop: 6 }]}>
                <Text style={{ color: palette.red500, fontSize: 12 }}>
                  B {item.debit ? formatMoney(item.debit) : '—'}
                </Text>
                <Text style={{ color: palette.blue600, fontSize: 12 }}>
                  A {item.credit ? formatMoney(item.credit) : '—'}
                </Text>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 12 }}>
                  {formatMoney(item.balance)}
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
  kpiRow: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 4 },
  kpi: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 12 },
  lbl: { fontSize: 10, color: '#6b7280', fontWeight: '600' },
  val: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  valSm: { fontSize: 13, fontWeight: '800', marginTop: 4 },
  sec: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 6,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  picker: {
    marginHorizontal: 12,
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  footerBtn: {
    margin: 12,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
});
