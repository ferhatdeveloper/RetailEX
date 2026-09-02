import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
} from 'react-native';
import { CheckCircle2, Smartphone, Tablet, UtensilsCrossed } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenHeader } from '../components/ScreenChrome';
import { useThemeStore } from '../store/themeStore';
import { useDeviceLayout } from '../hooks/useDeviceLayout';
import {
  useLayoutPreferencesStore,
  type DeviceOrientationPref,
  type RestaurantOrientationPref,
} from '../store/layoutPreferencesStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'DisplaySettings'>;

type ChipOption<T extends string> = {
  id: T;
  label: string;
};

export function DisplaySettingsScreen(_props: Props): React.JSX.Element {
  const { t } = useTranslation();
  const { colors, darkMode } = useThemeStore();
  const { isTablet } = useDeviceLayout();

  const tabletOrientation = useLayoutPreferencesStore((s) => s.defaultOrientationForTablet);
  const phoneOrientation = useLayoutPreferencesStore((s) => s.defaultOrientationForPhone);
  const restaurantOrientation = useLayoutPreferencesStore((s) => s.restaurantLandscapeDefault);
  const setTabletOrientation = useLayoutPreferencesStore((s) => s.setTabletOrientation);
  const setPhoneOrientation = useLayoutPreferencesStore((s) => s.setPhoneOrientation);
  const setRestaurantOrientation = useLayoutPreferencesStore((s) => s.setRestaurantOrientation);

  const deviceChipOptions: ChipOption<DeviceOrientationPref>[] = [
    { id: 'portrait', label: t('systemSettings.display.orientationPortrait') },
    { id: 'landscape', label: t('systemSettings.display.orientationLandscape') },
    { id: 'auto', label: t('systemSettings.display.orientationAuto') },
  ];

  const restaurantChipOptions: ChipOption<RestaurantOrientationPref>[] = [
    { id: 'auto', label: t('systemSettings.display.orientationAuto') },
    { id: 'landscape', label: t('systemSettings.display.orientationLandscape') },
    { id: 'portrait', label: t('systemSettings.display.orientationPortrait') },
  ];

  const renderChipRow = useCallback(
    <T extends string>({
      value,
      options,
      onSelect,
    }: {
      value: T;
      options: ChipOption<T>[];
      onSelect: (v: T) => void;
    }) => (
      <View style={styles.chipRow}>
        {options.map(({ id, label }) => {
          const active = value === id;
          return (
            <Pressable
              key={id}
              onPress={() => onSelect(id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? palette.blue600 : colors.card,
                  borderColor: active ? palette.blue600 : colors.cardBorder,
                },
              ]}
            >
              {active ? <CheckCircle2 size={14} color={palette.white} /> : null}
              <Text
                style={{
                  color: active ? palette.white : colors.text,
                  fontSize: 12,
                  fontWeight: '700',
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    ),
    [colors.card, colors.cardBorder, colors.text],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={t('systemSettings.display.title')} />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {isTablet ? (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
          >
            <View style={styles.cardHeader}>
              <Tablet size={20} color={palette.blue600} />
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                {t('systemSettings.display.tabletOrientation')}
              </Text>
            </View>
            <Text style={[styles.hint, { color: colors.textSubtle }]}>
              {t('systemSettings.display.hint')}
            </Text>
            {renderChipRow({
              value: tabletOrientation,
              options: deviceChipOptions,
              onSelect: setTabletOrientation,
            })}
          </View>
        ) : null}

        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.cardHeader}>
            <Smartphone size={20} color={palette.blue600} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {t('systemSettings.display.phoneOrientation')}
            </Text>
          </View>
          {renderChipRow({
            value: phoneOrientation,
            options: deviceChipOptions,
            onSelect: setPhoneOrientation,
          })}
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.cardHeader}>
            <UtensilsCrossed size={20} color={palette.blue600} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {t('systemSettings.display.restaurantOrientation')}
            </Text>
          </View>
          {renderChipRow({
            value: restaurantOrientation,
            options: restaurantChipOptions,
            onSelect: setRestaurantOrientation,
          })}
        </View>

        <View
          style={[
            styles.saveHint,
            {
              borderColor: colors.cardBorder,
              backgroundColor: darkMode ? palette.gray900 : palette.gray50,
            },
          ]}
        >
          <CheckCircle2 size={14} color={palette.green500} />
          <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>
            {t('printerSettings.savedAutoHint')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 16, paddingBottom: 48, gap: 12 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  hint: {
    fontSize: 11,
    lineHeight: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flex: 1,
    minWidth: '28%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  saveHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
});
