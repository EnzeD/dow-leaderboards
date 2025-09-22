"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { PlayerSearchResult } from '@/lib/supabase';

type AutocompleteSearchProps = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (player: PlayerSearchResult) => void;
  onExactSearch: () => void;
  loading?: boolean;
  placeholder?: string;
};

const FlagIcon = ({ countryCode }: { countryCode: string }) => {
  const normalized = countryCode.trim().toLowerCase();
  if (!normalized || normalized.length !== 2) return null;
  const isoCode = normalized.toUpperCase();
  const flagHeight = '0.8rem';
  const flagWidth = `calc(${flagHeight} * 4 / 3)`;

  return (
    <img
      src={`https://flagcdn.com/w40/${normalized}.png`}
      alt={`${isoCode} flag`}
      className="inline-block"
      style={{ height: flagHeight, width: flagWidth }}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
  );
};

export default function AutocompleteSearch({
  value,
  onChange,
  onSelect,
  onExactSearch,
  loading = false,
  placeholder = "Type player name..."
}: AutocompleteSearchProps) {
  const [suggestions, setSuggestions] = useState<PlayerSearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/players/search?q=${encodeURIComponent(query)}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.results || []);
        setShowSuggestions((data.results || []).length > 0);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.error('Autocomplete search failed:', error);
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchSuggestions(value);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value, fetchSuggestions]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions) {
      if (e.key === 'Enter') {
        onExactSearch();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && suggestions[selectedIndex]) {
          handleSelectSuggestion(suggestions[selectedIndex]);
        } else {
          onExactSearch();
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleSelectSuggestion = (player: PlayerSearchResult) => {
    onChange(player.current_alias);
    onSelect(player);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    inputRef.current?.blur();
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Delay hiding suggestions to allow clicking on them
    setTimeout(() => {
      if (!suggestionsRef.current?.contains(document.activeElement)) {
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    }, 200);
  };

  const handleFocus = () => {
    if (suggestions.length > 0 && value.length >= 2) {
      setShowSuggestions(true);
    }
  };

  return (
    <div className="relative w-full">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onFocus={handleFocus}
            placeholder={placeholder}
            className="w-full px-4 py-3 bg-neutral-900 border border-neutral-600/40 rounded-md text-white placeholder-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-500/30 transition-all duration-300 shadow-inner text-base"
            autoComplete="off"
          />
          {(isLoading || loading) && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            </div>
          )}
        </div>

        <button
          onClick={onExactSearch}
          disabled={loading || !value.trim()}
          className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-neutral-600 to-neutral-700 hover:from-neutral-700 hover:to-neutral-800 disabled:bg-neutral-600 disabled:cursor-not-allowed text-white font-bold rounded-md shadow-lg border border-neutral-500 transition-all duration-300 transform hover:scale-105"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute top-full left-0 right-0 z-50 mt-1 bg-neutral-800 border border-neutral-600/40 rounded-md shadow-xl max-h-64 overflow-y-auto"
        >
          {suggestions.map((player, index) => (
            <button
              key={player.profile_id}
              onClick={() => handleSelectSuggestion(player)}
              className={`w-full px-4 py-3 text-left hover:bg-neutral-700/50 transition-colors flex items-center justify-between gap-3 ${
                index === selectedIndex ? 'bg-neutral-700/50' : ''
              } ${index !== suggestions.length - 1 ? 'border-b border-neutral-700/40' : ''}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-white font-medium truncate">
                  {player.current_alias}
                </span>
                {player.country && (
                  <FlagIcon countryCode={player.country} />
                )}
                {player.level && (
                  <span className="text-xs text-neutral-400">
                    Lv. {player.level}
                  </span>
                )}
              </div>
              <div className="text-xs text-neutral-500 shrink-0">
                ID: {player.profile_id}
              </div>
            </button>
          ))}

          {value.length >= 2 && (
            <div className="px-4 py-2 text-xs text-neutral-500 bg-neutral-900/50 border-t border-neutral-700/40">
              {suggestions.length === 0 ? (
                "No results found. Try the exact search button above."
              ) : (
                `Showing ${suggestions.length} result${suggestions.length !== 1 ? 's' : ''}. Press Enter or click Search for API lookup.`
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}