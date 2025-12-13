import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { NavItemConfig } from '../types'
import { availableIcons, getIcon, defaultIcon } from '../utils/icons'

interface PageEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: NavItemConfig | null
  isNew?: boolean
  onSave: (item: NavItemConfig) => void
  onDelete?: () => void
}

export function PageEditDialog({
  open,
  onOpenChange,
  item,
  isNew = false,
  onSave,
  onDelete,
}: PageEditDialogProps) {
  const [formData, setFormData] = useState<NavItemConfig>({
    id: '',
    title: '',
    url: '',
    icon: 'FileText',
    order: 0,
    isVisible: true,
    badge: '',
  })

  useEffect(() => {
    if (item) {
      setFormData(item)
    } else {
      setFormData({
        id: `item-${Date.now()}`,
        title: '',
        url: '',
        icon: 'FileText',
        order: 0,
        isVisible: true,
        badge: '',
      })
    }
  }, [item, open])

  const handleSave = () => {
    if (!formData.title.trim() || !formData.url.trim()) return
    onSave(formData)
    onOpenChange(false)
  }

  const IconComponent = getIcon(formData.icon) || defaultIcon

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? '添加页面' : '编辑页面'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">标题</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="页面标题"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="url">URL 路径</Label>
            <Input
              id="url"
              value={formData.url}
              onChange={(e) =>
                setFormData({ ...formData, url: e.target.value })
              }
              placeholder="/path/to/page"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="icon">图标</Label>
            <Select
              value={formData.icon}
              onValueChange={(value) =>
                setFormData({ ...formData, icon: value })
              }
            >
              <SelectTrigger>
                <SelectValue>
                  <div className="flex items-center gap-2">
                    <IconComponent className="h-4 w-4" />
                    <span>{formData.icon}</span>
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {availableIcons.map((iconName) => {
                  const Icon = getIcon(iconName) || defaultIcon
                  return (
                    <SelectItem key={iconName} value={iconName}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <span>{iconName}</span>
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="badge">徽章（可选）</Label>
            <Input
              id="badge"
              value={formData.badge || ''}
              onChange={(e) =>
                setFormData({ ...formData, badge: e.target.value || undefined })
              }
              placeholder="如: Beta, New"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="visible">在侧边栏中显示</Label>
            <Switch
              id="visible"
              checked={formData.isVisible}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, isVisible: checked })
              }
            />
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          {!isNew && onDelete && (
            <Button variant="destructive" onClick={onDelete}>
              删除
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>保存</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
