'use client';

import { useCallback, useRef, useEffect, ReactNode } from 'react';
import { FixedSizeList as List, ListChildComponentProps } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

interface VirtualizedListProps<T> {
  items: T[];
  height?: number;
  width?: number | '100%';
  itemSize?: number;
  overscanCount?: number;
  renderItem: (item: T, index: number) => ReactNode;
  onEndReached?: () => void;
  hasMore?: boolean;
  loading?: boolean;
  emptyMessage?: string;
}

export function VirtualizedList<T>({
  items,
  height = 400,
  width = '100%',
  itemSize = 50,
  overscanCount = 5,
  renderItem,
  onEndReached,
  hasMore,
  loading,
  emptyMessage = 'No items to display',
}: VirtualizedListProps<T>) {
  const listRef = useRef<List>(null);

  // Handle infinite scroll
  const handleItemsRendered = useCallback(
    ({ visibleStopIndex }: { visibleStopIndex: number }) => {
      if (
        hasMore &&
        !loading &&
        onEndReached &&
        visibleStopIndex >= items.length - 5
      ) {
        onEndReached();
      }
    },
    [hasMore, loading, onEndReached, items.length]
  );

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div style={{ height, width }}>
      <AutoSizer>
        {({ height: autoHeight, width: autoWidth }) => (
          <List
            ref={listRef}
            height={autoHeight}
            width={autoWidth}
            itemCount={items.length}
            itemSize={itemSize}
            overscanCount={overscanCount}
            onItemsRendered={handleItemsRendered}
          >
            {({ index, style }: ListChildComponentProps) => (
              <div style={style} className="px-2">
                {renderItem(items[index], index)}
              </div>
            )}
          </List>
        )}
      </AutoSizer>
    </div>
  );
}

// Fixed-size grid for displaying data in columns
interface VirtualizedGridProps<T> {
  items: T[];
  columnCount: number;
  rowHeight?: number;
  columnWidth?: number;
  renderItem: (item: T, index: number) => ReactNode;
  overscanCount?: number;
}

export function VirtualizedGrid<T>({
  items,
  columnCount,
  rowHeight = 50,
  columnWidth = 200,
  renderItem,
  overscanCount = 3,
}: VirtualizedGridProps<T>) {
  return (
    <AutoSizer>
      {({ height, width }) => {
        const actualColumnCount = Math.floor(width / columnWidth) || columnCount;
        
        return (
          <List
            height={height}
            width={width}
            itemCount={Math.ceil(items.length / actualColumnCount)}
            itemSize={rowHeight}
            overscanCount={overscanCount}
          >
            {({ index, style }) => {
              const startIndex = index * actualColumnCount;
              const rowItems = items.slice(startIndex, startIndex + actualColumnCount);
              
              return (
                <div
                  style={style}
                  className="flex"
                >
                  {rowItems.map((item, i) => (
                    <div
                      key={startIndex + i}
                      style={{ width: columnWidth }}
                      className="p-1"
                    >
                      {renderItem(item, startIndex + i)}
                    </div>
                  ))}
                </div>
              );
            }}
          </List>
        );
      }}
    </AutoSizer>
  );
}
