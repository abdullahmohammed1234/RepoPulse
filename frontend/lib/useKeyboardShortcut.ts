'use client';

import { useEffect, useCallback } from 'react';

interface KeyboardShortcutOptions {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  callback: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcut({
  key,
  ctrlKey = false,
  metaKey = false,
  shiftKey = false,
  altKey = false,
  callback,
  enabled = true,
}: KeyboardShortcutOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      const target = event.target as HTMLElement;
      // Don't trigger shortcuts when typing in input fields
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const ctrlOrMeta = ctrlKey || metaKey;
      const isCtrlOrMetaPressed = event.ctrlKey || event.metaKey;

      if (
        event.key.toLowerCase() === key.toLowerCase() &&
        ctrlOrMeta === isCtrlOrMetaPressed &&
        event.shiftKey === shiftKey &&
        event.altKey === altKey
      ) {
        event.preventDefault();
        callback();
      }
    },
    [key, ctrlKey, metaKey, shiftKey, altKey, callback, enabled]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}

// Hook specifically for Cmd+K (Mac) / Ctrl+K (Windows) search
export function useSearchShortcut(callback: () => void, enabled = true) {
  return useKeyboardShortcut({
    key: 'k',
    ctrlKey: true,
    metaKey: true,
    callback,
    enabled,
  });
}
