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
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  Shield,
  User as UserIcon,
  Dices,
  Copy,
  Check,
  Pencil,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import apiClient from '@/lib/api-client'
import type { ApiResponse } from '@/lib/types'
import { Separator } from '@/components/ui/separator'
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
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTablePagination, DataTableColumnHeader } from '@/components/data-table'
import { Switch } from '@/components/ui/switch'

/** 用户类型 */
interface User {
  id: number
  email: string
  name: string
  role: string
  is_active: boolean
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

// 创建用户
function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      email?: string
      password: string
      name: string
      role: string
    }) => {
      const response = await apiClient.post<ApiResponse<User>>('/users', data)
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all })
    },
  })
}

// 更新用户
function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number
      data: {
        email?: string
        password?: string
        role?: string
        is_active?: boolean
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

// 删除用户
function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/users/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all })
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

const roleOptions = [
  { value: 'admin', label: '管理员', icon: Shield },
  { value: 'user', label: '普通用户', icon: UserIcon },
]

const formSchema = z.object({
  email: z.string().email('请输入有效的邮箱').optional().or(z.literal('')),
  password: z.string().min(6, '密码至少 6 个字符'),
  name: z.string().min(1, '名称不能为空'),
  role: z.string().min(1, '请选择角色'),
})

const editFormSchema = z.object({
  email: z.string().email('请输入有效的邮箱').optional().or(z.literal('')),
  password: z.string().min(6, '密码至少 6 个字符').optional().or(z.literal('')),
  role: z.string().min(1, '请选择角色'),
  is_active: z.boolean(),
})

/** 生成随机密码：2位大写 + 2位小写 + 4位数字 */
function generateRandomPassword(): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lowercase = 'abcdefghijklmnopqrstuvwxyz'
  const digits = '0123456789'

  let password = ''
  for (let i = 0; i < 2; i++) {
    password += uppercase[Math.floor(Math.random() * uppercase.length)]
  }
  for (let i = 0; i < 2; i++) {
    password += lowercase[Math.floor(Math.random() * lowercase.length)]
  }
  for (let i = 0; i < 4; i++) {
    password += digits[Math.floor(Math.random() * digits.length)]
  }
  return password
}

type UserForm = z.infer<typeof formSchema>
type EditUserForm = z.infer<typeof editFormSchema>

