import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  getEffectiveConnectivity,
  type EffectiveConnectivity,
} from '../offline/policy';
import { useConnectivityStore } from '../store/connectivityStore';
import { useConfigStore } from '../store/configStore';
import { palette } from '../theme/colors';

function labelFor(eff: EffectiveConnectivity, t: (k: string) => string): string {
  switch (eff) {
    case 'online':
      return t('connOnline');
    case 'offline':
      return t('connOffline');
    case 'hybrid-live':
      return t('connHybridLive');
    case 'hybrid-cache':
      return t('connHybridCache');
    default:
      return t('connHybrid');
  }
}

function colorFor(eff: EffectiveConnectivity): string {
  switch (eff) {
    case 'online':
    case 'hybrid-live':
      return palette.green500;
    case 'offline':
      return palette.red500;
    case 'hybrid-cache':
      return '#f59e0b';
    default:
      return palette.blue200;
  }
}

type Props = {
  /** Dashboard/gradient üzeri — açık renk metin */
  onDark?: boolean;
  compact?: boolean;
};

/** Header / ayarlar: Online · Offline · Hybrid göstergesi */
export function ConnectivityBadge({ onDark, compact }: Props) {
  const { t } = useTranslation();
  const policy = useConfigStore((s) => s.config.networkPolicy);
  const isConnected = useConnectivityStore((s) => s.isConnected);
  const isInternetReachable = useConnectivityStore((s) => s.isInternetReachable);
  const pendingCount = useConnectivityStore((s) => s.pendingCount);
  const syncing = useConnectivityStore((s) => s.syncing);

  // store alanları değişince etiket güncellensin
  void policy;
  void isConnected;
  void isInternetReachable;

  const eff = getEffectiveConnectivity();
  const label = syncing ? t('connSyncing') : labelFor(eff, t);
  const dot = colorFor(eff);
  const pending =
    pendingCount > 0 ? ` · ${pendingCount}` : '';

  return (
    <View
      style={[
        styles.wrap,
        compact && styles.wrapCompact,
        onDark
          ? styles.wrapOnDark
          : { backgroundColor: 'rgba(15,23,42,0.06)', borderColor: 'rgba(15,23,42,0.08)' },
      ]}
      accessibilityLabel={`${label}${pending}`}
    >
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Text
        style={[styles.text, onDark ? styles.textOnDark : styles.textOnLight]}
        numberOfLines={1}
      >
        {label}
        {pending}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    alignSelf: 'flex-start',
    maxWidth: 160,
  },
  wrapCompact: {
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  wrapOnDark: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  textOnDark: { color: palette.white },
  textOnLight: { color: palette.blue700 },
});
