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
  Check,
  PlusCircle,
  BarChart3,
  Search,
  SlidersHorizontal,
  Phone,
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
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
import { BatchPhoneQueryDialog } from './batch-phone-query-dialog'
import { callTypeOptions, callResultOptions, invalidCallOptions, transcriptStatusOptions, type FilterOption } from '../data/filter-options'
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
    call_type: search.callType?.length === 1 ? search.callType[0] : undefined,
    call_result: search.callResult?.length === 1 ? search.callResult[0] : undefined,
    start_time: search.startDate ?? undefined,
    end_time: search.endDate ?? undefined,
    staff_name: search.staffName ?? undefined,
    department: search.department ?? undefined,
    callee: search.callee ?? undefined,
    duration_min: search.durationMin ?? undefined,
    duration_max: search.durationMax ?? undefined,
    is_invalid_call: search.isInvalidCall ?? undefined,
    transcript_status: search.transcriptStatus ?? undefined,
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

  // 被叫手机号输入状态（只有点击搜索才触发查询）
  const [calleeInput, setCalleeInput] = useState<string>(search.callee ?? '')

  // Context
  const { setOpen, setCurrentRow, setAudioUrl, setAudioLoading } = useAnalysis()

  // 权限检查
  const isAdmin = useAuthStore((state) => state.auth.isAdmin())

  // UI 状态
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showBatchQueryDialog, setShowBatchQueryDialog] = useState(false)

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

  // 员工选项 (从 API 获取)
  const staffOptions: FilterOption[] = useMemo(() => {
    if (!filterOptions?.staff_names) return []
    return filterOptions.staff_names.map((name) => ({
      label: name,
      value: name,
    }))
  }, [filterOptions?.staff_names])

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
      callee: calleeInput || undefined,
    }

    setFilters(newFilters)

    // 同步到 URL
    navigate({
      search: {
        page: 1,
        pageSize: newFilters.page_size,
        callType: newFilters.call_type ? [newFilters.call_type] : undefined,
        callResult: newFilters.call_result ? [newFilters.call_result] : undefined,
        startDate: newFilters.start_time,
        endDate: newFilters.end_time,
        staffName: newFilters.staff_name,
        department: newFilters.department,
        callee: newFilters.callee,
        durationMin: newFilters.duration_min,
        durationMax: newFilters.duration_max,
        isInvalidCall: newFilters.is_invalid_call,
        transcriptStatus: newFilters.transcript_status,
      },
    })
  }, [filters, dateRange, durationMin, durationMax, calleeInput, navigate])

  // 重置筛选
  const handleResetFilters = useCallback(() => {
    setFilters({ page: 1, page_size: filters.page_size || 20 })
    setDateRange({ from: undefined, to: undefined })
    setDurationMin('')
    setDurationMax('')
    setCalleeInput('')
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

  // 渲染筛选工具栏
  const isFiltered = !!(
    filters.call_type ||
    filters.call_result ||
    filters.start_time ||
    filters.end_time ||
    filters.staff_name ||
    filters.department ||
    filters.callee ||
    filters.duration_min ||
    filters.duration_max ||
    filters.is_invalid_call !== undefined ||
    filters.transcript_status
  )

  return (
    <div className='flex flex-1 flex-col gap-4 overflow-hidden'>
      {/* 工具栏 */}
      <div className='flex flex-shrink-0 flex-col gap-2'>
        {/* 第一行：筛选区 */}
        <div className='flex flex-wrap items-center gap-2'>
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
          {staffOptions.length > 0 && (
            <ServerSideFilter
              title='员工'
              value={filters.staff_name}
              options={staffOptions}
              onChange={(value) => {
                setFilters((prev) => ({ ...prev, page: 1, staff_name: value }))
                navigate({
                  search: (prev) => ({
                    ...prev,
                    page: 1,
                    staffName: value,
                  }),
                })
              }}
            />
          )}
          <ServerSideFilter
            title='通话质量'
            value={filters.is_invalid_call?.toString()}
            options={invalidCallOptions}
            onChange={(value) => {
              const boolValue = value === 'true' ? true : value === 'false' ? false : undefined
              setFilters((prev) => ({ ...prev, page: 1, is_invalid_call: boolValue }))
              navigate({
                search: (prev) => ({
                  ...prev,
                  page: 1,
                  isInvalidCall: boolValue,
                }),
              })
            }}
          />
          <ServerSideFilter
            title='转写状态'
            value={filters.transcript_status}
            options={transcriptStatusOptions}
            onChange={(value) => {
              setFilters((prev) => ({ ...prev, page: 1, transcript_status: value }))
              navigate({
                search: (prev) => ({
                  ...prev,
                  page: 1,
                  transcriptStatus: value,
                }),
              })
            }}
          />

          <Separator orientation='vertical' className='h-5' />

          {/* 被叫手机号搜索 */}
          <Input
            type='text'
            placeholder='被叫手机号'
            value={calleeInput}
            onChange={(e) => setCalleeInput(e.target.value)}
            inputSize='xs'
            className='w-32'
          />

          {/* 高级筛选 */}
          <AdvancedFilterPopover
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            durationMin={durationMin}
            durationMax={durationMax}
            onDurationMinChange={setDurationMin}
            onDurationMaxChange={setDurationMax}
            onConfirm={handleSearch}
            onReset={() => {
              setDateRange({ from: undefined, to: undefined })
              setDurationMin('')
              setDurationMax('')
            }}
          />

          <div className='flex-1' />

          {/* 重置按钮 */}
          {isFiltered && (
            <Button
              variant='ghost'
              size='icon-xs'
              onClick={handleResetFilters}
              title='重置筛选'
            >
              <RotateCcw className='h-4 w-4' />
            </Button>
          )}

          {/* 搜索按钮 */}
          <Button size='icon-xs' onClick={handleSearch} title='查询'>
            <Search className='h-4 w-4' />
          </Button>
        </div>

        {/* 第二行：操作按钮 */}
        <div className='flex items-center gap-2'>
          {/* 批量删除 */}
          {selectedRowCount > 0 && isAdmin && (
            <>
              <span className='text-muted-foreground text-sm'>
                已选择 {selectedRowCount} 行
              </span>
              <Button
                variant='destructive'
                size='xs'
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
              <Separator orientation='vertical' className='h-5' />
            </>
          )}

          {/* 转写统计按钮 */}
          <Button
            variant='outline'
            size='xs'
            onClick={() => setOpen('transcript-stats')}
          >
            <BarChart3 className='mr-2 h-4 w-4' />
            转写统计
          </Button>

          {/* 批量查询按钮 */}
          <Button
            variant='outline'
            size='xs'
            onClick={() => setShowBatchQueryDialog(true)}
          >
            <Phone className='mr-2 h-4 w-4' />
            批量查询
          </Button>

          <div className='flex-1' />

          {/* 保存状态 */}
          {isSaving && (
            <span className='text-muted-foreground text-xs flex items-center gap-1'>
              <Loader2 className='h-3 w-3 animate-spin' />
              保存中...
            </span>
          )}

          {/* 列可见性 */}
          <DataTableViewOptions table={table} columnNames={columnNames} />

          {/* 刷新按钮 */}
          <Button
            variant='default'
            size='icon-xs'
            onClick={() => refetchRecords()}
            disabled={recordsFetching}
            title='刷新数据'
          >
            {recordsFetching ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : (
              <RotateCcw className='h-4 w-4' />
            )}
          </Button>
        </div>
      </div>

      {/* 表格 */}
      <div className='min-h-0 flex-1 overflow-auto rounded-md border'>
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

      {/* 分页 - 固定在底部 */}
      {recordsData && (
        <div className='mt-auto flex-shrink-0'>
          <SimplePagination
            page={filters.page || 1}
            pageSize={filters.page_size || 20}
            total={recordsData.total}
            totalPages={recordsData.pages}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
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

      {/* 批量查询弹窗 */}
      <BatchPhoneQueryDialog
        open={showBatchQueryDialog}
        onOpenChange={setShowBatchQueryDialog}
        onSelectPhone={(phone) => {
          // 设置搜索框并触发搜索
          setCalleeInput(phone)
          setFilters((prev) => ({ ...prev, callee: phone, page: 1 }))
        }}
      />
    </div>
  )
}

// 高级筛选弹窗组件
interface AdvancedFilterPopoverProps {
  dateRange: { from: Date | undefined; to: Date | undefined }
  onDateRangeChange: (range: { from: Date | undefined; to: Date | undefined }) => void
  durationMin: string
  durationMax: string
  onDurationMinChange: (value: string) => void
  onDurationMaxChange: (value: string) => void
  onConfirm: () => void
  onReset: () => void
}

function AdvancedFilterPopover({
  dateRange,
  onDateRangeChange,
  durationMin,
  durationMax,
  onDurationMinChange,
  onDurationMaxChange,
  onConfirm,
  onReset,
}: AdvancedFilterPopoverProps) {
  const [open, setOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const hasDateFilter = !!(dateRange.from || dateRange.to)
  const hasDurationFilter = !!(durationMin || durationMax)
  const filterCount = (hasDateFilter ? 1 : 0) + (hasDurationFilter ? 1 : 0)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant='outline' size='xs' className='border-dashed'>
          <SlidersHorizontal className='mr-2 h-4 w-4' />
          高级筛选
          {filterCount > 0 && (
            <>
              <Separator orientation='vertical' className='mx-2 h-4' />
              <Badge variant='secondary' className='rounded-sm px-1 font-normal'>
                {filterCount}
              </Badge>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-72' align='start'>
        <div className='space-y-4'>
          {/* 日期范围 */}
          <div className='space-y-2'>
            <h4 className='font-medium text-sm'>日期范围</h4>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant='outline'
                  size='xs'
                  className={cn(
                    'justify-start text-left font-normal w-full',
                    !dateRange.from && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className='mr-2 h-4 w-4' />
                  {dateRange.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, 'yyyy-MM-dd')} ~ {format(dateRange.to, 'yyyy-MM-dd')}
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
                  mode='range'
                  defaultMonth={dateRange.from}
                  selected={dateRange}
                  onSelect={(range) => {
                    onDateRangeChange({ from: range?.from, to: range?.to })
                    if (range?.from && range?.to) {
                      setCalendarOpen(false)
                    }
                  }}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          </div>

          <Separator />

          {/* 通话时长 */}
          <div className='space-y-2'>
            <h4 className='font-medium text-sm'>通话时长（秒）</h4>
            <div className='flex items-center gap-2'>
              <Input
                type='number'
                placeholder='最小'
                value={durationMin}
                onChange={(e) => onDurationMinChange(e.target.value)}
                inputSize='xs'
                className='flex-1'
                min={0}
              />
              <span className='text-muted-foreground'>-</span>
              <Input
                type='number'
                placeholder='最大'
                value={durationMax}
                onChange={(e) => onDurationMaxChange(e.target.value)}
                inputSize='xs'
                className='flex-1'
                min={0}
              />
            </div>
          </div>

          <Separator />

          <div className='flex justify-end gap-2'>
            <Button
              variant='outline'
              size='xs'
              onClick={() => {
                onReset()
              }}
              disabled={filterCount === 0}
            >
              重置
            </Button>
            <Button
              size='xs'
              onClick={() => {
                onConfirm()
                setOpen(false)
              }}
            >
              确认
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// 服务端筛选组件
interface ServerSideFilterProps {
  title: string
  value: string | undefined
  options: FilterOption[]
  onChange: (value: string | undefined) => void
}

function ServerSideFilter({
  title,
  value,
  options,
  onChange,
}: ServerSideFilterProps) {
  const selectedOption = options.find((opt) => opt.value === value)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant='outline' size='xs' className='border-dashed'>
          <PlusCircle className='mr-2 h-4 w-4' />
          {title}
          {selectedOption && (
            <>
              <Separator orientation='vertical' className='mx-2 h-4' />
              <Badge
                variant='secondary'
                className='rounded-sm px-1 font-normal'
              >
                {selectedOption.label}
              </Badge>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[200px] p-0' align='start'>
        <Command>
          <CommandInput placeholder={`搜索${title}...`} />
          <CommandList>
            <CommandEmpty>未找到结果</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = value === option.value
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      onChange(isSelected ? undefined : option.value)
                    }}
                  >
                    <div
                      className={cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'opacity-50 [&_svg]:invisible'
                      )}
                    >
                      <Check className='h-4 w-4' />
                    </div>
                    {option.icon && (
                      <option.icon className='mr-2 h-4 w-4 text-muted-foreground' />
                    )}
                    <span>{option.label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {value && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => onChange(undefined)}
                    className='justify-center text-center'
                  >
                    清除筛选
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
