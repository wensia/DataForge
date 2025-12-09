import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  RefreshCw,
  Plus,
  Copy,
  Trash2,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTablePagination, DataTableColumnHeader } from '@/components/data-table'

/** API 密钥类型 */
interface ApiKey {
  id: number
  key: string
  name: string
  is_active: boolean
  created_at: string
  expires_at: string | null
  last_used_at: string | null
  usage_count: number
  notes: string | null
}

/** 创建 API 密钥请求 */
interface ApiKeyCreate {
  key?: string
  name: string
  expires_at?: string
  notes?: string
}

// Query Keys
const apiKeyKeys = {
  all: ['api-keys'] as const,
  list: () => [...apiKeyKeys.all, 'list'] as const,
}

// 获取 API 密钥列表
function useApiKeys() {
  return useQuery({
    queryKey: apiKeyKeys.list(),
    queryFn: async () => {
      const response = await apiClient.get<
        ApiResponse<{ items: ApiKey[]; total: number }>
      >('/api-keys')
      return response.data.data.items
    },
  })
}

// 创建 API 密钥
function useCreateApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: ApiKeyCreate) => {
      const response = await apiClient.post<ApiResponse<ApiKey>>(
        '/api-keys',
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
    },
  })
}

// 删除 API 密钥
function useDeleteApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/api-keys/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
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

/** 密钥显示组件 */
function ApiKeyDisplay({ apiKey }: { apiKey: string }) {
  const [visible, setVisible] = useState(false)

  const displayKey = visible ? apiKey : apiKey.slice(0, 8) + '••••••••'

  const copyToClipboard = () => {
    navigator.clipboard.writeText(apiKey)
    toast.success('已复制到剪贴板')
  }

  return (
    <div className='flex items-center gap-2'>
      <code className='bg-muted rounded px-2 py-1 font-mono text-sm'>
        {displayKey}
      </code>
      <Button
        variant='ghost'
        size='icon'
        className='h-6 w-6'
        onClick={() => setVisible(!visible)}
      >
        {visible ? <EyeOff className='h-3 w-3' /> : <Eye className='h-3 w-3' />}
      </Button>
      <Button
        variant='ghost'
        size='icon'
        className='h-6 w-6'
        onClick={copyToClipboard}
      >
        <Copy className='h-3 w-3' />
      </Button>
    </div>
  )
}

const createFormSchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  key: z.string().optional(),
  notes: z.string().optional(),
})

type CreateApiKeyForm = z.infer<typeof createFormSchema>

export function ApiKeysSettings() {
  const { data: apiKeys = [], isLoading, refetch, isRefetching } = useApiKeys()
  const createApiKey = useCreateApiKey()
  const deleteApiKey = useDeleteApiKey()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null)

  // Local UI-only states
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [globalFilter, setGlobalFilter] = useState('')

  const columns: ColumnDef<ApiKey>[] = [
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
      accessorKey: 'key',
      header: '密钥',
      cell: ({ row }) => {
        return <ApiKeyDisplay apiKey={row.getValue('key')} />
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
          <Badge variant={isActive ? 'default' : 'secondary'} className='gap-1'>
            {isActive ? (
              <CheckCircle className='h-3 w-3' />
            ) : (
              <XCircle className='h-3 w-3' />
            )}
            {isActive ? '启用' : '禁用'}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'usage_count',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='调用次数' />
      ),
      cell: ({ row }) => {
        return (
          <span className='text-muted-foreground'>
            {row.getValue('usage_count')}
          </span>
        )
      },
    },
    {
      accessorKey: 'last_used_at',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='最后使用' />
      ),
      cell: ({ row }) => {
        return (
          <span className='text-muted-foreground text-sm'>
            {formatDateTime(row.getValue('last_used_at'))}
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
        return (
          <Button
            variant='ghost'
            size='icon'
            className='text-destructive hover:text-destructive h-8 w-8'
            onClick={() => {
              setSelectedKey(row.original)
              setDeleteDialogOpen(true)
            }}
          >
            <Trash2 className='h-4 w-4' />
          </Button>
        )
      },
    },
  ]

  const table = useReactTable({
    data: apiKeys,
    columns,
    state: {
      sorting,
      columnVisibility,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const form = useForm<CreateApiKeyForm>({
    resolver: zodResolver(createFormSchema),
    defaultValues: {
      name: '',
      key: '',
      notes: '',
    },
  })

  const onCreateSubmit = async (data: CreateApiKeyForm) => {
    try {
      await createApiKey.mutateAsync({
        name: data.name,
        key: data.key || undefined,
        notes: data.notes || undefined,
      })
      toast.success('API 密钥创建成功')
      setCreateDialogOpen(false)
      form.reset()
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '创建失败，请重试'
      toast.error(message)
    }
  }

  const handleDelete = async () => {
    if (!selectedKey) return
    try {
      await deleteApiKey.mutateAsync(selectedKey.id)
      toast.success('API 密钥删除成功')
      setDeleteDialogOpen(false)
      setSelectedKey(null)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '删除失败，请重试'
      toast.error(message)
    }
  }

  return (
    <div className='flex flex-1 flex-col'>
      <div className='flex-none'>
        <h3 className='text-lg font-medium'>API 密钥管理</h3>
        <p className='text-muted-foreground text-sm'>管理用于访问 API 的密钥。</p>
      </div>
      <Separator className='my-4 flex-none' />
      <div className='flex flex-col gap-4'>
        <div className='flex items-center justify-between'>
          <Input
            placeholder='搜索密钥名称...'
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
                className={cn(
                  'mr-2 h-4 w-4',
                  isRefetching && 'animate-spin'
                )}
              />
              刷新
            </Button>
            <Button size='sm' onClick={() => setCreateDialogOpen(true)}>
              <Plus className='mr-2 h-4 w-4' />
              新建密钥
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
                        暂无 API 密钥
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

      {/* 创建密钥对话框 */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建 API 密钥</DialogTitle>
            <DialogDescription>
              创建一个新的 API 密钥用于访问系统 API。
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onCreateSubmit)}
              className='space-y-4'
            >
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>名称</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='输入密钥名称' />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='key'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>密钥（可选）</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder='留空自动生成'
                        className='font-mono'
                      />
                    </FormControl>
                    <FormDescription>
                      如果不填写，系统将自动生成随机密钥
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='notes'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>备注（可选）</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder='输入备注信息' rows={2} />
                    </FormControl>
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
                <Button type='submit' disabled={createApiKey.isPending}>
                  {createApiKey.isPending ? '创建中...' : '创建'}
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
        isLoading={deleteApiKey.isPending}
        className='max-w-md'
        title={`删除 API 密钥: ${selectedKey?.name}?`}
        desc={
          <>
            您即将删除 API 密钥 <strong>{selectedKey?.name}</strong>。
            <br />
            删除后，使用该密钥的所有请求将失败。此操作无法撤销。
          </>
        }
        confirmText='删除'
      />
    </div>
  )
}
