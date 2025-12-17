/**
 * 公众号管理组件
 * 支持分组管理、采集状态控制、增删改查
 */
import { useState } from 'react'
import { toast } from 'sonner'
import {
  ChevronDown,
  ChevronRight,
  Edit,
  FolderPlus,
  Link,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  useCreateAccount,
  useCreateGroup,
  useDeleteAccount,
  useDeleteGroup,
  useGroupedAccounts,
  useParseArticleUrl,
  useToggleAccountCollection,
  useToggleGroupCollection,
  useUpdateAccount,
  useUpdateGroup,
} from '../api/accounts'
import type {
  CreateAccountRequest,
  CreateGroupRequest,
  GroupedAccounts,
  UpdateAccountRequest,
  UpdateGroupRequest,
  WechatAccount,
} from '../types/account'

export function AccountManagement() {
  const { data: groupedData, isLoading, refetch, isRefetching } = useGroupedAccounts()

  // 对话框状态
  const [createGroupOpen, setCreateGroupOpen] = useState(false)
  const [editGroupOpen, setEditGroupOpen] = useState(false)
  const [deleteGroupOpen, setDeleteGroupOpen] = useState(false)
  const [createAccountOpen, setCreateAccountOpen] = useState(false)
  const [editAccountOpen, setEditAccountOpen] = useState(false)
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false)

  // 当前选中项
  const [selectedGroup, setSelectedGroup] = useState<GroupedAccounts['group'] | null>(null)
  const [selectedAccount, setSelectedAccount] = useState<WechatAccount | null>(null)

  // 展开状态
  const [expandedGroups, setExpandedGroups] = useState<Set<number | null>>(new Set())

  // Mutations
  const createGroup = useCreateGroup()
  const updateGroup = useUpdateGroup()
  const deleteGroup = useDeleteGroup()
  const toggleGroupCollection = useToggleGroupCollection()
  const createAccount = useCreateAccount()
  const updateAccount = useUpdateAccount()
  const deleteAccount = useDeleteAccount()
  const toggleAccountCollection = useToggleAccountCollection()

  const toggleExpand = (groupId: number | null) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }

  const handleOpenCreateGroup = () => {
    setCreateGroupOpen(true)
  }

  const handleOpenEditGroup = (group: GroupedAccounts['group']) => {
    setSelectedGroup(group)
    setEditGroupOpen(true)
  }

  const handleOpenDeleteGroup = (group: GroupedAccounts['group']) => {
    setSelectedGroup(group)
    setDeleteGroupOpen(true)
  }

  const handleOpenCreateAccount = (groupId: number | null = null) => {
    setSelectedGroup(groupId !== null ? { id: groupId, name: '', description: null, is_collection_enabled: true, sort_order: 0 } : null)
    setCreateAccountOpen(true)
  }

  const handleOpenEditAccount = (account: WechatAccount) => {
    setSelectedAccount(account)
    setEditAccountOpen(true)
  }

  const handleOpenDeleteAccount = (account: WechatAccount) => {
    setSelectedAccount(account)
    setDeleteAccountOpen(true)
  }

  const handleToggleGroupCollection = async (groupId: number) => {
    try {
      await toggleGroupCollection.mutateAsync(groupId)
      toast.success('采集状态已更新')
    } catch {
      toast.error('更新失败')
    }
  }

  const handleToggleAccountCollection = async (accountId: number) => {
    try {
      await toggleAccountCollection.mutateAsync(accountId)
      toast.success('采集状态已更新')
    } catch {
      toast.error('更新失败')
    }
  }

  const handleDeleteGroup = async () => {
    if (!selectedGroup?.id) return
    try {
      await deleteGroup.mutateAsync(selectedGroup.id)
      toast.success('分组已删除')
      setDeleteGroupOpen(false)
    } catch {
      toast.error('删除失败')
    }
  }

  const handleDeleteAccount = async () => {
    if (!selectedAccount) return
    try {
      await deleteAccount.mutateAsync(selectedAccount.id)
      toast.success('公众号已删除')
      setDeleteAccountOpen(false)
    } catch {
      toast.error('删除失败')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex items-center justify-between">
        <div className="text-muted-foreground text-sm">
          共 {groupedData?.reduce((sum, g) => sum + g.accounts.length, 0) || 0} 个公众号
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isRefetching && 'animate-spin')} />
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={handleOpenCreateGroup}>
            <FolderPlus className="mr-2 h-4 w-4" />
            添加分组
          </Button>
          <Button size="sm" onClick={() => handleOpenCreateAccount()}>
            <UserPlus className="mr-2 h-4 w-4" />
            添加公众号
          </Button>
        </div>
      </div>

      {/* 分组列表 */}
      {!groupedData || groupedData.length === 0 ? (
        <Card>
          <CardContent className="flex h-32 items-center justify-center">
            <p className="text-muted-foreground">暂无公众号，点击上方按钮添加</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {groupedData.map((item) => (
            <GroupItem
              key={item.group.id ?? 'ungrouped'}
              group={item.group}
              accounts={item.accounts}
              isExpanded={expandedGroups.has(item.group.id)}
              onToggleExpand={() => toggleExpand(item.group.id)}
              onEditGroup={() => handleOpenEditGroup(item.group)}
              onDeleteGroup={() => handleOpenDeleteGroup(item.group)}
              onToggleGroupCollection={() => item.group.id && handleToggleGroupCollection(item.group.id)}
              onAddAccount={() => handleOpenCreateAccount(item.group.id)}
              onEditAccount={handleOpenEditAccount}
              onDeleteAccount={handleOpenDeleteAccount}
              onToggleAccountCollection={handleToggleAccountCollection}
            />
          ))}
        </div>
      )}

      {/* 创建分组对话框 */}
      <CreateGroupDialog
        open={createGroupOpen}
        onOpenChange={setCreateGroupOpen}
        onSubmit={async (data) => {
          await createGroup.mutateAsync(data)
          toast.success('分组创建成功')
          setCreateGroupOpen(false)
        }}
        isPending={createGroup.isPending}
      />

      {/* 编辑分组对话框 */}
      <EditGroupDialog
        open={editGroupOpen}
        onOpenChange={setEditGroupOpen}
        group={selectedGroup}
        onSubmit={async (data) => {
          if (!selectedGroup?.id) return
          await updateGroup.mutateAsync({ id: selectedGroup.id, data })
          toast.success('分组更新成功')
          setEditGroupOpen(false)
        }}
        isPending={updateGroup.isPending}
      />

      {/* 删除分组确认 */}
      <ConfirmDialog
        destructive
        open={deleteGroupOpen}
        onOpenChange={setDeleteGroupOpen}
        handleConfirm={handleDeleteGroup}
        isLoading={deleteGroup.isPending}
        title={`删除分组: ${selectedGroup?.name}?`}
        desc="删除分组后，该分组下的公众号将变为「未分组」状态。此操作无法撤销。"
        confirmText="删除"
      />

      {/* 创建公众号对话框 */}
      <CreateAccountDialog
        open={createAccountOpen}
        onOpenChange={setCreateAccountOpen}
        groupId={selectedGroup?.id ?? null}
        onSubmit={async (data) => {
          await createAccount.mutateAsync(data)
          toast.success('公众号添加成功')
          setCreateAccountOpen(false)
        }}
        isPending={createAccount.isPending}
      />

      {/* 编辑公众号对话框 */}
      <EditAccountDialog
        open={editAccountOpen}
        onOpenChange={setEditAccountOpen}
        account={selectedAccount}
        onSubmit={async (data) => {
          if (!selectedAccount) return
          await updateAccount.mutateAsync({ id: selectedAccount.id, data })
          toast.success('公众号更新成功')
          setEditAccountOpen(false)
        }}
        isPending={updateAccount.isPending}
      />

      {/* 删除公众号确认 */}
      <ConfirmDialog
        destructive
        open={deleteAccountOpen}
        onOpenChange={setDeleteAccountOpen}
        handleConfirm={handleDeleteAccount}
        isLoading={deleteAccount.isPending}
        title={`删除公众号: ${selectedAccount?.name}?`}
        desc="删除后将移除该公众号的所有配置。此操作无法撤销。"
        confirmText="删除"
      />
    </div>
  )
}

