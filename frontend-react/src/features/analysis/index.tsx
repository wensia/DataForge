/**
 * 数据浏览页面
 */
import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react'
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
import { toast } from 'sonner'
import { CloudDownload, Search, Loader2, RotateCcw } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { DataPageContent } from '@/components/layout/data-page-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTableViewOptions } from '@/components/data-table/view-options'
import { SimplePagination } from '@/components/data-table'
import {
  useRecords,
  useFilterOptions,
  useSyncData,
  proxyRecord,
  useUserPreference,
  useSaveUserPreference,
  type TablePreference,
} from './api'
import {
  getColumns,
  columnNames,
  defaultColumnOrder,
  defaultColumnVisibility,
} from './components/data-table-columns'
import type { RecordsParams, CallRecord } from './types'
import { callTypeMap, callResultMap } from './types'

// Memo 化的表格行组件，避免不必要的重新渲染
const MemoizedTableRow = memo(function TableRow({
  row,
}: {
  row: Row<CallRecord>
}) {
  return (
    <tr
      data-state={row.getIsSelected() && 'selected'}
      className='hover:bg-muted/50 border-b transition-colors data-[state=selected]:bg-muted'
    >
      {row.getVisibleCells().map((cell) => (
        <MemoizedTableCell key={cell.id} cell={cell} />
      ))}
    </tr>
  )
})

// Memo 化的表格单元格组件
const MemoizedTableCell = memo(function TableCell({
  cell,
}: {
  cell: Cell<CallRecord, unknown>
}) {
  return (
    <td className='p-2 align-middle whitespace-nowrap'>
      {flexRender(cell.column.columnDef.cell, cell.getContext())}
    </td>
  )
})

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

  // UI 状态
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [showAudioModal, setShowAudioModal] = useState(false)
  const [audioLoading, setAudioLoading] = useState(false)

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
    refetch: refetchRecords,
  } = useRecords(filters)
  const { data: filterOptions } = useFilterOptions()
  const syncMutation = useSyncData()

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

  // 重置为默认
  const handleResetPreferences = useCallback(() => {
    setColumnVisibility(defaultColumnVisibility)
    setColumnOrder(defaultColumnOrder)
    setSorting([])
    setRowSelection({})
    toast.success('已重置为默认设置')
  }, [])

  // 播放录音
  const handlePlayAudio = useCallback(
    async (url: string) => {
      setAudioLoading(true)
      try {
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl)
        }
        const blob = await proxyRecord(url)
        setAudioUrl(URL.createObjectURL(blob))
        setShowAudioModal(true)
      } catch {
        toast.error('获取录音失败')
      } finally {
        setAudioLoading(false)
      }
    },
    [audioUrl]
  )

  // 复制 URL
  const handleCopyUrl = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('已复制到剪贴板')
    } catch {
      toast.error('复制失败')
    }
  }, [])

  // 表格列 - 不依赖 audioLoading 避免频繁重新计算
  const columns = useMemo(
    () =>
      getColumns({
        onPlayAudio: handlePlayAudio,
        onCopyUrl: handleCopyUrl,
        audioLoading: false, // 按钮状态在组件内部管理
      }),
    [handlePlayAudio, handleCopyUrl]
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
    })
  }

  // 同步数据
  const handleSync = async () => {
    try {
      await syncMutation.mutateAsync()
      toast.success('同步完成')
      refetchRecords()
    } catch {
      toast.error('同步失败')
    }
  }

  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-4'>
          <h1 className='text-xl font-semibold'>数据浏览</h1>
        </div>
        <div className='flex items-center gap-2'>
          {isSaving && (
            <span className='text-muted-foreground text-xs flex items-center gap-1'>
              <Loader2 className='h-3 w-3 animate-spin' />
              保存中...
            </span>
          )}
          <Button
            variant='outline'
            onClick={handleSync}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <CloudDownload className='mr-2 h-4 w-4' />
            )}
            同步数据
          </Button>
        </div>
      </Header>

      <Main fixed className='min-h-0'>
        <DataPageContent
          toolbar={
            <>
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
              <Select
                value={staffNameFilter}
                onValueChange={setStaffNameFilter}
              >
                <SelectTrigger className='w-[120px]'>
                  <SelectValue placeholder='员工' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>全部</SelectItem>
                  {filterOptions?.staff_names.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder='部门'
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className='w-[120px]'
              />
              <Button onClick={handleSearch}>
                <Search className='mr-2 h-4 w-4' />
                查询
              </Button>
              <div className='flex-1' />
              <div className='flex items-center gap-2'>
                {selectedRowCount > 0 && (
                  <span className='text-muted-foreground text-sm'>
                    已选择 {selectedRowCount} 行
                  </span>
                )}
                <DataTableViewOptions table={table} columnNames={columnNames} />
              </div>
              <Button
                variant='ghost'
                size='sm'
                onClick={handleResetPreferences}
                title='重置为默认设置'
              >
                <RotateCcw className='h-4 w-4' />
              </Button>
            </>
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
                  <MemoizedTableRow key={row.id} row={row} />
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

      {/* 录音播放弹窗 */}
      <Dialog open={showAudioModal} onOpenChange={setShowAudioModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>播放录音</DialogTitle>
          </DialogHeader>
          {audioUrl && (
            <audio src={audioUrl} controls autoPlay className='w-full' />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
