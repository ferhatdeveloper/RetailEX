import React, { useEffect } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCallerIdPoll } from '../hooks/useCallerIdPoll';
import { useCallerIdStore, isCallerIdListening } from '../store/callerIdStore';
import { useAuthStore } from '../store/authStore';
import { CallerIdIncomingBanner } from './CallerIdIncomingBanner';
import { palette } from '../theme/colors';

/**
 * Oturum açıkken global Caller ID poll + gelen arama banner'ı.
 */
export function CallerIdHost() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const hydrated = useCallerIdStore((s) => s.hydrated);
  const hydrate = useCallerIdStore((s) => s.hydrate);
  const config = useCallerIdStore((s) => s.config);
  const pollError = useCallerIdStore((s) => s.pollError);
  const listening = Boolean(user) && isCallerIdListening(config);

  useEffect(() => {
    if (user && !hydrated) {
      void hydrate();
    }
  }, [user, hydrated, hydrate]);

  useCallerIdPoll(listening);

  if (!user) return null;

  const errorLabel = pollError
    ? pollError.startsWith('callerId.errorHttp:')
      ? t('callerId.errorHttp', { status: pollError.split(':')[1] })
      : pollError.startsWith('callerId.errorNet:')
        ? t('callerId.errorNet', { message: pollError.slice('callerId.errorNet:'.length) })
        : pollError === 'callerId.errorPhysicalUrl'
          ? t('callerId.errorPhysicalUrl')
          : pollError
    : null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {listening && errorLabel ? (
        <View style={styles.errorChip} pointerEvents="none">
          <Text style={styles.errorText} numberOfLines={2}>
            {errorLabel}
          </Text>
        </View>
      ) : null}
      <CallerIdIncomingBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  errorChip: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 88,
    zIndex: 9998,
    backgroundColor: 'rgba(127,29,29,0.92)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  errorText: { color: palette.white, fontSize: 11, fontWeight: '600' },
});
