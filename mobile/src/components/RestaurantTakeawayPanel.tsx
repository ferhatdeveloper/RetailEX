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
  RestTakeawayOrder,
  RestTakeawayStatus,
} from '../api/restaurantApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';

export type RestaurantTakeawayPanelProps = {
  orders: RestTakeawayOrder[];
  refreshing: boolean;
  onRefresh: () => void;
  onCreate: (params: { customerName: string; phone: string }) => Promise<void>;
  onUpdateStatus: (orderId: string, status: RestTakeawayStatus) => Promise<void>;
  saving?: boolean;
  actionId?: string | null;
  error?: string | null;
};

const STATUS_STEPS: { id: RestTakeawayStatus; label: string }[] = [
  { id: 'pending', label: 'Bekliyor' },
  { id: 'preparing', label: 'Hazırlanıyor' },
  { id: 'ready', label: 'Hazır' },
  { id: 'picked_up', label: 'Teslim alındı' },
];

function statusLabel(status: RestTakeawayStatus | string | null): string {
  const s = String(status || '').toLowerCase();
  const found = STATUS_STEPS.find((x) => x.id === s);
  return found?.label || status || '—';
}

function statusAccent(status: RestTakeawayStatus | string | null): string {
  const s = String(status || '').toLowerCase();
  if (s === 'preparing') return palette.orange500;
  if (s === 'ready') return palette.green500;
  if (s === 'picked_up') return palette.blue600;
  return palette.amber500;
}

export function RestaurantTakeawayPanel({
  orders,
  refreshing,
  onRefresh,
  onCreate,
  onUpdateStatus,
  saving,
  actionId,
  error,
}: RestaurantTakeawayPanelProps) {
  const { colors } = useThemeStore();
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setCustomerName('');
    setPhone('');
    setFormError(null);
  };

  const handleCreate = async () => {
    const name = customerName.trim();
    const tel = phone.trim();
    if (!name) {
      setFormError('Müşteri adı gerekli');
      return;
    }
    if (!tel) {
      setFormError('Telefon gerekli');
      return;
    }
    setFormError(null);
    try {
      await onCreate({ customerName: name, phone: tel });
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
      ListEmptyComponent={<EmptyState message="Açık gel-al siparişi yok" />}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View
          style={[
            styles.formCard,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <Text style={[styles.formTitle, { color: colors.text }]}>Yeni gel-al siparişi</Text>
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
          <PrimaryButton
            label="Gel-al siparişi oluştur"
            onPress={() => void handleCreate()}
            loading={!!saving && !actionId}
            disabled={!!saving}
            style={{ marginTop: 4 }}
          />
        </View>
      }
      renderItem={({ item }) => {
        const accent = statusAccent(item.takeaway_status);
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
                  {statusLabel(item.takeaway_status)}
                </Text>
              </View>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
              {item.phone || '—'}
              {item.item_count > 0 ? ` · ${item.item_count} kalem` : ''}
              {item.created_at ? ` · ${item.created_at.slice(0, 16)}` : ''}
            </Text>
            <Text style={{ color: palette.blue600, fontWeight: '800', marginTop: 4 }}>
              {formatMoney(item.total_amount)} ₺
            </Text>
            <View style={styles.statusRow}>
              {STATUS_STEPS.map((step) => {
                const active = item.takeaway_status === step.id;
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
