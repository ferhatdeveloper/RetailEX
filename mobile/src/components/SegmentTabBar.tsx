import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';

export type SegmentTabItem<T extends string = string> = {
  id: T;
  label: string;
  icon?: React.ComponentType<{ size?: number; color?: string }>;
};

type Props<T extends string> = {
  items: ReadonlyArray<SegmentTabItem<T>>;
  value: T;
  onChange: (id: T) => void;
  /** equal: sabit satır (flex); scroll: yatay kaydırma — etiket kesilmez */
  layout?: 'equal' | 'scroll';
  /** pill (varsayılan chip) veya underline (alt çizgi) */
  variant?: 'pill' | 'underline';
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const TAB_MIN_HEIGHT = 40;

/**
 * Modül içi sekme şeridi — Beauty / Restaurant / Delivery / Finance / More / System.
 * Active: web blue600; dark mode sınır/arka plan theme’den.
 *
 * Önemli: parent `flex:1` sütunda yatay ScrollView varsayılan `flexGrow:1` ile
 * dikey şişer; satır `flexGrow:0` + `alignItems:'center'` ile sabit yükseklik kalır.
 */
export function SegmentTabBar<T extends string>({
  items,
  value,
  onChange,
  layout = 'equal',
  variant = 'pill',
  style,
  testID,
}: Props<T>) {
  const { colors } = useThemeStore();

  const renderTab = (item: SegmentTabItem<T>, equal: boolean) => {
    const on = item.id === value;
    const Icon = item.icon;
    const activeColors =
      variant === 'underline'
        ? {
            color: on ? palette.blue600 : colors.textMuted,
            borderBottomColor: on ? palette.blue600 : 'transparent',
          }
        : {
            backgroundColor: on ? palette.blue600 : colors.card,
            borderColor: on ? palette.blue600 : colors.cardBorder,
            color: on ? palette.white : colors.text,
          };

    if (variant === 'underline') {
      return (
        <Pressable
          key={item.id}
          onPress={() => onChange(item.id)}
          accessibilityRole="tab"
          accessibilityState={{ selected: on }}
          style={[
            styles.underlineBtn,
            equal && styles.equalFlex,
            { borderBottomColor: activeColors.borderBottomColor },
          ]}
        >
          {Icon ? <Icon size={16} color={activeColors.color} /> : null}
          <Text
            style={[styles.label, { color: activeColors.color, fontWeight: on ? '800' : '600' }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item.label}
          </Text>
        </Pressable>
      );
    }

    return (
      <Pressable
        key={item.id}
        onPress={() => onChange(item.id)}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        style={[
          styles.pill,
          equal && styles.equalFlex,
          {
            backgroundColor: activeColors.backgroundColor,
            borderColor: activeColors.borderColor,
          },
        ]}
      >
        {Icon ? <Icon size={15} color={activeColors.color} /> : null}
        <Text
          style={[styles.label, { color: activeColors.color }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {item.label}
        </Text>
      </Pressable>
    );
  };

  if (layout === 'scroll') {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        testID={testID}
        style={[styles.barShell, variant === 'underline' && { borderBottomColor: colors.cardBorder }, style]}
        contentContainerStyle={[
          styles.scrollContent,
          variant === 'underline' && styles.underlineRow,
        ]}
      >
        {items.map((item) => renderTab(item, false))}
      </ScrollView>
    );
  }

  return (
    <View
      testID={testID}
      style={[
        styles.barShell,
        styles.row,
        variant === 'underline' && [styles.underlineRow, { borderBottomColor: colors.cardBorder }],
        style,
      ]}
    >
      {items.map((item) => renderTab(item, true))}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Parent flex sütunda dikey şişmeyi engelle */
  barShell: {
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'stretch',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  equalFlex: {
    flex: 1,
    minWidth: 0,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 6,
    height: TAB_MIN_HEIGHT,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  underlineRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  underlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 6,
    height: TAB_MIN_HEIGHT,
    paddingHorizontal: 10,
    borderBottomWidth: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
  },
});
