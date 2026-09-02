import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useTranslation } from 'react-i18next';
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

function buildStatusSteps(t: (key: string) => string): { id: RestTakeawayStatus; label: string }[] {
  return [
    { id: 'pending', label: t('takeaway.status.pending') },
    { id: 'preparing', label: t('takeaway.status.preparing') },
    { id: 'ready', label: t('takeaway.status.ready') },
    { id: 'picked_up', label: t('takeaway.status.pickedUp') },
  ];
}

function statusLabel(
  status: RestTakeawayStatus | string | null,
  steps: { id: RestTakeawayStatus; label: string }[],
): string {
  const s = String(status || '').toLowerCase();
  const found = steps.find((x) => x.id === s);
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
  const { t } = useTranslation();
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
      setFormError(t('takeaway.panel.needCustomer'));
      return;
    }
    if (!tel) {
      setFormError(t('takeaway.panel.needPhone'));
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
      ListEmptyComponent={<EmptyState message={t('takeaway.panel.empty')} />}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View
          style={[
            styles.formCard,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <Text style={[styles.formTitle, { color: colors.text }]}>{t('takeaway.panel.formTitle')}</Text>
          {error ? <ErrorBanner message={error} /> : null}
          {formError ? (
            <ErrorBanner message={formError} onRetry={() => setFormError(null)} />
          ) : null}
          <FormField
            label={t('takeaway.panel.customer')}
            value={customerName}
            onChangeText={setCustomerName}
            placeholder={t('takeaway.panel.customerPh')}
          />
          <FormField
            label={t('takeaway.panel.phone')}
            value={phone}
            onChangeText={setPhone}
            placeholder={t('takeaway.panel.phonePh')}
            keyboardType="phone-pad"
          />
          <PrimaryButton
            label={t('takeaway.panel.submit')}
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
        const steps = buildStatusSteps(t);
        const phoneText = item.phone || t('takeaway.panel.phoneEmpty');
        const itemsSuffix = item.item_count > 0 ? t('delivery.panel.itemsSuffix', { count: item.item_count }) : '';
        const timeSuffix = item.created_at ? t('delivery.panel.timeSuffix', { time: item.created_at.slice(0, 16) }) : '';
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
                {t('takeaway.panel.titleLine', {
                  no: item.order_no || item.id.slice(0, 8),
                  customer: item.customer_name,
                })}
              </Text>
              <View style={[styles.badge, { backgroundColor: accent + '22' }]}>
                <Text style={{ color: accent, fontSize: 10, fontWeight: '800' }}>
                  {statusLabel(item.takeaway_status, steps)}
                </Text>
              </View>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
              {itemsSuffix
                ? t('takeaway.panel.subLine', { phone: phoneText, items: itemsSuffix, time: timeSuffix })
                : t('takeaway.panel.subLineOnlyPhone', { phone: phoneText })}
            </Text>
            <Text style={{ color: palette.blue600, fontWeight: '800', marginTop: 4 }}>
              {formatMoney(item.total_amount)}
            </Text>
            <View style={styles.statusRow}>
              {steps.map((step) => {
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
