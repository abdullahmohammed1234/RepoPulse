'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface SearchResult {
  type: 'repository' | 'pr' | 'file';
  id: string | number;
  title: string;
  subtitle?: string;
  url: string;
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Reset state when closed
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Search as user types
  useEffect(() => {
    // Require at least 2 characters before searching
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    const searchTimeout = setTimeout(async () => {
      setLoading(true);
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        // Fetch all repositories and filter client-side
        const response = await fetch(`${API_URL}/api/repository`);
        const data = await response.json();
        
        const queryLower = query.toLowerCase().trim();
        
        const searchResults: SearchResult[] = Array.isArray(data)
          ? data
              .filter((repo: { full_name: string; description?: string }) => {
                const nameMatch = repo.full_name.toLowerCase().includes(queryLower);
                const descMatch = repo.description?.toLowerCase().includes(queryLower);
                return nameMatch || descMatch;
              })
              .slice(0, 5)
              .map((repo: { id: number; full_name: string; description?: string }) => ({
                type: 'repository' as const,
                id: repo.id,
                title: repo.full_name,
                subtitle: repo.description,
                url: `/repository/${repo.id}`,
              }))
          : [];
        
        setResults(searchResults);
      } catch (error) {
        console.error('Search failed:', error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }

      if (e.key === 'Enter' && results[selectedIndex]) {
        const result = results[selectedIndex];
        router.push(result.url);
        onClose();
        return;
      }
    },
    [results, selectedIndex, onClose, router]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-xl bg-background rounded-lg shadow-2xl border border-border overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search repositories (min 2 characters)..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="max-h-80 overflow-y-auto">
            {results.map((result, index) => (
              <button
                key={`${result.type}-${result.id}`}
                onClick={() => {
                  router.push(result.url);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  index === selectedIndex ? 'bg-muted' : 'hover:bg-muted/50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{result.title}</div>
                  {result.subtitle && (
                    <div className="text-sm text-muted-foreground truncate">
                      {result.subtitle}
                    </div>
                  )}
                </div>
                <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground capitalize">
                  {result.type}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {query && !loading && results.length === 0 && (
          <div className="px-4 py-8 text-center text-muted-foreground">
            No results found for "{query}"
          </div>
        )}

        {/* Initial state */}
        {!query && (
          <div className="px-4 py-8 text-center text-muted-foreground">
            <p>Type at least 2 characters to search repositories...</p>
            <p className="text-xs mt-2">
              Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs mx-1">↓</kbd>
              to navigate, <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Enter</kbd> to select
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs ml-1">↓</kbd>
              <span className="ml-2">Navigate</span>
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">↵</kbd>
              <span className="ml-2">Select</span>
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">esc</kbd>
              <span className="ml-2">Close</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
