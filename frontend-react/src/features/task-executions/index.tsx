import { useState, useMemo } from 'react'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Ban,
  Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { DataPageContent } from '@/components/layout/data-page-layout'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { Badge } from '@/components/ui/badge'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTableColumnHeader, SimplePagination } from '@/components/data-table'
import { useAllExecutions, useTasks } from '@/features/tasks/api'
import type { TaskExecution } from '@/features/tasks/data/schema'
import { ExecutionDetailDialog } from './components/execution-detail-dialog'

const statuses = [
  { value: 'success', label: '成功', icon: CheckCircle },
  { value: 'failed', label: '失败', icon: XCircle },
  { value: 'running', label: '运行中', icon: Loader2 },
  { value: 'pending', label: '等待中', icon: Clock },
  { value: 'cancelled', label: '已取消', icon: Ban },
]

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatDuration(ms: number | null): string {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

export function TaskExecutions() {
  // 筛选和分页状态
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [taskFilter, setTaskFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // 自动刷新
  const [autoRefresh, setAutoRefresh] = useState(true)
  const REFRESH_INTERVAL = 10000 // 10秒

  // 详情弹窗
  const [selectedExecution, setSelectedExecution] =
    useState<TaskExecution | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // 获取任务列表（用于筛选）
  const { data: tasks = [] } = useTasks()

  // 获取执行记录（服务端分页）
  const {
    data: executionsData,
    isLoading,
    refetch,
    isRefetching,
  } = useAllExecutions(
    {
      task_id: taskFilter ? Number(taskFilter) : undefined,
      status: statusFilter || undefined,
      page,
      size: pageSize,
    },
    {
      refetchInterval: autoRefresh ? REFRESH_INTERVAL : false,
    }
  )

  const executions = executionsData?.items || []
  const total = executionsData?.total || 0
  const totalPages = Math.ceil(total / pageSize)

  // 本地搜索过滤
  const filteredExecutions = useMemo(() => {
    if (!searchQuery) return executions
    const query = searchQuery.toLowerCase()
    return executions.filter(
      (e) =>
        e.task_name?.toLowerCase().includes(query) ||
        String(e.id).includes(query)
    )
  }, [executions, searchQuery])

  // 列定义
  const columns: ColumnDef<TaskExecution>[] = [
    {
      accessorKey: 'id',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='ID' />
      ),
      cell: ({ row }) => {
        return <span className='font-mono text-sm'>#{row.getValue('id')}</span>
      },
    },
    {
      accessorKey: 'task_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='任务名称' />
      ),
      cell: ({ row }) => {
        return (
          <span className='max-w-[200px] truncate font-medium'>
            {row.getValue('task_name') || `任务 #${row.original.task_id}`}
          </span>
        )
      },
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='状态' />
      ),
      cell: ({ row }) => {
        const statusValue = row.getValue('status') as string
        const status = statuses.find((s) => s.value === statusValue)
        if (!status) return null

        const getVariant = () => {
          switch (statusValue) {
            case 'success':
              return 'default'
            case 'failed':
              return 'destructive'
            case 'running':
              return 'secondary'
            default:
              return 'outline'
          }
        }

        return (
          <Badge variant={getVariant()} className='gap-1'>
            {status.icon && (
              <status.icon
                className={cn(
                  'size-3',
                  statusValue === 'running' && 'animate-spin'
                )}
              />
            )}
            {status.label}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'trigger_type',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='触发方式' />
      ),
      cell: ({ row }) => {
        const type = row.getValue('trigger_type') as string
        return (
          <Badge variant='outline'>
            {type === 'manual' ? '手动' : type === 'scheduled' ? '调度' : type}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'started_at',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='开始时间' />
      ),
      cell: ({ row }) => {
        return (
          <span className='text-muted-foreground text-sm'>
            {formatDateTime(row.getValue('started_at'))}
          </span>
        )
      },
    },
    {
      accessorKey: 'duration_ms',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='耗时' />
      ),
      cell: ({ row }) => {
        return (
          <span className='text-muted-foreground font-mono text-sm'>
            {formatDuration(row.getValue('duration_ms'))}
          </span>
        )
      },
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <Button
          variant='ghost'
          size='sm'
          onClick={(e) => {
            e.stopPropagation()
            setSelectedExecution(row.original)
            setDetailOpen(true)
          }}
        >
          <Eye className='mr-1 h-4 w-4' />
          详情
        </Button>
      ),
    },
  ]

  const table = useReactTable({
    data: filteredExecutions,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  // 处理行点击
  const handleRowClick = (execution: TaskExecution) => {
    setSelectedExecution(execution)
    setDetailOpen(true)
  }

  // 加载状态
  const loadingContent = (
    <div className='flex flex-1 flex-col gap-4'>
      <div className='flex items-center gap-2'>
        <Skeleton className='h-8 w-[250px]' />
        <Skeleton className='ml-auto h-8 w-[100px]' />
      </div>
      <div className='overflow-hidden rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((_, index) => (
                <TableHead key={index}>
                  <Skeleton className='h-4 w-full' />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 10 }).map((_, rowIndex) => (
              <TableRow key={rowIndex}>
                {columns.map((_, cellIndex) => (
                  <TableCell key={cellIndex}>
                    <Skeleton className='h-4 w-full' />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )

  return (
    <>
      <Header fixed>
        <Search />
        <div className='ms-auto flex items-center space-x-4'>
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main fixed className='min-h-0'>
        {isLoading ? (
          loadingContent
        ) : (
          <DataPageContent
            toolbar={
              <>
                <Input
                  placeholder='搜索任务名称或ID...'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className='h-8 w-[200px]'
                />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className='h-8 w-[120px]'>
                    <SelectValue placeholder='状态' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>全部状态</SelectItem>
                    {statuses.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={taskFilter} onValueChange={setTaskFilter}>
                  <SelectTrigger className='h-8 w-[160px]'>
                    <SelectValue placeholder='任务' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>全部任务</SelectItem>
                    {tasks.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className='ml-auto flex items-center gap-4'>
                  <div className='flex items-center gap-2'>
                    <Switch
                      id='auto-refresh'
                      checked={autoRefresh}
                      onCheckedChange={setAutoRefresh}
                    />
                    <Label htmlFor='auto-refresh' className='text-sm'>
                      自动刷新
                    </Label>
                  </div>
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
                </div>
              </>
            }
            pagination={
              <SimplePagination
                page={page}
                pageSize={pageSize}
                total={total}
                totalPages={totalPages}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size)
                  setPage(1)
                }}
              />
            }
          >
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      return (
                        <TableHead key={header.id} colSpan={header.colSpan}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </TableHead>
                      )
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className='cursor-pointer hover:bg-muted/50'
                      onClick={() => handleRowClick(row.original)}
                    >
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
                      暂无执行记录
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </DataPageContent>
        )}
      </Main>

      {/* 执行详情弹窗 */}
      <ExecutionDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        execution={selectedExecution}
      />
    </>
  )
}
