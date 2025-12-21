import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { RefreshCw, Plus, Loader2 } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/confirm-dialog'
import apiClient from '@/lib/api-client'
import type { ApiResponse } from '@/lib/types'
import {
  usePages,
  useGroups,
  useCreatePage,
  useUpdatePage,
  useDeletePage,
  useCreateGroup,
  useUpdateGroup,
  useDeleteGroup,
  useReorderPages,
} from './api'
import { PageList } from './components/page-list'
import { PageEditDialog } from './components/page-edit-dialog'
import { GroupEditDialog } from './components/group-edit-dialog'
import type { Page, PageGroup, PageCreate, PageUpdate, PageGroupCreate, PageGroupUpdate } from './types'

interface User {
  id: number
  name: string
  username: string
}

export default function PagesManagement() {
  const { data: pages = [], isLoading: loadingPages, refetch: refetchPages } = usePages()
  const { data: groups = [], isLoading: loadingGroups, refetch: refetchGroups } = useGroups()

  // 获取用户列表用于显示允许访问的用户名
  const { data: users = [] } = useQuery({
    queryKey: ['users-for-pages'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<{ items: User[]; total: number }>>('/users')
      const items = response.data.data?.items
      return Array.isArray(items) ? items : []
    },
  })

  // 创建用户ID到用户信息的映射
  const usersMap = useMemo(() => {
    const map = new Map<number, User>()
    users.forEach((user) => map.set(user.id, user))
    return map
  }, [users])

  const createPageMutation = useCreatePage()
  const updatePageMutation = useUpdatePage()
  const deletePageMutation = useDeletePage()
  const createGroupMutation = useCreateGroup()
  const updateGroupMutation = useUpdateGroup()
  const deleteGroupMutation = useDeleteGroup()
  const reorderMutation = useReorderPages()

  // 编辑对话框状态
  const [editingPage, setEditingPage] = useState<Page | null>(null)
  const [isNewPage, setIsNewPage] = useState(false)
  const [pageDialogOpen, setPageDialogOpen] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)

  const [editingGroup, setEditingGroup] = useState<PageGroup | null>(null)
  const [isNewGroup, setIsNewGroup] = useState(false)
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)

  const [deletePageId, setDeletePageId] = useState<number | null>(null)
  const [deleteGroupId, setDeleteGroupId] = useState<number | null>(null)

  const isLoading = loadingPages || loadingGroups
  const isSaving = createPageMutation.isPending ||
    updatePageMutation.isPending ||
    deletePageMutation.isPending ||
    createGroupMutation.isPending ||
    updateGroupMutation.isPending ||
    deleteGroupMutation.isPending ||
    reorderMutation.isPending

  // 按分组组织页面
  const groupedPages = useMemo(() => {
    const sortedGroups = [...groups].sort((a, b) => a.order - b.order)
    const result: { group: PageGroup; pages: Page[] }[] = []

    for (const group of sortedGroups) {
      const groupPages = pages
        .filter(p => p.group_id === group.id)
        .sort((a, b) => a.order - b.order)
      result.push({ group, pages: groupPages })
    }

    // 未分组的页面
    const ungroupedPages = pages
      .filter(p => p.group_id === null)
      .sort((a, b) => a.order - b.order)
    if (ungroupedPages.length > 0) {
      result.push({
        group: { id: 0, title: '未分组', order: 999, is_active: true, created_at: '', updated_at: '' },
        pages: ungroupedPages,
      })
    }

    return result
  }, [pages, groups])

  const handleRefresh = () => {
    refetchPages()
    refetchGroups()
  }

  // 页面操作
  const handleEditPage = (page: Page) => {
    setEditingPage(page)
    setSelectedGroupId(page.group_id)
    setIsNewPage(false)
    setPageDialogOpen(true)
  }

  const handleAddPage = (groupId: number | null) => {
    setEditingPage(null)
    setSelectedGroupId(groupId === 0 ? null : groupId)
    setIsNewPage(true)
    setPageDialogOpen(true)
  }

  const handleSavePage = async (data: PageCreate | PageUpdate) => {
    try {
      if (isNewPage) {
        await createPageMutation.mutateAsync(data as PageCreate)
        toast.success('页面创建成功')
      } else if (editingPage) {
        await updatePageMutation.mutateAsync({ id: editingPage.id, data: data as PageUpdate })
        toast.success('页面更新成功')
      }
      setPageDialogOpen(false)
    } catch {
      toast.error(isNewPage ? '创建失败' : '更新失败')
    }
  }

  const handleDeletePage = async () => {
    if (!deletePageId) return
    try {
      await deletePageMutation.mutateAsync(deletePageId)
      toast.success('页面删除成功')
      setDeletePageId(null)
    } catch {
      toast.error('删除失败')
    }
  }

  const handleTogglePageActive = async (page: Page) => {
    try {
      await updatePageMutation.mutateAsync({
        id: page.id,
        data: { is_active: !page.is_active },
      })
      toast.success(page.is_active ? '页面已禁用' : '页面已启用')
    } catch {
      toast.error('操作失败')
    }
  }

  // 分组操作
  const handleEditGroup = (group: PageGroup) => {
    if (group.id === 0) return // 不能编辑未分组
    setEditingGroup(group)
    setIsNewGroup(false)
    setGroupDialogOpen(true)
  }

  const handleAddGroup = () => {
    setEditingGroup(null)
    setIsNewGroup(true)
    setGroupDialogOpen(true)
  }

  const handleSaveGroup = async (data: PageGroupCreate | PageGroupUpdate) => {
    try {
      if (isNewGroup) {
        await createGroupMutation.mutateAsync(data as PageGroupCreate)
        toast.success('分组创建成功')
      } else if (editingGroup) {
        await updateGroupMutation.mutateAsync({ id: editingGroup.id, data: data as PageGroupUpdate })
        toast.success('分组更新成功')
      }
      setGroupDialogOpen(false)
    } catch {
      toast.error(isNewGroup ? '创建失败' : '更新失败')
    }
  }

  const handleDeleteGroupConfirm = async () => {
    if (!deleteGroupId) return
    try {
      await deleteGroupMutation.mutateAsync(deleteGroupId)
      toast.success('分组删除成功')
      setDeleteGroupId(null)
    } catch {
      toast.error('删除失败')
    }
  }

  // 拖拽排序
  const handleReorder = async (
    type: 'page' | 'group',
    items: { id: number; order: number; group_id?: number | null }[]
  ) => {
    try {
      if (type === 'page') {
        await reorderMutation.mutateAsync({ pages: items })
      } else {
        await reorderMutation.mutateAsync({ groups: items.map(i => ({ id: i.id, order: i.order })) })
      }
    } catch {
      toast.error('排序更新失败')
    }
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
              管理侧边栏导航页面，配置访问权限
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isSaving}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              刷新
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleAddGroup}
              disabled={isSaving}
            >
              <Plus className="mr-2 h-4 w-4" />
              添加分组
            </Button>

            <Button
              size="sm"
              onClick={() => handleAddPage(null)}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              添加页面
            </Button>
          </div>
        </div>

        <PageList
          groupedPages={groupedPages}
          usersMap={usersMap}
          onEditPage={handleEditPage}
          onEditGroup={handleEditGroup}
          onDeletePage={(id) => setDeletePageId(id)}
          onDeleteGroup={(id) => setDeleteGroupId(id)}
          onAddPage={handleAddPage}
          onTogglePageActive={handleTogglePageActive}
          onReorder={handleReorder}
        />
      </Main>

      {/* 页面编辑对话框 */}
      <PageEditDialog
        open={pageDialogOpen}
        onOpenChange={setPageDialogOpen}
        page={editingPage}
        isNew={isNewPage}
        groups={groups}
        defaultGroupId={selectedGroupId}
        onSave={handleSavePage}
        isSaving={createPageMutation.isPending || updatePageMutation.isPending}
      />

      {/* 分组编辑对话框 */}
      <GroupEditDialog
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
        group={editingGroup}
        isNew={isNewGroup}
        onSave={handleSaveGroup}
        isSaving={createGroupMutation.isPending || updateGroupMutation.isPending}
      />

      {/* 删除页面确认 */}
      <ConfirmDialog
        open={!!deletePageId}
        onOpenChange={(open) => !open && setDeletePageId(null)}
        title="删除页面"
        desc="确定要删除这个页面吗？删除后用户将无法在侧边栏看到此页面。"
        confirmText="删除"
        handleConfirm={handleDeletePage}
        destructive
      />

      {/* 删除分组确认 */}
      <ConfirmDialog
        open={!!deleteGroupId}
        onOpenChange={(open) => !open && setDeleteGroupId(null)}
        title="删除分组"
        desc="确定要删除这个分组吗？分组内的页面会变成未分组状态。"
        confirmText="删除"
        handleConfirm={handleDeleteGroupConfirm}
        destructive
      />
    </>
  )
}
