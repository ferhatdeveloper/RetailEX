import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { Plus, Minus, Trash2, ScanBarcode, Tag, UserRound } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader, SearchBar, EmptyState } from '../components/ScreenChrome';
import { PrimaryButton } from '../components/PrimaryButton';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { fetchProducts, fetchProductByBarcode, type ProductRow } from '../api/productsApi';
import { fetchCustomers, type CustomerRow } from '../api/customersApi';
import { savePosSale } from '../api/posApi';
import {
  fetchActiveCampaigns,
  formatCampaignDiscount,
  type CampaignDetail,
} from '../api/campaignsApi';
import { formatMoney } from '../api/erpTables';
import { applyCampaign, pickBestCampaign } from '../services/campaignEngine';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { usePrinterSettingsStore } from '../store/printerSettingsStore';
import { printSaleReceipt } from '../services/printerService';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type CartLine = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  unit: string | null;
  code: string | null;
  categoryCode: string | null;
  vatRate: number;
};

type SelectedCustomer = {
  id: string;
  name: string;
  code: string | null;
  balance: number;
};

export function PosScreen() {
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const orgEpoch = useOrgEpoch();
  const printerSettings = usePrinterSettingsStore((s) => s.settings);
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<ProductRow[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignDetail[]>([]);
  /** null = otomatik en iyi; '' = kampanya yok; id = manuel seçim */
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [campaignFilter, setCampaignFilter] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerHits, setCustomerHits] = useState<CustomerRow[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);

  useEffect(() => {
    setCart([]);
    setHits([]);
    setSearch('');
    setSelectedCampaignId(null);
    setSelectedCustomer(null);
  }, [orgEpoch]);

  useEffect(() => {
    if (!customerPickerOpen) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setCustomerLoading(true);
      try {
        const rows = await fetchCustomers(customerSearch, 40);
        if (!cancelled) setCustomerHits(rows);
      } catch {
        if (!cancelled) setCustomerHits([]);
      } finally {
        if (!cancelled) setCustomerLoading(false);
      }
    }, customerSearch ? 280 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerPickerOpen, customerSearch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchActiveCampaigns();
        if (!cancelled) setCampaigns(list);
      } catch {
        if (!cancelled) setCampaigns([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgEpoch]);

  const subtotal = useMemo(
    () => cart.reduce((s, l) => s + l.price * l.qty, 0),
    [cart],
  );

  const campaignEngineLines = useMemo(
    () =>
      cart.map((l) => ({
        productId: l.productId,
        price: l.price,
        qty: l.qty,
        categoryCode: l.categoryCode,
      })),
    [cart],
  );

  const applied = useMemo(() => {
    if (cart.length === 0) {
      return { campaign: null as CampaignDetail | null, discount: 0, mode: 'none' as const };
    }
    if (selectedCampaignId === '') {
      return { campaign: null, discount: 0, mode: 'off' as const };
    }
    if (selectedCampaignId) {
      const c = campaigns.find((x) => x.id === selectedCampaignId) || null;
      if (!c) return { campaign: null, discount: 0, mode: 'manual' as const };
      const r = applyCampaign(campaignEngineLines, c);
      return {
        campaign: r.appliedCampaignId ? c : null,
        discount: r.totalDiscount,
        mode: 'manual' as const,
      };
    }
    const best = pickBestCampaign(campaignEngineLines, campaigns);
    if (!best) return { campaign: null, discount: 0, mode: 'auto' as const };
    return {
      campaign: best.campaign,
      discount: best.result.totalDiscount,
      mode: 'auto' as const,
    };
  }, [cart.length, campaignEngineLines, campaigns, selectedCampaignId]);

  const total = Math.round((subtotal - applied.discount) * 100) / 100;

  const addProduct = useCallback((p: ProductRow) => {
    setCart((prev) => {
      const i = prev.findIndex((l) => l.productId === String(p.id));
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i]!, qty: next[i]!.qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          productId: String(p.id),
          name: p.name,
          price: Number(p.price) || 0,
          qty: 1,
          unit: p.unit,
          code: p.code,
          categoryCode: p.category_code ?? null,
          vatRate:
            Number.isFinite(p.vat_rate) && p.vat_rate >= 0 ? Number(p.vat_rate) : 20,
        },
      ];
    });
  }, []);

  const runSearch = useCallback(
    async (q: string) => {
      setSearch(q);
      if (q.trim().length < 1) {
        setHits([]);
        return;
      }
      setSearching(true);
      try {
        if (/^\d{8,}$/.test(q.trim())) {
          const byBc = await fetchProductByBarcode(q.trim());
          if (byBc) {
            addProduct(byBc);
            setSearch('');
            setHits([]);
            return;
          }
        }
        setHits(await fetchProducts(q, 30));
      } catch (e) {
        Alert.alert(t('alert.search'), e instanceof Error ? e.message : String(e));
      } finally {
        setSearching(false);
      }
    },
    [addProduct, t],
  );

  const setQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) =>
          l.productId === productId ? { ...l, qty: Math.max(0, l.qty + delta) } : l,
        )
        .filter((l) => l.qty > 0),
    );
  };

  const checkout = (paymentMethod: string) => {
    if (cart.length === 0 || saving) return;
    const isCredit =
      paymentMethod.toLocaleLowerCase('tr-TR').includes('veresiye');
    if (isCredit && !selectedCustomer) {
      Alert.alert(t('posAlerts.payment'), t('posUi.creditNeedsCustomer'));
      setCustomerPickerOpen(true);
      return;
    }
    const discLabel =
      applied.discount > 0 && applied.campaign
        ? t('posAlerts.campaignDiscount', {
            name: applied.campaign.name,
            discount: formatMoney(applied.discount),
          })
        : '';
    const customerLabel =
      isCredit && selectedCustomer
        ? t('posAlerts.creditCustomer', { name: selectedCustomer.name })
        : '';
    Alert.alert(
      t('posAlerts.payment'),
      t('posAlerts.confirmSave', {
        method: paymentMethod,
        total: formatMoney(total),
        campaign: discLabel,
      }) + customerLabel,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('save'),
          onPress: () => {
            void (async () => {
              setSaving(true);
              try {
                const res = await savePosSale(cart, paymentMethod, {
                  totalDiscount: applied.discount,
                  campaignId: applied.campaign?.id ?? null,
                  campaignName: applied.campaign?.name ?? null,
                  customerId: selectedCustomer?.id ?? null,
                  customerName: selectedCustomer?.name ?? null,
                });
                setCart([]);
                setSelectedCampaignId(null);
                setSelectedCustomer(null);
                if (res.queued) {
                  Alert.alert(
                    t('posAlerts.receiptQueuedTitle'),
                    t('posAlerts.receiptQueuedBody', {
                      ficheNo: res.ficheNo,
                      total: formatMoney(res.total),
                    }),
                  );
                  return;
                }
                Alert.alert(
                  t('posAlerts.receiptSavedTitle'),
                  t('posAlerts.receiptSavedBody', {
                    ficheNo: res.ficheNo,
                    total: formatMoney(res.total),
                  }),
                  [
                    {
                      text: t('posAlerts.detail'),
                      onPress: () =>
                        navigation.navigate('InvoiceDetail', { invoiceId: res.id }),
                    },
                    { text: t('alert.ok') },
                  ],
                );
                if (printerSettings.autoPrint) {
                  const printRes = await printSaleReceipt(printerSettings, res.id);
                  if (printRes.ok) {
                    Alert.alert(t('posAlerts.printOk', { defaultValue: 'Yazdırıldı' }), printRes.message);
                  } else if (printerSettings.enabled) {
                    Alert.alert(
                      t('posAlerts.printFail', { defaultValue: 'Yazdırılamadı' }),
                      printRes.message,
                    );
                  }
                }
              } catch (e) {
                Alert.alert(
                  t('alert.saveError'),
                  e instanceof Error ? e.message : String(e),
                );
              } finally {
                setSaving(false);
              }
            })();
          },
        },
      ],
    );
  };

  const filteredCampaigns = useMemo(() => {
    const q = campaignFilter.trim().toLocaleLowerCase('tr-TR');
    if (!q) return campaigns;
    return campaigns.filter((c) => c.name.toLocaleLowerCase('tr-TR').includes(q));
  }, [campaigns, campaignFilter]);

  const campaignModeLabel =
    applied.mode === 'auto'
      ? t('posUi.campaignAuto')
      : applied.mode === 'off'
        ? t('posUi.campaignOff')
        : applied.mode === 'manual'
          ? t('posUi.campaignManual')
          : '';

  const campaignSubtitle =
    applied.discount > 0 && applied.campaign
      ? `${applied.campaign.name.slice(0, 28)} (−${formatMoney(applied.discount)})`
      : campaigns.length > 0
        ? t('posUi.campaignsActive', { count: campaigns.length })
        : t('posUi.noCampaign');

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={t('posUi.title')}
        subtitle={t('posUi.subtitle')}
        showBack={false}
        right={
          <Pressable onPress={() => navigation.navigate('ScaleSale')} hitSlop={8}>
            <Text style={{ color: palette.white, fontWeight: '800', fontSize: 12 }}>
              {t('posUi.scale')}
            </Text>
          </Pressable>
        }
      />
      <View style={styles.searchRow}>
        <View style={styles.searchFlex}>
          <SearchBar
            value={search}
            onChangeText={(q) => void runSearch(q)}
            placeholder={t('posUi.searchPlaceholder')}
          />
        </View>
        <Pressable
          onPress={() => setScannerOpen(true)}
          style={[styles.scanBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          accessibilityLabel={t('posUi.scanA11y')}
        >
          <ScanBarcode size={22} color={palette.blue600} />
        </Pressable>
      </View>

      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanned={(data) => void runSearch(data)}
        title={t('posUi.scanTitle')}
      />

      {hits.length > 0 ? (
        <View style={[styles.hits, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          {hits.slice(0, 8).map((p) => (
            <Pressable
              key={String(p.id)}
              onPress={() => {
                addProduct(p);
                setHits([]);
                setSearch('');
              }}
              style={styles.hit}
            >
              <Text style={{ color: colors.text, flex: 1 }} numberOfLines={1}>
                {p.name}
              </Text>
              <Text style={{ color: palette.blue600, fontWeight: '700' }}>
                {formatMoney(p.price)}
              </Text>
            </Pressable>
          ))}
          {searching ? (
            <Text style={{ color: colors.textMuted, padding: 8 }}>{t('posUi.searching')}</Text>
          ) : null}
        </View>
      ) : null}

      <FlatList
        data={cart}
        keyExtractor={(item) => item.productId}
        ListEmptyComponent={<EmptyState message={t('posUi.emptyCart')} />}
        contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 280 }}
        renderItem={({ item }) => (
          <View style={[styles.line, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                {formatMoney(item.price)} × {item.qty} {item.unit || ''}
              </Text>
            </View>
            <View style={styles.qtyRow}>
              <Pressable onPress={() => setQty(item.productId, -1)} style={styles.qtyBtn}>
                <Minus size={14} color={palette.white} />
              </Pressable>
              <Text
                style={{
                  color: colors.text,
                  fontWeight: '700',
                  minWidth: 24,
                  textAlign: 'center',
                }}
              >
                {item.qty}
              </Text>
              <Pressable onPress={() => setQty(item.productId, 1)} style={styles.qtyBtn}>
                <Plus size={14} color={palette.white} />
              </Pressable>
              <Pressable
                onPress={() => setQty(item.productId, -item.qty)}
                style={[styles.qtyBtn, { backgroundColor: palette.red500 }]}
              >
                <Trash2 size={14} color={palette.white} />
              </Pressable>
            </View>
          </View>
        )}
      />

      <View style={[styles.footer, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Pressable
          onPress={() => {
            setCustomerSearch('');
            setCustomerPickerOpen(true);
          }}
          style={[styles.campaignRow, { borderColor: colors.cardBorder }]}
        >
          <UserRound size={16} color={palette.blue600} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700' }}>
              {t('posUi.customerLabel')}
            </Text>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }} numberOfLines={1}>
              {selectedCustomer
                ? `${selectedCustomer.name}${
                    selectedCustomer.code ? ` · ${selectedCustomer.code}` : ''
                  }`
                : t('posUi.customerNone')}
            </Text>
            {selectedCustomer ? (
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                {t('posUi.balance')}: {formatMoney(selectedCustomer.balance)} ₺
              </Text>
            ) : null}
          </View>
          <Text style={{ color: palette.blue600, fontWeight: '800', fontSize: 12 }}>
            {selectedCustomer ? t('posUi.change') : t('posUi.select')}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setPickerOpen(true)}
          style={[styles.campaignRow, { borderColor: colors.cardBorder }]}
        >
          <Tag size={16} color={palette.blue600} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700' }}>
              {t('posUi.campaignLabel')} {campaignModeLabel}
            </Text>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }} numberOfLines={1}>
              {campaignSubtitle}
            </Text>
          </View>
          <Text style={{ color: palette.blue600, fontWeight: '800', fontSize: 12 }}>
            {t('posUi.select')}
          </Text>
        </Pressable>

        {applied.discount > 0 ? (
          <View style={styles.totalsCol}>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              {t('posUi.subtotal')}: {formatMoney(subtotal)} ₺
            </Text>
            <Text style={{ color: palette.green600, fontSize: 13, fontWeight: '700' }}>
              {t('posUi.discount')}: −{formatMoney(applied.discount)} ₺
            </Text>
          </View>
        ) : null}
        <Text style={[styles.total, { color: colors.text }]}>
          {t('posUi.total')}: {formatMoney(total)} ₺
        </Text>
        {saving ? (
          <ActivityIndicator color={palette.blue600} />
        ) : (
          <View style={styles.payCol}>
            <View style={styles.payRow}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  label={t('posUi.cash')}
                  disabled={cart.length === 0}
                  onPress={() => checkout('Nakit')}
                />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  label={t('posUi.card')}
                  disabled={cart.length === 0}
                  onPress={() => checkout('Kredi Kartı')}
                />
              </View>
            </View>
            <View style={styles.payRow}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  label={t('posUi.transfer')}
                  disabled={cart.length === 0}
                  onPress={() => checkout('Havale')}
                />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  label={t('posUi.credit')}
                  disabled={cart.length === 0}
                  onPress={() => checkout('Veresiye')}
                />
              </View>
            </View>
          </View>
        )}
      </View>

      <Modal
        visible={customerPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomerPickerOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setCustomerPickerOpen(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('posUi.pickCustomer')}</Text>
            <View style={{ paddingHorizontal: 4, marginBottom: 4 }}>
              <SearchBar
                value={customerSearch}
                onChangeText={setCustomerSearch}
                placeholder={t('posUi.customerSearch')}
              />
            </View>
            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              {selectedCustomer ? (
                <Pressable
                  style={styles.modalItem}
                  onPress={() => {
                    setSelectedCustomer(null);
                    setCustomerPickerOpen(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textMuted, fontWeight: '700' }}>
                      {t('posUi.clearCustomer')}
                    </Text>
                    <Text style={{ color: colors.textSubtle, fontSize: 11 }}>
                      {t('posUi.clearCustomerHint')}
                    </Text>
                  </View>
                </Pressable>
              ) : null}
              {customerLoading ? (
                <ActivityIndicator style={{ marginVertical: 16 }} color={palette.blue600} />
              ) : (
                customerHits.map((c) => {
                  const selected = selectedCustomer?.id === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      style={[
                        styles.modalItem,
                        selected && { backgroundColor: palette.blue600 + '18' },
                      ]}
                      onPress={() => {
                        setSelectedCustomer({
                          id: c.id,
                          name: c.name,
                          code: c.code,
                          balance: Number(c.balance) || 0,
                        });
                        setCustomerPickerOpen(false);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>
                          {c.name}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                          {c.code || '—'} · {t('posUi.balance')}: {formatMoney(c.balance)} ₺
                        </Text>
                      </View>
                      {selected ? (
                        <Text style={{ color: palette.blue600, fontWeight: '800', fontSize: 11 }}>
                          {t('posUi.badgeSelected')}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })
              )}
              {!customerLoading && customerHits.length === 0 ? (
                <Text style={{ color: colors.textMuted, padding: 12, fontSize: 12 }}>
                  {t('posUi.customerSearchEmpty')}
                </Text>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPickerOpen(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('posUi.pickCampaign')}</Text>
            <View style={{ paddingHorizontal: 4, marginBottom: 4 }}>
              <SearchBar
                value={campaignFilter}
                onChangeText={setCampaignFilter}
                placeholder={t('posUi.campaignSearch')}
              />
            </View>
            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              <Pressable
                style={[
                  styles.modalItem,
                  selectedCampaignId === null && { backgroundColor: palette.blue600 + '18' },
                ]}
                onPress={() => {
                  setSelectedCampaignId(null);
                  setPickerOpen(false);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{t('posUi.autoBest')}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                    {t('posUi.autoBestHint')}
                  </Text>
                </View>
                {selectedCampaignId === null ? (
                  <Text style={{ color: palette.blue600, fontWeight: '800', fontSize: 11 }}>
                    {t('posUi.badgeSelected')}
                  </Text>
                ) : null}
              </Pressable>
              <Pressable
                style={[
                  styles.modalItem,
                  selectedCampaignId === '' && { backgroundColor: palette.blue600 + '18' },
                ]}
                onPress={() => {
                  setSelectedCampaignId('');
                  setPickerOpen(false);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textMuted, fontWeight: '700' }}>{t('posUi.noApply')}</Text>
                  <Text style={{ color: colors.textSubtle, fontSize: 11 }}>
                    {t('posUi.noApplyHint')}
                  </Text>
                </View>
                {selectedCampaignId === '' ? (
                  <Text style={{ color: palette.blue600, fontWeight: '800', fontSize: 11 }}>
                    {t('posUi.badgeSelected')}
                  </Text>
                ) : null}
              </Pressable>
              {filteredCampaigns.map((c) => {
                const preview = applyCampaign(campaignEngineLines, c);
                const ok = preview.totalDiscount > 0;
                const selected = selectedCampaignId === c.id;
                const reason =
                  !ok && cart.length > 0
                    ? c.minPurchaseAmount > 0 && subtotal < c.minPurchaseAmount
                      ? t('posUi.minPurchase', { amount: formatMoney(c.minPurchaseAmount) })
                      : t('posUi.notForCart')
                    : null;
                return (
                  <Pressable
                    key={c.id}
                    style={[
                      styles.modalItem,
                      !ok && { opacity: 0.5 },
                      selected && { backgroundColor: palette.blue600 + '18' },
                    ]}
                    disabled={!ok && cart.length > 0}
                    onPress={() => {
                      setSelectedCampaignId(c.id);
                      setPickerOpen(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>
                        {c.name}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                        {formatCampaignDiscount(c)}
                        {ok
                          ? ` · −${formatMoney(preview.totalDiscount)}`
                          : reason
                            ? ` · ${reason}`
                            : ''}
                      </Text>
                    </View>
                    {ok ? (
                      <Text
                        style={{
                          color: selected ? palette.blue600 : palette.green600,
                          fontWeight: '800',
                          fontSize: 11,
                        }}
                      >
                        {selected ? t('posUi.badgeSelected') : t('posUi.badgeOk')}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
              {campaigns.length === 0 ? (
                <Text style={{ color: colors.textMuted, padding: 12, fontSize: 12 }}>
                  {t('posUi.noPeriodCampaign')}
                </Text>
              ) : filteredCampaigns.length === 0 ? (
                <Text style={{ color: colors.textMuted, padding: 12, fontSize: 12 }}>
                  {t('posUi.campaignSearchEmpty')}
                </Text>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
    gap: 4,
  },
  searchFlex: { flex: 1, minWidth: 0 },
  scanBtn: {
    marginTop: 8,
    marginBottom: 4,
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hits: {
    marginHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    maxHeight: 220,
    overflow: 'hidden',
  },
  hit: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    gap: 8,
  },
  line: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: palette.blue600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    padding: 16,
    gap: 8,
  },
  campaignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  totalsCol: { gap: 2 },
  total: { fontSize: 18, fontWeight: '800' },
  payCol: { gap: 8 },
  payRow: { flexDirection: 'row', gap: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    maxHeight: '70%',
    paddingBottom: 24,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    padding: 16,
    paddingBottom: 8,
  },
  modalItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
  },
});