export function UsersSettings() {
  const { data: users = [], isLoading, refetch, isRefetching } = useUsers()

  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const deleteUser = useDeleteUser()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [createdCredentials, setCreatedCredentials] = useState<{
    name: string
    password: string
  } | null>(null)
  const [editedCredentials, setEditedCredentials] = useState<{
    name: string
    password: string
  } | null>(null)
  const [copied, setCopied] = useState(false)
  const [editedCopied, setEditedCopied] = useState(false)

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
      accessorKey: 'email',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='邮箱' />
      ),
      cell: ({ row }) => {
        return (
          <span className='text-muted-foreground'>{row.getValue('email')}</span>
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
            <Button
              variant='ghost'
              size='icon'
              className='text-destructive hover:text-destructive h-8 w-8'
              onClick={() => {
                setSelectedUser(user)
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

  const form = useForm<UserForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
      name: '',
      role: 'user',
    },
  })

  const editForm = useForm<EditUserForm>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      email: '',
      password: '',
      role: 'user',
      is_active: true,
    },
  })

  // 当编辑用户变化时，填充表单
  useEffect(() => {
    if (editingUser) {
      editForm.reset({
        email: editingUser.email || '',
        password: '',
        role: editingUser.role,
        is_active: editingUser.is_active,
      })
    }
  }, [editingUser, editForm])

  const onSubmit = async (data: UserForm) => {
    try {
      const password = data.password
      await createUser.mutateAsync(data)
      toast.success('用户创建成功')
      setCreateDialogOpen(false)
      // 保存凭证用于复制
      setCreatedCredentials({ name: data.name, password })
      form.reset()
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '创建失败，请重试'
      toast.error(message)
    }
  }

  const onEditSubmit = async (data: EditUserForm) => {
    if (!editingUser) return
    try {
      // 只发送有变化的字段
      const updateData: {
        email?: string
        password?: string
        role?: string
        is_active?: boolean
      } = {}

      if (data.email && data.email !== editingUser.email) {
        updateData.email = data.email
      }
      const hasNewPassword = !!data.password
      if (data.password) {
        updateData.password = data.password
      }
      if (data.role !== editingUser.role) {
        updateData.role = data.role
      }
      if (data.is_active !== editingUser.is_active) {
        updateData.is_active = data.is_active
      }

      await updateUser.mutateAsync({
        id: editingUser.id,
        data: updateData,
      })
      toast.success('用户更新成功')
      setEditDialogOpen(false)

      // 如果设置了新密码，显示凭证复制弹窗
      if (hasNewPassword) {
        setEditedCredentials({
          name: editingUser.name,
          password: data.password,
        })
      }

      setEditingUser(null)
      editForm.reset()
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '更新失败，请重试'
      toast.error(message)
    }
  }

  const handleCopyCredentials = async () => {
    if (!createdCredentials) return
    const text = `用户名: ${createdCredentials.name}\n密码: ${createdCredentials.password}`

    try {
      // 优先使用现代 Clipboard API（需要 HTTPS）
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        // HTTP 环境下的备用方案
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('凭证已复制到剪贴板')
    } catch {
      toast.error('复制失败，请手动复制')
    }
  }

  const handleCopyEditedCredentials = async () => {
    if (!editedCredentials) return
    const text = `用户名: ${editedCredentials.name}\n密码: ${editedCredentials.password}`

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setEditedCopied(true)
      setTimeout(() => setEditedCopied(false), 2000)
      toast.success('凭证已复制到剪贴板')
    } catch {
      toast.error('复制失败，请手动复制')
    }
  }

  const handleDelete = async () => {
    if (!selectedUser) return
    try {
      await deleteUser.mutateAsync(selectedUser.id)
      toast.success('用户删除成功')
      setDeleteDialogOpen(false)
      setSelectedUser(null)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '删除失败，请重试'
      toast.error(message)
    }
  }

  return (
    <div className='flex flex-1 flex-col'>
      <div className='flex-none'>
        <h3 className='text-lg font-medium'>用户管理</h3>
        <p className='text-muted-foreground text-sm'>
          管理系统用户账号和权限。
        </p>
      </div>
      <Separator className='my-4 flex-none' />

      <div className='flex flex-col gap-4'>
        <div className='flex items-center justify-between'>
          <Input
            placeholder='搜索用户名或邮箱...'
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
            <Button size='sm' onClick={() => setCreateDialogOpen(true)}>
              <Plus className='mr-2 h-4 w-4' />
              添加用户
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
                        暂无用户数据
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

      {/* 创建用户对话框 */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加用户</DialogTitle>
            <DialogDescription>创建新的系统用户账号。</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className='space-y-4'
            >
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>名称</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='输入用户名称' />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      邮箱 <span className='text-muted-foreground'>(可选)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='email'
                        placeholder='user@example.com'
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='password'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>密码</FormLabel>
                    <div className='flex gap-2'>
                      <FormControl>
                        <Input
                          {...field}
                          type='text'
                          placeholder='输入密码'
                          autoComplete='new-password'
                        />
                      </FormControl>
                      <Button
                        type='button'
                        variant='outline'
                        size='icon'
                        onClick={() => {
                          const pwd = generateRandomPassword()
                          form.setValue('password', pwd)
                        }}
                        title='生成随机密码'
                      >
                        <Dices className='h-4 w-4' />
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
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

              <DialogFooter>
                <Button
                  variant='outline'
                  type='button'
                  onClick={() => setCreateDialogOpen(false)}
                >
                  取消
                </Button>
                <Button type='submit' disabled={createUser.isPending}>
                  {createUser.isPending ? '创建中...' : '创建'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* 编辑用户对话框 */}
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
            <DialogTitle>编辑用户</DialogTitle>
            <DialogDescription>
              修改用户信息。用户名不可修改。
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit(onEditSubmit)}
              className='space-y-4'
            >
              {/* 用户名 - 只读 */}
              <div className='space-y-2'>
                <label className='text-sm font-medium'>名称</label>
                <Input
                  value={editingUser?.name || ''}
                  disabled
                  className='bg-muted'
                />
                <p className='text-muted-foreground text-xs'>用户名不可修改</p>
              </div>

              <FormField
                control={editForm.control}
                name='email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>邮箱</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='email'
                        placeholder='user@example.com'
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name='password'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      新密码{' '}
                      <span className='text-muted-foreground'>(留空不修改)</span>
                    </FormLabel>
                    <div className='flex gap-2'>
                      <FormControl>
                        <Input
                          {...field}
                          type='text'
                          placeholder='输入新密码'
                          autoComplete='new-password'
                        />
                      </FormControl>
                      <Button
                        type='button'
                        variant='outline'
                        size='icon'
                        onClick={() => {
                          const pwd = generateRandomPassword()
                          editForm.setValue('password', pwd)
                        }}
                        title='生成随机密码'
                      >
                        <Dices className='h-4 w-4' />
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

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

      {/* 删除确认对话框 */}
      <ConfirmDialog
        destructive
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        handleConfirm={handleDelete}
        isLoading={deleteUser.isPending}
        className='max-w-md'
        title={`删除用户: ${selectedUser?.name}?`}
        desc={
          <>
            您即将删除用户 <strong>{selectedUser?.email}</strong>。
            <br />
            此操作无法撤销。
          </>
        }
        confirmText='删除'
      />

      {/* 凭证复制对话框 */}
      <Dialog
        open={!!createdCredentials}
        onOpenChange={(open) => {
          if (!open) {
            setCreatedCredentials(null)
            setCopied(false)
          }
        }}
      >
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>用户创建成功</DialogTitle>
            <DialogDescription>
              请保存以下登录凭证，密码不会再次显示。
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-3 rounded-md border bg-muted/50 p-4'>
            <div className='flex items-center justify-between'>
              <span className='text-muted-foreground text-sm'>用户名</span>
              <span className='font-mono font-medium'>
                {createdCredentials?.name}
              </span>
            </div>
            <Separator />
            <div className='flex items-center justify-between'>
              <span className='text-muted-foreground text-sm'>密码</span>
              <span className='font-mono font-medium'>
                {createdCredentials?.password}
              </span>
            </div>
          </div>
          <DialogFooter className='sm:justify-between'>
            <Button
              variant='outline'
              onClick={() => {
                setCreatedCredentials(null)
                setCopied(false)
              }}
            >
              关闭
            </Button>
            <Button onClick={handleCopyCredentials} className='gap-2'>
              {copied ? (
                <Check className='h-4 w-4' />
              ) : (
                <Copy className='h-4 w-4' />
              )}
              {copied ? '已复制' : '复制凭证'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑用户凭证复制对话框 */}
      <Dialog
        open={!!editedCredentials}
        onOpenChange={(open) => {
          if (!open) {
            setEditedCredentials(null)
            setEditedCopied(false)
          }
        }}
      >
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>密码已更新</DialogTitle>
            <DialogDescription>
              请保存以下登录凭证，密码不会再次显示。
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-3 rounded-md border bg-muted/50 p-4'>
            <div className='flex items-center justify-between'>
              <span className='text-muted-foreground text-sm'>用户名</span>
              <span className='font-mono font-medium'>
                {editedCredentials?.name}
              </span>
            </div>
            <Separator />
            <div className='flex items-center justify-between'>
              <span className='text-muted-foreground text-sm'>新密码</span>
              <span className='font-mono font-medium'>
                {editedCredentials?.password}
              </span>
            </div>
          </div>
          <DialogFooter className='sm:justify-between'>
            <Button
              variant='outline'
              onClick={() => {
                setEditedCredentials(null)
                setEditedCopied(false)
              }}
            >
              关闭
            </Button>
            <Button onClick={handleCopyEditedCredentials} className='gap-2'>
              {editedCopied ? (
                <Check className='h-4 w-4' />
              ) : (
                <Copy className='h-4 w-4' />
              )}
              {editedCopied ? '已复制' : '复制凭证'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
