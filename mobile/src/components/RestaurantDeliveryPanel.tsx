import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  RefreshControl,
} from 'react-native';
import { EmptyState, ErrorBanner } from './ScreenChrome';
import { FormField } from './FormField';
import { PrimaryButton } from './PrimaryButton';
import type {
  RestDeliveryOrder,
  RestDeliveryStatus,
} from '../api/restaurantApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';

export type RestaurantDeliveryPanelProps = {
  orders: RestDeliveryOrder[];
  refreshing: boolean;
  onRefresh: () => void;
  onCreate: (params: {
    customerName: string;
    phone: string;
    address: string;
    itemsSummary?: string;
    totalAmount?: number;
    expectedPaymentMethod?: 'cash' | 'card' | 'transfer';
  }) => Promise<void>;
  onUpdateStatus: (
    orderId: string,
    status: RestDeliveryStatus,
  ) => Promise<void>;
  saving?: boolean;
  actionId?: string | null;
  error?: string | null;
};

type PayMethod = 'cash' | 'card' | 'transfer';

const PAY_METHODS: { id: PayMethod; label: string }[] = [
  { id: 'cash', label: 'Nakit' },
  { id: 'card', label: 'Kart' },
  { id: 'transfer', label: 'Havale' },
];

const STATUS_STEPS: { id: RestDeliveryStatus; label: string }[] = [
  { id: 'pending', label: 'Bekliyor' },
  { id: 'preparing', label: 'Hazırlanıyor' },
  { id: 'on_way', label: 'Yolda' },
  { id: 'delivered', label: 'Teslim' },
];

function statusLabel(status: RestDeliveryStatus | string | null): string {
  const s = String(status || '').toLowerCase();
  const found = STATUS_STEPS.find((x) => x.id === s);
  return found?.label || status || '—';
}

function payLabel(method: string | null | undefined): string {
  const m = String(method || '').toLowerCase();
  if (m === 'cash') return 'Nakit';
  if (m === 'card') return 'Kart';
  if (m === 'transfer') return 'Havale';
  return method || '—';
}

function statusAccent(status: RestDeliveryStatus | string | null): string {
  const s = String(status || '').toLowerCase();
  if (s === 'preparing') return palette.orange500;
  if (s === 'on_way') return palette.indigo500;
  if (s === 'delivered') return palette.green500;
  return palette.amber500;
}

