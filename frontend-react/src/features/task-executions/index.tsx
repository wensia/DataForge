import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
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
  Terminal,
  X,
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
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
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

  // 日志跟踪状态
  const [trackedExecutionId, setTrackedExecutionId] = useState<number | null>(null)
  const [trackedLogs, setTrackedLogs] = useState<string[]>([])
  const [isTracking, setIsTracking] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const logScrollRef = useRef<HTMLDivElement>(null)

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

  // 清理 SSE 连接
  const cleanupSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setIsTracking(false)
  }, [])

  // 建立 SSE 连接跟踪日志
  const connectSSE = useCallback((executionId: number) => {
    // 如果已经有连接，先关闭
    cleanupSSE()

    const authToken = localStorage.getItem('auth_token')
    const sseUrl = authToken
      ? `/api/v1/tasks/executions/${executionId}/logs/stream?token=${authToken}`
      : `/api/v1/tasks/executions/${executionId}/logs/stream`

    const eventSource = new EventSource(sseUrl)
    eventSourceRef.current = eventSource
    setIsTracking(true)
    setTrackedLogs([])

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.log) {
          setTrackedLogs((prev) => [...prev, data.log])
        }
        if (data.finished) {
          setIsTracking(false)
          eventSource.close()
          eventSourceRef.current = null
        }
      } catch {
        // 忽略解析错误
      }
    }

    eventSource.onerror = () => {
      setIsTracking(false)
      eventSource.close()
      eventSourceRef.current = null
    }
  }, [cleanupSSE])

  // 处理跟踪切换
  const handleTrackToggle = useCallback((executionId: number, checked: boolean) => {
    if (checked) {
      setTrackedExecutionId(executionId)
      connectSSE(executionId)
    } else {
      setTrackedExecutionId(null)
      setTrackedLogs([])
      cleanupSSE()
    }
  }, [connectSSE, cleanupSSE])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      cleanupSSE()
    }
  }, [cleanupSSE])

  // 自动滚动到日志底部
  useEffect(() => {
    if (logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight
    }
  }, [trackedLogs])

  // 获取当前跟踪的执行记录
  const trackedExecution = useMemo(() => {
    if (!trackedExecutionId) return null
    return executions.find((e) => e.id === trackedExecutionId) || null
  }, [trackedExecutionId, executions])

  // 列定义
  const columns: ColumnDef<TaskExecution>[] = [
    {
      id: 'track',
      header: '跟踪',
      cell: ({ row }) => {
        const execution = row.original
        const isRunning = execution.status === 'running' || execution.status === 'pending'
        const isCurrentlyTracked = trackedExecutionId === execution.id

        return (
          <Checkbox
            checked={isCurrentlyTracked}
            onCheckedChange={(checked) => {
              handleTrackToggle(execution.id, checked === true)
            }}
            onClick={(e) => e.stopPropagation()}
            disabled={!isRunning && !isCurrentlyTracked}
            aria-label='跟踪日志'
          />
        )
      },
    },
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

      {/* 日志跟踪面板 */}
      {trackedExecutionId && (
        <div className='bg-background fixed right-0 bottom-0 left-0 z-40 border-t shadow-lg md:left-[--sidebar-width]'>
          <div className='flex items-center justify-between border-b px-4 py-2'>
            <div className='flex items-center gap-2'>
              <Terminal className='h-4 w-4' />
              <span className='text-sm font-medium'>
                日志跟踪 - {trackedExecution?.task_name || `执行 #${trackedExecutionId}`}
              </span>
              {isTracking && (
                <Badge variant='secondary' className='gap-1'>
                  <Loader2 className='h-3 w-3 animate-spin' />
                  实时
                </Badge>
              )}
            </div>
            <Button
              variant='ghost'
              size='icon'
              className='h-6 w-6'
              onClick={() => {
                setTrackedExecutionId(null)
                setTrackedLogs([])
                cleanupSSE()
              }}
            >
              <X className='h-4 w-4' />
            </Button>
          </div>
          <ScrollArea className='h-[200px]' ref={logScrollRef}>
            <div className='p-4'>
              {trackedLogs.length > 0 ? (
                <pre className='whitespace-pre-wrap font-mono text-xs'>
                  {trackedLogs.map((line, index) => (
                    <div
                      key={index}
                      className={cn(
                        'py-0.5',
                        line.toLowerCase().includes('error') && 'text-destructive',
                        line.toLowerCase().includes('warn') &&
                          'text-yellow-600 dark:text-yellow-500',
                        line.toLowerCase().includes('success') &&
                          'text-green-600 dark:text-green-500'
                      )}
                    >
                      {line}
                    </div>
                  ))}
                </pre>
              ) : (
                <p className='text-muted-foreground text-center text-sm'>
                  {isTracking ? '等待日志...' : '暂无日志'}
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* 执行详情弹窗 */}
      <ExecutionDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        execution={selectedExecution}
      />
    </>
  )
}
