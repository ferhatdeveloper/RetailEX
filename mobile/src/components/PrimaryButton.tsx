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
  const { darkMode } = useThemeStore();
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        isPrimary && { backgroundColor: pressed ? palette.blue700 : palette.blue600 },
        isDanger && { backgroundColor: pressed ? '#dc2626' : palette.red500 },
        variant === 'ghost' && {
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderColor: darkMode ? palette.gray700 : palette.gray200,
        },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'ghost' ? palette.blue600 : palette.white} />
      ) : (
        <Text
          style={[
            styles.label,
            variant === 'ghost' && { color: darkMode ? palette.gray300 : palette.gray600 },
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
