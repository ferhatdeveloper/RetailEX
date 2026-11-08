import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { isScreenFieldVisible } from '../config/systemTypeFields';
import { usePreferencesStore } from '../store/preferencesStore';

/** Seçili tip bu alanı açmıyorsa ekranı kapat. */
export function useScreenFieldAllowed(fieldId: string): boolean {
  const navigation = useNavigation();
  const businessProfile = usePreferencesStore((s) => s.businessProfile);
  const allowed = isScreenFieldVisible(fieldId, businessProfile);

  useEffect(() => {
    if (allowed) return;
    if (navigation.canGoBack()) navigation.goBack();
  }, [allowed, navigation]);

  return allowed;
}
