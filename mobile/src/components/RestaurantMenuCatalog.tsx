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

const GRID_GAP = 8;
const GRID_COL_OPTIONS = [2, 3, 4, 5, 6] as const;
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
  const gridCols = usePreferencesStore((s) => s.restMenuCatalogGridCols);
  const setGridCols = usePreferencesStore((s) => s.setRestMenuCatalogGridCols);
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
    const cols = gridCols;
    const usable = width - 32 - GRID_GAP * (cols - 1);
    return Math.max(72, Math.floor(usable / cols));
  }, [width, gridCols]);

  const setMode = (mode: RestMenuCatalogView) => setViewMode(mode);

  const imageH =
    gridCols <= 2 ? 152 : gridCols === 3 ? 136 : gridCols === 4 ? 96 : gridCols === 5 ? 80 : 68;

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.toolbarBlock,
          {
            backgroundColor: colors.background,
            borderBottomColor: colors.cardBorder,
          },
        ]}
      >
        <View style={styles.toolbar}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.title, { color: colors.text }]}>Menü</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 2 }}>
              {loading ? 'Yükleniyor…' : `${filtered.length} ürün`}
              {!loading && category ? ` · ${category}` : ''}
            </Text>
          </View>
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

        {viewMode === 'grid' ? (
          <View style={styles.colsRow}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '800' }}>
              Sütun
            </Text>
            <View style={styles.colsChips}>
              {GRID_COL_OPTIONS.map((n) => {
                const on = gridCols === n;
                return (
                  <Pressable
                    key={n}
                    onPress={() => setGridCols(n)}
                    style={[
                      styles.colChip,
                      {
                        backgroundColor: on ? palette.indigo600 : colors.card,
                        borderColor: on ? palette.indigo600 : colors.cardBorder,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: on ? palette.white : colors.text,
                        fontWeight: '900',
                        fontSize: 12,
                      }}
                    >
                      {n}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

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
                !category ? styles.chipSelected : null,
                {
                  backgroundColor: !category ? palette.blue700 : colors.card,
                  borderColor: !category ? palette.blue700 : colors.cardBorder,
                },
              ]}
            >
              <Text
                style={{
                  color: !category ? palette.white : colors.text,
                  fontWeight: '900',
                  fontSize: 13,
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
                    on ? styles.chipSelected : null,
                    {
                      backgroundColor: on ? palette.blue700 : colors.card,
                      borderColor: on ? palette.blue700 : colors.cardBorder,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.chipDot,
                      { backgroundColor: on ? 'rgba(255,255,255,0.9)' : tone.fg },
                    ]}
                  />
                  <Text
                    style={{
                      color: on ? palette.white : colors.text,
                      fontWeight: '900',
                      fontSize: 13,
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
      </View>

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
            const catLabel = (mi.category || '').trim();
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
                    opacity: busy ? 0.55 : pressed ? 0.88 : 1,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  },
                ]}
              >
                <View style={[styles.gridImageWrap, { height: imageH }]}>
                  <MenuThumb item={mi} size="fill" rounded={0} />
                  <View
                    style={[
                      styles.priceBadge,
                      {
                        backgroundColor: darkMode ? palette.blue700 : palette.blue600,
                      },
                    ]}
                  >
                    <Text style={{ color: palette.white, fontWeight: '900', fontSize: 12 }}>
                      {formatMoney(mi.price)}
                    </Text>
                  </View>
                  <View style={styles.plusFab}>
                    <Plus size={16} color={palette.white} strokeWidth={3} />
                  </View>
                </View>
                <View style={styles.gridBody}>
                  <Text
                    style={{ color: colors.text, fontWeight: '800', fontSize: 13 }}
                    numberOfLines={2}
                  >
                    {mi.name}
                  </Text>
                  {catLabel ? (
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: 10,
                        fontWeight: '700',
                        marginTop: 3,
                      }}
                      numberOfLines={1}
                    >
                      {catLabel}
                    </Text>
                  ) : null}
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
                    opacity: busy ? 0.6 : pressed ? 0.9 : 1,
                    transform: [{ scale: pressed ? 0.99 : 1 }],
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
  wrap: { gap: 12, marginTop: 4 },
  toolbarBlock: {
    gap: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  viewToggle: { flexDirection: 'row', gap: 6 },
  viewBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 0,
  },
  colsChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 },
  colChip: {
    minWidth: 36,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  chipsScroll: { flexGrow: 0, marginHorizontal: H_PAD },
  chips: { gap: 8, paddingVertical: 2, paddingRight: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: 240,
  },
  chipSelected: {
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
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
    paddingHorizontal: 9,
    paddingVertical: 5,
    shadowColor: '#0F172A',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
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
  gridBody: { paddingHorizontal: 10, paddingVertical: 10, minHeight: 52 },
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
