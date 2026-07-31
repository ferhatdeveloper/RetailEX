import React from 'react';
import { View, Text, Pressable, StyleSheet, TextInput } from 'react-native';
import { ArrowLeft, Search } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { GradientHeader, HeaderIconButton } from './GradientHeader';
import { ConnectivityBadge } from './ConnectivityBadge';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';

type Props = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  /** Varsayılan `navigation.goBack` yerine özel geri (ör. restoran hub) */
  onBack?: () => void;
  right?: React.ReactNode;
  /** App bar altına bitişik şerit (ör. flat gün tab’ları) */
  below?: React.ReactNode;
  /** Ağ rozeti (varsayılan açık) */
  showConnectivity?: boolean;
};

export function ScreenHeader({
  title,
  subtitle,
  showBack = true,
  onBack,
  right,
  below,
  showConnectivity = true,
}: Props) {
  const navigation = useNavigation();
  const canBack = showBack && (Boolean(onBack) || navigation.canGoBack());
  return (
    <GradientHeader compact style={below ? styles.headerWithBelow : undefined}>
      <View style={styles.row}>
        {canBack ? (
          <HeaderIconButton
            onPress={() => {
              if (onBack) onBack();
              else navigation.goBack();
            }}
          >
            <ArrowLeft size={18} color={palette.white} />
          </HeaderIconButton>
        ) : (
          <View style={{ width: 36 }} />
        )}
        <View style={styles.mid}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.sub} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
          {showConnectivity ? (
            <View style={styles.badgeRow}>
              <ConnectivityBadge onDark compact />
            </View>
          ) : null}
        </View>
        {right ?? <View style={{ width: 36 }} />}
      </View>
      {below ? <View style={styles.below}>{below}</View> : null}
    </GradientHeader>
  );
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Ara…',
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
}) {
  const { colors } = useThemeStore();
  return (
    <View
      style={[
        styles.searchWrap,
        { backgroundColor: colors.card, borderColor: colors.cardBorder },
      ]}
    >
      <Search size={16} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        style={[styles.searchInput, { color: colors.text }]}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />
    </View>
  );
}

export function EmptyState({ message }: { message: string }) {
  const { colors } = useThemeStore();
  return (
    <View style={styles.empty}>
      <Text style={{ color: colors.textMuted, textAlign: 'center' }}>{message}</Text>
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Pressable onPress={onRetry} style={styles.err}>
      <Text style={styles.errText}>{message}</Text>
      {onRetry ? <Text style={styles.retry}>Yenile</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerWithBelow: { paddingBottom: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 2,
  },
  mid: { flex: 1, minWidth: 0 },
  title: { color: palette.white, fontSize: 16, fontWeight: '700' },
  sub: { color: palette.blue100, fontSize: 10, marginTop: 2 },
  badgeRow: { marginTop: 6 },
  below: {
    marginHorizontal: -16,
    marginTop: 10,
    zIndex: 2,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 4 },
  empty: { padding: 32, alignItems: 'center' },
  err: {
    margin: 12,
    padding: 12,
    backgroundColor: palette.red100,
    borderRadius: 8,
    gap: 4,
  },
  errText: { color: palette.red500, fontSize: 12 },
  retry: { color: palette.blue600, fontWeight: '700', fontSize: 12 },
});
