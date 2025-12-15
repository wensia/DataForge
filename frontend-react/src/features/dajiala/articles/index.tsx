/**
 * 微信公众号文章列表页面
 */
import { useState, useMemo, useCallback } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  type Row,
  type Cell,
} from '@tanstack/react-table'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  Search,
  Loader2,
  RotateCcw,
  Trash2,
  FilterX,
  ChevronDown,
  ChevronUp,
  Filter,
  ExternalLink,
  Image,
  Star,
} from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { DataPageContent } from '@/components/layout/data-page-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FilterDatePicker } from '@/components/filter-date-picker'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Badge } from '@/components/ui/badge'
import { DataTableViewOptions } from '@/components/data-table/view-options'
import { SimplePagination } from '@/components/data-table'
import { useAuthStore } from '@/stores/auth-store'
import {
  useWechatArticles,
  useArticleFilterOptions,
  useDeleteArticles,
} from './api'
import { type WechatArticle, type ArticleParams, getPositionLabel } from './types'

// 表格行组件
function TableRow({ row }: { row: Row<WechatArticle> }) {
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
function TableCell({ cell }: { cell: Cell<WechatArticle, unknown> }) {
  return (
    <td className='p-2 align-middle whitespace-nowrap'>
      {flexRender(cell.column.columnDef.cell, cell.getContext())}
    </td>
  )
}

// 列名映射
const columnNames: Record<string, string> = {
  select: '选择',
  title: '标题',
  account_name: '公众号',
  post_time: '发布时间',
  position: '位置',
  is_original: '原创',
  cover_url: '封面',
}

// 默认列可见性
const defaultColumnVisibility: VisibilityState = {
  select: true,
  title: true,
  account_name: true,
  post_time: true,
  position: true,
  is_original: true,
  cover_url: true,
}

// 默认列顺序
const defaultColumnOrder = [
  'select',
  'title',
  'account_name',
  'post_time',
  'position',
  'is_original',
  'cover_url',
]

// 表格列定义
function getColumns(): ColumnDef<WechatArticle>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label='全选'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label='选择行'
        />
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'title',
      header: '标题',
      cell: ({ row }) => (
        <div className='max-w-[300px] truncate'>
          <a
            href={row.original.article_url}
            target='_blank'
            rel='noopener noreferrer'
            className='text-blue-600 hover:underline inline-flex items-center gap-1'
            title={row.original.title}
          >
            {row.original.title}
            <ExternalLink className='h-3 w-3 flex-shrink-0' />
          </a>
        </div>
      ),
    },
    {
      accessorKey: 'account_name',
      header: '公众号',
      cell: ({ row }) => row.original.account_name || '-',
    },
    {
      accessorKey: 'post_time',
      header: '发布时间',
      cell: ({ row }) => {
        try {
          return format(new Date(row.original.post_time), 'yyyy-MM-dd HH:mm')
        } catch {
          return row.original.post_time
        }
      },
    },
    {
      accessorKey: 'position',
      header: '位置',
      cell: ({ row }) => {
        const position = row.original.position
        if (position === 1) {
          return (
            <Badge variant='default' className='bg-yellow-500'>
              <Star className='h-3 w-3 mr-1' />
              头条
            </Badge>
          )
        }
        return getPositionLabel(position)
      },
    },
    {
      accessorKey: 'is_original',
      header: '原创',
      cell: ({ row }) =>
        row.original.is_original ? (
          <Badge variant='outline' className='text-green-600 border-green-600'>
            原创
          </Badge>
        ) : (
          '-'
        ),
    },
    {
      accessorKey: 'cover_url',
      header: '封面',
      cell: ({ row }) =>
        row.original.cover_url ? (
          <a
            href={row.original.cover_url}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center gap-1 text-muted-foreground hover:text-foreground'
          >
            <Image className='h-4 w-4' />
          </a>
        ) : (
          '-'
        ),
    },
  ]
}

