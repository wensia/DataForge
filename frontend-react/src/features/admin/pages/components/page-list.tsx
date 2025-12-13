import { useState, useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { SortableGroup } from './sortable-group'
import type { NavPageConfig, NavGroupConfig, NavItemConfig } from '../types'

interface PageListProps {
  config: NavPageConfig
  onConfigChange: (config: NavPageConfig) => void
  onEditItem: (item: NavItemConfig, groupId: string) => void
  onEditGroup: (group: NavGroupConfig) => void
  onDeleteGroup: (groupId: string) => void
  onAddItem: (groupId: string) => void
}

export function PageList({
  config,
  onConfigChange,
  onEditItem,
  onEditGroup,
  onDeleteGroup,
  onAddItem,
}: PageListProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const sortedGroups = useMemo(
    () => [...config.groups].sort((a, b) => a.order - b.order),
    [config.groups]
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over || active.id === over.id) return

    const activeIdStr = active.id as string
    const overIdStr = over.id as string

    // 检查是否是分组拖拽
    const isGroupDrag = config.groups.some(g => g.id === activeIdStr)

    if (isGroupDrag) {
      // 分组排序
      const oldIndex = sortedGroups.findIndex(g => g.id === activeIdStr)
      const newIndex = sortedGroups.findIndex(g => g.id === overIdStr)

      if (oldIndex !== -1 && newIndex !== -1) {
        const newGroups = [...config.groups]
        // 更新 order
        const movedGroup = newGroups.find(g => g.id === activeIdStr)!
        const targetGroup = newGroups.find(g => g.id === overIdStr)!
        const tempOrder = movedGroup.order
        movedGroup.order = targetGroup.order
        targetGroup.order = tempOrder

        onConfigChange({ ...config, groups: newGroups })
      }
    } else {
      // 页面项排序（在同一分组内）
      const sourceGroup = config.groups.find(g =>
        g.items.some(i => i.id === activeIdStr)
      )
      const targetGroup = config.groups.find(g =>
        g.items.some(i => i.id === overIdStr)
      )

      if (sourceGroup && targetGroup && sourceGroup.id === targetGroup.id) {
        const items = [...sourceGroup.items]
        const activeItem = items.find(i => i.id === activeIdStr)!
        const overItem = items.find(i => i.id === overIdStr)!
        const tempOrder = activeItem.order
        activeItem.order = overItem.order
        overItem.order = tempOrder

        const newGroups = config.groups.map(g =>
          g.id === sourceGroup.id ? { ...g, items } : g
        )
        onConfigChange({ ...config, groups: newGroups })
      }
    }
  }

  const handleToggleItemVisibility = (groupId: string, itemId: string) => {
    const newGroups = config.groups.map(g => {
      if (g.id === groupId) {
        return {
          ...g,
          items: g.items.map(i =>
            i.id === itemId ? { ...i, isVisible: !i.isVisible } : i
          ),
        }
      }
      return g
    })
    onConfigChange({ ...config, groups: newGroups })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sortedGroups.map(g => g.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedGroups.map((group) => (
            <SortableGroup
              key={group.id}
              group={group}
              onToggleItemVisibility={handleToggleItemVisibility}
              onEditItem={onEditItem}
              onEditGroup={onEditGroup}
              onDeleteGroup={onDeleteGroup}
              onAddItem={onAddItem}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeId && (
          <div className="rounded-lg border bg-card p-3 shadow-lg opacity-80">
            {config.groups.find(g => g.id === activeId)?.title ||
              config.groups
                .flatMap(g => g.items)
                .find(i => i.id === activeId)?.title}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
