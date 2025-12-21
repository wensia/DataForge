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
import type { Page, PageGroup } from '../types'
import { SortableItem } from './sortable-item'

interface User {
  id: number
  name: string
  username: string
}

interface SortableGroupProps {
  group: PageGroup
  pages: Page[]
  usersMap: Map<number, User>
  onEditPage: (page: Page) => void
  onEditGroup: (group: PageGroup) => void
  onDeletePage: (id: number) => void
  onDeleteGroup: (id: number) => void
  onAddPage: (groupId: number | null) => void
  onTogglePageActive: (page: Page) => void
}

export function SortableGroup({
  group,
  pages,
  usersMap,
  onEditPage,
  onEditGroup,
  onDeletePage,
  onDeleteGroup,
  onAddPage,
  onTogglePageActive,
}: SortableGroupProps) {
  const [isOpen, setIsOpen] = useState(true)
  const isUngrouped = group.id === 0

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `group-${group.id}`, disabled: isUngrouped })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const activePages = pages.filter(p => p.is_active)

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
          {!isUngrouped && (
            <button
              className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-5 w-5" />
            </button>
          )}

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
            {activePages.length}/{pages.length} 项
          </span>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onAddPage(group.id)}
          >
            <Plus className="h-4 w-4" />
          </Button>

          {!isUngrouped && (
            <>
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
            </>
          )}
        </div>

        <CollapsibleContent>
          <div className="p-3 space-y-2">
            <SortableContext
              items={pages.map(p => `page-${p.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {pages.map((page) => (
                <SortableItem
                  key={page.id}
                  page={page}
                  usersMap={usersMap}
                  onEdit={onEditPage}
                  onDelete={onDeletePage}
                  onToggleActive={onTogglePageActive}
                />
              ))}
            </SortableContext>

            {pages.length === 0 && (
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
