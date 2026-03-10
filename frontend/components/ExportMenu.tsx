'use client';

import { useState, useRef, useEffect } from 'react';
import { Download, FileText, FileSpreadsheet, FileJson, ChevronDown } from 'lucide-react';
import { exportToCSV, exportToPDF, exportToJSON } from '@/lib/exportUtils';

interface ExportMenuProps {
  data: unknown[];
  filename: string;
  elementId?: string; // For PDF export
  columns?: { key: string; header: string }[];
  onExportStart?: () => void;
  onExportSuccess?: (format: string) => void;
  onExportError?: (error: Error) => void;
}

export function ExportMenu({
  data,
  filename,
  elementId,
  columns,
  onExportStart,
  onExportSuccess,
  onExportError,
}: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExport = async (format: 'csv' | 'pdf' | 'json') => {
    setIsOpen(false);
    setIsExporting(true);
    onExportStart?.();

    try {
      switch (format) {
        case 'csv':
          exportToCSV(data as Record<string, unknown>[], filename, columns as { key: keyof Record<string, unknown>; header: string }[]);
          onExportSuccess?.('CSV');
          break;
        case 'pdf':
          if (!elementId) {
            throw new Error('Element ID required for PDF export');
          }
          await exportToPDF(elementId, filename);
          onExportSuccess?.('PDF');
          break;
        case 'json':
          exportToJSON(data, filename);
          onExportSuccess?.('JSON');
          break;
      }
    } catch (error) {
      onExportError?.(error instanceof Error ? error : new Error('Export failed'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting || data.length === 0}
        className="px-4 py-2 border border-border rounded-lg hover:bg-muted flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Download className="h-4 w-4" />
        Export
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-background border border-border rounded-lg shadow-lg overflow-hidden z-10">
          <button
            onClick={() => handleExport('csv')}
            disabled={data.length === 0}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted text-left disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4 text-green-600" />
            <div>
              <div className="font-medium text-sm">Export as CSV</div>
              <div className="text-xs text-muted-foreground">Spreadsheet format</div>
            </div>
          </button>
          
          {elementId && (
            <button
              onClick={() => handleExport('pdf')}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted text-left"
            >
              <FileText className="h-4 w-4 text-red-600" />
              <div>
                <div className="font-medium text-sm">Export as PDF</div>
                <div className="text-xs text-muted-foreground">Print-ready format</div>
              </div>
            </button>
          )}
          
          <button
            onClick={() => handleExport('json')}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted text-left"
          >
            <FileJson className="h-4 w-4 text-blue-600" />
            <div>
              <div className="font-medium text-sm">Export as JSON</div>
              <div className="text-xs text-muted-foreground">Data interchange</div>
            </div>
          </button>
        </div>
      )}

      {isExporting && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      )}
    </div>
  );
}
