import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type Row,
  type Cell,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import {
  RotateCcw,
  Trash2,
  Loader2,
  CalendarIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DataTableFacetedFilter,
  DataTableViewOptions,
  SimplePagination,
} from '@/components/data-table'
import {
  useRecords,
  useFilterOptions,
  useDeleteRecords,
  proxyRecord,
  useUserPreference,
  useSaveUserPreference,
  type TablePreference,
} from '../api'
import {
  getColumns,
  columnNames,
  defaultColumnOrder,
  defaultColumnVisibility,
} from './data-table-columns'
import { useAnalysis } from './analysis-provider'
import { callTypeOptions, callResultOptions, sourceOptions } from '../data/filter-options'
import type { CallRecord, RecordsParams } from '../types'

const route = getRouteApi('/_authenticated/analysis/')

// 用户偏好键
const PREFERENCE_KEY = 'analysis_table'

// 表格行组件
function TableRow({ row }: { row: Row<CallRecord> }) {
  return (
    <tr
      data-state={row.getIsSelected() && 'selected'}
      className='hover:bg-muted/50 border-b transition-colors data-[state=selected]:bg-muted'
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell key={cell.id} cell={cell} />
      ))}
    </tr>
  )
}

// 表格单元格组件
function TableCell({ cell }: { cell: Cell<CallRecord, unknown> }) {
  return (
    <td className='p-2 align-middle whitespace-nowrap'>
      {flexRender(cell.column.columnDef.cell, cell.getContext())}
    </td>
  )
}

