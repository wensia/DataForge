import { useEffect, useState, type MouseEvent } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import {
  flexRender,
  type ColumnSizingState,
  type Header,
  type SortingState,
  type VisibilityState,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { RefreshCw, Play, Pause, PlayCircle, Edit, Copy, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import { Button } from '@/components/ui/button'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DataTablePagination, DataTableToolbar } from '@/components/data-table'
import { useTasks, usePauseTask, useResumeTask } from '../api'
import { statuses, categories } from '../data/data'
import { type Task } from '../data/schema'
import { DataTableBulkActions } from './data-table-bulk-actions'
import { tasksColumns as columns } from './tasks-columns'
import { useTasks as useTasksContext } from './tasks-provider'

const route = getRouteApi('/_authenticated/tasks/')

export function TasksTable() {
  // 使用 API 获取数据
  const { data: tasks = [], isLoading, refetch, isRefetching } = useTasks()

  // 右键菜单状态
  const [contextTask, setContextTask] = useState<Task | null>(null)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 })

  // Tasks context for dialogs
  const { setOpen, setCurrentRow } = useTasksContext()

  // Task mutations
  const pauseTask = usePauseTask()
  const resumeTask = useResumeTask()

  // Local UI-only states
  const [rowSelection, setRowSelection] = useState({})
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({})

  // Synced with URL states
  const {
    globalFilter,
    onGlobalFilterChange,
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
    ensurePageInRange,
  } = useTableUrlState({
    search: route.useSearch(),
    navigate: route.useNavigate(),
    pagination: { defaultPage: 1, defaultPageSize: 10 },
    globalFilter: { enabled: true, key: 'filter' },
    columnFilters: [
      { columnId: 'status', searchKey: 'status', type: 'array' },
      { columnId: 'category', searchKey: 'category', type: 'array' },
    ],
  })

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: tasks,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      globalFilter,
      pagination,
      columnSizing,
    },
    enableRowSelection: true,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    globalFilterFn: (row, _columnId, filterValue) => {
      const name = String(row.getValue('name')).toLowerCase()
      const description = row.original.description?.toLowerCase() ?? ''
      const searchValue = String(filterValue).toLowerCase()

      return name.includes(searchValue) || description.includes(searchValue)
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    onPaginationChange,
    onGlobalFilterChange,
    onColumnFiltersChange,
  })

  const pageCount = table.getPageCount()
  useEffect(() => {
    ensurePageInRange(pageCount)
  }, [pageCount, ensurePageInRange])

  // Handle right-click on row
  const handleContextMenu = (e: MouseEvent, task: Task) => {
    e.preventDefault()
    setContextTask(task)
    setContextMenuPosition({ x: e.clientX, y: e.clientY })
    setContextMenuOpen(true)
  }

  // Context menu handlers
  const handleRun = () => {
    if (!contextTask) return
    setCurrentRow(contextTask)
    setOpen('run')
    setContextMenuOpen(false)
  }

  const handlePause = async () => {
    if (!contextTask) return
    try {
      await pauseTask.mutateAsync(contextTask.id)
      toast.success('任务已暂停')
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '暂停失败，请重试'
      toast.error(message)
    }
    setContextMenuOpen(false)
  }

  const handleResume = async () => {
    if (!contextTask) return
    try {
      await resumeTask.mutateAsync(contextTask.id)
      toast.success('任务已恢复')
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '恢复失败，请重试'
      toast.error(message)
    }
    setContextMenuOpen(false)
  }

  const handleEdit = () => {
    if (!contextTask) return
    setCurrentRow(contextTask)
    setOpen('update')
    setContextMenuOpen(false)
  }

  const handleCopy = () => {
    if (!contextTask) return
    setCurrentRow(contextTask)
    setOpen('copy')
    setContextMenuOpen(false)
  }

  const handleDelete = () => {
    if (!contextTask) return
    setCurrentRow(contextTask)
    setOpen('delete')
    setContextMenuOpen(false)
  }

  // 加载状态
  if (isLoading) {
    return (
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
              {Array.from({ length: 5 }).map((_, rowIndex) => (
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
  }

  return (
    <div
      className={cn(
        'max-sm:has-[div[role="toolbar"]]:mb-16',
        'flex flex-1 flex-col gap-4'
      )}
    >
      <div className='flex items-center justify-between'>
        <DataTableToolbar
          table={table}
          searchPlaceholder='搜索任务名称或描述...'
          filters={[
            {
              columnId: 'status',
              title: '状态',
              options: statuses,
            },
            {
              columnId: 'category',
              title: '分类',
              options: categories.map((c) => ({
                label: c.label,
                value: c.value,
                icon: c.icon,
              })),
            },
          ]}
        />
        <Button
          variant='outline'
          size='sm'
          onClick={() => refetch()}
          disabled={isRefetching}
          className='ml-2'
        >
          <RefreshCw
            className={cn('mr-2 h-4 w-4', isRefetching && 'animate-spin')}
          />
          刷新
        </Button>
      </div>

      <div className='overflow-hidden rounded-md border'>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      className={cn(
                        'relative',
                        header.column.columnDef.meta?.className,
                        header.column.columnDef.meta?.thClassName
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                      <ColumnResizer header={header} />
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
                  data-state={row.getIsSelected() && 'selected'}
                  onContextMenu={(e) => handleContextMenu(e, row.original)}
                  className='cursor-context-menu'
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        cell.column.columnDef.meta?.className,
                        cell.column.columnDef.meta?.tdClassName
                      )}
                    >
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
                  暂无任务数据
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* 右键菜单 - 使用 DropdownMenu 模拟 */}
      <DropdownMenu open={contextMenuOpen} onOpenChange={setContextMenuOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <div
            className='fixed'
            style={{
              left: contextMenuPosition.x,
              top: contextMenuPosition.y,
              width: 0,
              height: 0,
            }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' className='w-[160px]'>
          <DropdownMenuItem onClick={handleRun}>
            <Play className='mr-2 h-4 w-4' />
            立即执行
          </DropdownMenuItem>

          {contextTask?.status === 'active' ? (
            <DropdownMenuItem
              onClick={handlePause}
              disabled={pauseTask.isPending}
            >
              <Pause className='mr-2 h-4 w-4' />
              暂停任务
            </DropdownMenuItem>
          ) : contextTask?.status === 'paused' ? (
            <DropdownMenuItem
              onClick={handleResume}
              disabled={resumeTask.isPending}
            >
              <PlayCircle className='mr-2 h-4 w-4' />
              恢复任务
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={handleEdit}>
            <Edit className='mr-2 h-4 w-4' />
            编辑
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleCopy}>
            <Copy className='mr-2 h-4 w-4' />
            复制
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={handleDelete}
            className='text-destructive focus:text-destructive'
            disabled={contextTask?.is_system}
          >
            删除
            <DropdownMenuShortcut>
              <Trash2 size={16} />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DataTablePagination table={table} className='mt-auto' />
      <DataTableBulkActions table={table} />
    </div>
  )
}

/** 列宽调整手柄组件 */
function ColumnResizer<TData>({ header }: { header: Header<TData, unknown> }) {
  if (!header.column.getCanResize()) {
    return null
  }

  return (
    <div
      onDoubleClick={() => header.column.resetSize()}
      onMouseDown={header.getResizeHandler()}
      onTouchStart={header.getResizeHandler()}
      className={cn(
        'absolute top-0 right-0 h-full w-1 cursor-col-resize select-none touch-none',
        'bg-transparent hover:bg-primary/50 transition-colors',
        header.column.getIsResizing() && 'bg-primary'
      )}
      style={{
        transform: 'translateX(50%)',
      }}
    />
  )
}
