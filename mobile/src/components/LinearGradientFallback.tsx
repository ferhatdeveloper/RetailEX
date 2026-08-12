import React from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';

/** expo-linear-gradient yoksa yatay renk şeridi fallback */
type Props = {
  colors: string[];
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export function LinearGradientFallback({ colors, style, children }: Props) {
  const c0 = colors[0] ?? '#2563eb';
  const c1 = colors[1] ?? colors[0] ?? '#4f46e5';
  const c2 = colors[2] ?? colors[1] ?? colors[0] ?? '#1d4ed8';

  return (
    <View style={[{ backgroundColor: c0, overflow: 'hidden' }, style]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: c1, opacity: 0.55 }]} />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: c2,
            opacity: 0.35,
            transform: [{ translateX: 40 }],
          },
        ]}
      />
      {children}
    </View>
  );
}
