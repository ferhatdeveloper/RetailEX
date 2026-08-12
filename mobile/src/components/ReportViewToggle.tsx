/**
 * ERP / restoran raporları — Liste | Grafik görünüm seçici.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { usePreferencesStore, type ReportsView } from '../store/preferencesStore';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';

type Props = {
  /** Dışarıdan kontrol (opsiyonel); yoksa preferencesStore.reportsView */
  value?: ReportsView;
  onChange?: (mode: ReportsView) => void;
  style?: StyleProp<ViewStyle>;
};

export function ReportViewToggle({ value, onChange, style }: Props) {
  const { colors } = useThemeStore();
  const storeView = usePreferencesStore((s) => s.reportsView);
  const setReportsView = usePreferencesStore((s) => s.setReportsView);
  const viewMode = value ?? storeView;
  const setViewMode = onChange ?? setReportsView;

  return (
    <View style={[styles.viewToggle, style]}>
      {(
        [
          ['list', 'Liste'],
          ['chart', 'Grafik'],
        ] as const
      ).map(([id, label]) => {
        const on = viewMode === id;
        return (
          <Pressable
            key={id}
            onPress={() => setViewMode(id)}
            style={[
              styles.viewChip,
              {
                backgroundColor: on ? palette.indigo600 : colors.card,
                borderColor: on ? palette.indigo600 : colors.cardBorder,
              },
            ]}
          >
            <Text
              style={{
                color: on ? palette.white : colors.text,
                fontWeight: '800',
                fontSize: 12,
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  viewToggle: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  viewChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
});
