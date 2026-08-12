import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ViewStyle,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';

export type PercentBodySheetSize = 'list' | 'wide' | 'compact';

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** list ≈ %85 yükseklik; wide daha yüksek; compact içeriğe yakın */
  size?: PercentBodySheetSize;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Scroll gövde kapalı — caller kendi ScrollView kullanır */
  scrollBody?: boolean;
  bodyStyle?: ViewStyle;
};

const SIZE_H: Record<PercentBodySheetSize, `${number}%`> = {
  list: '85%',
  wide: '90%',
  compact: '70%',
};

/**
 * Web PercentBodyModal benzeri — RN Modal + overlay + sabit % yükseklik kabuk.
 * Header / gövde (scroll) / footer ayrımı.
 */
export function PercentBodySheet({
  visible,
  onClose,
  title,
  subtitle,
  size = 'list',
  children,
  footer,
  scrollBody = true,
  bodyStyle,
}: Props) {
  const { colors } = useThemeStore();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Kapat" />
        <View
          style={[
            styles.sheet,
            {
              height: SIZE_H[size],
              backgroundColor: colors.card,
              borderColor: colors.cardBorder,
            },
          ]}
        >
          <View style={styles.header}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={styles.headerSub} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn} accessibilityLabel="Kapat">
              <X size={18} color={palette.white} />
            </Pressable>
          </View>

          {scrollBody ? (
            <ScrollView
              style={styles.bodyScroll}
              contentContainerStyle={[styles.bodyContent, bodyStyle]}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.bodyFlex, bodyStyle]}>{children}</View>
          )}

          {footer ? (
            <View style={[styles.footer, { borderTopColor: colors.cardBorder, backgroundColor: colors.backgroundAlt }]}>
              {footer}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: palette.blue600,
  },
  headerTitle: { color: palette.white, fontSize: 16, fontWeight: '800' },
  headerSub: { color: palette.blue100, fontSize: 11, marginTop: 2, fontWeight: '600' },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  bodyScroll: { flex: 1, minHeight: 0 },
  bodyContent: { padding: 16, gap: 12, paddingBottom: 24 },
  bodyFlex: { flex: 1, minHeight: 0 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
  },
});
