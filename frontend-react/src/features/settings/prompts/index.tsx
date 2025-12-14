import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  Edit,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import apiClient from '@/lib/api-client'
import type { ApiResponse } from '@/lib/types'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTablePagination, DataTableColumnHeader } from '@/components/data-table'

/** 话术类型 */
interface Prompt {
  id: number
  title: string
  content: string
  category: string | null
  description: string | null
  sort_order: number
  is_active: boolean
  created_by: number
  created_at: string
  updated_at: string
  assigned_count?: number
}

/** 用户类型 */
interface User {
  id: number
  email: string
  name: string
  role: string
}

/** 分配信息 */
interface AssignedUser {
  id: number
  name: string
  email: string
  assignment_id: number
  assigned_at: string
}

// Query Keys
const promptKeys = {
  all: ['prompts'] as const,
  list: () => [...promptKeys.all, 'list'] as const,
  detail: (id: number) => [...promptKeys.all, 'detail', id] as const,
}

const userKeys = {
  all: ['users'] as const,
  list: () => [...userKeys.all, 'list'] as const,
}

// 获取话术列表
function usePrompts() {
  return useQuery({
    queryKey: promptKeys.list(),
    queryFn: async () => {
      const response = await apiClient.get<
        ApiResponse<{ items: Prompt[]; total: number }>
      >('/prompts')
      return response.data.data.items
    },
  })
}

// 获取话术详情（包含分配用户）
function usePromptDetail(id: number | null) {
  return useQuery({
    queryKey: promptKeys.detail(id!),
    queryFn: async () => {
      const response = await apiClient.get<
        ApiResponse<Prompt & { assigned_users: AssignedUser[] }>
      >(`/prompts/${id}`)
      return response.data.data
    },
    enabled: !!id,
  })
}

// 获取用户列表
function useUsers() {
  return useQuery({
    queryKey: userKeys.list(),
    queryFn: async () => {
      const response = await apiClient.get<
        ApiResponse<{ items: User[]; total: number }>
      >('/users')
      return response.data.data.items
    },
  })
}

// 创建话术
function useCreatePrompt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      title: string
      content: string
      category?: string
      description?: string
      sort_order?: number
      is_active?: boolean
    }) => {
      const response = await apiClient.post<ApiResponse<Prompt>>('/prompts', data)
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptKeys.all })
    },
  })
}

// 更新话术
function useUpdatePrompt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number
      data: Partial<Prompt>
    }) => {
      const response = await apiClient.put<ApiResponse<Prompt>>(
        `/prompts/${id}`,
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptKeys.all })
    },
  })
}

// 删除话术
function useDeletePrompt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/prompts/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptKeys.all })
    },
  })
}

// 分配用户
function useAssignUsers() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ promptId, userIds }: { promptId: number; userIds: number[] }) => {
      const response = await apiClient.post<ApiResponse<{ added: number }>>(
        `/prompts/${promptId}/assignments`,
        { user_ids: userIds }
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptKeys.all })
    },
  })
}

// 取消分配用户
function useUnassignUsers() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ promptId, userIds }: { promptId: number; userIds: number[] }) => {
      const response = await apiClient.request<ApiResponse<{ removed: number }>>({
        method: 'DELETE',
        url: `/prompts/${promptId}/assignments`,
        data: { user_ids: userIds },
      })
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptKeys.all })
    },
  })
}

/** 格式化时间 */
function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(100, '标题最多100字符'),
  content: z.string().min(1, '内容不能为空'),
  category: z.string().optional(),
  description: z.string().max(500, '描述最多500字符').optional(),
  sort_order: z.number(),
  is_active: z.boolean(),
})

type PromptForm = z.infer<typeof formSchema>

