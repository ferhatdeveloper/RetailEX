import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Mic, MicOff, Loader2 } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useDebouncedSearch } from '../hooks/useDebouncedSearch';
import { fuzzySearch, highlightMatches } from '../utils/fuzzySearch';
import { logger } from '../utils/logger';
import type { Product } from '../core/types';

interface AdvancedSearchProps<T = Product> {
  items: T[];
  onSearch: (results: T[]) => void;
  getSearchText: (item: T) => string | string[];
  placeholder?: string;
  autoFocus?: boolean;
  showSuggestions?: boolean;
  voiceSearch?: boolean;
  debounceMs?: number;
  fuzzyThreshold?: number;
  onItemSelect?: (item: T) => void;
  renderSuggestion?: (item: T, query: string) => React.ReactNode;
}

export function AdvancedSearch<T = Product>({
  items,
  onSearch,
  getSearchText,
  placeholder = 'Search...',
  autoFocus = false,
  showSuggestions = true,
  voiceSearch = true,
  debounceMs = 300,
  fuzzyThreshold = 0.5,
  onItemSelect,
  renderSuggestion
}: AdvancedSearchProps<T>) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // Fuzzy search function
  const searchFunction = (items: T[], query: string) => {
    return fuzzySearch(items, query, getSearchText, fuzzyThreshold);
  };

  const {
    query,
    setQuery,
    results,
    isSearching,
    clearSearch
  } = useDebouncedSearch(items, searchFunction, debounceMs);

  // Update parent with results
  useEffect(() => {
    onSearch(results);
  }, [results, onSearch]);

  // Show/hide suggestions
  useEffect(() => {
    setShowSuggestions(query.length > 0 && showSuggestions);
  }, [query, showSuggestions]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < Math.min(results.length - 1, 9) ? prev + 1 : prev
        );
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
        
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && results[selectedIndex]) {
          handleSelectItem(results[selectedIndex]);
        }
        break;
        
      case 'Escape':
        e.preventDefault();
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  };

  // Handle item selection
  const handleSelectItem = (item: T) => {
    if (onItemSelect) {
      onItemSelect(item);
    }
    setShowSuggestions(false);
    setSelectedIndex(-1);
    inputRef.current?.blur();
  };

  // Voice search
  const startVoiceSearch = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setVoiceError('Voice search not supported in this browser');
      logger.warn('voice-search', 'Speech recognition not supported');
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.lang = 'tr-TR'; // Turkish by default
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsVoiceRecording(true);
      setVoiceError(null);
      logger.log('voice-search', 'Voice recording started');
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setQuery(transcript);
      logger.log('voice-search', 'Voice input received', { transcript });
    };

    recognition.onerror = (event: any) => {
      setVoiceError(`Voice search error: ${event.error}`);
      logger.error('voice-search', 'Voice recognition error', event.error);
      setIsVoiceRecording(false);
    };

    recognition.onend = () => {
      setIsVoiceRecording(false);
      logger.log('voice-search', 'Voice recording ended');
    };

    recognition.start();
  };

  // Default suggestion renderer
  const defaultRenderSuggestion = (item: T, query: string) => {
    const text = getSearchText(item);
    const displayText = Array.isArray(text) ? text[0] : text;
    return (
      <div 
        className="text-sm" 
        dangerouslySetInnerHTML={{ __html: highlightMatches(displayText, query) }}
      />
    );
  };

  return (
    <div className="relative w-full">
      {/* Search Input */}
      <div className="relative">
        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${
          theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
        }`} />
        
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query.length > 0 && setShowSuggestions(true)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={`pl-10 pr-20 ${
            theme === 'dark' 
              ? 'bg-gray-800 border-gray-700 text-white' 
              : 'bg-white border-gray-300 text-gray-900'
          }`}
        />

        {/* Right side buttons */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isSearching && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
          
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearSearch}
              className="h-7 w-7 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
          
          {voiceSearch && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={startVoiceSearch}
              disabled={isVoiceRecording}
              className={`h-7 w-7 p-0 ${isVoiceRecording ? 'text-red-500' : ''}`}
              title={t('voiceSearch') || 'Voice Search'}
            >
              {isVoiceRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>
          )}
        </div>
      </div>

      {/* Voice Error */}
      {voiceError && (
        <div className="mt-2 text-sm text-red-500">
          {voiceError}
        </div>
      )}

      {/* Search Results Count */}
      {query && (
        <div className="mt-2 flex items-center justify-between">
          <Badge variant="outline" className={`${
            theme === 'dark' ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-700'
          }`}>
            {results.length} {t('results') || 'results'}
          </Badge>
        </div>
      )}

      {/* Autocomplete Suggestions */}
      {showSuggestions && results.length > 0 && (
        <div
          ref={suggestionsRef}
          className={`absolute z-50 w-full mt-1 rounded-lg border shadow-lg max-h-96 overflow-y-auto ${
            theme === 'dark'
              ? 'bg-gray-800 border-gray-700'
              : 'bg-white border-gray-200'
          }`}
        >
          {results.slice(0, 10).map((item, index) => (
            <button
              key={index}
              onClick={() => handleSelectItem(item)}
              className={`w-full text-left px-4 py-3 transition-colors border-b last:border-b-0 ${
                index === selectedIndex
                  ? theme === 'dark'
                    ? 'bg-blue-900 text-white'
                    : 'bg-blue-50 text-blue-900'
                  : theme === 'dark'
                    ? 'hover:bg-gray-700 text-gray-200 border-gray-700'
                    : 'hover:bg-gray-50 text-gray-900 border-gray-100'
              }`}
            >
              {renderSuggestion 
                ? renderSuggestion(item, query) 
                : defaultRenderSuggestion(item, query)
              }
            </button>
          ))}
        </div>
      )}
    </div>
  );
}