export function RestaurantDeliveryPanel({
  orders,
  refreshing,
  onRefresh,
  onCreate,
  onUpdateStatus,
  saving,
  actionId,
  error,
}: RestaurantDeliveryPanelProps) {
  const { colors } = useThemeStore();
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [itemsSummary, setItemsSummary] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PayMethod>('cash');
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setCustomerName('');
    setPhone('');
    setAddress('');
    setItemsSummary('');
    setTotalAmount('');
    setPayMethod('cash');
    setFormError(null);
  };

  const handleCreate = async () => {
    const name = customerName.trim();
    const tel = phone.trim();
    const addr = address.trim();
    if (!name) {
      setFormError('Müşteri adı gerekli');
      return;
    }
    if (!tel) {
      setFormError('Telefon gerekli');
      return;
    }
    if (!addr) {
      setFormError('Adres gerekli');
      return;
    }
    setFormError(null);
    const amountRaw = totalAmount.trim().replace(',', '.');
    const amountNum = amountRaw ? parseFloat(amountRaw) : undefined;
    try {
      await onCreate({
        customerName: name,
        phone: tel,
        address: addr,
        itemsSummary: itemsSummary.trim() || undefined,
        totalAmount:
          amountNum != null && Number.isFinite(amountNum) ? amountNum : undefined,
        expectedPaymentMethod: payMethod,
      });
      resetForm();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <FlatList
      data={orders}
      keyExtractor={(item) => String(item.id)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListEmptyComponent={<EmptyState message="Açık paket siparişi yok" />}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View
          style={[
            styles.formCard,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <Text style={[styles.formTitle, { color: colors.text }]}>Yeni paket servis</Text>
          {error ? <ErrorBanner message={error} /> : null}
          {formError ? (
            <ErrorBanner message={formError} onRetry={() => setFormError(null)} />
          ) : null}
          <FormField
            label="Müşteri"
            value={customerName}
            onChangeText={setCustomerName}
            placeholder="Ad soyad"
          />
          <FormField
            label="Telefon"
            value={phone}
            onChangeText={setPhone}
            placeholder="05xx…"
            keyboardType="phone-pad"
          />
          <FormField
            label="Adres"
            value={address}
            onChangeText={setAddress}
            placeholder="Teslimat adresi"
          />
          <FormField
            label="Sipariş özeti"
            value={itemsSummary}
            onChangeText={setItemsSummary}
            placeholder="İsteğe bağlı"
          />
          <FormField
            label="Tutar"
            value={totalAmount}
            onChangeText={setTotalAmount}
            placeholder="0"
            keyboardType="decimal-pad"
          />
          <Text style={[styles.pickLabel, { color: colors.textMuted }]}>Ödeme türü</Text>
          <View style={styles.chipRow}>
            {PAY_METHODS.map((p) => {
              const active = payMethod === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setPayMethod(p.id)}
                  style={[
                    styles.payChip,
                    {
                      backgroundColor: active ? palette.blue600 : colors.backgroundAlt,
                      borderColor: colors.cardBorder,
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
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <PrimaryButton
            label="Paket siparişi oluştur"
            onPress={() => void handleCreate()}
            loading={!!saving && !actionId}
            disabled={!!saving}
            style={{ marginTop: 4 }}
          />
        </View>
      }
      renderItem={({ item }) => {
        const accent = statusAccent(item.delivery_status);
        const busy = actionId === item.id;
        return (
          <View
            style={[
              styles.orderCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.cardBorder,
                borderLeftColor: accent,
              },
            ]}
          >
            <View style={styles.cardTop}>
              <Text style={{ color: colors.text, fontWeight: '800', flex: 1 }} numberOfLines={1}>
                {item.order_no || item.id.slice(0, 8)} · {item.customer_name}
              </Text>
              <View style={[styles.badge, { backgroundColor: accent + '22' }]}>
                <Text style={{ color: accent, fontSize: 10, fontWeight: '800' }}>
                  {statusLabel(item.delivery_status)}
                </Text>
              </View>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }} numberOfLines={2}>
              {item.phone || '—'} · {item.address || 'Adres yok'}
            </Text>
            {item.items_summary ? (
              <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 2 }} numberOfLines={2}>
                {item.items_summary}
              </Text>
            ) : null}
            <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 4 }}>
              {item.courier ? `${item.courier} · ` : ''}
              {payLabel(item.expected_payment_method)}
              {item.item_count > 0 ? ` · ${item.item_count} kalem` : ''}
              {item.created_at ? ` · ${item.created_at.slice(0, 16)}` : ''}
            </Text>
            <Text style={{ color: palette.blue600, fontWeight: '800', marginTop: 4 }}>
              {formatMoney(item.total_amount)}
            </Text>
            <View style={styles.statusRow}>
              {STATUS_STEPS.map((step) => {
                const active = item.delivery_status === step.id;
                return (
                  <Pressable
                    key={step.id}
                    disabled={busy || !!saving}
                    onPress={() => void onUpdateStatus(item.id, step.id)}
                    style={[
                      styles.statusChip,
                      {
                        borderColor: colors.cardBorder,
                        backgroundColor: active ? palette.blue600 : colors.backgroundAlt,
                        opacity: busy || saving ? 0.6 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: active ? palette.white : colors.textMuted,
                        fontSize: 10,
                        fontWeight: '800',
                      }}
                    >
                      {step.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, gap: 8, paddingBottom: 40 },
  formCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginBottom: 4,
  },
  formTitle: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
  pickLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  chipRow: { flexDirection: 'row', gap: 8 },
  payChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  orderCard: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  statusChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
});