export function PromptsSettings() {
  const { data: prompts = [], isLoading, refetch, isRefetching } = usePrompts()
  const { data: users = [] } = useUsers()

  const createPrompt = useCreatePrompt()
  const updatePrompt = useUpdatePrompt()
  const deletePrompt = useDeletePrompt()
  const assignUsers = useAssignUsers()
  const unassignUsers = useUnassignUsers()

  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null)
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null)
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  // 获取选中话术的详情（包含分配用户）
  const { data: promptDetail } = usePromptDetail(
    assignDialogOpen ? selectedPrompt?.id ?? null : null
  )

  // 选中的用户 ID（用于分配对话框）
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])

  const columns: ColumnDef<Prompt>[] = [
    {
      accessorKey: 'title',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='标题' />
      ),
      cell: ({ row }) => {
        return <span className='font-medium'>{row.getValue('title')}</span>
      },
    },
    {
      accessorKey: 'content',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='内容' />
      ),
      cell: ({ row }) => {
        const content = row.getValue('content') as string
        return (
          <span
            className='text-muted-foreground block max-w-[300px] truncate'
            title={content}
          >
            {content}
          </span>
        )
      },
    },
    {
      accessorKey: 'category',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='分类' />
      ),
      cell: ({ row }) => {
        const category = row.getValue('category') as string | null
        return category ? (
          <Badge variant='outline'>{category}</Badge>
        ) : (
          <span className='text-muted-foreground'>-</span>
        )
      },
    },
    {
      accessorKey: 'assigned_count',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='分配用户' />
      ),
      cell: ({ row }) => {
        const count = row.original.assigned_count ?? 0
        return (
          <Badge variant={count > 0 ? 'default' : 'secondary'}>
            {count} 人
          </Badge>
        )
      },
    },
    {
      accessorKey: 'is_active',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='状态' />
      ),
      cell: ({ row }) => {
        const isActive = row.getValue('is_active') as boolean
        return (
          <Badge variant={isActive ? 'outline' : 'secondary'} className='gap-1'>
            {isActive ? (
              <CheckCircle className='h-3 w-3 text-green-500' />
            ) : (
              <XCircle className='h-3 w-3 text-gray-400' />
            )}
            {isActive ? '启用' : '禁用'}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='创建时间' />
      ),
      cell: ({ row }) => {
        return (
          <span className='text-muted-foreground text-sm'>
            {formatDateTime(row.getValue('created_at'))}
          </span>
        )
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const prompt = row.original
        return (
          <div className='flex gap-1'>
            <Button
              variant='ghost'
              size='icon'
              className='h-8 w-8'
              onClick={() => {
                setEditingPrompt(prompt)
                setFormDialogOpen(true)
              }}
            >
              <Edit className='h-4 w-4' />
            </Button>
            <Button
              variant='ghost'
              size='icon'
              className='h-8 w-8'
              onClick={() => {
                setSelectedPrompt(prompt)
                setAssignDialogOpen(true)
              }}
            >
              <Users className='h-4 w-4' />
            </Button>
            <Button
              variant='ghost'
              size='sm'
              onClick={() => {
                updatePrompt.mutate({
                  id: prompt.id,
                  data: { is_active: !prompt.is_active },
                })
              }}
            >
              {prompt.is_active ? '禁用' : '启用'}
            </Button>
            <Button
              variant='ghost'
              size='icon'
              className='text-destructive hover:text-destructive h-8 w-8'
              onClick={() => {
                setSelectedPrompt(prompt)
                setDeleteDialogOpen(true)
              }}
            >
              <Trash2 className='h-4 w-4' />
            </Button>
          </div>
        )
      },
    },
  ]

  const table = useReactTable({
    data: prompts,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const form = useForm<PromptForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      content: '',
      category: '',
      description: '',
      sort_order: 0,
      is_active: true,
    },
  })

  // 打开编辑对话框时填充表单
  const openEditDialog = (prompt: Prompt | null) => {
    if (prompt) {
      form.reset({
        title: prompt.title,
        content: prompt.content,
        category: prompt.category || '',
        description: prompt.description || '',
        sort_order: prompt.sort_order,
        is_active: prompt.is_active,
      })
    } else {
      form.reset({
        title: '',
        content: '',
        category: '',
        description: '',
        sort_order: 0,
        is_active: true,
      })
    }
    setEditingPrompt(prompt)
    setFormDialogOpen(true)
  }

  const onSubmit = async (data: PromptForm) => {
    try {
      if (editingPrompt) {
        await updatePrompt.mutateAsync({
          id: editingPrompt.id,
          data,
        })
        toast.success('话术更新成功')
      } else {
        await createPrompt.mutateAsync(data)
        toast.success('话术创建成功')
      }
      setFormDialogOpen(false)
      setEditingPrompt(null)
      form.reset()
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '操作失败，请重试'
      toast.error(message)
    }
  }

  const handleDelete = async () => {
    if (!selectedPrompt) return
    try {
      await deletePrompt.mutateAsync(selectedPrompt.id)
      toast.success('话术删除成功')
      setDeleteDialogOpen(false)
      setSelectedPrompt(null)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '删除失败，请重试'
      toast.error(message)
    }
  }

  // 当获取到话术详情时，更新选中的用户 ID
  const handleAssignDialogOpened = () => {
    if (promptDetail?.assigned_users) {
      setSelectedUserIds(promptDetail.assigned_users.map((u) => u.id))
    } else {
      setSelectedUserIds([])
    }
  }

  const handleSaveAssignments = async () => {
    if (!selectedPrompt) return

    try {
      const currentAssigned = promptDetail?.assigned_users?.map((u) => u.id) || []
      const toAdd = selectedUserIds.filter((id) => !currentAssigned.includes(id))
      const toRemove = currentAssigned.filter((id) => !selectedUserIds.includes(id))

      if (toAdd.length > 0) {
        await assignUsers.mutateAsync({
          promptId: selectedPrompt.id,
          userIds: toAdd,
        })
      }

      if (toRemove.length > 0) {
        await unassignUsers.mutateAsync({
          promptId: selectedPrompt.id,
          userIds: toRemove,
        })
      }

      toast.success('分配更新成功')
      setAssignDialogOpen(false)
      setSelectedPrompt(null)
      setSelectedUserIds([])
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '分配失败，请重试'
      toast.error(message)
    }
  }

  return (
    <div className='flex flex-1 flex-col'>
      <div className='flex-none'>
        <h3 className='text-lg font-medium'>快捷话术管理</h3>
        <p className='text-muted-foreground text-sm'>
          管理快捷话术，分配给指定用户使用。
        </p>
      </div>
      <Separator className='my-4 flex-none' />

      <div className='flex flex-col gap-4'>
        <div className='flex items-center justify-between'>
          <Input
            placeholder='搜索话术标题或内容...'
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className='max-w-sm'
          />
          <div className='flex gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => refetch()}
              disabled={isRefetching}
            >
              <RefreshCw
                className={cn('mr-2 h-4 w-4', isRefetching && 'animate-spin')}
              />
              刷新
            </Button>
            <Button size='sm' onClick={() => openEditDialog(null)}>
              <Plus className='mr-2 h-4 w-4' />
              添加话术
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className='space-y-2'>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className='h-12 w-full' />
            ))}
          </div>
        ) : (
          <>
            <div className='overflow-hidden rounded-md border'>
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className='h-24 text-center'
                      >
                        暂无话术数据
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <DataTablePagination table={table} />
          </>
        )}
      </div>

      {/* 创建/编辑话术对话框 */}
      <Dialog open={formDialogOpen} onOpenChange={(open) => {
        setFormDialogOpen(open)
        if (!open) {
          setEditingPrompt(null)
          form.reset()
        }
      }}>
        <DialogContent className='max-w-xl'>
          <DialogHeader>
            <DialogTitle>{editingPrompt ? '编辑话术' : '添加话术'}</DialogTitle>
            <DialogDescription>
              {editingPrompt ? '修改话术内容和设置。' : '创建新的快捷话术。'}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className='space-y-4'
            >
              <FormField
                control={form.control}
                name='title'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>标题</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='输入话术标题' />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='content'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>内容</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder='输入话术内容...'
                        className='min-h-[120px]'
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className='grid grid-cols-2 gap-4'>
                <FormField
                  control={form.control}
                  name='category'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>分类（可选）</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder='例如：问候、跟进' />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='sort_order'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>排序</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type='number'
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name='description'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>描述（可选）</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='简短描述话术用途' />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='is_active'
                render={({ field }) => (
                  <FormItem className='flex items-center justify-between rounded-lg border p-3'>
                    <div className='space-y-0.5'>
                      <FormLabel>启用状态</FormLabel>
                      <p className='text-muted-foreground text-sm'>
                        禁用后用户将看不到此话术
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  variant='outline'
                  type='button'
                  onClick={() => setFormDialogOpen(false)}
                >
                  取消
                </Button>
                <Button
                  type='submit'
                  disabled={createPrompt.isPending || updatePrompt.isPending}
                >
                  {createPrompt.isPending || updatePrompt.isPending
                    ? '保存中...'
                    : '保存'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* 分配用户对话框 */}
      <Dialog
        open={assignDialogOpen}
        onOpenChange={(open) => {
          setAssignDialogOpen(open)
          if (open) {
            handleAssignDialogOpened()
          } else {
            setSelectedPrompt(null)
            setSelectedUserIds([])
          }
        }}
      >
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>分配用户</DialogTitle>
            <DialogDescription>
              为话术 &quot;{selectedPrompt?.title}&quot; 分配可以使用的用户。
            </DialogDescription>
          </DialogHeader>

          <div className='max-h-[400px] overflow-y-auto'>
            <div className='space-y-2'>
              {users.map((user) => (
                <div
                  key={user.id}
                  className='flex items-center space-x-3 rounded-lg border p-3'
                >
                  <Checkbox
                    id={`user-${user.id}`}
                    checked={selectedUserIds.includes(user.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedUserIds([...selectedUserIds, user.id])
                      } else {
                        setSelectedUserIds(
                          selectedUserIds.filter((id) => id !== user.id)
                        )
                      }
                    }}
                  />
                  <label
                    htmlFor={`user-${user.id}`}
                    className='flex flex-1 cursor-pointer flex-col'
                  >
                    <span className='font-medium'>{user.name}</span>
                    <span className='text-muted-foreground text-sm'>
                      {user.email}
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setAssignDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              onClick={handleSaveAssignments}
              disabled={assignUsers.isPending || unassignUsers.isPending}
            >
              {assignUsers.isPending || unassignUsers.isPending
                ? '保存中...'
                : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <ConfirmDialog
        destructive
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        handleConfirm={handleDelete}
        isLoading={deletePrompt.isPending}
        className='max-w-md'
        title={`删除话术: ${selectedPrompt?.title}?`}
        desc={
          <>
            您即将删除话术 <strong>{selectedPrompt?.title}</strong>。
            <br />
            此操作无法撤销，相关的用户分配也会被删除。
          </>
        }
        confirmText='删除'
      />
    </div>
  )
}
