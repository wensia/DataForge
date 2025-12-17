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
  Filter,
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
})

type EditUserForm = z.infer<typeof editFormSchema>

export function UsersSettings() {
  const { data: users = [], isLoading, refetch, isRefetching } = useUsers()
  const updateUser = useUpdateUser()
  const { data: filterOptions } = useFilterOptions()

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [dataFiltersDialogOpen, setDataFiltersDialogOpen] = useState(false)
  const [dataFiltersUser, setDataFiltersUser] = useState<User | null>(null)
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
    },
  })

  // 当编辑用户变化时，填充表单
  useEffect(() => {
    if (editingUser) {
      editForm.reset({
        role: editingUser.role,
        is_active: editingUser.is_active,
        ai_enabled: editingUser.ai_enabled,
        analysis_enabled: editingUser.analysis_enabled,
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
                        <ContextMenuItem
                          onClick={() => {
                            setDataFiltersUser(row.original)
                            setDataFiltersDialogOpen(true)
                          }}
                        >
                          <Filter className='mr-2 h-4 w-4' />
                          数据访问限制
                          {row.original.data_filters && Object.keys(row.original.data_filters).some(k => row.original.data_filters?.[k as keyof DataFilters]) && (
                            <span className='ml-auto text-xs text-muted-foreground'>已配置</span>
                          )}
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

      {/* 数据访问限制配置对话框 */}
      <Dialog
        open={dataFiltersDialogOpen}
        onOpenChange={(open) => {
          setDataFiltersDialogOpen(open)
          if (!open) {
            setDataFiltersUser(null)
          }
        }}
      >
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <Filter className='h-5 w-5' />
              数据访问限制
            </DialogTitle>
            <DialogDescription>
              配置 <span className='font-medium'>{dataFiltersUser?.name}</span> 可以查看的数据范围。
              未设置的字段表示不限制。
            </DialogDescription>
          </DialogHeader>

          <DataFiltersForm
            user={dataFiltersUser}
            filterOptions={filterOptions}
            onSave={async (filters) => {
              if (!dataFiltersUser) return
              try {
                await updateUser.mutateAsync({
                  id: dataFiltersUser.id,
                  data: { data_filters: filters },
                })
                toast.success('数据访问限制已更新')
                setDataFiltersDialogOpen(false)
                setDataFiltersUser(null)
              } catch (error: unknown) {
                const message = error instanceof Error ? error.message : '更新失败'
                toast.error(message)
              }
            }}
            onCancel={() => {
              setDataFiltersDialogOpen(false)
              setDataFiltersUser(null)
            }}
            isPending={updateUser.isPending}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

/** 数据访问限制表单组件 */
function DataFiltersForm({
  user,
  filterOptions,
  onSave,
  onCancel,
  isPending,
}: {
  user: User | null
  filterOptions: { staff_names: string[] } | undefined
  onSave: (filters: DataFilters | null) => Promise<void>
  onCancel: () => void
  isPending: boolean
}) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [callType, setCallType] = useState('')
  const [staffNames, setStaffNames] = useState<string[]>([])

  // 初始化表单数据
  useEffect(() => {
    if (user) {
      const filters = user.data_filters || {}
      setStartDate(filters.start_date || '')
      setEndDate(filters.end_date || '')
      setCallType(filters.call_type || '')
      setStaffNames(filters.staff_names || [])
    }
  }, [user])

  const handleSave = async () => {
    const hasAnyFilter = startDate || endDate || callType || staffNames.length > 0
    const filters: DataFilters | null = hasAnyFilter
      ? {
          start_date: startDate || null,
          end_date: endDate || null,
          call_type: callType || null,
          staff_names: staffNames.length > 0 ? staffNames : null,
        }
      : null
    await onSave(filters)
  }

  const handleClear = async () => {
    await onSave(null)
  }

  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-2 gap-4'>
        <div className='space-y-2'>
          <label className='text-sm font-medium'>开始日期</label>
          <Input
            type='date'
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <p className='text-muted-foreground text-xs'>
            只能看此日期之后的数据
          </p>
        </div>
        <div className='space-y-2'>
          <label className='text-sm font-medium'>结束日期</label>
          <Input
            type='date'
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <p className='text-muted-foreground text-xs'>
            只能看此日期之前的数据
          </p>
        </div>
      </div>

      <div className='space-y-2'>
        <label className='text-sm font-medium'>通话类型限制</label>
        <Select value={callType} onValueChange={setCallType}>
          <SelectTrigger>
            <SelectValue placeholder='全部（不限制）' />
          </SelectTrigger>
          <SelectContent>
            {callTypeFilterOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className='space-y-2'>
        <label className='text-sm font-medium'>员工限制</label>
        <div className='max-h-40 overflow-y-auto rounded-md border p-2'>
          {filterOptions?.staff_names && filterOptions.staff_names.length > 0 ? (
            <div className='space-y-1'>
              {filterOptions.staff_names.map((staffName) => (
                <label
                  key={staffName}
                  className='flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1.5 rounded'
                >
                  <input
                    type='checkbox'
                    checked={staffNames.includes(staffName)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setStaffNames([...staffNames, staffName])
                      } else {
                        setStaffNames(staffNames.filter((v) => v !== staffName))
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
      </div>

      {/* 当前配置摘要 */}
      {(startDate || endDate || callType || staffNames.length > 0) && (
        <div className='text-xs text-muted-foreground bg-muted/50 p-2 rounded'>
          <span className='font-medium'>当前限制: </span>
          {startDate && `从 ${startDate} 起`}
          {endDate && ` 到 ${endDate}`}
          {callType && ` | ${callType}`}
          {staffNames.length > 0 && ` | ${staffNames.length}个员工`}
        </div>
      )}

      <DialogFooter className='gap-2'>
        <Button
          variant='ghost'
          type='button'
          onClick={handleClear}
          disabled={isPending}
          className='text-destructive hover:text-destructive'
        >
          清除限制
        </Button>
        <div className='flex-1' />
        <Button variant='outline' type='button' onClick={onCancel}>
          取消
        </Button>
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? '保存中...' : '保存'}
        </Button>
      </DialogFooter>
    </div>
  )
}
