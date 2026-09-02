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
  RestDeliveryOrder,
  RestDeliveryStatus,
} from '../api/restaurantApi';
import { formatMoney } from '../api/erpTables';
import type { FoodDeliveryChannelId } from '../config/foodDeliveryChannels';
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
    channel?: FoodDeliveryChannelId;
    externalOrderId?: string;
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

function buildPayMethods(t: (key: string) => string): { id: PayMethod; label: string }[] {
  return [
    { id: 'cash', label: t('delivery.pay.cash') },
    { id: 'card', label: t('delivery.pay.card') },
    { id: 'transfer', label: t('delivery.pay.transfer') },
  ];
}

function buildStatusSteps(t: (key: string) => string): { id: RestDeliveryStatus; label: string }[] {
  return [
    { id: 'pending', label: t('delivery.status.pending') },
    { id: 'preparing', label: t('delivery.status.preparing') },
    { id: 'on_way', label: t('delivery.status.delivering') },
    { id: 'delivered', label: t('delivery.status.delivered') },
  ];
}

function statusLabel(
  status: RestDeliveryStatus | string | null,
  steps: { id: RestDeliveryStatus; label: string }[],
  fallbackKey: string,
): string {
  const s = String(status || '').toLowerCase();
  const found = steps.find((x) => x.id === s);
  return found?.label || status || fallbackKey;
}

function payLabel(method: string | null | undefined, t: (key: string) => string): string {
  const m = String(method || '').toLowerCase();
  if (m === 'cash') return t('delivery.pay.cash');
  if (m === 'card') return t('delivery.pay.card');
  if (m === 'transfer') return t('delivery.pay.transfer');
  return method || t('delivery.pay.unknown');
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
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [itemsSummary, setItemsSummary] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [externalOrderId, setExternalOrderId] = useState('');
  const [payMethod, setPayMethod] = useState<PayMethod>('cash');
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setCustomerName('');
    setPhone('');
    setAddress('');
    setItemsSummary('');
    setTotalAmount('');
    setExternalOrderId('');
    setPayMethod('cash');
    setFormError(null);
  };

  const handleCreate = async () => {
    const name = customerName.trim();
    const tel = phone.trim();
    const addr = address.trim();
    if (!name) {
      setFormError(t('delivery.panel.needCustomer'));
      return;
    }
    if (!tel) {
      setFormError(t('delivery.panel.needPhone'));
      return;
    }
    if (!addr) {
      setFormError(t('delivery.panel.needAddress'));
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
        channel: 'manual',
        externalOrderId: externalOrderId.trim() || undefined,
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
      ListEmptyComponent={<EmptyState message={t('delivery.panel.empty')} />}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View
          style={[
            styles.formCard,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <Text style={[styles.formTitle, { color: colors.text }]}>{t('delivery.panel.formTitle')}</Text>
          {error ? <ErrorBanner message={error} /> : null}
          {formError ? (
            <ErrorBanner message={formError} onRetry={() => setFormError(null)} />
          ) : null}
          <FormField
            label={t('delivery.panel.customer')}
            value={customerName}
            onChangeText={setCustomerName}
            placeholder={t('delivery.panel.customerPh')}
          />
          <FormField
            label={t('delivery.panel.phone')}
            value={phone}
            onChangeText={setPhone}
            placeholder={t('delivery.panel.phonePh')}
            keyboardType="phone-pad"
          />
          <FormField
            label={t('delivery.panel.address')}
            value={address}
            onChangeText={setAddress}
            placeholder={t('delivery.panel.addressPh')}
          />
          <FormField
            label={t('delivery.panel.externalOrder')}
            value={externalOrderId}
            onChangeText={setExternalOrderId}
            placeholder={t('delivery.panel.externalOrderPh')}
          />
          <FormField
            label={t('delivery.panel.orderSummary')}
            value={itemsSummary}
            onChangeText={setItemsSummary}
            placeholder={t('delivery.panel.orderSummaryPh')}
          />
          <FormField
            label={t('delivery.panel.amount')}
            value={totalAmount}
            onChangeText={setTotalAmount}
            placeholder={t('delivery.panel.amountPh')}
            keyboardType="decimal-pad"
          />
          <Text style={[styles.pickLabel, { color: colors.textMuted }]}>{t('delivery.panel.payment')}</Text>
          <View style={styles.chipRow}>
            {buildPayMethods(t).map((p) => {
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
            label={t('delivery.panel.submit')}
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
        const steps = buildStatusSteps(t);
        const phoneText = item.phone || t('delivery.panel.phoneEmpty');
        const addrText = item.address || t('delivery.panel.addressEmpty');
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
                {t('delivery.panel.titleLine', {
                  no: item.order_no || item.id.slice(0, 8),
                  customer: item.customer_name,
                })}
              </Text>
              <View style={[styles.badge, { backgroundColor: accent + '22' }]}>
                <Text style={{ color: accent, fontSize: 10, fontWeight: '800' }}>
                  {statusLabel(item.delivery_status, steps, '—')}
                </Text>
              </View>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }} numberOfLines={2}>
              {t('delivery.panel.subLine', { phone: phoneText, address: addrText })}
            </Text>
            {item.external_order_id ? (
              <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 2 }}>
                {t('delivery.panel.externalLine', { no: item.external_order_id })}
              </Text>
            ) : null}
            {item.items_summary ? (
              <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 2 }} numberOfLines={2}>
                {item.items_summary}
              </Text>
            ) : null}
            <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 4 }}>
              {t('delivery.panel.paymentLine', {
                courier: item.courier ? `${item.courier} · ` : '',
                payLabel: payLabel(item.expected_payment_method, t),
                items: item.item_count > 0
                  ? t('delivery.panel.itemsSuffix', { count: item.item_count })
                  : '',
                time: item.created_at ? t('delivery.panel.timeSuffix', { time: item.created_at.slice(0, 16) }) : '',
              })}
            </Text>
            <Text style={{ color: palette.blue600, fontWeight: '800', marginTop: 4 }}>
              {formatMoney(item.total_amount)}
            </Text>
            <View style={styles.statusRow}>
              {steps.map((step) => {
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
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  statusChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
});
