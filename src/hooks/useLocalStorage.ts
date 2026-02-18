import { useEffect, useState } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  // Get from local storage then parse stored json or return initialValue
  const readValue = (): T => {
    // Prevent build error "window is undefined" but keep working
    if (typeof window === 'undefined') {
      return initialValue;
    }

    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  };

  const [storedValue, setStoredValue] = useState<T>(readValue);

  // Return a wrapped version of useState's setter function that persists the new value to localStorage
  const setValue = (value: T | ((val: T) => T)) => {
    try {
      // Allow value to be a function so we have same API as useState
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      
      // Save state
      setStoredValue(valueToStore);
      
      // Save to local storage
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue] as const;
}

// Hook to sync zustand store with localStorage
export function syncStoreWithLocalStorage<T>(
  storeName: string,
  getter: () => T,
  setter: (data: T) => void
) {
  // Load from localStorage on mount
  useEffect(() => {
    const loadFromStorage = () => {
      try {
        const stored = localStorage.getItem(`retailos_${storeName}`);
        if (stored) {
          const data = JSON.parse(stored);
          setter(data);
          console.log(`✅ ${storeName} loaded from localStorage`);
        }
      } catch (error) {
        console.error(`❌ Failed to load ${storeName} from localStorage:`, error);
      }
    };

    loadFromStorage();
  }, []);

  // Save to localStorage whenever data changes
  useEffect(() => {
    const data = getter();
    if (data && (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0)) {
      try {
        localStorage.setItem(`retailos_${storeName}`, JSON.stringify(data));
        console.log(`ğŸ’¾ ${storeName} saved to localStorage`);
      } catch (error) {
        console.error(`❌ Failed to save ${storeName} to localStorage:`, error);
      }
    }
  }, [getter()]);
}

