/**
 * 数据浏览页面
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  type Row,
  type Cell,
} from '@tanstack/react-table'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Search, Loader2, RotateCcw, Trash2, FilterX } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { DataPageContent } from '@/components/layout/data-page-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FilterDatePicker } from '@/components/filter-date-picker'
import { SearchableSelect } from '@/components/searchable-select'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { Skeleton } from '@/components/ui/skeleton'
import { DataTableViewOptions } from '@/components/data-table/view-options'
import { SimplePagination } from '@/components/data-table'
import {
  useRecords,
  useFilterOptions,
  useDeleteRecords,
  proxyRecord,
  useUserPreference,
  useSaveUserPreference,
  type TablePreference,
} from './api'
import { useAuthStore } from '@/stores/auth-store'
import {
  getColumns,
  columnNames,
  defaultColumnOrder,
  defaultColumnVisibility,
} from './components/data-table-columns'
import { RecordDetailModal } from './components/record-detail-modal'
import { callTypeMap, callResultMap, type RecordsParams, type CallRecord } from './types'

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

// 用户偏好键
const PREFERENCE_KEY = 'analysis_table'

export function DataAnalysis() {
  // 筛选状态
  const [filters, setFilters] = useState<RecordsParams>({
    page: 1,
    page_size: 20,
  })
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [callTypeFilter, setCallTypeFilter] = useState<string>('')
  const [callResultFilter, setCallResultFilter] = useState<string>('')
  const [staffNameFilter, setStaffNameFilter] = useState<string>('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [calleeFilter, setCalleeFilter] = useState('')
  const [startTime, setStartTime] = useState<Date | undefined>(undefined)
  const [endTime, setEndTime] = useState<Date | undefined>(undefined)

  // UI 状态
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioLoading, setAudioLoading] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<CallRecord | null>(null)
  const [showRecordModal, setShowRecordModal] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // 权限检查
  const isAdmin = useAuthStore((state) => state.auth.isAdmin())

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
    // 等待偏好加载完成
    if (!preferencesLoaded) return

    // 跳过首次加载时的保存
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

  // 重置筛选条件
  const handleResetFilters = useCallback(() => {
    setSourceFilter('')
    setCallTypeFilter('')
    setCallResultFilter('')
    setStaffNameFilter('')
    setDepartmentFilter('')
    setCalleeFilter('')
    setStartTime(undefined)
    setEndTime(undefined)
    setFilters({ page: 1, page_size: filters.page_size || 20 })
    toast.success('已重置筛选条件')
  }, [filters.page_size])

  // 打开录音详情弹窗
  const handleOpenRecordModal = useCallback(
    async (record: CallRecord) => {
      setSelectedRecord(record)
      setShowRecordModal(true)
      setAudioUrl(null)

      // 加载录音
      const recordUrl = record.raw_data?.['录音地址'] as string | undefined
      if (recordUrl) {
        setAudioLoading(true)
        try {
          // 释放之前的 URL
          if (audioUrl) {
            URL.revokeObjectURL(audioUrl)
          }
          const blob = await proxyRecord(recordUrl)
          setAudioUrl(URL.createObjectURL(blob))
        } catch {
          toast.error('获取录音失败')
        } finally {
          setAudioLoading(false)
        }
      }
    },
    [audioUrl]
  )

  // 表格列
  const columns = useMemo(
    () =>
      getColumns({
        onOpenRecordModal: handleOpenRecordModal,
      }),
    [handleOpenRecordModal]
  )

  // 稳定的数据引用，避免不必要的表格重渲染
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
    // 使用 id 作为行唯一标识，避免索引重排问题
    getRowId: (row) => String(row.id),
  })

  // 获取选中的行数
  const selectedRowCount = Object.keys(rowSelection).length

  // 搜索
  const handleSearch = () => {
    setFilters({
      ...filters,
      page: 1,
      source:
        sourceFilter && sourceFilter !== 'all' ? sourceFilter : undefined,
      call_type:
        callTypeFilter && callTypeFilter !== 'all' ? callTypeFilter : undefined,
      call_result:
        callResultFilter && callResultFilter !== 'all'
          ? callResultFilter
          : undefined,
      staff_name:
        staffNameFilter && staffNameFilter !== 'all'
          ? staffNameFilter
          : undefined,
      department: departmentFilter || undefined,
      callee: calleeFilter || undefined,
      start_time: startTime ? format(startTime, 'yyyy-MM-dd') : undefined,
      end_time: endTime ? format(endTime, 'yyyy-MM-dd') : undefined,
    })
  }

  // 删除选中的记录
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
      // 清除选中状态和关闭对话框
      setRowSelection({})
      setShowDeleteDialog(false)
      // mutation 的 onSuccess 会自动刷新数据，无需手动调用 refetchRecords
    } catch {
      toast.error('删除失败')
    }
  }

  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-4'>
          <h1 className='text-xl font-semibold'>数据浏览</h1>
        </div>
        {isSaving && (
          <span className='text-muted-foreground text-xs flex items-center gap-1'>
            <Loader2 className='h-3 w-3 animate-spin' />
            保存中...
          </span>
        )}
      </Header>

      <Main fixed className='min-h-0'>
        <DataPageContent
          toolbar={
            <div className='flex w-full flex-col gap-3'>
              {/* 筛选条件行 */}
              <div className='flex items-center gap-2'>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className='w-[100px]'>
                    <SelectValue placeholder='来源' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>全部</SelectItem>
                    <SelectItem value='feishu'>飞书</SelectItem>
                    <SelectItem value='yunke'>云客</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={callTypeFilter} onValueChange={setCallTypeFilter}>
                  <SelectTrigger className='w-[100px]'>
                    <SelectValue placeholder='类型' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>全部</SelectItem>
                    {Object.entries(callTypeMap).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={callResultFilter}
                  onValueChange={setCallResultFilter}
                >
                  <SelectTrigger className='w-[100px]'>
                    <SelectValue placeholder='结果' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>全部</SelectItem>
                    {Object.entries(callResultMap).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <SearchableSelect
                  value={staffNameFilter}
                  onValueChange={setStaffNameFilter}
                  options={[
                    { value: 'all', label: '全部' },
                    ...(filterOptions?.staff_names.map((name) => ({
                      value: name,
                      label: name,
                    })) || []),
                  ]}
                  placeholder='员工'
                  searchPlaceholder='搜索员工...'
                  emptyText='未找到员工'
                  className='w-[120px]'
                />
                <Input
                  placeholder='部门'
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className='w-[120px]'
                />
                <Input
                  placeholder='被叫号码'
                  value={calleeFilter}
                  onChange={(e) => setCalleeFilter(e.target.value)}
                  className='w-[120px]'
                />
                <FilterDatePicker
                  selected={startTime}
                  onSelect={setStartTime}
                  placeholder='开始日期'
                  className='w-[140px]'
                />
                <FilterDatePicker
                  selected={endTime}
                  onSelect={setEndTime}
                  placeholder='结束日期'
                  className='w-[140px]'
                />
                <div className='flex-1' />
                <Button onClick={handleSearch}>
                  <Search className='mr-2 h-4 w-4' />
                  查询
                </Button>
                <Button variant='outline' onClick={handleResetFilters}>
                  <FilterX className='mr-2 h-4 w-4' />
                  重置
                </Button>
              </div>
              {/* 操作栏 */}
              <div className='flex items-center gap-2'>
                {selectedRowCount > 0 && (
                  <>
                    <span className='text-muted-foreground text-sm'>
                      已选择 {selectedRowCount} 行
                    </span>
                    {isAdmin && (
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
                    )}
                  </>
                )}
                <div className='flex-1' />
                <Button
                  variant='outline'
                  size='sm'
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
                <DataTableViewOptions table={table} columnNames={columnNames} />
              </div>
            </div>
          }
          pagination={
            recordsData && (
              <SimplePagination
                page={filters.page || 1}
                pageSize={filters.page_size || 20}
                total={recordsData.total}
                totalPages={recordsData.pages}
                onPageChange={(page) =>
                  setFilters((prev) => ({ ...prev, page }))
                }
                onPageSizeChange={(pageSize) =>
                  setFilters((prev) => ({ ...prev, page: 1, page_size: pageSize }))
                }
              />
            )
          }
        >
          <table className='w-full caption-bottom text-sm'>
            <thead className='bg-card sticky top-0 z-10 [&_tr]:border-b'>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr
                  key={headerGroup.id}
                  className='border-b transition-colors'
                >
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
                      <td
                        key={j}
                        className='p-2 align-middle whitespace-nowrap'
                      >
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
        </DataPageContent>
      </Main>

      {/* 录音详情弹窗 */}
      <RecordDetailModal
        open={showRecordModal}
        onOpenChange={setShowRecordModal}
        record={selectedRecord}
        audioUrl={audioUrl}
        audioLoading={audioLoading}
      />

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
    </>
  )
}