export function AnalysisTable() {
  const search = route.useSearch()
  const navigate = route.useNavigate()

  // 从 URL 读取筛选参数
  const [filters, setFilters] = useState<RecordsParams>(() => ({
    page: search.page ?? 1,
    page_size: search.pageSize ?? 20,
    source: search.source?.length === 1 ? search.source[0] : undefined,
    call_type: search.callType?.length === 1 ? search.callType[0] : undefined,
    call_result: search.callResult?.length === 1 ? search.callResult[0] : undefined,
    start_time: search.startDate ?? undefined,
    end_time: search.endDate ?? undefined,
    staff_name: search.staffName ?? undefined,
    department: search.department ?? undefined,
    callee: search.callee ?? undefined,
    duration_min: search.durationMin ?? undefined,
    duration_max: search.durationMax ?? undefined,
  }))

  // 日期状态
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined
    to: Date | undefined
  }>({
    from: search.startDate ? parseISO(search.startDate) : undefined,
    to: search.endDate ? parseISO(search.endDate) : undefined,
  })

  // 时长输入状态
  const [durationMin, setDurationMin] = useState<string>(
    search.durationMin?.toString() ?? ''
  )
  const [durationMax, setDurationMax] = useState<string>(
    search.durationMax?.toString() ?? ''
  )

  // Context
  const { setOpen, setCurrentRow, setAudioUrl, setAudioLoading } = useAnalysis()

  // 权限检查
  const isAdmin = useAuthStore((state) => state.auth.isAdmin())

  // UI 状态
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // 表格状态
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    defaultColumnVisibility
  )
  const [columnOrder, setColumnOrder] = useState<string[]>(defaultColumnOrder)

  // 偏好保存状态
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)

  // API Hooks
  const {
    data: recordsData,
    isLoading: recordsLoading,
    isFetching: recordsFetching,
    refetch: refetchRecords,
  } = useRecords(filters)
  const { data: filterOptions } = useFilterOptions()
  const deleteMutation = useDeleteRecords()

  // 用户偏好
  const { data: savedPreference, isLoading: preferenceLoading } =
    useUserPreference<TablePreference>(PREFERENCE_KEY)
  const savePreferenceMutation = useSaveUserPreference()

  // 加载用户偏好
  useEffect(() => {
    if (savedPreference && !preferencesLoaded) {
      if (savedPreference.columnVisibility) {
        setColumnVisibility(savedPreference.columnVisibility)
      }
      if (savedPreference.columnOrder) {
        setColumnOrder(savedPreference.columnOrder)
      }
      if (savedPreference.sorting) {
        setSorting(savedPreference.sorting)
      }
      setPreferencesLoaded(true)
    } else if (!preferenceLoading && !savedPreference && !preferencesLoaded) {
      setPreferencesLoaded(true)
    }
  }, [savedPreference, preferenceLoading, preferencesLoaded])

  // 用于跟踪是否是首次加载后的变更
  const hasInitializedRef = useRef(false)

  // 当偏好变更时保存 (debounced)
  useEffect(() => {
    if (!preferencesLoaded) return

    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true
      return
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(async () => {
      setIsSaving(true)
      try {
        await savePreferenceMutation.mutateAsync({
          key: PREFERENCE_KEY,
          value: {
            columnVisibility,
            columnOrder,
            sorting,
          } satisfies TablePreference,
        })
      } catch {
        // 静默失败
      } finally {
        setIsSaving(false)
      }
    }, 1000)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnVisibility, columnOrder, sorting, preferencesLoaded])

  // 打开录音详情弹窗
  const handleOpenRecordModal = useCallback(
    async (record: CallRecord) => {
      setCurrentRow(record)
      setOpen('detail')
      setAudioUrl(null)

      // 加载录音
      const recordUrl = record.raw_data?.['录音地址'] as string | undefined
      if (recordUrl) {
        setAudioLoading(true)
        try {
          const blob = await proxyRecord(recordUrl)
          setAudioUrl(URL.createObjectURL(blob))
        } catch {
          toast.error('获取录音失败')
        } finally {
          setAudioLoading(false)
        }
      }
    },
    [setCurrentRow, setOpen, setAudioUrl, setAudioLoading]
  )

  // 表格列
  const columns = useMemo(
    () =>
      getColumns({
        onOpenRecordModal: handleOpenRecordModal,
      }),
    [handleOpenRecordModal]
  )

  // 稳定的数据引用
  const tableData = useMemo(
    () => recordsData?.items || [],
    [recordsData?.items]
  )

  // 表格实例
  const table = useReactTable({
    data: tableData,
    columns,
    state: {
      rowSelection,
      sorting,
      columnVisibility,
      columnOrder,
    },
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: true,
    getRowId: (row) => String(row.id),
  })

  // 选中行数
  const selectedRowCount = Object.keys(rowSelection).length

  // 更新 URL 并触发搜索
  const handleSearch = useCallback(() => {
    const newFilters: RecordsParams = {
      ...filters,
      page: 1,
      start_time: dateRange.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
      end_time: dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
      duration_min: durationMin ? parseInt(durationMin, 10) : undefined,
      duration_max: durationMax ? parseInt(durationMax, 10) : undefined,
    }

    setFilters(newFilters)

    // 同步到 URL
    navigate({
      search: {
        page: 1,
        pageSize: newFilters.page_size,
        source: newFilters.source ? [newFilters.source] : undefined,
        callType: newFilters.call_type ? [newFilters.call_type] : undefined,
        callResult: newFilters.call_result ? [newFilters.call_result] : undefined,
        startDate: newFilters.start_time,
        endDate: newFilters.end_time,
        staffName: newFilters.staff_name,
        department: newFilters.department,
        callee: newFilters.callee,
        durationMin: newFilters.duration_min,
        durationMax: newFilters.duration_max,
      },
    })
  }, [filters, dateRange, durationMin, durationMax, navigate])

  // 重置筛选
  const handleResetFilters = useCallback(() => {
    setFilters({ page: 1, page_size: filters.page_size || 20 })
    setDateRange({ from: undefined, to: undefined })
    setDurationMin('')
    setDurationMax('')
    table.resetColumnFilters()

    navigate({
      search: {
        page: 1,
        pageSize: filters.page_size,
      },
    })

    toast.success('已重置筛选条件')
  }, [filters.page_size, navigate, table])

  // 删除选中记录
  const handleDelete = async () => {
    const selectedIds = Object.keys(rowSelection).map(Number)
    if (selectedIds.length === 0) return

    try {
      const result = await deleteMutation.mutateAsync(selectedIds)
      if (result.deleted_count === 0) {
        toast.warning('没有记录被删除，数据可能已更新，正在刷新...')
      } else if (result.deleted_count < selectedIds.length) {
        toast.success(
          `成功删除 ${result.deleted_count} 条记录（${selectedIds.length - result.deleted_count} 条已不存在）`
        )
      } else {
        toast.success(`成功删除 ${result.deleted_count} 条记录`)
      }
      setRowSelection({})
      setShowDeleteDialog(false)
    } catch {
      toast.error('删除失败')
    }
  }

  // 页码变更
  const handlePageChange = useCallback(
    (page: number) => {
      setFilters((prev) => ({ ...prev, page }))
      navigate({
        search: (prev) => ({ ...prev, page }),
      })
    },
    [navigate]
  )

  // 每页数量变更
  const handlePageSizeChange = useCallback(
    (pageSize: number) => {
      setFilters((prev) => ({ ...prev, page: 1, page_size: pageSize }))
      navigate({
        search: (prev) => ({ ...prev, page: 1, pageSize }),
      })
    },
    [navigate]
  )

  // FacetedFilter 筛选变化处理
  const handleFilterChange = useCallback(
    (columnId: string, values: string[] | undefined) => {
      const value = values?.length === 1 ? values[0] : undefined

      setFilters((prev) => ({
        ...prev,
        page: 1,
        [columnId === 'call_type' ? 'call_type' : columnId === 'call_result' ? 'call_result' : 'source']: value,
      }))

      navigate({
        search: (prev) => ({
          ...prev,
          page: 1,
          [columnId === 'call_type' ? 'callType' : columnId === 'call_result' ? 'callResult' : 'source']: values,
        }),
      })
    },
    [navigate]
  )

  // 渲染筛选工具栏
  const isFiltered = !!(
    filters.source ||
    filters.call_type ||
    filters.call_result ||
    filters.start_time ||
    filters.end_time ||
    filters.staff_name ||
    filters.department ||
    filters.callee ||
    filters.duration_min ||
    filters.duration_max
  )

  return (
    <div className='flex flex-1 flex-col gap-4 overflow-hidden'>
      {/* 工具栏 */}
      <div className='flex flex-col gap-3'>
        <div className='flex flex-wrap items-center gap-2'>
          {/* 日期范围选择器 */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant='outline'
                size='sm'
                className={cn(
                  'h-8 justify-start text-left font-normal',
                  !dateRange.from && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className='mr-2 h-4 w-4' />
                {dateRange.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, 'MM/dd')} - {format(dateRange.to, 'MM/dd')}
                    </>
                  ) : (
                    format(dateRange.from, 'yyyy-MM-dd')
                  )
                ) : (
                  '选择日期范围'
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className='w-auto p-0' align='start'>
              <Calendar
                initialFocus
                mode='range'
                defaultMonth={dateRange.from}
                selected={dateRange}
                onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>

          {/* 服务端筛选按钮 */}
          <ServerSideFilter
            title='通话类型'
            value={filters.call_type}
            options={callTypeOptions}
            onChange={(value) => {
              setFilters((prev) => ({ ...prev, page: 1, call_type: value }))
              navigate({
                search: (prev) => ({
                  ...prev,
                  page: 1,
                  callType: value ? [value] : undefined,
                }),
              })
            }}
          />
          <ServerSideFilter
            title='通话结果'
            value={filters.call_result}
            options={callResultOptions}
            onChange={(value) => {
              setFilters((prev) => ({ ...prev, page: 1, call_result: value }))
              navigate({
                search: (prev) => ({
                  ...prev,
                  page: 1,
                  callResult: value ? [value] : undefined,
                }),
              })
            }}
          />
          <ServerSideFilter
            title='数据来源'
            value={filters.source}
            options={sourceOptions}
            onChange={(value) => {
              setFilters((prev) => ({ ...prev, page: 1, source: value }))
              navigate({
                search: (prev) => ({
                  ...prev,
                  page: 1,
                  source: value ? [value] : undefined,
                }),
              })
            }}
          />

          {/* 时长范围 */}
          <div className='flex items-center gap-1'>
            <Input
              type='number'
              placeholder='最小秒'
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              className='h-8 w-20'
              min={0}
            />
            <span className='text-muted-foreground'>-</span>
            <Input
              type='number'
              placeholder='最大秒'
              value={durationMax}
              onChange={(e) => setDurationMax(e.target.value)}
              className='h-8 w-20'
              min={0}
            />
          </div>

          {/* 搜索按钮 */}
          <Button size='sm' onClick={handleSearch}>
            查询
          </Button>

          {/* 重置按钮 */}
          {isFiltered && (
            <Button variant='ghost' size='sm' onClick={handleResetFilters}>
              重置
            </Button>
          )}

          <div className='flex-1' />

          {/* 批量删除 */}
          {selectedRowCount > 0 && isAdmin && (
            <>
              <span className='text-muted-foreground text-sm'>
                已选择 {selectedRowCount} 行
              </span>
              <Button
                variant='destructive'
                size='sm'
                onClick={() => setShowDeleteDialog(true)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                ) : (
                  <Trash2 className='mr-2 h-4 w-4' />
                )}
                删除
              </Button>
            </>
          )}

          {/* 刷新按钮 */}
          <Button
            variant='outline'
            size='sm'
            onClick={() => refetchRecords()}
            disabled={recordsFetching}
          >
            {recordsFetching ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : (
              <RotateCcw className='h-4 w-4' />
            )}
          </Button>

          {/* 列可见性 */}
          <DataTableViewOptions table={table} columnNames={columnNames} />
        </div>

        {/* 保存状态 */}
        {isSaving && (
          <span className='text-muted-foreground text-xs flex items-center gap-1'>
            <Loader2 className='h-3 w-3 animate-spin' />
            保存中...
          </span>
        )}
      </div>

      {/* 表格 */}
      <div className='overflow-auto rounded-md border flex-1'>
        <table className='w-full caption-bottom text-sm'>
          <thead className='bg-card sticky top-0 z-10 [&_tr]:border-b'>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className='border-b transition-colors'>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className='text-foreground bg-card h-10 px-2 text-start align-middle font-medium whitespace-nowrap'
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className='[&_tr:last-child]:border-0'>
            {recordsLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr
                  key={i}
                  className='hover:bg-muted/50 border-b transition-colors'
                >
                  {columns.map((_, j) => (
                    <td key={j} className='p-2 align-middle whitespace-nowrap'>
                      <Skeleton className='h-4 w-full' />
                    </td>
                  ))}
                </tr>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} row={row} />
              ))
            ) : (
              <tr className='hover:bg-muted/50 border-b transition-colors'>
                <td
                  colSpan={columns.length}
                  className='h-24 text-center p-2 align-middle'
                >
                  暂无数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {recordsData && (
        <SimplePagination
          page={filters.page || 1}
          pageSize={filters.page_size || 20}
          total={recordsData.total}
          totalPages={recordsData.pages}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}

      {/* 删除确认对话框 */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除选中的 {selectedRowCount} 条记录吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {deleteMutation.isPending ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : null}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
