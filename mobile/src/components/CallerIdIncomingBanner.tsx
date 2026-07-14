import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Phone, X } from 'lucide-react-native';
import { useCallerIdStore } from '../store/callerIdStore';
import { navigationRef } from '../navigation/navigationRef';
import { palette } from '../theme/colors';

const AUTO_DISMISS_MS = 45_000;

export function CallerIdIncomingBanner() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const incoming = useCallerIdStore((s) => s.incoming);
  const customer = useCallerIdStore((s) => s.matchedCustomer);
  const dismissIncoming = useCallerIdStore((s) => s.dismissIncoming);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!incoming) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => dismissIncoming(), AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [incoming?.phone, incoming?.receivedAt, dismissIncoming]);

  if (!incoming) return null;

  const goMain = (screen: string, params?: object) => {
    dismissIncoming();
    if (!navigationRef.isReady()) return;
    navigationRef.navigate('Main', {
      screen,
      params,
    } as never);
  };

  return (
    <View
      style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) + 4 }]}
      pointerEvents="box-none"
    >
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.iconBox}>
            <Phone size={18} color={palette.white} />
          </View>
          <View style={styles.body}>
            <Text style={styles.title}>{t('callerId.incomingTitle')}</Text>
            <Text style={styles.phone} numberOfLines={1}>
              {incoming.phone}
              {incoming.name ? ` · ${incoming.name}` : ''}
            </Text>
            <Text style={styles.customer} numberOfLines={2}>
              {customer
                ? t('callerId.matchedCustomer', {
                    name: customer.name,
                    code: customer.code || '—',
                  })
                : t('callerId.unknownCustomer')}
            </Text>
          </View>
          <Pressable onPress={dismissIncoming} hitSlop={10} style={styles.closeBtn}>
            <X size={18} color="#e2e8f0" />
          </Pressable>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[styles.btn, styles.btnPrimary]}
            onPress={() =>
              goMain('Restaurant', { initialTab: 'orders', callerPhone: incoming.phone })
            }
          >
            <Text style={styles.btnPrimaryText}>{t('callerId.actionRestaurant')}</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.btnSecondary]}
            onPress={() =>
              goMain('Beauty', {
                initialTab: 'appointments',
                openCreate: true,
                callerPhone: incoming.phone,
                callerName: customer?.name || incoming.name,
              })
            }
          >
            <Text style={styles.btnSecondaryText}>{t('callerId.actionBeauty')}</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.btnSecondary]}
            onPress={() => {
              if (customer?.id) {
                goMain('CustomerDetail', { customerId: customer.id });
              } else {
                goMain('Customers', { initialSearch: incoming.phone, callerPhone: incoming.phone });
              }
            }}
          >
            <Text style={styles.btnSecondaryText}>
              {customer ? t('callerId.actionOpenCustomer') : t('callerId.actionFindCustomer')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.btnGhost]}
            onPress={() => {
              dismissIncoming();
              if (!navigationRef.isReady()) return;
              navigationRef.navigate('Main', {
                screen: 'Tabs',
                params: { screen: 'POS' },
              });
            }}
          >
            <Text style={styles.btnGhostText}>{t('callerId.actionPos')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 9999,
    elevation: 9999,
    paddingHorizontal: 10,
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 10 },
    }),
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: palette.blue600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  title: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  phone: { color: palette.white, fontSize: 16, fontWeight: '800', marginTop: 2 },
  customer: { color: '#cbd5e1', fontSize: 12, marginTop: 3 },
  closeBtn: { padding: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  btnPrimary: { backgroundColor: palette.blue600 },
  btnPrimaryText: { color: palette.white, fontSize: 11, fontWeight: '800' },
  btnSecondary: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#475569' },
  btnSecondaryText: { color: '#e2e8f0', fontSize: 11, fontWeight: '700' },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#475569' },
  btnGhostText: { color: '#94a3b8', fontSize: 11, fontWeight: '700' },
});
