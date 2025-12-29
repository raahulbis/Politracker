'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type SearchType = 'postal_code' | 'name' | 'riding';

interface SearchFormProps {
  onSearch: (query: string, searchType: SearchType) => void;
  loading: boolean;
}

interface AutocompleteSuggestion {
  type: 'mp' | 'riding' | 'postal_code';
  label: string;
  value: string;
  subtitle?: string;
}

export default function SearchForm({ onSearch, loading }: SearchFormProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [hasBlurred, setHasBlurred] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setError(null);
    setSelectedIndex(-1);
  };

  // Fetch autocomplete suggestions
  const fetchSuggestions = useCallback(async (searchTerm: string) => {
    if (searchTerm.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const response = await fetch(`/api/autocomplete?q=${encodeURIComponent(searchTerm)}`);
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
        setShowSuggestions(data.suggestions && data.suggestions.length > 0);
      }
    } catch (err) {
      console.error('Error fetching suggestions:', err);
      setSuggestions([]);
    }
  }, []);

  // Debounce autocomplete requests
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      if (query.trim().length >= 2) {
        fetchSuggestions(query);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, fetchSuggestions]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setHasBlurred(true);
    // If there's a selected suggestion or a matching suggestion, use its type
    let searchType: SearchType | undefined;
    if (selectedIndex >= 0 && suggestions[selectedIndex]) {
      const suggestion = suggestions[selectedIndex];
      searchType = suggestion.type === 'postal_code' ? 'postal_code' : suggestion.type === 'riding' ? 'riding' : 'name';
    } else if (suggestions.length > 0) {
      // Check if query matches any suggestion value exactly
      const matchingSuggestion = suggestions.find(
        s => s.value.toLowerCase() === query.trim().toLowerCase()
      );
      if (matchingSuggestion) {
        searchType = matchingSuggestion.type === 'postal_code' ? 'postal_code' : matchingSuggestion.type === 'riding' ? 'riding' : 'name';
      }
    }
    performSearch(query.trim(), searchType);
  };

  const performSearch = (searchQuery: string, searchType?: SearchType) => {
    if (!searchQuery) {
      setError('Please enter a postal code, MP name, or riding');
      return;
    }

    // Clear any previous error
    setError(null);

    // Determine search type if not provided
    let finalSearchType: SearchType;
    if (searchType) {
      finalSearchType = searchType;
    } else {
      // Auto-detect search type
      const normalized = searchQuery.replace(/\s+/g, '').toUpperCase();
      const looksLikePostalCode = /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(normalized) && normalized.length === 6;
      finalSearchType = looksLikePostalCode ? 'postal_code' : 'name';
    }
    
    setShowSuggestions(false);
    onSearch(searchQuery.trim(), finalSearchType);
  };

  const handleSuggestionClick = (suggestion: AutocompleteSuggestion) => {
    setQuery(suggestion.value);
    setShowSuggestions(false);
    setHasBlurred(true);
    // Pass the suggestion type to performSearch
    performSearch(suggestion.value, suggestion.type === 'postal_code' ? 'postal_code' : suggestion.type === 'riding' ? 'riding' : 'name');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0 && suggestions[selectedIndex]) {
      e.preventDefault();
      handleSuggestionClick(suggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedIndex(-1);
    }
  };

  const handleBlur = () => {
    setHasBlurred(true);
    // Delay hiding suggestions to allow click events
    setTimeout(() => {
      setShowSuggestions(false);
      setIsFocused(false);
    }, 200);
  };

  const handleFocus = () => {
    setIsFocused(true);
    if (suggestions.length > 0) {
      setShowSuggestions(true);
    }
  };

  // Determine if input looks like a postal code
  const normalized = query.replace(/\s+/g, '').toUpperCase();
  const looksLikePostalCode = /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(normalized) && normalized.length === 6;
  const showError = hasBlurred && error && !isFocused;

  return (
    <div className="relative w-full">
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative flex items-center">
          {/* Search Icon */}
          <div className={`absolute left-5 pointer-events-none transition-colors ${
            isFocused ? 'text-gray-600 dark:text-gray-400' : 'text-gray-400 dark:text-gray-500'
          }`}>
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>

          {/* Input - macOS Spotlight style */}
          <input
            ref={inputRef}
            type="text"
            id="searchQuery"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder="K1A 0A6, MP name, or riding"
            className={`w-full pl-14 ${query.trim() && !loading ? 'pr-28' : 'pr-5'} py-4 rounded-full focus:outline-none bg-white/80 dark:bg-[#0B0F14]/80 backdrop-blur-sm text-gray-900 dark:text-gray-100 text-base shadow-lg border transition-all duration-200 ${
              isFocused
                ? 'shadow-xl border-gray-300/50 dark:border-slate-600/50 ring-4 ring-blue-500/10 dark:ring-blue-400/20 bg-white dark:bg-[#0B0F14]'
                : showError
                ? 'border-red-200 dark:border-red-800 shadow-red-100 dark:shadow-red-900/20'
                : 'border-gray-200/50 dark:border-slate-700/50'
            } ${loading ? 'opacity-60' : ''}`}
            disabled={loading}
          />

          {/* Keyboard hint inside input (right side) */}
          {query.trim() && !loading && (
            <div className="absolute right-5 flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 pointer-events-none">
              <kbd className="px-1.5 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100/60 dark:bg-slate-600/60 border border-gray-200/60 dark:border-slate-500/60 rounded shadow-sm">
                ↵
              </kbd>
              <span className="text-gray-400 dark:text-gray-500">Search</span>
            </div>
          )}

          {/* Loading indicator */}
          {loading && (
            <div className="absolute right-5">
              <svg className="animate-spin h-5 w-5 text-gray-400 dark:text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          )}
        </div>

        {/* Error message */}
        {showError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </form>

      {/* Autocomplete dropdown - macOS style */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-3 bg-white/95 dark:bg-[#0B0F14]/95 backdrop-blur-md border border-gray-200/50 dark:border-slate-700/50 rounded-2xl shadow-2xl max-h-80 overflow-y-auto"
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.type}-${suggestion.value}-${index}`}
              type="button"
              onClick={() => handleSuggestionClick(suggestion)}
              className={`w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-[#0B0F14] focus:bg-gray-50 dark:focus:bg-[#0B0F14] focus:outline-none transition-colors ${
                index === selectedIndex ? 'bg-gray-50 dark:bg-[#0B0F14]' : ''
              } ${
                index > 0 ? 'border-t border-gray-100 dark:border-slate-700' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {suggestion.label}
                    </div>
                    {suggestion.subtitle && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {suggestion.subtitle}
                      </div>
                    )}
                  </div>
                  <div className="ml-3 flex-shrink-0">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-[#0B0F14] text-gray-600 dark:text-gray-300">
                      {suggestion.type === 'mp' ? 'MP' : suggestion.type === 'riding' ? 'Riding' : 'Postal'}
                    </span>
                  </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

