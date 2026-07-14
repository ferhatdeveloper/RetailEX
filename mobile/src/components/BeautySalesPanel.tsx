import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  RefreshControl,
} from 'react-native';
import { Plus, Minus, Trash2, ArrowLeft, ShoppingCart } from 'lucide-react-native';
import { GradientHeader, HeaderIconButton } from './GradientHeader';
import { EmptyState, ErrorBanner } from './ScreenChrome';
import { FormField } from './FormField';
import { PrimaryButton } from './PrimaryButton';
import {
  createBeautySale,
  fetchBeautySaleItems,
  type BeautyPaymentMethod,
  type BeautySale,
  type BeautyService,
  type BeautySpecialist,
} from '../api/beautyApi';
import { formatMoney } from '../api/erpTables';
import { palette } from '../theme/colors';
import type { ThemeColors } from '../theme/colors';

type CartLine = {
  id: string;
  serviceId: string;
  name: string;
  price: number;
  qty: number;
  staffId: string | null;
};

type Props = {
  colors: ThemeColors;
  sales: BeautySale[];
  services: BeautyService[];
  specialists: BeautySpecialist[];
  loading: boolean;
  onRefresh: () => void;
  onSaleCreated: () => void;
};

const PAY_METHODS: { id: BeautyPaymentMethod; label: string }[] = [
  { id: 'cash', label: 'Nakit' },
  { id: 'card', label: 'Kart' },
  { id: 'transfer', label: 'Havale' },
];

function payLabel(method: string | null): string {
  const m = String(method || '').toLowerCase();
  if (m === 'cash') return 'Nakit';
  if (m === 'card') return 'Kart';
  if (m === 'transfer') return 'Havale';
  return method || '—';
}

function statusLabel(status: string | null): string {
  const s = String(status || '').toLowerCase();
  if (s === 'paid') return 'Ödendi';
  if (s === 'pending') return 'Bekliyor';
  if (s === 'cancelled') return 'İptal';
  if (s === 'refunded') return 'İade';
  return status || '—';
}

let cartSeq = 0;
function nextCartId(): string {
  cartSeq += 1;
  return `bs_${cartSeq}`;
}

