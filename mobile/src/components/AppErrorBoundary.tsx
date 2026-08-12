import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { palette } from '../theme/colors';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Render crash’lerini yakalar — mavi splash’te “ölü” kalmak yerine hata + yeniden dene.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  private retry = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.root}>
        <Text style={styles.title}>Uygulama yüklenemedi</Text>
        <Text style={styles.sub}>
          Bir ekran veya eklenti çöktü. Aşağıdaki hata Metro/logcat ile eşleşir.
        </Text>
        <ScrollView style={styles.box} contentContainerStyle={{ padding: 12 }}>
          <Text style={styles.msg} selectable>
            {error.message || String(error)}
          </Text>
        </ScrollView>
        <Pressable onPress={this.retry} style={styles.btn} accessibilityRole="button">
          <Text style={styles.btnText}>Tekrar dene</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.blue600,
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    color: palette.white,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  sub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  box: {
    maxHeight: 220,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 12,
    marginBottom: 20,
  },
  msg: {
    color: palette.white,
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
  btn: {
    backgroundColor: palette.white,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: {
    color: palette.blue600,
    fontWeight: '800',
    fontSize: 15,
  },
});
