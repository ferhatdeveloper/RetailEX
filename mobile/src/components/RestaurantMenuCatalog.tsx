/**
 * Restoran sipariş menü kataloğu — kategori şeridi + resimli ızgara / liste.
 * GastroPOS tarzı akış; dokunarak +1, uzun basınca manuel form.
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { LayoutGrid, List, Plus, Utensils } from 'lucide-react-native';
import { FormField } from './FormField';
import {
  restMenuImageUrl,
  type RestMenuItem,
} from '../api/restaurantApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import {
  usePreferencesStore,
  type RestMenuCatalogView,
} from '../store/preferencesStore';
import { palette } from '../theme/colors';

const GRID_COLS = 2;
const GRID_GAP = 10;
const H_PAD = 0;

const PLACEHOLDER_TONES = [
  { bg: '#E8F1FF', fg: '#1A56DB' },
  { bg: '#FFF1E8', fg: '#C2410C' },
  { bg: '#ECFDF5', fg: '#047857' },
  { bg: '#F5F3FF', fg: '#6D28D9' },
  { bg: '#FFF7ED', fg: '#B45309' },
  { bg: '#FDF2F8', fg: '#BE185D' },
  { bg: '#F0FDFA', fg: '#0F766E' },
  { bg: '#FEF3C7', fg: '#A16207' },
] as const;

function toneFor(key: string): (typeof PLACEHOLDER_TONES)[number] {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PLACEHOLDER_TONES[h % PLACEHOLDER_TONES.length]!;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toLocaleUpperCase('tr-TR');
  return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toLocaleUpperCase('tr-TR');
}

function MenuThumb({
  item,
  size,
  rounded = 14,
}: {
  item: RestMenuItem;
  size: number | 'fill';
  rounded?: number;
}) {
  const uri = restMenuImageUrl(item);
  const [failed, setFailed] = useState(false);
  const tone = toneFor(item.category || item.name);
  const fill = size === 'fill';
  const dim = fill ? undefined : size;

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[
          fill ? styles.thumbFill : { width: dim, height: dim },
          { borderRadius: rounded },
        ]}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View
      style={[
        fill ? styles.thumbFill : { width: dim, height: dim },
        {
          borderRadius: rounded,
          backgroundColor: tone.bg,
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}
    >
      <Text style={{ color: tone.fg, fontWeight: '900', fontSize: fill ? 22 : 14 }}>
        {initials(item.name)}
      </Text>
    </View>
  );
}

type Props = {
  items: RestMenuItem[];
  loading?: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  busyId: string | null;
  disabled?: boolean;
  onQuickAdd: (item: RestMenuItem) => void;
  onLongPress: (item: RestMenuItem) => void;
};

export function RestaurantMenuCatalog({
  items,
  loading,
  search,
  onSearchChange,
  busyId,
  disabled,
  onQuickAdd,
  onLongPress,
}: Props) {
  const { colors, darkMode } = useThemeStore();
  const { width } = useWindowDimensions();
  const viewMode = usePreferencesStore((s) => s.restMenuCatalogView);
  const setViewMode = usePreferencesStore((s) => s.setRestMenuCatalogView);
  const [category, setCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      const c = (it.category || 'Genel').trim() || 'Genel';
      map.set(c, (map.get(c) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'tr'));
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return items.filter((it) => {
      const cat = (it.category || 'Genel').trim() || 'Genel';
      if (category && cat !== category) return false;
      if (!q) return true;
      const hay = `${it.name} ${it.code || ''} ${cat}`.toLocaleLowerCase('tr-TR');
      return hay.includes(q);
    });
  }, [items, search, category]);

  const tileW = useMemo(() => {
    const usable = width - 32 - GRID_GAP * (GRID_COLS - 1);
    return Math.floor(usable / GRID_COLS);
  }, [width]);

  const setMode = (mode: RestMenuCatalogView) => setViewMode(mode);

  return (
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        <Text style={[styles.title, { color: colors.text }]}>Menü</Text>
        <View style={styles.viewToggle}>
          <Pressable
            onPress={() => setMode('grid')}
            accessibilityRole="button"
            accessibilityState={{ selected: viewMode === 'grid' }}
            style={[
              styles.viewBtn,
              {
                backgroundColor: viewMode === 'grid' ? palette.blue600 : colors.card,
                borderColor: viewMode === 'grid' ? palette.blue600 : colors.cardBorder,
              },
            ]}
          >
            <LayoutGrid
              size={16}
              color={viewMode === 'grid' ? palette.white : colors.textMuted}
            />
          </Pressable>
          <Pressable
            onPress={() => setMode('list')}
            accessibilityRole="button"
            accessibilityState={{ selected: viewMode === 'list' }}
            style={[
              styles.viewBtn,
              {
                backgroundColor: viewMode === 'list' ? palette.blue600 : colors.card,
                borderColor: viewMode === 'list' ? palette.blue600 : colors.cardBorder,
              },
            ]}
          >
            <List
              size={16}
              color={viewMode === 'list' ? palette.white : colors.textMuted}
            />
          </Pressable>
        </View>
      </View>

      <FormField
        label="Ara"
        value={search}
        onChangeText={onSearchChange}
        placeholder="Ürün, kod veya kategori"
        hintRight={loading ? '…' : `${filtered.length}/${items.length}`}
      />

      {categories.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          style={styles.chipsScroll}
        >
          <Pressable
            onPress={() => setCategory(null)}
            style={[
              styles.chip,
              {
                backgroundColor: !category ? palette.blue600 : colors.card,
                borderColor: !category ? palette.blue600 : colors.cardBorder,
              },
            ]}
          >
            <Text
              style={{
                color: !category ? palette.white : colors.text,
                fontWeight: '800',
                fontSize: 12,
              }}
            >
              Tümü · {items.length}
            </Text>
          </Pressable>
          {categories.map(([name, count]) => {
            const on = category === name;
            const tone = toneFor(name);
            return (
              <Pressable
                key={name}
                onPress={() => setCategory(on ? null : name)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: on ? palette.blue600 : colors.card,
                    borderColor: on ? palette.blue600 : colors.cardBorder,
                  },
                ]}
              >
                <View
                  style={[
                    styles.chipDot,
                    { backgroundColor: on ? 'rgba(255,255,255,0.85)' : tone.fg },
                  ]}
                />
                <Text
                  style={{
                    color: on ? palette.white : colors.text,
                    fontWeight: '800',
                    fontSize: 12,
                  }}
                  numberOfLines={1}
                >
                  {name} · {count}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {filtered.length === 0 ? (
        <View
          style={[
            styles.empty,
            { borderColor: colors.cardBorder, backgroundColor: colors.card },
          ]}
        >
          <Utensils size={28} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8, textAlign: 'center' }}>
            {loading ? 'Menü yükleniyor…' : 'Bu filtrede ürün yok'}
          </Text>
        </View>
      ) : viewMode === 'grid' ? (
        <View style={styles.grid}>
          {filtered.map((mi) => {
            const busy = busyId === mi.id;
            return (
              <Pressable
                key={mi.id}
                disabled={disabled || busy}
                onPress={() => onQuickAdd(mi)}
                onLongPress={() => onLongPress(mi)}
                style={({ pressed }) => [
                  styles.gridCard,
                  {
                    width: tileW,
                    borderColor: busy ? palette.blue600 : colors.cardBorder,
                    backgroundColor: colors.card,
                    opacity: busy ? 0.72 : pressed ? 0.92 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                ]}
              >
                <View style={styles.gridImageWrap}>
                  <MenuThumb item={mi} size="fill" rounded={0} />
                  <View
                    style={[
                      styles.priceBadge,
                      {
                        backgroundColor: darkMode
                          ? 'rgba(15,23,42,0.88)'
                          : 'rgba(255,255,255,0.94)',
                      },
                    ]}
                  >
                    <Text style={{ color: palette.blue600, fontWeight: '900', fontSize: 12 }}>
                      {formatMoney(mi.price)}
                    </Text>
                  </View>
                  <View style={styles.plusFab}>
                    <Plus size={16} color={palette.white} strokeWidth={3} />
                  </View>
                </View>
                <View style={styles.gridBody}>
                  <Text
                    style={{
                      color: palette.blue600,
                      fontSize: 9,
                      fontWeight: '900',
                      letterSpacing: 0.6,
                      textTransform: 'uppercase',
                    }}
                    numberOfLines={1}
                  >
                    {mi.category || 'Menü'}
                  </Text>
                  <Text
                    style={{ color: colors.text, fontWeight: '800', fontSize: 13, marginTop: 2 }}
                    numberOfLines={2}
                  >
                    {mi.name}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.list}>
          {filtered.map((mi) => {
            const busy = busyId === mi.id;
            return (
              <Pressable
                key={mi.id}
                disabled={disabled || busy}
                onPress={() => onQuickAdd(mi)}
                onLongPress={() => onLongPress(mi)}
                style={({ pressed }) => [
                  styles.listRow,
                  {
                    borderColor: busy ? palette.blue600 : colors.cardBorder,
                    backgroundColor: pressed || busy ? palette.blue50 : colors.card,
                    opacity: busy ? 0.75 : 1,
                  },
                ]}
              >
                <MenuThumb item={mi} size={56} rounded={12} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}
                    numberOfLines={1}
                  >
                    {mi.name}
                  </Text>
                  <Text
                    style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}
                    numberOfLines={1}
                  >
                    {mi.category || 'Menü'}
                    {mi.code ? ` · ${mi.code}` : ''}
                  </Text>
                  <Text
                    style={{
                      color: palette.blue600,
                      fontWeight: '900',
                      fontSize: 13,
                      marginTop: 4,
                    }}
                  >
                    {formatMoney(mi.price)}
                  </Text>
                </View>
                <View style={styles.listPlus}>
                  <Plus size={18} color={palette.blue600} strokeWidth={2.5} />
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 4 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 15, fontWeight: '900' },
  viewToggle: { flexDirection: 'row', gap: 6 },
  viewBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipsScroll: { flexGrow: 0, marginHorizontal: H_PAD },
  chips: { gap: 8, paddingVertical: 2, paddingRight: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 220,
  },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  empty: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 28,
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  gridCard: {
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  gridImageWrap: {
    width: '100%',
    height: 112,
    backgroundColor: palette.gray100,
    position: 'relative',
  },
  thumbFill: { width: '100%', height: '100%' },
  priceBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  plusFab: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: palette.blue600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridBody: { paddingHorizontal: 10, paddingVertical: 10, minHeight: 64 },
  list: { gap: 8 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
  },
  listPlus: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: palette.blue50,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
