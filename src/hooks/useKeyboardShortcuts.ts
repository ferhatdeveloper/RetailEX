import { useEffect, useCallback, useRef, useMemo } from 'react';
import { logger } from '../utils/logger';

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  description: string;
  action: () => void;
  category?: string;
}

interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
  preventDefault?: boolean;
}

/**
 * Global keyboard shortcuts hook for RetailOS
 * Supports F1-F12, Ctrl combinations, ESC, Enter, etc.
 */
export function useKeyboardShortcuts({ 
  shortcuts, 
  enabled = true,
  preventDefault = true 
}: UseKeyboardShortcutsOptions) {
  const shortcutsRef = useRef(shortcuts);
  
  // Update ref when shortcuts change
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;

    // Ignore if user is typing in input/textarea
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return;
    }

    const matchedShortcut = shortcutsRef.current.find(shortcut => {
      const keyMatch = shortcut.key.toLowerCase() === e.key.toLowerCase();
      const ctrlMatch = shortcut.ctrlKey ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.metaKey;
      const shiftMatch = shortcut.shiftKey ? e.shiftKey : !e.shiftKey;
      const altMatch = shortcut.altKey ? e.altKey : !e.altKey;

      return keyMatch && ctrlMatch && shiftMatch && altMatch;
    });

    if (matchedShortcut) {
      if (preventDefault) {
        e.preventDefault();
        e.stopPropagation();
      }
      
      logger.log('keyboard', `Shortcut triggered: ${matchedShortcut.description}`, {
        key: e.key,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey
      });

      matchedShortcut.action();
    }
  }, [enabled, preventDefault]);

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyPress);
    logger.log('keyboard', `Registered ${shortcuts.length} keyboard shortcuts`);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      logger.log('keyboard', 'Unregistered keyboard shortcuts');
    };
  }, [enabled, handleKeyPress, shortcuts.length]);

  return {
    shortcuts: shortcutsRef.current
  };
}

/**
 * Hook to get all registered shortcuts for display
 */
export function useShortcutsList(shortcuts: KeyboardShortcut[]) {
  return useMemo(() => {
    const grouped = shortcuts.reduce((acc, shortcut) => {
      const category = shortcut.category || 'General';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(shortcut);
      return acc;
    }, {} as Record<string, KeyboardShortcut[]>);

    return grouped;
  }, [shortcuts]);
}

/**
 * Format shortcut key for display
 */
export function formatShortcutKey(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];
  
  if (shortcut.ctrlKey) parts.push('Ctrl');
  if (shortcut.shiftKey) parts.push('Shift');
  if (shortcut.altKey) parts.push('Alt');
  
  // Format function keys
  if (shortcut.key.startsWith('F') && /F\d+/.test(shortcut.key)) {
    parts.push(shortcut.key.toUpperCase());
  } else {
    parts.push(shortcut.key.toUpperCase());
  }

  return parts.join(' + ');
}


