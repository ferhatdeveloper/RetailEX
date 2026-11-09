import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, type ViewStyle } from 'react-native';
import { palette } from '../theme/colors';
import { useThemeStore } from '../store/themeStore';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
  style?: ViewStyle;
};

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  style,
}: Props) {
  const { colors } = useThemeStore();
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        isPrimary && {
          backgroundColor: pressed ? colors.primaryPressed : colors.primary,
        },
        isDanger && { backgroundColor: pressed ? palette.red600 : colors.danger },
        variant === 'ghost' && {
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderColor: colors.cardBorder,
        },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'ghost' ? colors.primary : palette.white} />
      ) : (
        <Text
          style={[
            styles.label,
            variant === 'ghost' && { color: colors.textMuted },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: palette.white,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
