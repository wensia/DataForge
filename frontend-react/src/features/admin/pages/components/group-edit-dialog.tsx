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
import type { NavGroupConfig } from '../types'

interface GroupEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: NavGroupConfig | null
  isNew?: boolean
  onSave: (group: NavGroupConfig) => void
}

export function GroupEditDialog({
  open,
  onOpenChange,
  group,
  isNew = false,
  onSave,
}: GroupEditDialogProps) {
  const [formData, setFormData] = useState<NavGroupConfig>({
    id: '',
    title: '',
    order: 0,
    isCollapsed: false,
    items: [],
  })

  useEffect(() => {
    if (group) {
      setFormData(group)
    } else {
      setFormData({
        id: `group-${Date.now()}`,
        title: '',
        order: 999,
        isCollapsed: false,
        items: [],
      })
    }
  }, [group, open])

  const handleSave = () => {
    if (!formData.title.trim()) return
    onSave(formData)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? '添加分组' : '编辑分组'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">分组名称</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="如: 系统设置"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="collapsed">默认折叠</Label>
              <p className="text-xs text-muted-foreground">
                在侧边栏中默认收起此分组
              </p>
            </div>
            <Switch
              id="collapsed"
              checked={formData.isCollapsed}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, isCollapsed: checked })
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