/** 分组项 */
interface GroupItemProps {
  group: GroupedAccounts['group']
  accounts: WechatAccount[]
  isExpanded: boolean
  onToggleExpand: () => void
  onEditGroup: () => void
  onDeleteGroup: () => void
  onToggleGroupCollection: () => void
  onAddAccount: () => void
  onEditAccount: (account: WechatAccount) => void
  onDeleteAccount: (account: WechatAccount) => void
  onToggleAccountCollection: (id: number) => void
}

function GroupItem({
  group,
  accounts,
  isExpanded,
  onToggleExpand,
  onEditGroup,
  onDeleteGroup,
  onToggleGroupCollection,
  onAddAccount,
  onEditAccount,
  onDeleteAccount,
  onToggleAccountCollection,
}: GroupItemProps) {
  const isUngrouped = group.id === null

  return (
    <Card>
      <Collapsible open={isExpanded} onOpenChange={onToggleExpand}>
        <div className="flex items-center justify-between p-3">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-left">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <span className="font-medium">{group.name}</span>
              <Badge variant="secondary" className="text-xs">
                {accounts.length}
              </Badge>
              {!isUngrouped && (
                <Badge variant={group.is_collection_enabled ? 'default' : 'outline'} className="text-xs">
                  {group.is_collection_enabled ? '采集中' : '已暂停'}
                </Badge>
              )}
            </button>
          </CollapsibleTrigger>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onAddAccount}>
              <Plus className="h-4 w-4" />
            </Button>
            {!isUngrouped && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onToggleGroupCollection}>
                    {group.is_collection_enabled ? (
                      <>
                        <Pause className="mr-2 h-4 w-4" />
                        暂停采集
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        启用采集
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onEditGroup}>
                    <Edit className="mr-2 h-4 w-4" />
                    编辑分组
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDeleteGroup} className="text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    删除分组
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <CollapsibleContent>
          {accounts.length === 0 ? (
            <div className="text-muted-foreground border-t px-3 py-4 text-center text-sm">
              该分组暂无公众号
            </div>
          ) : (
            <div className="grid gap-3 border-t p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {accounts.map((account) => (
                <AccountItem
                  key={account.id}
                  account={account}
                  onEdit={() => onEditAccount(account)}
                  onDelete={() => onDeleteAccount(account)}
                  onToggleCollection={() => onToggleAccountCollection(account.id)}
                />
              ))}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

