import React from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';

type Props = TextInputProps & {
  label: string;
  hintRight?: string;
  leftIcon?: React.ReactNode;
  rightAddon?: React.ReactNode;
  containerStyle?: ViewStyle;
};

/** Login.tsx form alanı: uppercase label + border-2 + pl-12 ikon */
export function FormField({
  label,
  hintRight,
  leftIcon,
  rightAddon,
  containerStyle,
  style,
  ...rest
}: Props) {
  const { colors, darkMode } = useThemeStore();

  return (
    <View style={[styles.wrap, containerStyle]}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
        {hintRight ? (
          <Text style={styles.hintRight}>{hintRight}</Text>
        ) : null}
      </View>
      <View style={styles.row}>
        {leftIcon ? <View style={styles.leftIcon}>{leftIcon}</View> : null}
        <TextInput
          placeholderTextColor={darkMode ? 'rgba(255,255,255,0.2)' : palette.gray400}
          style={[
            styles.input,
            {
              backgroundColor: colors.inputBg,
              borderColor: colors.inputBorder,
              color: colors.text,
              paddingLeft: leftIcon ? 44 : 16,
              borderTopRightRadius: rightAddon ? 0 : 2,
              borderBottomRightRadius: rightAddon ? 0 : 2,
              borderRightWidth: rightAddon ? 0 : 2,
            },
            style,
          ]}
          {...rest}
        />
        {rightAddon}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  hintRight: {
    fontSize: 8,
    fontWeight: '700',
    color: palette.blue500,
    textTransform: 'uppercase',
  },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  leftIcon: {
    position: 'absolute',
    left: 16,
    top: 0,
    bottom: 0,
    zIndex: 2,
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 2,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: '700',
  },
});
