import { useState } from 'react'
import { toast } from 'sonner'
import { RefreshCw, Plus, RotateCcw, Save, Loader2 } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useNavConfig, useSaveNavConfig, useResetNavConfig } from './api'
import { PageList } from './components/page-list'
import { PageEditDialog } from './components/page-edit-dialog'
import { GroupEditDialog } from './components/group-edit-dialog'
import type { NavPageConfig, NavGroupConfig, NavItemConfig } from './types'

export default function PagesManagement() {
  const { data: config, isLoading, refetch } = useNavConfig()
  const saveConfigMutation = useSaveNavConfig()
  const resetConfigMutation = useResetNavConfig()

  const [localConfig, setLocalConfig] = useState<NavPageConfig | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  // 编辑对话框状态
  const [editingItem, setEditingItem] = useState<NavItemConfig | null>(null)
  const [editingItemGroupId, setEditingItemGroupId] = useState<string | null>(null)
  const [isNewItem, setIsNewItem] = useState(false)
  const [itemDialogOpen, setItemDialogOpen] = useState(false)

  const [editingGroup, setEditingGroup] = useState<NavGroupConfig | null>(null)
  const [isNewGroup, setIsNewGroup] = useState(false)
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)

  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)

  // 使用本地配置或服务器配置
  const currentConfig = localConfig || config

  const handleConfigChange = (newConfig: NavPageConfig) => {
    setLocalConfig(newConfig)
    setHasChanges(true)
  }

  const handleSave = async () => {
    if (!currentConfig) return
    try {
      await saveConfigMutation.mutateAsync(currentConfig)
      setHasChanges(false)
      setLocalConfig(null)
      toast.success('配置已保存')
    } catch {
      toast.error('保存失败')
    }
  }

  const handleReset = async () => {
    try {
      await resetConfigMutation.mutateAsync()
      setLocalConfig(null)
      setHasChanges(false)
      setResetDialogOpen(false)
      toast.success('已重置为默认配置')
    } catch {
      toast.error('重置失败')
    }
  }

  const handleRefresh = () => {
    setLocalConfig(null)
    setHasChanges(false)
    refetch()
  }

  // 页面项操作
  const handleEditItem = (item: NavItemConfig, groupId: string) => {
    setEditingItem(item)
    setEditingItemGroupId(groupId)
    setIsNewItem(false)
    setItemDialogOpen(true)
  }

  const handleAddItem = (groupId: string) => {
    setEditingItem(null)
    setEditingItemGroupId(groupId)
    setIsNewItem(true)
    setItemDialogOpen(true)
  }

  const handleSaveItem = (item: NavItemConfig) => {
    if (!currentConfig || !editingItemGroupId) return

    const newGroups = currentConfig.groups.map(g => {
      if (g.id === editingItemGroupId) {
        if (isNewItem) {
          // 添加新项
          const maxOrder = Math.max(...g.items.map(i => i.order), -1)
          return {
            ...g,
            items: [...g.items, { ...item, order: maxOrder + 1 }],
          }
        } else {
          // 更新现有项
          return {
            ...g,
            items: g.items.map(i => (i.id === item.id ? item : i)),
          }
        }
      }
      return g
    })

    handleConfigChange({ ...currentConfig, groups: newGroups })
  }

  const handleDeleteItem = () => {
    if (!currentConfig || !editingItem || !editingItemGroupId) return

    const newGroups = currentConfig.groups.map(g => {
      if (g.id === editingItemGroupId) {
        return {
          ...g,
          items: g.items.filter(i => i.id !== editingItem.id),
        }
      }
      return g
    })

    handleConfigChange({ ...currentConfig, groups: newGroups })
    setItemDialogOpen(false)
  }

  // 分组操作
  const handleEditGroup = (group: NavGroupConfig) => {
    setEditingGroup(group)
    setIsNewGroup(false)
    setGroupDialogOpen(true)
  }

  const handleAddGroup = () => {
    setEditingGroup(null)
    setIsNewGroup(true)
    setGroupDialogOpen(true)
  }

  const handleSaveGroup = (group: NavGroupConfig) => {
    if (!currentConfig) return

    if (isNewGroup) {
      // 添加新分组
      const maxOrder = Math.max(...currentConfig.groups.map(g => g.order), -1)
      handleConfigChange({
        ...currentConfig,
        groups: [...currentConfig.groups, { ...group, order: maxOrder + 1 }],
      })
    } else {
      // 更新现有分组
      handleConfigChange({
        ...currentConfig,
        groups: currentConfig.groups.map(g => (g.id === group.id ? group : g)),
      })
    }
  }

  const handleDeleteGroup = (groupId: string) => {
    setDeleteGroupId(groupId)
  }

  const confirmDeleteGroup = () => {
    if (!currentConfig || !deleteGroupId) return

    handleConfigChange({
      ...currentConfig,
      groups: currentConfig.groups.filter(g => g.id !== deleteGroupId),
    })
    setDeleteGroupId(null)
  }

  if (isLoading) {
    return (
      <>
        <Header fixed>
          <Search />
          <div className="ml-auto flex items-center gap-2">
            <ThemeSwitch />
            <ProfileDropdown />
          </div>
        </Header>
        <Main>
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
            <div className="space-y-4 mt-6">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          </div>
        </Main>
      </>
    )
  }

  return (
    <>
      <Header fixed>
        <Search />
        <div className="ml-auto flex items-center gap-2">
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>

      <Main>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">页面导航管理</h1>
            <p className="text-muted-foreground">
              管理侧边栏导航和页面排序，拖拽调整顺序
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={saveConfigMutation.isPending}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              刷新
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setResetDialogOpen(true)}
              disabled={resetConfigMutation.isPending}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              重置默认
            </Button>

            {hasChanges && (
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saveConfigMutation.isPending}
              >
                {saveConfigMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                保存更改
              </Button>
            )}
          </div>
        </div>

        <div className="mb-4">
          <Button variant="outline" onClick={handleAddGroup}>
            <Plus className="mr-2 h-4 w-4" />
            添加分组
          </Button>
        </div>

        {currentConfig && (
          <PageList
            config={currentConfig}
            onConfigChange={handleConfigChange}
            onEditItem={handleEditItem}
            onEditGroup={handleEditGroup}
            onDeleteGroup={handleDeleteGroup}
            onAddItem={handleAddItem}
          />
        )}
      </Main>

      {/* 页面编辑对话框 */}
      <PageEditDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        item={editingItem}
        isNew={isNewItem}
        onSave={handleSaveItem}
        onDelete={handleDeleteItem}
      />

      {/* 分组编辑对话框 */}
      <GroupEditDialog
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
        group={editingGroup}
        isNew={isNewGroup}
        onSave={handleSaveGroup}
      />

      {/* 删除分组确认 */}
      <ConfirmDialog
        open={!!deleteGroupId}
        onOpenChange={(open) => !open && setDeleteGroupId(null)}
        title="删除分组"
        desc="确定要删除这个分组吗？分组内的所有页面项也会被删除。"
        confirmText="删除"
        handleConfirm={confirmDeleteGroup}
        destructive
      />

      {/* 重置确认 */}
      <ConfirmDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        title="重置为默认配置"
        desc="确定要重置导航配置吗？您的所有自定义排序和分类将被清除。"
        confirmText="重置"
        handleConfirm={handleReset}
        destructive
      />
    </>
  )
}
