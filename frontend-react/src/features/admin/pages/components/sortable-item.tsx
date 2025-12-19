import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Eye, EyeOff, Pencil, Trash2, ExternalLink, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Page } from '../types'
import { getPermissionType, permissionLabels, permissionColors } from '../types'
import { getIcon, defaultIcon } from '../utils/icons'

interface SortableItemProps {
  page: Page
  onEdit: (page: Page) => void
  onDelete: (id: number) => void
  onToggleActive: (page: Page) => void
}

export function SortableItem({ page, onEdit, onDelete, onToggleActive }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `page-${page.id}` })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const IconComponent = getIcon(page.icon) || defaultIcon
  const permissionType = getPermissionType(page)

  const fullUrl = `${window.location.origin}${page.url}`

  const handleOpenInNewTab = () => {
    window.open(fullUrl, '_blank')
  }

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl)
      toast.success('已复制链接')
    } catch {
      toast.error('复制失败')
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 rounded-md border bg-card p-2 pl-3',
        isDragging && 'opacity-50 shadow-lg',
        !page.is_active && 'opacity-60'
      )}
    >
      <button
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <IconComponent className="h-4 w-4 text-muted-foreground shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('text-sm font-medium truncate', !page.is_active && 'line-through')}>
            {page.title}
          </span>
          <span className={cn('rounded px-1.5 py-0.5 text-xs shrink-0', permissionColors[permissionType])}>
            {permissionType === 'specific_users' && page.allowed_user_ids
              ? `${page.allowed_user_ids.length}人可见`
              : permissionLabels[permissionType]}
          </span>
        </div>
        <span className="text-xs text-muted-foreground truncate block">{page.url}</span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={handleOpenInNewTab}
        title="在新标签页打开"
      >
        <ExternalLink className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={handleCopyUrl}
        title="复制链接"
      >
        <Copy className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={() => onToggleActive(page)}
        title={page.is_active ? '禁用' : '启用'}
      >
        {page.is_active ? (
          <Eye className="h-4 w-4" />
        ) : (
          <EyeOff className="h-4 w-4" />
        )}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={() => onEdit(page)}
        title="编辑"
      >
        <Pencil className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
        onClick={() => onDelete(page.id)}
        title="删除"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}
