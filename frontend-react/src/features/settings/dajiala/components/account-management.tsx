/**
 * 公众号管理组件
 * 支持标签筛选、采集状态控制、增删改查
 */
import { useState } from 'react'
import { toast } from 'sonner'
import {
  Download,
  Edit,
  Link,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Tag,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getTagColorClass, getTagColorNames, type TagColorName } from '@/lib/colors'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  useAccounts,
  useCreateAccount,
  useCreateTag,
  useDeleteAccount,
  useDeleteTag,
  useParseArticleUrl,
  useSyncAvatars,
  useTags,
  useToggleAccountCollection,
  useUpdateAccount,
  useUpdateTag,
} from '../api/accounts'
import type {
  CreateAccountRequest,
  UpdateAccountRequest,
  UpdateTagRequest,
  WechatAccount,
  WechatAccountTag,
} from '../types/account'

export function AccountManagement() {
  // 标签筛选状态
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])

  // 获取数据
  const { data: tags, isLoading: isTagsLoading } = useTags()
  const { data: accountsData, isLoading: isAccountsLoading, refetch, isRefetching } = useAccounts({
    tag_ids: selectedTagIds.length > 0 ? selectedTagIds : undefined,
    page_size: 100,
  })

  // 对话框状态
  const [tagManagerOpen, setTagManagerOpen] = useState(false)
  const [createAccountOpen, setCreateAccountOpen] = useState(false)
  const [editAccountOpen, setEditAccountOpen] = useState(false)
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false)

  // 当前选中项
  const [selectedAccount, setSelectedAccount] = useState<WechatAccount | null>(null)

  // Mutations
  const createAccount = useCreateAccount()
  const updateAccount = useUpdateAccount()
  const deleteAccount = useDeleteAccount()
  const toggleAccountCollection = useToggleAccountCollection()
  const syncAvatars = useSyncAvatars()

  const handleToggleTag = (tagId: number) => {
    setSelectedTagIds((prev) => {
      if (prev.includes(tagId)) {
        return prev.filter((id) => id !== tagId)
      }
      return [...prev, tagId]
    })
  }

  const handleClearTagFilter = () => {
    setSelectedTagIds([])
  }

  const handleOpenEditAccount = (account: WechatAccount) => {
    setSelectedAccount(account)
    setEditAccountOpen(true)
  }

  const handleOpenDeleteAccount = (account: WechatAccount) => {
    setSelectedAccount(account)
    setDeleteAccountOpen(true)
  }

  const handleToggleAccountCollection = async (accountId: number) => {
    try {
      await toggleAccountCollection.mutateAsync(accountId)
      toast.success('采集状态已更新')
    } catch {
      toast.error('更新失败')
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

  const handleSyncAvatars = async () => {
    try {
      const result = await syncAvatars.mutateAsync()
      toast.success(result.message)
    } catch {
      toast.error('同步头像失败')
    }
  }

  const isLoading = isTagsLoading || isAccountsLoading

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    )
  }

  const accounts = accountsData?.items || []
  const totalCount = accountsData?.total || 0

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex items-center justify-between">
        <div className="text-muted-foreground text-sm">
          共 {totalCount} 个公众号
          {selectedTagIds.length > 0 && (
            <span className="ml-2">
              (已筛选 {selectedTagIds.length} 个标签)
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isRefetching && 'animate-spin')} />
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={handleSyncAvatars} disabled={syncAvatars.isPending}>
            <Download className={cn('mr-2 h-4 w-4', syncAvatars.isPending && 'animate-pulse')} />
            {syncAvatars.isPending ? '同步中...' : '同步头像'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTagManagerOpen(true)}>
            <Settings className="mr-2 h-4 w-4" />
            管理标签
          </Button>
          <Button size="sm" onClick={() => setCreateAccountOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            添加公众号
          </Button>
        </div>
      </div>

      {/* 标签筛选栏 */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
        <Tag className="text-muted-foreground h-4 w-4" />
        <button
          onClick={handleClearTagFilter}
          className={cn(
            'rounded-full px-3 py-1 text-sm transition-colors',
            selectedTagIds.length === 0
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted hover:bg-muted/80'
          )}
        >
          全部
        </button>
        {tags?.map((tag) => (
          <button
            key={tag.id}
            onClick={() => handleToggleTag(tag.id)}
            className={cn(
              'flex items-center gap-1 rounded-full px-3 py-1 text-sm transition-colors',
              selectedTagIds.includes(tag.id)
                ? getTagColorClass(tag.color, 'solid')
                : getTagColorClass(tag.color, 'soft')
            )}
          >
            {tag.name}
            <span className="text-xs opacity-70">({tag.account_count})</span>
          </button>
        ))}
        {selectedTagIds.length > 0 && (
          <button
            onClick={handleClearTagFilter}
            className="text-muted-foreground hover:text-foreground ml-2 flex items-center gap-1 text-sm"
          >
            <X className="h-3 w-3" />
            清除筛选
          </button>
        )}
      </div>

      {/* 公众号卡片网格 */}
      {accounts.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
          <p className="text-muted-foreground text-sm">
            {selectedTagIds.length > 0 ? '没有符合筛选条件的公众号' : '暂无公众号，点击上方按钮添加'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {accounts.map((account) => (
            <AccountItem
              key={account.id}
              account={account}
              onEdit={() => handleOpenEditAccount(account)}
              onDelete={() => handleOpenDeleteAccount(account)}
              onToggleCollection={() => handleToggleAccountCollection(account.id)}
            />
          ))}
        </div>
      )}

      {/* 标签管理对话框 */}
      <TagManagerDialog
        open={tagManagerOpen}
        onOpenChange={setTagManagerOpen}
      />

      {/* 创建公众号对话框 */}
      <CreateAccountDialog
        open={createAccountOpen}
        onOpenChange={setCreateAccountOpen}
        tags={tags || []}
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
        tags={tags || []}
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

/** 公众号卡片 */
interface AccountItemProps {
  account: WechatAccount
  onEdit: () => void
  onDelete: () => void
  onToggleCollection: () => void
}

function AccountItem({ account, onEdit, onDelete, onToggleCollection }: AccountItemProps) {
  const avatarSrc = account.local_avatar || account.avatar_url

  return (
    <div className="bg-muted/30 hover:bg-muted/50 rounded-lg border p-3 transition-colors">
      {/* 顶部：头像和操作按钮 */}
      <div className="mb-2 flex items-start justify-between">
        <div className="flex items-center gap-2">
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt={account.name}
              className="h-10 w-10 rounded-full object-cover"
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

      {/* 标签 */}
      {account.tags && account.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {account.tags.map((tag) => (
            <span
              key={tag.id}
              className={cn('rounded px-1.5 py-0.5 text-xs', getTagColorClass(tag.color, 'soft'))}
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** 标签管理对话框 */
interface TagManagerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function TagManagerDialog({ open, onOpenChange }: TagManagerDialogProps) {
  const { data: tags } = useTags()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()

  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState<TagColorName>('gray')
  const [editingTag, setEditingTag] = useState<WechatAccountTag | null>(null)
  const [deleteTagOpen, setDeleteTagOpen] = useState(false)
  const [tagToDelete, setTagToDelete] = useState<WechatAccountTag | null>(null)

  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      toast.error('请输入标签名称')
      return
    }
    try {
      await createTag.mutateAsync({
        name: newTagName.trim(),
        color: newTagColor,
      })
      toast.success('标签创建成功')
      setNewTagName('')
      setNewTagColor('gray')
    } catch {
      toast.error('创建失败')
    }
  }

  const handleUpdateTag = async (tag: WechatAccountTag, data: UpdateTagRequest) => {
    try {
      await updateTag.mutateAsync({ id: tag.id, data })
      toast.success('标签更新成功')
      setEditingTag(null)
    } catch {
      toast.error('更新失败')
    }
  }

  const handleDeleteTag = async () => {
    if (!tagToDelete) return
    try {
      await deleteTag.mutateAsync(tagToDelete.id)
      toast.success('标签已删除')
      setDeleteTagOpen(false)
      setTagToDelete(null)
    } catch {
      toast.error('删除失败')
    }
  }

  const colorOptions = getTagColorNames()

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>管理标签</DialogTitle>
            <DialogDescription>创建和管理公众号标签，用于分类筛选。</DialogDescription>
          </DialogHeader>

          {/* 创建新标签 */}
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <Label className="text-sm font-medium">添加新标签</Label>
            <div className="flex gap-2">
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="标签名称"
                className="flex-1"
              />
              <select
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value as TagColorName)}
                className="rounded-md border bg-background px-2 py-1 text-sm"
              >
                {colorOptions.map((color) => (
                  <option key={color} value={color}>
                    {color}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                onClick={handleCreateTag}
                disabled={createTag.isPending || !newTagName.trim()}
              >
                {createTag.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
            {/* 颜色预览 */}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">预览:</span>
              <span className={cn('rounded px-2 py-0.5 text-xs', getTagColorClass(newTagColor, 'soft'))}>
                {newTagName || '标签名称'}
              </span>
            </div>
          </div>

          {/* 现有标签列表 */}
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {!tags || tags.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-sm">暂无标签</p>
            ) : (
              tags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2"
                >
                  {editingTag?.id === tag.id ? (
                    <EditTagInline
                      tag={tag}
                      colorOptions={colorOptions}
                      onSave={(data) => handleUpdateTag(tag, data)}
                      onCancel={() => setEditingTag(null)}
                      isPending={updateTag.isPending}
                    />
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className={cn('rounded px-2 py-0.5 text-sm', getTagColorClass(tag.color, 'soft'))}>
                          {tag.name}
                        </span>
                        <span className="text-muted-foreground text-xs">({tag.account_count})</span>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setEditingTag(tag)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive h-7 w-7"
                          onClick={() => {
                            setTagToDelete(tag)
                            setDeleteTagOpen(true)
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除标签确认 */}
      <ConfirmDialog
        destructive
        open={deleteTagOpen}
        onOpenChange={setDeleteTagOpen}
        handleConfirm={handleDeleteTag}
        isLoading={deleteTag.isPending}
        title={`删除标签: ${tagToDelete?.name}?`}
        desc="删除标签后，关联的公众号将取消该标签。此操作无法撤销。"
        confirmText="删除"
      />
    </>
  )
}

/** 内联编辑标签 */
interface EditTagInlineProps {
  tag: WechatAccountTag
  colorOptions: TagColorName[]
  onSave: (data: UpdateTagRequest) => void
  onCancel: () => void
  isPending: boolean
}

function EditTagInline({ tag, colorOptions, onSave, onCancel, isPending }: EditTagInlineProps) {
  const [name, setName] = useState(tag.name)
  const [color, setColor] = useState<TagColorName>(tag.color as TagColorName)

  return (
    <div className="flex w-full items-center gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        inputSize='xs'
        className='flex-1'
      />
      <select
        value={color}
        onChange={(e) => setColor(e.target.value as TagColorName)}
        className="h-8 rounded-md border bg-background px-2 text-sm"
      >
        {colorOptions.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <Button
        size='xs'
        onClick={() => onSave({ name, color })}
        disabled={isPending}
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : '保存'}
      </Button>
      <Button variant='ghost' size='xs' onClick={onCancel}>
        取消
      </Button>
    </div>
  )
}

/** 创建公众号对话框 */
interface CreateAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tags: WechatAccountTag[]
  onSubmit: (data: CreateAccountRequest) => Promise<void>
  isPending: boolean
}

function CreateAccountDialog({ open, onOpenChange, tags, onSubmit, isPending }: CreateAccountDialogProps) {
  const [biz, setBiz] = useState('')
  const [name, setName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [isCollectionEnabled, setIsCollectionEnabled] = useState(true)
  const [articleUrl, setArticleUrl] = useState('')
  const parseUrl = useParseArticleUrl()

  const handleParseUrl = async () => {
    if (!articleUrl.trim()) {
      toast.error('请输入公众号文章链接')
      return
    }
    try {
      const result = await parseUrl.mutateAsync(articleUrl.trim())
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

  const handleToggleTag = (tagId: number) => {
    setSelectedTagIds((prev) => {
      if (prev.includes(tagId)) {
        return prev.filter((id) => id !== tagId)
      }
      return [...prev, tagId]
    })
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
        tag_ids: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        is_collection_enabled: isCollectionEnabled,
        notes: notes.trim() || undefined,
      })
      resetForm()
    } catch {
      toast.error('添加失败')
    }
  }

  const resetForm = () => {
    setBiz('')
    setName('')
    setAvatarUrl('')
    setNotes('')
    setArticleUrl('')
    setSelectedTagIds([])
    setIsCollectionEnabled(true)
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm()
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

          {/* 标签选择 */}
          {tags.length > 0 && (
            <div className="space-y-2">
              <Label>标签（可选）</Label>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => handleToggleTag(tag.id)}
                    className={cn(
                      'rounded-full px-3 py-1 text-sm transition-colors',
                      selectedTagIds.includes(tag.id)
                        ? getTagColorClass(tag.color, 'solid')
                        : getTagColorClass(tag.color, 'soft')
                    )}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

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
  tags: WechatAccountTag[]
  onSubmit: (data: UpdateAccountRequest) => Promise<void>
  isPending: boolean
}

function EditAccountDialog({ open, onOpenChange, account, tags, onSubmit, isPending }: EditAccountDialogProps) {
  const [name, setName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && account) {
      setName(account.name)
      setAvatarUrl(account.avatar_url || '')
      setNotes(account.notes || '')
      setSelectedTagIds(account.tags?.map((t) => t.id) || [])
    }
    onOpenChange(newOpen)
  }

  const handleToggleTag = (tagId: number) => {
    setSelectedTagIds((prev) => {
      if (prev.includes(tagId)) {
        return prev.filter((id) => id !== tagId)
      }
      return [...prev, tagId]
    })
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
        tag_ids: selectedTagIds,
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

          {/* 标签选择 */}
          {tags.length > 0 && (
            <div className="space-y-2">
              <Label>标签</Label>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => handleToggleTag(tag.id)}
                    className={cn(
                      'rounded-full px-3 py-1 text-sm transition-colors',
                      selectedTagIds.includes(tag.id)
                        ? getTagColorClass(tag.color, 'solid')
                        : getTagColorClass(tag.color, 'soft')
                    )}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

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
