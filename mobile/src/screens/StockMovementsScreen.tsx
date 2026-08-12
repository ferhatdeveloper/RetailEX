import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Plus } from 'lucide-react-native';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { HeaderIconButton } from '../components/GradientHeader';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  createStockMovement,
  fetchStockMovements,
  STOCK_SLIP_TRCODES,
  stockMovementLabel,
  type StockMovementRow,
} from '../api/stockMovementApi';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

const FILTER_META: Record<
  'all' | 'deficit' | 'surplus',
  { title: string; subtitle: string; trcode?: number }
> = {
  all: { title: 'Malzeme Yönetim Fişleri', subtitle: 'Ambar fişleri + faturalar' },
  deficit: {
    title: 'Sayım Eksiği Fişleri',
    subtitle: 'TRCODE 50',
    trcode: STOCK_SLIP_TRCODES.SHORTAGE,
  },
  surplus: {
    title: 'Sayım Fazlası Fişleri',
    subtitle: 'TRCODE 26',
    trcode: STOCK_SLIP_TRCODES.SURPLUS,
  },
};

type CreateType = 'out' | 'in' | 'adjustment';

export function StockMovementsScreen() {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'StockMovements'>>();
  const filter = route.params?.filter ?? 'all';
  const meta = FILTER_META[filter];

  const [rows, setRows] = useState<StockMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createType, setCreateType] = useState<CreateType>('out');
  const [description, setDescription] = useState('');
  const [documentNo, setDocumentNo] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(
        await fetchStockMovements({
          trcode: meta.trcode,
          limit: filter === 'all' ? 300 : 200,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [meta.trcode, filter, orgEpoch]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const openCreate = () => {
    setCreateType('out');
    setDescription('');
    setDocumentNo('');
    setShowCreate(true);
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const id = await createStockMovement({
        movementType: createType,
        description,
        documentNo: documentNo.trim() || undefined,
        items: [],
      });
      setShowCreate(false);
      navigation.navigate('StockMovementDetail', { id });
    } catch (e) {
      Alert.alert('Kayıt hatası', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const typeChips: { id: CreateType; label: string }[] = [
    { id: 'out', label: 'Çıkış / Sarf' },
    { id: 'in', label: 'Giriş' },
    { id: 'adjustment', label: 'Düzeltme' },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={meta.title}
        subtitle={`${rows.length} kayıt · ${meta.subtitle}`}
        right={
          filter === 'all' ? (
            <HeaderIconButton accent onPress={openCreate}>
              <Plus size={18} color={palette.white} />
            </HeaderIconButton>
          ) : undefined
        }
      />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Stok hareketi yok" />}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                if (item.source_kind === 'invoice') {
                  const invId = item.id.startsWith('inv-') ? item.id.slice(4) : item.id;
                  navigation.navigate('InvoiceDetail', { invoiceId: invId });
                  return;
                }
                navigation.navigate('StockMovementDetail', { id: item.id });
              }}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            >
              <View style={styles.rowBetween}>
                <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>
                  {item.document_no || '—'}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{item.movement_date}</Text>
              </View>
              <Text style={{ color: palette.blue600, fontWeight: '700', fontSize: 12, marginTop: 4 }}>
                {stockMovementLabel(item)}
                {item.source_kind === 'invoice' ? ' · Fatura' : ''}
              </Text>
              {item.warehouse_name ? (
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                  {item.warehouse_name}
                </Text>
              ) : null}
              {item.customer_name ? (
                <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>
                  {item.customer_name}
                </Text>
              ) : null}
              {item.description ? (
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              <View style={[styles.rowBetween, { marginTop: 6 }]}>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  {item.line_count} kalem · {item.status || '—'}
                </Text>
                <Text style={{ color: colors.textSubtle, fontSize: 10, fontFamily: 'monospace' }}>
                  {item.movement_type}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}

      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCreate(false)} />
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Yeni stok fişi</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {typeChips.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setCreateType(c.id)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: createType === c.id ? palette.blue600 : colors.background,
                      borderColor: colors.cardBorder,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: createType === c.id ? palette.white : colors.text,
                      fontWeight: '700',
                      fontSize: 12,
                    }}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <FormField
              label="Belge no (opsiyonel)"
              value={documentNo}
              onChangeText={setDocumentNo}
              autoCapitalize="characters"
            />
            <FormField
              label="Açıklama"
              value={description}
              onChangeText={setDescription}
              multiline
              placeholder="Sarf / giriş açıklaması"
            />
            <Text style={{ color: colors.textMuted, fontSize: 11, marginVertical: 6 }}>
              Kalemler fiş detayından sonra eklenebilir; şu an başlık kaydı oluşturulur.
            </Text>
            <PrimaryButton
              label={saving ? 'Kaydediliyor…' : 'Oluştur'}
              onPress={() => void handleCreate()}
              disabled={saving}
              loading={saving}
            />
            <Pressable onPress={() => setShowCreate(false)} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={{ color: colors.textMuted, fontWeight: '600' }}>İptal</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    padding: 16,
    paddingBottom: 28,
    gap: 4,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8 },
  chipRow: { gap: 8, paddingVertical: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
});
