import { useState, useEffect } from 'react'
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
  CheckCircle,
  XCircle,
  Shield,
  User as UserIcon,
  Pencil,
  Bot,
  BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import apiClient from '@/lib/api-client'
import type { ApiResponse } from '@/lib/types'
import { DataPageContent } from '@/components/layout/data-page-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DataTablePagination, DataTableColumnHeader } from '@/components/data-table'
import { Switch } from '@/components/ui/switch'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

/** 数据筛选条件类型 */
interface DataFilters {
  start_date?: string | null // 开始日期限制 (YYYY-MM-DD)
  end_date?: string | null // 结束日期限制 (YYYY-MM-DD)
  call_type?: string | null // 通话类型 (呼入/外呼)
  departments?: string[] | null // 部门限制
  staff_names?: string[] | null // 员工限制
}

/** 用户类型 */
interface User {
  id: number
  email: string | null
  username: string | null
  name: string
  role: string
  is_active: boolean
  ai_enabled: boolean
  analysis_enabled: boolean
  call_type_filter: string | null // 已废弃
  data_filters: DataFilters | null // 新的数据筛选条件
  created_at: string
  last_login_at: string | null
}

// Query Keys
const userKeys = {
  all: ['users'] as const,
  list: () => [...userKeys.all, 'list'] as const,
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

// 更新用户（仅本地扩展字段）
function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number
      data: {
        role?: string
        is_active?: boolean
        ai_enabled?: boolean
        analysis_enabled?: boolean
        call_type_filter?: string | null
        data_filters?: DataFilters | null
      }
    }) => {
      const response = await apiClient.put<ApiResponse<User>>(
        `/users/${id}`,
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all })
    },
  })
}

