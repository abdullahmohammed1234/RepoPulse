'use client';

import { useState, useCallback, ReactNode } from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  siblings?: number;
  boundary?: number;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  siblings = 1,
  boundary = 1,
}: PaginationProps) {
  const [isNavigating, setIsNavigating] = useState(false);

  const handlePageChange = useCallback(
    async (page: number) => {
      if (page < 1 || page > totalPages || page === currentPage) return;
      
      setIsNavigating(true);
      try {
        await onPageChange(page);
      } finally {
        setIsNavigating(false);
      }
    },
    [currentPage, totalPages, onPageChange]
  );

  // Generate page numbers with ellipsis
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    
    // Add first boundary pages
    for (let i = 1; i <= Math.min(boundary, totalPages); i++) {
      pages.push(i);
    }
    
    // Add ellipsis after first boundary if needed
    if (boundary + siblings + 1 < totalPages) {
      pages.push('...');
    }
    
    // Add middle pages
    const startMiddle = Math.max(boundary + 1, currentPage - siblings);
    const endMiddle = Math.min(totalPages - boundary, currentPage + siblings);
    
    for (let i = startMiddle; i <= endMiddle; i++) {
      if (!pages.includes(i)) {
        pages.push(i);
      }
    }
    
    // Add ellipsis before last boundary if needed
    if (totalPages - boundary - siblings > currentPage + siblings) {
      pages.push('...');
    }
    
    // Add last boundary pages
    for (let i = Math.max(totalPages - boundary + 1, boundary + siblings + 1); i <= totalPages; i++) {
      if (!pages.includes(i)) {
        pages.push(i);
      }
    }
    
    return pages;
  };

  const pages = getPageNumbers();

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center gap-1">
      {/* Previous button */}
      <button
        onClick={() => handlePageChange(currentPage - 1)}
        disabled={currentPage === 1 || isNavigating}
        className="px-3 py-1.5 text-sm font-medium rounded-md border border-border bg-background hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-label="Previous page"
      >
        Previous
      </button>

      {/* Page numbers */}
      <div className="flex items-center gap-1">
        {pages.map((page, index) => {
          if (page === '...') {
            return (
              <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">
                ...
              </span>
            );
          }
          
          const pageNum = page as number;
          const isActive = pageNum === currentPage;
          
          return (
            <button
              key={pageNum}
              onClick={() => handlePageChange(pageNum)}
              disabled={isNavigating}
              className={`min-w-[36px] px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-background hover:bg-accent'
              } disabled:opacity-50`}
              aria-label={`Page ${pageNum}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {pageNum}
            </button>
          );
        })}
      </div>

      {/* Next button */}
      <button
        onClick={() => handlePageChange(currentPage + 1)}
        disabled={currentPage === totalPages || isNavigating}
        className="px-3 py-1.5 text-sm font-medium rounded-md border border-border bg-background hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-label="Next page"
      >
        Next
      </button>
    </div>
  );
}

// Simple pagination with limit selector
interface PaginationWithLimitProps {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

export function PaginationWithLimit({
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}: PaginationWithLimitProps) {
  const totalPages = Math.ceil(totalItems / pageSize);
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="text-sm text-muted-foreground">
        Showing {startItem} to {endItem} of {totalItems} results
      </div>
      
      <div className="flex items-center gap-4">
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <label htmlFor="pageSize" className="text-sm text-muted-foreground">
              Rows per page:
            </label>
            <select
              id="pageSize"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="px-2 py-1 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}
        
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      </div>
    </div>
  );
}
