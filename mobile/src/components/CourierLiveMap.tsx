/**
 * OSM WebView haritası — kurye / cihaz konumları.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Linking, Pressable, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { Navigation } from 'lucide-react-native';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  color?: string;
};

type Props = {
  points: MapPoint[];
  height?: number;
};

function buildMapHtml(points: MapPoint[]): string {
  const valid = points.filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90,
  );
  const center = valid[0] || { lat: 36.19, lng: 44.01 };
  const markersJs = valid
    .map((p) => {
      const color = (p.color || '#2563eb').replace(/'/g, '');
      const label = String(p.label || p.id).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `L.circleMarker([${p.lat},${p.lng}],{radius:9,color:'${color}',fillColor:'${color}',fillOpacity:0.85}).addTo(map).bindPopup('${label}');`;
    })
    .join('\n');
  const fitJs =
    valid.length > 1
      ? `map.fitBounds([${valid.map((p) => `[${p.lat},${p.lng}]`).join(',')}],{padding:[28,28]});`
      : '';

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{margin:0;height:100%;width:100%} .leaflet-control-attribution{font-size:9px}</style>
</head><body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map=L.map('map',{zoomControl:true}).setView([${center.lat},${center.lng}],14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OSM'}).addTo(map);
${markersJs}
${fitJs}
</script></body></html>`;
}

export function CourierLiveMap({ points, height = 220 }: Props) {
  const { colors } = useThemeStore();
  const html = useMemo(() => buildMapHtml(points), [points]);
  const first = points.find((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

  if (!first) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.backgroundAlt, borderColor: colors.cardBorder }]}>
        <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center' }}>
          Haritada gösterilecek konum yok — canlı takibi başlatın veya kurye konumunu bekleyin.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height, borderColor: colors.cardBorder }]}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={styles.web}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
      />
      <Pressable
        onPress={() => {
          const url =
            Platform.OS === 'ios'
              ? `http://maps.apple.com/?ll=${first.lat},${first.lng}&q=${encodeURIComponent(first.label)}`
              : `geo:${first.lat},${first.lng}?q=${first.lat},${first.lng}(${encodeURIComponent(first.label)})`;
          void Linking.openURL(url);
        }}
        style={styles.openBtn}
      >
        <Navigation size={14} color={palette.white} />
        <Text style={styles.openTxt}>Harita uygulaması</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  web: { flex: 1, backgroundColor: '#e5e7eb' },
  empty: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    minHeight: 80,
    justifyContent: 'center',
  },
  openBtn: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.blue600,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },
  openTxt: { color: '#fff', fontWeight: '800', fontSize: 11 },
});