export function WechatArticles() {
  // 筛选状态
  const [filters, setFilters] = useState<ArticleParams>({
    page: 1,
    page_size: 20,
  })
  const [accountNameFilter, setAccountNameFilter] = useState('')
  const [titleFilter, setTitleFilter] = useState('')
  const [startTime, setStartTime] = useState<Date | undefined>(undefined)
  const [endTime, setEndTime] = useState<Date | undefined>(undefined)
  const [isOriginalFilter, setIsOriginalFilter] = useState<string>('')

  // UI 状态
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [filtersExpanded, setFiltersExpanded] = useState(true)

  // 权限检查
  const isAdmin = useAuthStore((state) => state.auth.isAdmin())

  // 表格状态
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>(defaultColumnVisibility)
  const [columnOrder, setColumnOrder] = useState<string[]>(defaultColumnOrder)

  // API Hooks
  const {
    data: articlesData,
    isLoading: articlesLoading,
    isFetching: articlesFetching,
    refetch: refetchArticles,
  } = useWechatArticles(filters)
  const { data: filterOptions } = useArticleFilterOptions()
  const deleteMutation = useDeleteArticles()

  // 重置筛选条件
  const handleResetFilters = useCallback(() => {
    setAccountNameFilter('')
    setTitleFilter('')
    setStartTime(undefined)
    setEndTime(undefined)
    setIsOriginalFilter('')
    setFilters({ page: 1, page_size: filters.page_size || 20 })
    toast.success('已重置筛选条件')
  }, [filters.page_size])

  // 表格列
  const columns = useMemo(() => getColumns(), [])

  // 稳定的数据引用
  const tableData = useMemo(
    () => articlesData?.items || [],
    [articlesData?.items]
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

  // 获取选中的行数
  const selectedRowCount = Object.keys(rowSelection).length

  // 搜索
  const handleSearch = () => {
    setFilters({
      ...filters,
      page: 1,
      account_name: accountNameFilter || undefined,
      title: titleFilter || undefined,
      start_time: startTime ? format(startTime, 'yyyy-MM-dd') : undefined,
      end_time: endTime ? format(endTime, 'yyyy-MM-dd') : undefined,
      is_original:
        isOriginalFilter === 'true'
          ? true
          : isOriginalFilter === 'false'
            ? false
            : undefined,
    })
  }

  // 删除选中的文章
  const handleDelete = async () => {
    const selectedIds = Object.keys(rowSelection).map(Number)
    if (selectedIds.length === 0) return

    try {
      const result = await deleteMutation.mutateAsync(selectedIds)
      if (result.deleted_count === 0) {
        toast.warning('没有文章被删除')
      } else {
        toast.success(`成功删除 ${result.deleted_count} 篇文章`)
      }
      setRowSelection({})
      setShowDeleteDialog(false)
    } catch {
      toast.error('删除失败')
    }
  }

  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-4'>
          <h1 className='text-xl font-semibold'>公众号文章</h1>
        </div>
      </Header>

      <Main fixed className='min-h-0'>
        <DataPageContent
          toolbar={
            <div className='flex w-full flex-col gap-3'>
              {/* 筛选区标题栏 */}
              <div className='flex items-center justify-between'>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => setFiltersExpanded(!filtersExpanded)}
                  className='gap-2 px-2'
                >
                  <Filter className='h-4 w-4' />
                  <span className='text-sm font-medium'>筛选条件</span>
                  {filtersExpanded ? (
                    <ChevronUp className='h-4 w-4' />
                  ) : (
                    <ChevronDown className='h-4 w-4' />
                  )}
                </Button>
                <div className='flex items-center gap-2'>
                  <Button onClick={handleSearch}>
                    <Search className='mr-2 h-4 w-4' />
                    查询
                  </Button>
                  <Button variant='outline' onClick={handleResetFilters}>
                    <FilterX className='mr-2 h-4 w-4' />
                    重置
                  </Button>
                </div>
              </div>

              {/* 可折叠的筛选条件区 */}
              {filtersExpanded && (
                <div className='flex flex-col gap-2 rounded-md border bg-muted/30 p-3'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <Select
                      value={accountNameFilter}
                      onValueChange={setAccountNameFilter}
                    >
                      <SelectTrigger className='w-[150px]'>
                        <SelectValue placeholder='公众号' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='all'>全部</SelectItem>
                        {filterOptions?.account_names.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder='标题关键词'
                      value={titleFilter}
                      onChange={(e) => setTitleFilter(e.target.value)}
                      className='w-[200px]'
                    />
                    <Select
                      value={isOriginalFilter}
                      onValueChange={setIsOriginalFilter}
                    >
                      <SelectTrigger className='w-[100px]'>
                        <SelectValue placeholder='原创' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='all'>全部</SelectItem>
                        <SelectItem value='true'>原创</SelectItem>
                        <SelectItem value='false'>非原创</SelectItem>
                      </SelectContent>
                    </Select>
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
                  </div>
                </div>
              )}

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
                  onClick={() => refetchArticles()}
                  disabled={articlesFetching}
                  title='刷新数据'
                >
                  {articlesFetching ? (
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
            articlesData && (
              <SimplePagination
                page={filters.page || 1}
                pageSize={filters.page_size || 20}
                total={articlesData.total}
                totalPages={articlesData.pages}
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
              {articlesLoading ? (
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
        </DataPageContent>
      </Main>

      {/* 删除确认对话框 */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除选中的 {selectedRowCount} 篇文章吗？此操作无法撤销。
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