/** 公众号项 */
interface AccountItemProps {
  account: WechatAccount
  onEdit: () => void
  onDelete: () => void
  onToggleCollection: () => void
}

function AccountItem({ account, onEdit, onDelete, onToggleCollection }: AccountItemProps) {
  return (
    <div className="bg-muted/30 hover:bg-muted/50 rounded-lg border p-3 transition-colors">
      {/* 顶部：头像和操作按钮 */}
      <div className="mb-2 flex items-start justify-between">
        <div className="flex items-center gap-2">
          {account.avatar_url ? (
            <img
              src={account.avatar_url}
              alt={account.name}
              className="h-10 w-10 rounded-full"
            />
          ) : (
            <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium">
              {account.name.slice(0, 1)}
            </div>
          )}
          <Badge variant={account.is_collection_enabled ? 'default' : 'outline'} className="text-xs">
            {account.is_collection_enabled ? '采集中' : '已暂停'}
          </Badge>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onToggleCollection}>
              {account.is_collection_enabled ? (
                <>
                  <Pause className="mr-2 h-4 w-4" />
                  暂停采集
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  启用采集
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit}>
              <Edit className="mr-2 h-4 w-4" />
              编辑
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 名称和 Biz */}
      <div className="space-y-1">
        <div className="truncate text-sm font-medium" title={account.name}>
          {account.name}
        </div>
        <div className="text-muted-foreground truncate font-mono text-xs" title={account.biz}>
          {account.biz}
        </div>
      </div>
    </div>
  )
}

/** 创建分组对话框 */
interface CreateGroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: CreateGroupRequest) => Promise<void>
  isPending: boolean
}

function CreateGroupDialog({ open, onOpenChange, onSubmit, isPending }: CreateGroupDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isCollectionEnabled, setIsCollectionEnabled] = useState(true)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('请输入分组名称')
      return
    }
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        is_collection_enabled: isCollectionEnabled,
      })
      setName('')
      setDescription('')
      setIsCollectionEnabled(true)
    } catch {
      toast.error('创建失败')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加分组</DialogTitle>
          <DialogDescription>创建新的公众号分组，用于组织和批量管理采集行为。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="group-name">分组名称</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：科技媒体"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="group-description">描述（可选）</Label>
            <Textarea
              id="group-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="分组描述"
              rows={2}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="group-collection"
              checked={isCollectionEnabled}
              onCheckedChange={setIsCollectionEnabled}
            />
            <Label htmlFor="group-collection">启用采集</Label>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              创建
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** 编辑分组对话框 */
interface EditGroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: GroupedAccounts['group'] | null
  onSubmit: (data: UpdateGroupRequest) => Promise<void>
  isPending: boolean
}

function EditGroupDialog({ open, onOpenChange, group, onSubmit, isPending }: EditGroupDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  // 当 group 变化时更新表单
  useState(() => {
    if (group) {
      setName(group.name)
      setDescription(group.description || '')
    }
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('请输入分组名称')
      return
    }
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
      })
    } catch {
      toast.error('更新失败')
    }
  }

  // 对话框打开时重置表单
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && group) {
      setName(group.name)
      setDescription(group.description || '')
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑分组</DialogTitle>
          <DialogDescription>修改分组信息。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-group-name">分组名称</Label>
            <Input
              id="edit-group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：科技媒体"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-group-description">描述（可选）</Label>
            <Textarea
              id="edit-group-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="分组描述"
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** 创建公众号对话框 */
interface CreateAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: number | null
  onSubmit: (data: CreateAccountRequest) => Promise<void>
  isPending: boolean
}