export function BeautySalesPanel({
  colors,
  sales,
  services,
  specialists,
  loading,
  onRefresh,
  onSaleCreated,
}: Props) {
  const [posOpen, setPosOpen] = useState(false);
  const [detailSale, setDetailSale] = useState<BeautySale | null>(null);
  const [detailItems, setDetailItems] = useState<{ name: string; qty: number; total: number }[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [discountPct, setDiscountPct] = useState('0');
  const [payMethod, setPayMethod] = useState<BeautyPaymentMethod>('cash');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.price * l.qty, 0), [cart]);
  const discPctNum = Math.min(100, Math.max(0, parseFloat(discountPct) || 0));
  const discAmt = subtotal * (discPctNum / 100);
  const total = Math.max(0, subtotal - discAmt);

  const resetPos = () => {
    setCart([]);
    setCustomerName('');
    setDiscountPct('0');
    setPayMethod('cash');
    setNotes('');
    setFormError(null);
  };

  const addService = (svc: BeautyService) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.serviceId === svc.id);
      if (existing) {
        return prev.map((l) =>
          l.serviceId === svc.id ? { ...l, qty: l.qty + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          id: nextCartId(),
          serviceId: svc.id,
          name: svc.name,
          price: Number(svc.price) || 0,
          qty: 1,
          staffId: null,
        },
      ];
    });
  };

  const setQty = (lineId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.id === lineId ? { ...l, qty: Math.max(0, l.qty + delta) } : l))
        .filter((l) => l.qty > 0),
    );
  };

  const removeLine = (lineId: string) => {
    setCart((prev) => prev.filter((l) => l.id !== lineId));
  };

  const setStaff = (lineId: string, staffId: string | null) => {
    setCart((prev) => prev.map((l) => (l.id === lineId ? { ...l, staffId } : l)));
  };

  const openDetail = async (sale: BeautySale) => {
    setDetailSale(sale);
    setDetailItems([]);
    setDetailLoading(true);
    try {
      const rows = await fetchBeautySaleItems(sale.id);
      setDetailItems(
        rows.map((r) => ({
          name: r.name || 'Kalem',
          qty: r.quantity,
          total: r.total,
        })),
      );
    } catch {
      setDetailItems([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (!cart.length) {
      setFormError('Sepete en az bir hizmet ekleyin');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const result = await createBeautySale({
        customerName: customerName.trim() || undefined,
        subtotal,
        discount: discAmt,
        total,
        paymentMethod: payMethod,
        notes: notes.trim() || undefined,
        items: cart.map((l) => ({
          item_type: 'service',
          item_id: l.serviceId,
          name: l.name,
          quantity: l.qty,
          unit_price: l.price,
          staff_id: l.staffId,
        })),
      });
      setPosOpen(false);
      resetPos();
      onSaleCreated();
      Alert.alert(
        'Satış kaydedildi',
        result.erpSynced === false
          ? `${result.invoiceNumber}\nToplam: ${formatMoney(result.total)} ₺\n\nUyarı: Güzellik fişi yazıldı; ERP/kasa senkronu tamamlanamadı.`
          : `${result.invoiceNumber}\nToplam: ${formatMoney(result.total)} ₺`,
      );
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <FlatList
        data={sales}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />}
        ListEmptyComponent={<EmptyState message="Güzellik satış fişi yok" />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => void openDetail(item)}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          >
            <View style={styles.cardTop}>
              <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }}>
                {item.invoice_number || 'Fiş'}
              </Text>
              <View style={[styles.badge, { backgroundColor: palette.green500 + '22' }]}>
                <Text style={{ color: palette.green600, fontSize: 10, fontWeight: '800' }}>
                  {statusLabel(item.payment_status)}
                </Text>
              </View>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              {item.customer_name || item.notes?.split(' — ')[0] || 'Perakende'}
            </Text>
            <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 4 }}>
              {item.created_at?.slice(0, 16) || '—'}
              {item.item_count > 0 ? ` · ${item.item_count} kalem` : ''}
              {' · '}
              {payLabel(item.payment_method)}
            </Text>
            <Text style={{ color: palette.blue600, fontWeight: '700', marginTop: 4 }}>
              {formatMoney(item.total)} ₺
            </Text>
          </Pressable>
        )}
      />

      <Pressable
        style={[styles.fab, { backgroundColor: palette.blue600 }]}
        onPress={() => {
          resetPos();
          setPosOpen(true);
        }}
      >
        <Plus color={palette.white} size={22} />
      </Pressable>

      <Modal visible={posOpen} animationType="slide" onRequestClose={() => setPosOpen(false)}>
        <KeyboardAvoidingView
          style={[styles.modalRoot, { backgroundColor: colors.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <GradientHeader compact>
            <View style={styles.modalHeaderRow}>
              <HeaderIconButton onPress={() => setPosOpen(false)}>
                <ArrowLeft size={18} color={palette.white} />
              </HeaderIconButton>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: palette.white, fontSize: 16, fontWeight: '700' }}>
                  Güzellik satış
                </Text>
                <Text style={{ color: palette.blue100, fontSize: 10, marginTop: 2 }}>
                  Hizmet seç · ödeme kaydet
                </Text>
              </View>
              <View style={{ width: 36 }} />
            </View>
          </GradientHeader>
          <ScrollView contentContainerStyle={styles.modalBody}>
            {formError ? <ErrorBanner message={formError} onRetry={() => setFormError(null)} /> : null}

            <FormField
              label="Müşteri (isteğe bağlı)"
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="Ad soyad"
            />

            <Text style={[styles.pickLabel, { color: colors.textMuted }]}>Hizmetler</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickRow}>
              {services.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => addService(s)}
                  style={[styles.svcChip, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                >
                  <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>{s.name}</Text>
                  <Text style={{ color: palette.blue600, fontSize: 10, marginTop: 2 }}>
                    {formatMoney(s.price)} ₺
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={[styles.cartBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.cartTitleRow}>
                <ShoppingCart size={16} color={palette.blue600} />
                <Text style={{ color: colors.text, fontWeight: '700', marginLeft: 6 }}>Sepet</Text>
              </View>
              {cart.length === 0 ? (
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>
                  Hizmet eklemek için yukarıdaki kartlara dokunun
                </Text>
              ) : (
                cart.map((line) => (
                  <View key={line.id} style={styles.cartLine}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: colors.text, fontWeight: '600' }} numberOfLines={1}>
                        {line.name}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                        {formatMoney(line.price)} ₺ × {line.qty}
                      </Text>
                      {specialists.length > 0 ? (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={[styles.pickRow, { marginTop: 4 }]}
                        >
                          <Pressable
                            onPress={() => setStaff(line.id, null)}
                            style={[
                              styles.pickChip,
                              {
                                backgroundColor: !line.staffId ? palette.blue600 : colors.background,
                                borderColor: colors.cardBorder,
                              },
                            ]}
                          >
                            <Text
                              style={{
                                color: !line.staffId ? palette.white : colors.text,
                                fontSize: 10,
                                fontWeight: '700',
                              }}
                            >
                              Uzman yok
                            </Text>
                          </Pressable>
                          {specialists.map((sp) => (
                            <Pressable
                              key={sp.id}
                              onPress={() => setStaff(line.id, sp.id)}
                              style={[
                                styles.pickChip,
                                {
                                  backgroundColor: line.staffId === sp.id ? palette.blue600 : colors.background,
                                  borderColor: colors.cardBorder,
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  color: line.staffId === sp.id ? palette.white : colors.text,
                                  fontSize: 10,
                                  fontWeight: '700',
                                }}
                              >
                                {sp.name}
                              </Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      ) : null}
                    </View>
                    <View style={styles.qtyRow}>
                      <Pressable onPress={() => setQty(line.id, -1)} style={styles.qtyBtn}>
                        <Minus size={14} color={colors.text} />
                      </Pressable>
                      <Text style={{ color: colors.text, fontWeight: '700', minWidth: 20, textAlign: 'center' }}>
                        {line.qty}
                      </Text>
                      <Pressable onPress={() => setQty(line.id, 1)} style={styles.qtyBtn}>
                        <Plus size={14} color={colors.text} />
                      </Pressable>
                      <Pressable onPress={() => removeLine(line.id)} style={styles.qtyBtn}>
                        <Trash2 size={14} color={palette.red500} />
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </View>

            <FormField
              label="İndirim (%)"
              value={discountPct}
              onChangeText={setDiscountPct}
              placeholder="0"
              keyboardType="decimal-pad"
            />

            <Text style={[styles.pickLabel, { color: colors.textMuted }]}>Ödeme</Text>
            <View style={styles.payRow}>
              {PAY_METHODS.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => setPayMethod(p.id)}
                  style={[
                    styles.payChip,
                    {
                      backgroundColor: payMethod === p.id ? palette.blue600 : colors.card,
                      borderColor: colors.cardBorder,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: payMethod === p.id ? palette.white : colors.text,
                      fontSize: 11,
                      fontWeight: '700',
                    }}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <FormField label="Not" value={notes} onChangeText={setNotes} placeholder="İsteğe bağlı" />

            <View style={[styles.totalBox, { borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                Ara toplam: {formatMoney(subtotal)} ₺
              </Text>
              {discAmt > 0 ? (
                <Text style={{ color: palette.red500, fontSize: 12 }}>
                  İndirim: −{formatMoney(discAmt)} ₺
                </Text>
              ) : null}
              <Text style={{ color: palette.blue600, fontSize: 18, fontWeight: '800', marginTop: 4 }}>
                Toplam: {formatMoney(total)} ₺
              </Text>
            </View>

            <PrimaryButton
              label="Satışı kaydet"
              onPress={() => void handleCheckout()}
              loading={saving}
              disabled={!cart.length}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!detailSale} animationType="slide" onRequestClose={() => setDetailSale(null)}>
        <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          <GradientHeader compact>
            <View style={styles.modalHeaderRow}>
              <HeaderIconButton onPress={() => setDetailSale(null)}>
                <ArrowLeft size={18} color={palette.white} />
              </HeaderIconButton>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: palette.white, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>
                  {detailSale?.invoice_number || 'Fiş detayı'}
                </Text>
                <Text style={{ color: palette.blue100, fontSize: 10, marginTop: 2 }} numberOfLines={1}>
                  {detailSale?.customer_name || detailSale?.notes || '—'}
                </Text>
              </View>
              <View style={{ width: 36 }} />
            </View>
          </GradientHeader>
          <ScrollView contentContainerStyle={styles.modalBody}>
            {detailLoading ? (
              <Text style={{ color: colors.textMuted }}>Kalemler yükleniyor…</Text>
            ) : detailItems.length === 0 ? (
              <EmptyState message="Kalem bulunamadı" />
            ) : (
              detailItems.map((it, idx) => (
                <View
                  key={`${it.name}-${idx}`}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                >
                  <Text style={{ color: colors.text, fontWeight: '600' }}>{it.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {it.qty} adet · {formatMoney(it.total)} ₺
                  </Text>
                </View>
              ))
            )}
            {detailSale ? (
              <View style={[styles.totalBox, { borderColor: colors.cardBorder, marginTop: 8 }]}>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {payLabel(detailSale.payment_method)} · {statusLabel(detailSale.payment_status)}
                </Text>
                <Text style={{ color: palette.blue600, fontSize: 18, fontWeight: '800', marginTop: 4 }}>
                  {formatMoney(detailSale.total)} ₺
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, gap: 8, paddingBottom: 88 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  modalRoot: { flex: 1 },
  modalBody: { padding: 16, gap: 12, paddingBottom: 48 },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 2 },
  pickLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase', marginTop: 4 },
  pickRow: { gap: 8, paddingVertical: 4 },
  pickChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  svcChip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, minWidth: 100 },
  cartBox: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 10 },
  cartTitleRow: { flexDirection: 'row', alignItems: 'center' },
  cartLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qtyBtn: { padding: 6, borderRadius: 6 },
  payRow: { flexDirection: 'row', gap: 8 },
  payChip: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  totalBox: { borderTopWidth: 1, paddingTop: 12 },
});
