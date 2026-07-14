import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
  type BarcodeType,
} from 'expo-camera';
import { X } from 'lucide-react-native';
import { PrimaryButton } from './PrimaryButton';
import { palette } from '../theme/colors';

const BARCODE_TYPES: BarcodeType[] = [
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'code128',
  'code39',
  'code93',
  'codabar',
  'itf14',
  'qr',
  'pdf417',
  'aztec',
  'datamatrix',
];

export type BarcodeScannerModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Okunan barkod değeri (trim edilmiş) */
  onScanned: (data: string) => void;
  title?: string;
};

/**
 * Tam ekran overlay kamera barkod tarayıcı.
 * Web PercentBodyModal benzeri: koyu overlay + başlık + gövde + kapat.
 */
export function BarcodeScannerModal({
  visible,
  onClose,
  onScanned,
  title = 'Barkod oku',
}: BarcodeScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const lockedRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      lockedRef.current = false;
      setTorch(false);
      return;
    }
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [visible, permission, requestPermission]);

  const handleBarcode = useCallback(
    (result: BarcodeScanningResult) => {
      if (lockedRef.current) return;
      const data = (result.data || '').trim();
      if (!data) return;
      lockedRef.current = true;
      onScanned(data);
      onClose();
    },
    [onClose, onScanned],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <View style={styles.header}>
          <View style={{ width: 40 }} />
          <Text style={styles.title}>{title}</Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={styles.closeBtn}
            accessibilityLabel="Kapat"
          >
            <X size={22} color={palette.white} />
          </Pressable>
        </View>

        <View style={styles.body}>
          {!permission ? (
            <ActivityIndicator color={palette.white} size="large" />
          ) : !permission.granted ? (
            <View style={styles.permBox}>
              <Text style={styles.permText}>
                Barkod okumak için kamera izni gerekli.
              </Text>
              <PrimaryButton
                label="İzin ver"
                onPress={() => void requestPermission()}
              />
              <PrimaryButton label="Kapat" variant="ghost" onPress={onClose} />
            </View>
          ) : (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={torch}
              barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
              onBarcodeScanned={handleBarcode}
            />
          )}

          {permission?.granted ? (
            <>
              <View style={styles.frame} pointerEvents="none" />
              <Text style={styles.hint}>Barkodu çerçeveye hizalayın</Text>
              <Pressable
                onPress={() => setTorch((t) => !t)}
                style={styles.torchBtn}
              >
                <Text style={styles.torchLabel}>{torch ? 'Flaş kapat' : 'Flaş'}</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.black },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 48,
    paddingBottom: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(37, 99, 235, 0.95)',
  },
  title: {
    color: palette.white,
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  body: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  permBox: {
    padding: 24,
    gap: 16,
    width: '100%',
    maxWidth: 360,
  },
  permText: {
    color: palette.white,
    textAlign: 'center',
    fontSize: 15,
    marginBottom: 8,
  },
  frame: {
    width: '72%',
    aspectRatio: 1.6,
    borderWidth: 2,
    borderColor: palette.blue400,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  hint: {
    position: 'absolute',
    bottom: 120,
    color: palette.white,
    fontSize: 13,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
  },
  torchBtn: {
    position: 'absolute',
    bottom: 48,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  torchLabel: { color: palette.white, fontWeight: '700', fontSize: 13 },
});