// 获取筛选选项（员工列表）
function useFilterOptions() {
  return useQuery({
    queryKey: ['filter-options'],
    queryFn: async () => {
      const response = await apiClient.get<
        ApiResponse<{ staff_names: string[] }>
      >('/analysis/filter-options')
      return response.data.data
    },
    staleTime: 5 * 60 * 1000, // 5分钟缓存
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

const roleOptions = [
  { value: 'admin', label: '管理员', icon: Shield },
  { value: 'user', label: '普通用户', icon: UserIcon },
]

const callTypeFilterOptions = [
  { value: '', label: '全部（不限制）' },
  { value: '呼入', label: '仅呼入' },
  { value: '外呼', label: '仅外呼' },
]

const editFormSchema = z.object({
  role: z.string().min(1, '请选择角色'),
  is_active: z.boolean(),
  ai_enabled: z.boolean(),
  analysis_enabled: z.boolean(),
  call_type_filter: z.string(), // 已废弃，保留兼容
  // 新的数据筛选条件
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  data_call_type: z.string().optional(),
  staff_names: z.array(z.string()).optional(),
})

type EditUserForm = z.infer<typeof editFormSchema>

export function UsersSettings() {
  const { data: users = [], isLoading, refetch, isRefetching } = useUsers()
  const updateUser = useUpdateUser()
  const { data: filterOptions } = useFilterOptions()

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  const columns: ColumnDef<User>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='名称' />
      ),
      cell: ({ row }) => {
        return <span className='font-medium'>{row.getValue('name')}</span>
      },
    },
    {
      accessorKey: 'username',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='用户名' />
      ),
      cell: ({ row }) => {
        const username = row.getValue('username') as string | null
        return (
          <span className='text-muted-foreground'>{username || '-'}</span>
        )
      },
    },
    {
      accessorKey: 'role',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='角色' />
      ),
      cell: ({ row }) => {
        const role = row.getValue('role') as string
        const roleOption = roleOptions.find((r) => r.value === role)
        return (
          <Badge
            variant={role === 'admin' ? 'default' : 'secondary'}
            className='gap-1'
          >
            {roleOption?.icon && <roleOption.icon className='h-3 w-3' />}
            {roleOption?.label || role}
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
      accessorKey: 'ai_enabled',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='AI 对话' />
      ),
      cell: ({ row }) => {
        const aiEnabled = row.getValue('ai_enabled') as boolean
        return (
          <Badge variant={aiEnabled ? 'outline' : 'secondary'} className='gap-1'>
            <Bot className='h-3 w-3' />
            {aiEnabled ? '已开启' : '未开启'}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'analysis_enabled',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='数据分析' />
      ),
      cell: ({ row }) => {
        const analysisEnabled = row.getValue('analysis_enabled') as boolean
        return (
          <Badge variant={analysisEnabled ? 'outline' : 'secondary'} className='gap-1'>
            <BarChart3 className='h-3 w-3' />
            {analysisEnabled ? '已开启' : '未开启'}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'last_login_at',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='最后登录' />
      ),
      cell: ({ row }) => {
        return (
          <span className='text-muted-foreground text-sm'>
            {formatDateTime(row.getValue('last_login_at'))}
          </span>
        )
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const user = row.original
        return (
          <div className='flex gap-1'>
            <Button
              variant='ghost'
              size='icon'
              className='h-8 w-8'
              onClick={() => {
                setEditingUser(user)
                setEditDialogOpen(true)
              }}
              title='编辑用户'
            >
              <Pencil className='h-4 w-4' />
            </Button>
            <Button
              variant='ghost'
              size='sm'
              onClick={() => {
                updateUser.mutate({
                  id: user.id,
                  data: { is_active: !user.is_active },
                })
              }}
            >
              {user.is_active ? '禁用' : '启用'}
            </Button>
          </div>
        )
      },
    },
  ]

  const table = useReactTable({
    data: users,
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

  const editForm = useForm<EditUserForm>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      role: 'user',
      is_active: true,
      ai_enabled: false,
      analysis_enabled: false,
      call_type_filter: '',
      start_date: '',
      end_date: '',
      data_call_type: '',
      staff_names: [],
    },
  })

  // 当编辑用户变化时，填充表单
  useEffect(() => {
    if (editingUser) {
      const dataFilters = editingUser.data_filters || {}
      editForm.reset({
        role: editingUser.role,
        is_active: editingUser.is_active,
        ai_enabled: editingUser.ai_enabled,
        analysis_enabled: editingUser.analysis_enabled,
        call_type_filter: editingUser.call_type_filter || '',
        // 新的数据筛选条件
        start_date: dataFilters.start_date || '',
        end_date: dataFilters.end_date || '',
        data_call_type: dataFilters.call_type || '',
        staff_names: dataFilters.staff_names || [],
      })
    }
  }, [editingUser, editForm])

  const onEditSubmit = async (data: EditUserForm) => {
    if (!editingUser) return
    try {
      // 只发送有变化的字段
      const updateData: {
        role?: string
        is_active?: boolean
        ai_enabled?: boolean
        analysis_enabled?: boolean
        call_type_filter?: string | null
        data_filters?: DataFilters | null
      } = {}

      if (data.role !== editingUser.role) {
        updateData.role = data.role
      }
      if (data.is_active !== editingUser.is_active) {
        updateData.is_active = data.is_active
      }
      if (data.ai_enabled !== editingUser.ai_enabled) {
        updateData.ai_enabled = data.ai_enabled
      }
      if (data.analysis_enabled !== editingUser.analysis_enabled) {
        updateData.analysis_enabled = data.analysis_enabled
      }

      // 构建新的 data_filters
      const oldFilters = editingUser.data_filters || {}
      const newFilters: DataFilters = {
        start_date: data.start_date || null,
        end_date: data.end_date || null,
        call_type: data.data_call_type || null,
        staff_names: data.staff_names && data.staff_names.length > 0 ? data.staff_names : null,
      }

      // 检查 data_filters 是否有变化
      const filtersChanged =
        newFilters.start_date !== (oldFilters.start_date || null) ||
        newFilters.end_date !== (oldFilters.end_date || null) ||
        newFilters.call_type !== (oldFilters.call_type || null) ||
        JSON.stringify(newFilters.staff_names || []) !== JSON.stringify(oldFilters.staff_names || [])

      if (filtersChanged) {
        // 只有当有值时才发送 data_filters
        const hasAnyFilter = newFilters.start_date || newFilters.end_date || newFilters.call_type || newFilters.staff_names
        updateData.data_filters = hasAnyFilter ? newFilters : null
      }

      if (Object.keys(updateData).length === 0) {
        toast.info('没有需要更新的内容')
        setEditDialogOpen(false)
        return
      }

      await updateUser.mutateAsync({
        id: editingUser.id,
        data: updateData,
      })
      toast.success('用户更新成功')
      setEditDialogOpen(false)
      setEditingUser(null)
      editForm.reset()
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '更新失败，请重试'
      toast.error(message)
    }
  }

  return (
    <>
      <DataPageContent
        className='h-full'
        toolbar={
          <div className='flex w-full items-center justify-between'>
            <div className='flex items-center gap-4'>
              <h1 className='text-lg font-semibold'>用户管理</h1>
              <span className='text-muted-foreground text-sm'>
                用户数据来自 CRM 系统，仅可编辑本地扩展设置
              </span>
            </div>
            <div className='flex items-center gap-4'>
              <Input
                placeholder='搜索用户...'
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className='w-64'
              />
              <Button
                variant='outline'
                size='sm'
                onClick={() => refetch()}
                disabled={isRefetching}
              >
                <RefreshCw
                  className={cn('h-4 w-4', isRefetching && 'animate-spin')}
                />
              </Button>
            </div>
          </div>
        }
        pagination={<DataTablePagination table={table} />}
      >
          {isLoading ? (
            <div className='space-y-2 p-4'>
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className='h-12 w-full' />
              ))}
            </div>
          ) : (
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
                    <ContextMenu key={row.id}>
                      <ContextMenuTrigger asChild>
                        <TableRow className='cursor-context-menu'>
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id}>
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem
                          onClick={() => {
                            const user = row.original
                            updateUser.mutate(
                              {
                                id: user.id,
                                data: { ai_enabled: !user.ai_enabled },
                              },
                              {
                                onSuccess: () => {
                                  toast.success(
                                    user.ai_enabled
                                      ? 'AI 对话已禁用'
                                      : 'AI 对话已启用'
                                  )
                                },
                              }
                            )
                          }}
                        >
                          <Bot className='mr-2 h-4 w-4' />
                          {row.original.ai_enabled ? '禁用 AI 对话' : '启用 AI 对话'}
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className='h-24 text-center'
                    >
                      暂无用户数据
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
      </DataPageContent>

      {/* 编辑用户对话框 - 仅可编辑本地扩展字段 */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open)
          if (!open) {
            setEditingUser(null)
            editForm.reset()
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑用户设置</DialogTitle>
            <DialogDescription>
              修改用户的本地扩展设置（角色、状态、AI 功能）。
              用户基本信息由 CRM 系统管理。
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit(onEditSubmit)}
              className='space-y-4'
            >
              {/* 用户名 - 只读 */}
              <div className='space-y-2'>
                <label className='text-sm font-medium'>用户</label>
                <div className='flex items-center gap-2 rounded-md border bg-muted/50 p-3'>
                  <UserIcon className='h-4 w-4 text-muted-foreground' />
                  <span className='font-medium'>{editingUser?.name}</span>
                  {editingUser?.username && (
                    <span className='text-muted-foreground'>
                      ({editingUser.username})
                    </span>
                  )}
                </div>
              </div>

              <FormField
                control={editForm.control}
                name='role'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>角色</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='选择角色' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {roleOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className='flex items-center gap-2'>
                              <option.icon className='h-4 w-4' />
                              {option.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name='is_active'
                render={({ field }) => (
                  <FormItem className='flex items-center justify-between rounded-lg border p-3'>
                    <div className='space-y-0.5'>
                      <FormLabel>启用状态</FormLabel>
                      <p className='text-muted-foreground text-sm'>
                        禁用后用户将无法登录
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

              <FormField
                control={editForm.control}
                name='ai_enabled'
                render={({ field }) => (
                  <FormItem className='flex items-center justify-between rounded-lg border p-3'>
                    <div className='space-y-0.5'>
                      <FormLabel>AI 对话功能</FormLabel>
                      <p className='text-muted-foreground text-sm'>
                        开启后用户可以使用 AI 对话功能
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

              <FormField
                control={editForm.control}
                name='analysis_enabled'
                render={({ field }) => (
                  <FormItem className='flex items-center justify-between rounded-lg border p-3'>
                    <div className='space-y-0.5'>
                      <FormLabel className='flex items-center gap-2'>
                        <BarChart3 className='h-4 w-4' />
                        数据分析功能
                      </FormLabel>
                      <p className='text-muted-foreground text-sm'>
                        开启后用户可以访问数据分析页面
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

              {/* 数据访问限制区域 */}
              <div className='space-y-4 rounded-lg border p-4'>
                <h4 className='text-sm font-medium'>数据访问限制</h4>
                <p className='text-muted-foreground text-xs'>
                  配置用户可以查看的数据范围。未设置的字段表示不限制。
                </p>

                <div className='grid grid-cols-2 gap-4'>
                  <FormField
                    control={editForm.control}
                    name='start_date'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>开始日期</FormLabel>
                        <FormControl>
                          <Input
                            type='date'
                            {...field}
                            placeholder='不限制'
                          />
                        </FormControl>
                        <p className='text-muted-foreground text-xs'>
                          用户只能看此日期之后的数据
                        </p>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editForm.control}
                    name='end_date'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>结束日期</FormLabel>
                        <FormControl>
                          <Input
                            type='date'
                            {...field}
                            placeholder='不限制'
                          />
                        </FormControl>
                        <p className='text-muted-foreground text-xs'>
                          用户只能看此日期之前的数据
                        </p>
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={editForm.control}
                  name='data_call_type'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>通话类型限制</FormLabel>
                      <Select value={field.value || ''} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='全部（不限制）' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {callTypeFilterOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name='staff_names'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>员工限制</FormLabel>
                      <div className='max-h-32 overflow-y-auto rounded-md border p-2'>
                        {filterOptions?.staff_names && filterOptions.staff_names.length > 0 ? (
                          <div className='space-y-2'>
                            {filterOptions.staff_names.map((staffName) => (
                              <label
                                key={staffName}
                                className='flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1 rounded'
                              >
                                <input
                                  type='checkbox'
                                  checked={field.value?.includes(staffName) || false}
                                  onChange={(e) => {
                                    const currentValues = field.value || []
                                    if (e.target.checked) {
                                      field.onChange([...currentValues, staffName])
                                    } else {
                                      field.onChange(currentValues.filter((v) => v !== staffName))
                                    }
                                  }}
                                  className='h-4 w-4 rounded border-gray-300'
                                />
                                {staffName}
                              </label>
                            ))}
                          </div>
                        ) : (
                          <p className='text-muted-foreground text-xs py-2'>
                            暂无员工数据
                          </p>
                        )}
                      </div>
                      <p className='text-muted-foreground text-xs'>
                        选择用户可以查看的员工数据，不选则不限制
                      </p>
                    </FormItem>
                  )}
                />

                {/* 显示当前配置摘要 */}
                {editingUser?.data_filters && Object.keys(editingUser.data_filters).some(k => editingUser.data_filters?.[k as keyof DataFilters]) && (
                  <div className='text-xs text-muted-foreground bg-muted/50 p-2 rounded'>
                    <span className='font-medium'>当前限制: </span>
                    {editingUser.data_filters.start_date && `从 ${editingUser.data_filters.start_date} 起`}
                    {editingUser.data_filters.end_date && ` 到 ${editingUser.data_filters.end_date}`}
                    {editingUser.data_filters.call_type && ` | ${editingUser.data_filters.call_type}`}
                    {editingUser.data_filters.staff_names && editingUser.data_filters.staff_names.length > 0 && ` | ${editingUser.data_filters.staff_names.length}个员工`}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant='outline'
                  type='button'
                  onClick={() => {
                    setEditDialogOpen(false)
                    setEditingUser(null)
                    editForm.reset()
                  }}
                >
                  取消
                </Button>
                <Button type='submit' disabled={updateUser.isPending}>
                  {updateUser.isPending ? '保存中...' : '保存'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  )
}
