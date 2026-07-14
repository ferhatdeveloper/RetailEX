import React from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/** Kart görünümü: asla 2 sütun (kırık / “ikili” layout yok). */
export const MENU_GRID_MIN_COLUMNS = 3;
export const MENU_GRID_GAP = 8;
export const MENU_GRID_HORIZONTAL_PADDING = 12;
/** Dar telefon + 3 sütunda kompakt eşit kart. */
export const MENU_CARD_HEIGHT = 76;

/**
 * Genişliğe göre sütun: 3 (telefon) | 4 (geniş / tablet).
 * 2 sütun bilerek desteklenmez.
 */
export function useMenuGridColumns(): number {
  const { width } = useWindowDimensions();
  if (width >= 720) return 4;
  return MENU_GRID_MIN_COLUMNS;
}

export function useMenuGridCellWidth(horizontalPadding = MENU_GRID_HORIZONTAL_PADDING): number {
  const { width } = useWindowDimensions();
  const cols = useMenuGridColumns();
  return (width - horizontalPadding * 2 - MENU_GRID_GAP * (cols - 1)) / cols;
}

type MenuCardGridProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function MenuCardGrid({ children, style }: MenuCardGridProps) {
  return <View style={[styles.grid, style]}>{children}</View>;
}

type MenuCardGridItemProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function MenuCardGridItem({ children, style }: MenuCardGridItemProps) {
  const cellWidth = useMenuGridCellWidth();
  return (
    <View style={[styles.gridItem, { width: cellWidth }, style]}>
      {children}
    </View>
  );
}

export const menuCardStyles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    height: MENU_CARD_HEIGHT,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  cardPressable: {
    height: MENU_CARD_HEIGHT,
    width: '100%',
  },
  actionCard: {
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    height: MENU_CARD_HEIGHT,
    width: '100%',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 1,
  },
  actionLabel: {
    fontSize: 10,
    textAlign: 'center',
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto',
  },
});

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MENU_GRID_GAP,
  },
  gridItem: {
    flexGrow: 0,
    flexShrink: 0,
  },
});
