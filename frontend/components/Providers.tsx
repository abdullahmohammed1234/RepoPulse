'use client';

import { useState, useCallback } from 'react';
import { Toaster } from '@/components/ui/Toast';
import { SearchModal } from '@/components/SearchModal';
import { useSearchShortcut } from '@/lib/useKeyboardShortcut';
import { toast } from 'sonner';

interface ProvidersProps {
  children: React.ReactNode;
}

// Re-export toast for easy use throughout the app
export { toast };

export function Providers({ children }: ProvidersProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Cmd+K / Ctrl+K shortcut for search
  const openSearch = useCallback(() => {
    setIsSearchOpen(true);
  }, []);

  useSearchShortcut(openSearch, true);

  return (
    <>
      {children}
      <Toaster position="bottom-right" richColors />
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
      
      {/* Keyboard shortcut hint */}
      <div className="fixed bottom-4 right-4 text-xs text-muted-foreground opacity-50 hover:opacity-100 transition-opacity z-40">
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">⌘</kbd>
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] ml-0.5">K</kbd>
        <span className="ml-2">Search</span>
      </div>
    </>
  );
}
