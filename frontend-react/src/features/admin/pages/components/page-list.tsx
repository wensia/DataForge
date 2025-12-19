import { useState } from 'react'
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
import type { Page, PageGroup } from '../types'

interface PageListProps {
  groupedPages: { group: PageGroup; pages: Page[] }[]
  onEditPage: (page: Page) => void
  onEditGroup: (group: PageGroup) => void
  onDeletePage: (id: number) => void
  onDeleteGroup: (id: number) => void
  onAddPage: (groupId: number | null) => void
  onTogglePageActive: (page: Page) => void
  onReorder: (type: 'page' | 'group', items: { id: number; order: number; group_id?: number | null }[]) => void
}

export function PageList({
  groupedPages,
  onEditPage,
  onEditGroup,
  onDeletePage,
  onDeleteGroup,
  onAddPage,
  onTogglePageActive,
  onReorder,
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
    const isGroupDrag = activeIdStr.startsWith('group-')

    if (isGroupDrag) {
      // 分组排序
      const activeGroupId = parseInt(activeIdStr.replace('group-', ''))
      const overGroupId = parseInt(overIdStr.replace('group-', ''))

      const activeIndex = groupedPages.findIndex(g => g.group.id === activeGroupId)
      const overIndex = groupedPages.findIndex(g => g.group.id === overGroupId)

      if (activeIndex !== -1 && overIndex !== -1) {
        // 计算新的排序
        const newOrders = groupedPages.map((g, i) => ({
          id: g.group.id,
          order: i,
        }))
        // 交换排序
        const temp = newOrders[activeIndex].order
        newOrders[activeIndex].order = newOrders[overIndex].order
        newOrders[overIndex].order = temp

        onReorder('group', newOrders.filter(g => g.id !== 0))
      }
    } else {
      // 页面排序
      const activePageId = parseInt(activeIdStr.replace('page-', ''))
      const overPageId = parseInt(overIdStr.replace('page-', ''))

      // 找到页面所在的分组
      const activeGroup = groupedPages.find(g => g.pages.some(p => p.id === activePageId))
      const overGroup = groupedPages.find(g => g.pages.some(p => p.id === overPageId))

      if (activeGroup && overGroup && activeGroup.group.id === overGroup.group.id) {
        // 同一分组内排序
        const pages = activeGroup.pages
        const activeIndex = pages.findIndex(p => p.id === activePageId)
        const overIndex = pages.findIndex(p => p.id === overPageId)

        if (activeIndex !== -1 && overIndex !== -1) {
          const newOrders = pages.map((p, i) => ({
            id: p.id,
            order: i,
            group_id: p.group_id,
          }))
          const temp = newOrders[activeIndex].order
          newOrders[activeIndex].order = newOrders[overIndex].order
          newOrders[overIndex].order = temp

          onReorder('page', newOrders)
        }
      }
    }
  }

  // 查找正在拖动的项目
  const getActiveItem = () => {
    if (!activeId) return null
    if (activeId.startsWith('group-')) {
      const groupId = parseInt(activeId.replace('group-', ''))
      return groupedPages.find(g => g.group.id === groupId)?.group.title
    } else {
      const pageId = parseInt(activeId.replace('page-', ''))
      for (const g of groupedPages) {
        const page = g.pages.find(p => p.id === pageId)
        if (page) return page.title
      }
    }
    return null
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={groupedPages.map(g => `group-${g.group.id}`)}
        strategy={verticalListSortingStrategy}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {groupedPages.map(({ group, pages }) => (
            <SortableGroup
              key={group.id}
              group={group}
              pages={pages}
              onEditPage={onEditPage}
              onEditGroup={onEditGroup}
              onDeletePage={onDeletePage}
              onDeleteGroup={onDeleteGroup}
              onAddPage={onAddPage}
              onTogglePageActive={onTogglePageActive}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeId && (
          <div className="rounded-lg border bg-card p-3 shadow-lg opacity-80">
            {getActiveItem()}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
