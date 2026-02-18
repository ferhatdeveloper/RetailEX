import React, { useState, useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import type { KeyboardShortcut } from '../../hooks/useKeyboardShortcuts';
import { formatShortcutKey, useShortcutsList } from '../../hooks/useKeyboardShortcuts';

interface KeyboardShortcutOverlayProps {
  shortcuts: KeyboardShortcut[];
  onClose: () => void;
}

export function KeyboardShortcutOverlay({ shortcuts, onClose }: KeyboardShortcutOverlayProps) {
  const { t } = useLanguage();
  const { darkMode } = useTheme();
  const groupedShortcuts = useShortcutsList(shortcuts);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="w-5 h-5" />
            {t.keyboardShortcuts}
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500 dark:text-gray-400">
            {(t as any).keyboardShortcutsDescription || 'View available keyboard shortcuts'}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={Object.keys(groupedShortcuts)[0]} className="w-full">
          <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${Math.min(Object.keys(groupedShortcuts).length, 4)}, 1fr)` }}>
            {Object.keys(groupedShortcuts).map(category => (
              <TabsTrigger key={category} value={category}>
                {(t as any)[category] || category}
              </TabsTrigger>
            ))}
          </TabsList>

          {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
            <TabsContent key={category} value={category} className="space-y-2 mt-4">
              <div className="grid gap-2">
                {categoryShortcuts.map((shortcut, index) => (
                  <div
                    key={index}
                    className={`flex items-center justify-between p-3 rounded-lg border ${darkMode
                      ? 'bg-gray-800 border-gray-700 hover:bg-gray-750'
                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                      } transition-colors`}
                  >
                    <span className="text-sm">{(t as any)[shortcut.description] || shortcut.description}</span>
                    <Badge
                      variant="outline"
                      className={`font-mono ${darkMode
                        ? 'bg-gray-900 text-blue-400 border-blue-500'
                        : 'bg-white text-blue-600 border-blue-300'
                        }`}
                    >
                      {formatShortcutKey(shortcut)}
                    </Badge>
                  </div>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onClose} variant="outline">
            {t.close}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Floating shortcut hint button
 */
export function KeyboardShortcutHint({ onClick }: { onClick: () => void }) {
  const { darkMode } = useTheme();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Hide hint after 10 seconds
    const timer = setTimeout(() => setVisible(false), 10000);
    return () => clearTimeout(timer);
  }, []);

  // Listen for ? key to show shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === '?') {
        e.preventDefault();
        onClick();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [onClick]);

  if (!visible) {
    return (
      <button
        onClick={onClick}
        className={`fixed bottom-4 right-4 p-3 rounded-full shadow-lg transition-all hover:scale-110 z-50 ${darkMode
          ? 'bg-gray-800 text-blue-400 hover:bg-gray-700'
          : 'bg-white text-blue-600 hover:bg-gray-50'
          }`}
        title="Press ? to view keyboard shortcuts"
      >
        <Keyboard className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div
      className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-xl z-50 animate-in fade-in slide-in-from-bottom-5 ${darkMode
        ? 'bg-gray-800 border border-gray-700'
        : 'bg-white border border-gray-200'
        }`}
    >
      <button
        onClick={() => setVisible(false)}
        className="absolute top-2 right-2 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-3">
        <Keyboard className="w-6 h-6 text-blue-600 dark:text-blue-400 mt-1" />
        <div>
          <p className="font-semibold mb-1">Keyboard Shortcuts Available</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Press <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs">?</kbd> to view all shortcuts
          </p>
          <Button onClick={onClick} size="sm" variant="outline">
            View Shortcuts
          </Button>
        </div>
      </div>
    </div>
  );
}
