import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
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
import type { PageGroup, PageGroupCreate, PageGroupUpdate } from '../types'

interface GroupEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: PageGroup | null
  isNew?: boolean
  onSave: (data: PageGroupCreate | PageGroupUpdate) => void
  isSaving?: boolean
}

export function GroupEditDialog({
  open,
  onOpenChange,
  group,
  isNew = false,
  onSave,
  isSaving = false,
}: GroupEditDialogProps) {
  const [formData, setFormData] = useState({
    title: '',
    order: 0,
  })

  useEffect(() => {
    if (group) {
      setFormData({
        title: group.title,
        order: group.order,
      })
    } else {
      setFormData({
        title: '',
        order: 999,
      })
    }
  }, [group, open])

  const handleSave = () => {
    if (!formData.title.trim()) return

    const data: PageGroupCreate | PageGroupUpdate = {
      title: formData.title,
      order: formData.order,
    }

    onSave(data)
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
