import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { GripVertical, ChevronDown, ChevronRight, Pencil, Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { NavGroupConfig, NavItemConfig } from '../types'
import { SortableItem } from './sortable-item'

interface SortableGroupProps {
  group: NavGroupConfig
  onToggleItemVisibility: (groupId: string, itemId: string) => void
  onEditItem: (item: NavItemConfig, groupId: string) => void
  onEditGroup: (group: NavGroupConfig) => void
  onDeleteGroup: (groupId: string) => void
  onAddItem: (groupId: string) => void
}

export function SortableGroup({
  group,
  onToggleItemVisibility,
  onEditItem,
  onEditGroup,
  onDeleteGroup,
  onAddItem,
}: SortableGroupProps) {
  const [isOpen, setIsOpen] = useState(!group.isCollapsed)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const sortedItems = [...group.items].sort((a, b) => a.order - b.order)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-lg border bg-card',
        isDragging && 'opacity-50 shadow-lg'
      )}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center gap-2 p-3 border-b">
          <button
            className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5" />
          </button>

          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              {isOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>

          <span className="flex-1 font-medium">{group.title}</span>

          <span className="text-xs text-muted-foreground">
            {group.items.filter(i => i.isVisible).length}/{group.items.length} 项
          </span>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onAddItem(group.id)}
          >
            <Plus className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onEditGroup(group)}
          >
            <Pencil className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onDeleteGroup(group.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <CollapsibleContent>
          <div className="p-3 space-y-2">
            <SortableContext
              items={sortedItems.map(i => i.id)}
              strategy={verticalListSortingStrategy}
            >
              {sortedItems.map((item) => (
                <SortableItem
                  key={item.id}
                  item={item}
                  onToggleVisibility={(itemId) =>
                    onToggleItemVisibility(group.id, itemId)
                  }
                  onEdit={(item) => onEditItem(item, group.id)}
                />
              ))}
            </SortableContext>

            {group.items.length === 0 && (
              <div className="text-center py-4 text-muted-foreground text-sm">
                暂无页面项，点击 + 添加
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
