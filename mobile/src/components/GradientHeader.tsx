import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradientFallback } from './LinearGradientFallback';
import { palette } from '../theme/colors';

type Props = {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  /**
   * Status bar / notch üst boşluğu.
   * Edge-to-edge app bar’larda true (varsayılan).
   * Kart içi header’larda false — üst güvenli alanı ekran SafeAreaView sağlar.
   */
  safeTop?: boolean;
};

/** Login / Dashboard mavi-indigo gradient header */
export function GradientHeader({
  title,
  subtitle,
  right,
  children,
  style,
  compact,
  safeTop = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const paddingTop = (safeTop ? insets.top : 0) + (compact ? 12 : 16);

  return (
    <LinearGradientFallback
      colors={[palette.blue600, palette.indigo600, palette.blue700]}
      style={[styles.header, compact && styles.compact, { paddingTop }, style]}
    >
      {safeTop ? <StatusBar style="light" /> : null}
      <View style={styles.gloss} pointerEvents="none" />
      {(title || right) && (
        <View style={styles.topRow}>
          <View style={styles.titleBlock}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      )}
      {children}
    </LinearGradientFallback>
  );
}

export function HeaderIconButton({
  onPress,
  children,
  accent,
}: {
  onPress: () => void;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.iconBtn, accent && styles.iconBtnAccent]}
      hitSlop={8}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 24,
    paddingBottom: 36,
    overflow: 'hidden',
  },
  compact: {
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  gloss: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    zIndex: 2,
  },
  titleBlock: { flex: 1, minWidth: 0 },
  title: {
    color: palette.white,
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: palette.blue200,
    fontSize: 10,
    marginTop: 2,
  },
  iconBtn: {
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  iconBtnAccent: {
    backgroundColor: 'rgba(59,130,246,0.25)',
    borderColor: 'rgba(59,130,246,0.15)',
  },
});
