import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Eye, EyeOff, Pencil, ExternalLink, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { NavItemConfig } from '../types'
import { getIcon, defaultIcon } from '../utils/icons'

interface SortableItemProps {
  item: NavItemConfig
  onToggleVisibility: (id: string) => void
  onEdit: (item: NavItemConfig) => void
}

export function SortableItem({ item, onToggleVisibility, onEdit }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const IconComponent = getIcon(item.icon) || defaultIcon

  const fullUrl = `${window.location.origin}${item.url}`

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
        !item.isVisible && 'opacity-60'
      )}
    >
      <button
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <IconComponent className="h-4 w-4 text-muted-foreground" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('text-sm font-medium truncate', !item.isVisible && 'line-through')}>
            {item.title}
          </span>
          {item.badge && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
              {item.badge}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground truncate block">{item.url}</span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={handleOpenInNewTab}
        title="在新标签页打开"
      >
        <ExternalLink className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={handleCopyUrl}
        title="复制链接"
      >
        <Copy className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => onToggleVisibility(item.id)}
        title={item.isVisible ? '隐藏' : '显示'}
      >
        {item.isVisible ? (
          <Eye className="h-4 w-4" />
        ) : (
          <EyeOff className="h-4 w-4" />
        )}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => onEdit(item)}
        title="编辑"
      >
        <Pencil className="h-4 w-4" />
      </Button>
    </div>
  )
}
