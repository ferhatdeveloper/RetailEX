import React, { type ReactNode } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';

export type SplitPaneOrientation = 'row' | 'col';

export type SplitPaneProps = {
  /** Yatay yan yana mı, dikey üst üste mi. */
  orientation: SplitPaneOrientation;
  /** Sol / üst bölme. */
  left?: ReactNode;
  /** Sağ / alt bölme. */
  right?: ReactNode;
  /** İki bölme arasındaki boşluk (px). */
  gap?: number;
  /** Sol bölmenin esneklik oranı. */
  leftFlex?: number;
  /** Sağ bölmenin esneklik oranı. */
  rightFlex?: number;
  /** Container stili (örn. padding). Container transparent geçirilir. */
  style?: ViewStyle;
};

export function SplitPane({
  orientation,
  left,
  right,
  gap = 12,
  leftFlex = 1,
  rightFlex = 1,
  style,
}: SplitPaneProps): React.JSX.Element {
  const flexDirection: ViewStyle['flexDirection'] =
    orientation === 'row' ? 'row' : 'column';

  return (
    <View style={[styles.root, { flexDirection, gap }, style]}>
      <View style={{ flex: leftFlex }}>{left}</View>
      <View style={{ flex: rightFlex }}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
