import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import apiClient from '@/lib/api-client'
import type { ApiResponse } from '@/lib/types'
import type { Page, PageGroup, PageCreate, PageUpdate, PermissionType } from '../types'
import { availableIcons, getIcon, defaultIcon } from '../utils/icons'

interface User {
  id: number
  name: string
  email: string
}

interface PageEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  page: Page | null
  isNew?: boolean
  groups: PageGroup[]
  defaultGroupId: number | null
  onSave: (data: PageCreate | PageUpdate) => void
  isSaving?: boolean
}

export function PageEditDialog({
  open,
  onOpenChange,
  page,
  isNew = false,
  groups,
  defaultGroupId,
  onSave,
  isSaving = false,
}: PageEditDialogProps) {
  const [formData, setFormData] = useState({
    key: '',
    title: '',
    url: '',
    icon: 'FileText',
    group_id: null as number | null,
  })

  const [permissionType, setPermissionType] = useState<PermissionType>('public')
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])

  // 获取用户列表
  const { data: users = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<User[]>>('/users')
      return response.data.data || []
    },
    enabled: open,
  })

  useEffect(() => {
    if (page) {
      setFormData({
        key: page.key,
        title: page.title,
        url: page.url,
        icon: page.icon,
        group_id: page.group_id,
      })
      if (page.is_public) {
        setPermissionType('public')
      } else if (page.is_admin_only) {
        setPermissionType('admin_only')
      } else {
        setPermissionType('specific_users')
      }
      setSelectedUserIds(page.allowed_user_ids || [])
    } else {
      setFormData({
        key: '',
        title: '',
        url: '',
        icon: 'FileText',
        group_id: defaultGroupId,
      })
      setPermissionType('public')
      setSelectedUserIds([])
    }
  }, [page, open, defaultGroupId])

  const handleSave = () => {
    if (!formData.title.trim() || !formData.url.trim()) return
    if (isNew && !formData.key.trim()) return

    const data: PageCreate | PageUpdate = {
      ...(isNew ? { key: formData.key } : {}),
      title: formData.title,
      url: formData.url,
      icon: formData.icon,
      group_id: formData.group_id,
      is_public: permissionType === 'public',
      is_admin_only: permissionType === 'admin_only',
      allowed_user_ids: permissionType === 'specific_users' ? selectedUserIds : null,
    }

    onSave(data)
  }

  const handleUserToggle = (userId: number) => {
    setSelectedUserIds(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }

  const IconComponent = getIcon(formData.icon) || defaultIcon

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{isNew ? '添加页面' : '编辑页面'}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4 py-4">
            {isNew && (
              <div className="space-y-2">
                <Label htmlFor="key">页面标识</Label>
                <Input
                  id="key"
                  value={formData.key}
                  onChange={(e) =>
                    setFormData({ ...formData, key: e.target.value })
                  }
                  placeholder="如: dashboard, users"
                />
                <p className="text-xs text-muted-foreground">
                  唯一标识符，只能包含字母、数字和下划线
                </p>
              </div>
            )}

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
              <Label htmlFor="group">分组</Label>
              <Select
                value={formData.group_id?.toString() || '0'}
                onValueChange={(value) =>
                  setFormData({ ...formData, group_id: value === '0' ? null : parseInt(value) })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择分组" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">未分组</SelectItem>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id.toString()}>
                      {group.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 pt-2 border-t">
              <Label>访问权限</Label>
              <RadioGroup
                value={permissionType}
                onValueChange={(value) => setPermissionType(value as PermissionType)}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="public" id="public" />
                  <Label htmlFor="public" className="font-normal cursor-pointer">
                    公开（所有登录用户可见）
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="admin_only" id="admin_only" />
                  <Label htmlFor="admin_only" className="font-normal cursor-pointer">
                    仅管理员可见
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="specific_users" id="specific_users" />
                  <Label htmlFor="specific_users" className="font-normal cursor-pointer">
                    指定用户可见
                  </Label>
                </div>
              </RadioGroup>

              {permissionType === 'specific_users' && (
                <div className="ml-6 space-y-2">
                  <Label className="text-sm text-muted-foreground">选择可访问的用户：</Label>
                  <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
                    {users.length === 0 ? (
                      <p className="text-sm text-muted-foreground">暂无用户</p>
                    ) : (
                      users.map((user) => (
                        <div key={user.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`user-${user.id}`}
                            checked={selectedUserIds.includes(user.id)}
                            onCheckedChange={() => handleUserToggle(user.id)}
                          />
                          <Label
                            htmlFor={`user-${user.id}`}
                            className="font-normal cursor-pointer text-sm"
                          >
                            {user.name} ({user.email})
                          </Label>
                        </div>
                      ))
                    )}
                  </div>
                  {selectedUserIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      已选择 {selectedUserIds.length} 个用户
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

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
