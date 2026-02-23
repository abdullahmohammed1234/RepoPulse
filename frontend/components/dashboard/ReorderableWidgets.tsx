'use client';

import { useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';

interface Widget {
  id: string;
  title: string;
  component: React.ReactNode;
  defaultVisible?: boolean;
}

interface SortableWidgetProps {
  widget: Widget;
  isEditing: boolean;
  onRemove?: (id: string) => void;
}

function SortableWidget({ widget, isEditing, onRemove }: SortableWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-card border rounded-lg overflow-hidden ${
        isDragging ? 'shadow-lg ring-2 ring-primary' : ''
      }`}
    >
      {/* Widget Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          {isEditing && (
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
              aria-label="Drag to reorder"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
          <h3 className="font-semibold text-sm">{widget.title}</h3>
        </div>
        {isEditing && onRemove && (
          <button
            onClick={() => onRemove(widget.id)}
            className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-destructive"
            aria-label="Remove widget"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      
      {/* Widget Content */}
      <div className="p-4">
        {widget.component}
      </div>
    </div>
  );
}

interface ReorderableWidgetsProps {
  widgets: Widget[];
  onReorder?: (widgets: Widget[]) => void;
  onToggleWidget?: (widgetId: string, visible: boolean) => void;
  isEditing?: boolean;
}

export function ReorderableWidgets({
  widgets,
  onReorder,
  onToggleWidget,
  isEditing = false,
}: ReorderableWidgetsProps) {
  const [items, setItems] = useState(widgets);

  // Update items when widgets prop changes
  if (widgets !== items && JSON.stringify(widgets.map(w => w.id)) !== JSON.stringify(items.map(w => w.id))) {
    // Only update if the IDs have changed
    const currentIds = new Set(items.map(w => w.id));
    const newWidgets = widgets.filter(w => currentIds.has(w.id));
    if (newWidgets.length !== items.length || newWidgets.some((w, i) => w.id !== items[i]?.id)) {
      setItems(widgets);
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        setItems((items) => {
          const oldIndex = items.findIndex((item) => item.id === active.id);
          const newIndex = items.findIndex((item) => item.id === over.id);
          const newItems = arrayMove(items, oldIndex, newIndex);
          
          if (onReorder) {
            onReorder(newItems);
          }
          
          return newItems;
        });
      }
    },
    [onReorder]
  );

  const handleRemove = useCallback(
    (id: string) => {
      if (onToggleWidget) {
        onToggleWidget(id, false);
      }
    },
    [onToggleWidget]
  );

  // Filter to show only visible widgets
  const visibleWidgets = items;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={visibleWidgets.map((w) => w.id)}
        strategy={rectSortingStrategy}
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visibleWidgets.map((widget) => (
            <SortableWidget
              key={widget.id}
              widget={widget}
              isEditing={isEditing}
              onRemove={handleRemove}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// Widget selector for customization panel
interface WidgetSelectorProps {
  allWidgets: Widget[];
  visibleWidgetIds: string[];
  onToggle: (widgetId: string, visible: boolean) => void;
}

export function WidgetSelector({
  allWidgets,
  visibleWidgetIds,
  onToggle,
}: WidgetSelectorProps) {
  return (
    <div className="space-y-2">
      <h4 className="font-medium text-sm">Toggle Widgets</h4>
      <div className="space-y-2">
        {allWidgets.map((widget) => {
          const isVisible = visibleWidgetIds.includes(widget.id);
          return (
            <label
              key={widget.id}
              className="flex items-center gap-3 p-2 rounded hover:bg-muted cursor-pointer"
            >
              <input
                type="checkbox"
                checked={isVisible}
                onChange={(e) => onToggle(widget.id, e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm">{widget.title}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