function CreateAccountDialog({ open, onOpenChange, groupId, onSubmit, isPending }: CreateAccountDialogProps) {
  // 表单字段
  const [biz, setBiz] = useState('')
  const [name, setName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [isCollectionEnabled, setIsCollectionEnabled] = useState(true)

  // URL 解析
  const [articleUrl, setArticleUrl] = useState('')
  const parseUrl = useParseArticleUrl()

  const handleParseUrl = async () => {
    if (!articleUrl.trim()) {
      toast.error('请输入公众号文章链接')
      return
    }
    try {
      const result = await parseUrl.mutateAsync(articleUrl.trim())
      // 自动填充表单
      setBiz(result.biz)
      setName(result.name)
      if (result.avatar_url) {
        setAvatarUrl(result.avatar_url)
      }
      toast.success('解析成功')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '解析失败'
      toast.error(message)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!biz.trim()) {
      toast.error('请输入公众号 Biz')
      return
    }
    if (!name.trim()) {
      toast.error('请输入公众号名称')
      return
    }
    try {
      await onSubmit({
        biz: biz.trim(),
        name: name.trim(),
        avatar_url: avatarUrl.trim() || undefined,
        group_id: groupId,
        is_collection_enabled: isCollectionEnabled,
        notes: notes.trim() || undefined,
      })
      // 重置表单
      setBiz('')
      setName('')
      setAvatarUrl('')
      setNotes('')
      setArticleUrl('')
      setIsCollectionEnabled(true)
    } catch {
      toast.error('添加失败')
    }
  }

  // 对话框关闭时重置
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setBiz('')
      setName('')
      setAvatarUrl('')
      setNotes('')
      setArticleUrl('')
      setIsCollectionEnabled(true)
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>添加公众号</DialogTitle>
          <DialogDescription>添加新的微信公众号到管理列表。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* URL 解析区域 */}
          <div className="bg-muted/50 space-y-2 rounded-lg border p-3">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <Link className="h-4 w-4" />
              从文章链接解析（可选）
            </Label>
            <div className="flex gap-2">
              <Input
                value={articleUrl}
                onChange={(e) => setArticleUrl(e.target.value)}
                placeholder="粘贴公众号文章链接..."
                className="flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleParseUrl}
                disabled={parseUrl.isPending || !articleUrl.trim()}
              >
                {parseUrl.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                <span className="ml-1.5">解析</span>
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              支持微信公众号文章链接，自动提取 Biz、名称和头像
            </p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background text-muted-foreground px-2">或手动填写</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="account-biz">
              公众号 Biz <span className="text-destructive">*</span>
            </Label>
            <Input
              id="account-biz"
              value={biz}
              onChange={(e) => setBiz(e.target.value)}
              placeholder="例如：MjM5MjAxNjM0MA=="
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-name">
              公众号名称 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="account-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：人民日报"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-avatar">头像 URL（可选）</Label>
            <Input
              id="account-avatar"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-notes">备注（可选）</Label>
            <Textarea
              id="account-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="备注信息"
              rows={2}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="account-collection"
              checked={isCollectionEnabled}
              onCheckedChange={setIsCollectionEnabled}
            />
            <Label htmlFor="account-collection">启用采集</Label>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => handleOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              添加
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** 编辑公众号对话框 */
interface EditAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: WechatAccount | null
  onSubmit: (data: UpdateAccountRequest) => Promise<void>
  isPending: boolean
}

function EditAccountDialog({ open, onOpenChange, account, onSubmit, isPending }: EditAccountDialogProps) {
  const [name, setName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [notes, setNotes] = useState('')

  // 对话框打开时重置表单
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && account) {
      setName(account.name)
      setAvatarUrl(account.avatar_url || '')
      setNotes(account.notes || '')
    }
    onOpenChange(newOpen)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('请输入公众号名称')
      return
    }
    try {
      await onSubmit({
        name: name.trim(),
        avatar_url: avatarUrl.trim() || undefined,
        notes: notes.trim() || undefined,
      })
    } catch {
      toast.error('更新失败')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑公众号</DialogTitle>
          <DialogDescription>
            修改公众号信息。Biz 为唯一标识，不可修改。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>公众号 Biz</Label>
            <Input value={account?.biz || ''} disabled className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-account-name">公众号名称</Label>
            <Input
              id="edit-account-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：人民日报"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-account-avatar">头像 URL（可选）</Label>
            <Input
              id="edit-account-avatar"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-account-notes">备注（可选）</Label>
            <Textarea
              id="edit-account-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="备注信息"
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
