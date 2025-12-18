# 可复用数据表格页面布局规范

> 基于 DataForge 项目的 `/analysis` 页面提取，使用 React + TanStack Table + shadcn/ui 技术栈

## 1. 整体页面结构

```
┌─────────────────────────────────────────────────────────┐
│ Header (固定顶部)                                        │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 页面标题                                             │ │
│ └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ Main (flex-1, 自适应高度)                                │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 页面描述                                             │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ 工具栏 (筛选器 + 操作按钮)                            │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │                                                     │ │
│ │ 数据表格 (flex-1, overflow-auto)                     │ │
│ │                                                     │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ 分页器 (固定底部)                                    │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## 2. 核心布局代码

### 2.1 页面入口组件

```tsx
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'

export function DataPage() {
  return (
    <Provider>
      {/* 固定头部 */}
      <Header fixed>
        <h1 className='text-xl font-semibold'>页面标题</h1>
      </Header>

      {/* 主内容区域 - fixed 使其填充剩余高度 */}
      <Main fixed className='min-h-0'>
        <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-hidden'>
          <p className='text-muted-foreground text-sm mb-2'>
            页面描述文字
          </p>
          <DataTable />
        </div>
      </Main>

      <Dialogs />
    </Provider>
  )
}
```

### 2.2 Header 组件

```tsx
// components/layout/header.tsx
type HeaderProps = React.HTMLAttributes<HTMLElement> & {
  fixed?: boolean
}

export function Header({ className, fixed, children, ...props }: HeaderProps) {
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      setOffset(document.body.scrollTop || document.documentElement.scrollTop)
    }
    document.addEventListener('scroll', onScroll, { passive: true })
    return () => document.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'z-50 h-16',
        fixed && 'header-fixed peer/header sticky top-0 w-[inherit]',
        offset > 10 && fixed ? 'shadow' : 'shadow-none',
        className
      )}
      {...props}
    >
      <div className={cn(
        'relative flex h-full items-center gap-3 p-4 sm:gap-4',
        offset > 10 && fixed &&
          'after:bg-background/20 after:absolute after:inset-0 after:-z-10 after:backdrop-blur-lg'
      )}>
        {children}
      </div>
    </header>
  )
}
```

### 2.3 Main 组件

```tsx
// components/layout/main.tsx
type MainProps = React.HTMLAttributes<HTMLElement> & {
  fixed?: boolean
  fluid?: boolean
}

export function Main({ fixed, className, fluid, ...props }: MainProps) {
  return (
    <main
      data-layout={fixed ? 'fixed' : 'auto'}
      className={cn(
        'px-4 py-6',
        // fixed 模式下填充剩余空间
        fixed && 'flex grow flex-col overflow-hidden',
        // 非 fluid 模式下设置最大宽度
        !fluid && '@7xl/content:mx-auto @7xl/content:w-full @7xl/content:max-w-screen-2xl',
        className
      )}
      {...props}
    />
  )
}
```

## 3. 数据表格组件

### 3.1 表格容器布局

```tsx
export function DataTable() {
  return (
    <div className='flex flex-1 flex-col gap-4 overflow-hidden'>
      {/* 工具栏 - 不可收缩 */}
      <div className='flex flex-shrink-0 flex-col gap-3'>
        <div className='flex flex-wrap items-center gap-2'>
          {/* 筛选器按钮组 */}
          <FilterButton />
          <FilterButton />

          {/* 弹性空间 */}
          <div className='flex-1' />

          {/* 操作按钮组 */}
          <ActionButton />
          <DataTableViewOptions table={table} />
        </div>
      </div>

      {/* 表格 - 自适应高度，可滚动 */}
      <div className='min-h-0 flex-1 overflow-auto rounded-md border'>
        <table className='w-full caption-bottom text-sm'>
          <thead className='bg-card sticky top-0 z-10 [&_tr]:border-b'>
            {/* 表头 */}
          </thead>
          <tbody className='[&_tr:last-child]:border-0'>
            {/* 表格行 */}
          </tbody>
        </table>
      </div>

      {/* 分页器 - 固定底部 */}
      <div className='mt-auto flex-shrink-0'>
        <SimplePagination {...paginationProps} />
      </div>
    </div>
  )
}
```

### 3.2 TanStack Table 配置

```tsx
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'

// 表格状态
const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
const [sorting, setSorting] = useState<SortingState>([])
const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(defaultColumnVisibility)
const [columnOrder, setColumnOrder] = useState<string[]>(defaultColumnOrder)

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
```

### 3.3 表格行样式

```tsx
// 表格行
<tr
  data-state={row.getIsSelected() && 'selected'}
  className='hover:bg-muted/50 border-b transition-colors data-[state=selected]:bg-muted'
>
  {row.getVisibleCells().map((cell) => (
    <td key={cell.id} className='p-2 align-middle whitespace-nowrap'>
      {flexRender(cell.column.columnDef.cell, cell.getContext())}
    </td>
  ))}
</tr>

// 表头
<th className='text-foreground bg-card h-10 px-2 text-start align-middle font-medium whitespace-nowrap'>
  {flexRender(header.column.columnDef.header, header.getContext())}
</th>
```

## 4. 列定义规范

### 4.1 列配置结构

```tsx
// data-table-columns.tsx
import { type ColumnDef } from '@tanstack/react-table'
import { DataTableColumnHeader, createSelectColumn } from '@/components/data-table'

// 列名映射（用于显示中文名）
export const columnNames: Record<string, string> = {
  select: '选择',
  name: '名称',
  status: '状态',
  created_at: '创建时间',
}

// 默认列顺序
export const defaultColumnOrder = ['select', 'name', 'status', 'created_at']

// 默认列可见性
export const defaultColumnVisibility: Record<string, boolean> = {
  select: true,
  name: true,
  status: true,
  created_at: false, // 默认隐藏
}

export function getColumns(options: ColumnOptions): ColumnDef<DataType>[] {
  return [
    // 选择列（固定宽度）
    createSelectColumn<DataType>(),

    // 普通列
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='名称' />
      ),
      cell: ({ row }) => (
        <span className='block max-w-[120px] truncate'>
          {row.original.name || '-'}
        </span>
      ),
      enableSorting: true,
      enableHiding: true,
      size: 120,
    },

    // Badge 列
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='状态' />
      ),
      cell: ({ row }) => {
        const status = row.original.status
        const info = statusMap[status]
        return <Badge variant={info.variant}>{info.label}</Badge>
      },
      enableSorting: true,
      enableHiding: true,
      size: 80,
    },
  ]
}
```

### 4.2 选择列组件

```tsx
// components/data-table/select-column.tsx
import { type ColumnDef } from '@tanstack/react-table'
import { Checkbox } from '@/components/ui/checkbox'

export function createSelectColumn<TData>(): ColumnDef<TData> {
  return {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label='Select all'
        className='translate-y-[2px]'
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label='Select row'
        className='translate-y-[2px]'
      />
    ),
    size: 40,
    minSize: 40,
    maxSize: 40,
    enableResizing: false,
    enableSorting: false,
    enableHiding: false,
  }
}
```

### 4.3 列头组件

```tsx
// components/data-table/column-header.tsx
import { ArrowDownIcon, ArrowUpIcon, CaretSortIcon, EyeNoneIcon } from '@radix-ui/react-icons'
import { type Column } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: {
  column: Column<TData, TValue>
  title: string
  className?: string
}) {
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='sm' className='data-[state=open]:bg-accent h-8'>
          <span>{title}</span>
          {column.getIsSorted() === 'desc' ? (
            <ArrowDownIcon className='ms-2 h-4 w-4' />
          ) : column.getIsSorted() === 'asc' ? (
            <ArrowUpIcon className='ms-2 h-4 w-4' />
          ) : (
            <CaretSortIcon className='ms-2 h-4 w-4' />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start'>
        <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
          <ArrowUpIcon className='size-3.5' /> Asc
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
          <ArrowDownIcon className='size-3.5' /> Desc
        </DropdownMenuItem>
        {column.getCanHide() && (
          <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
            <EyeNoneIcon className='size-3.5' /> Hide
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

## 5. 分页器组件

### 5.1 SimplePagination（服务端分页）

适用于使用 `useState` 管理分页状态，配合服务端分页 API 使用。

```tsx
// components/data-table/simple-pagination.tsx
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface SimplePaginationProps {
  page: number
  pageSize: number
  total: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: number[]
}

export function SimplePagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}: SimplePaginationProps) {
  const pageNumbers = getPageNumbers(page, totalPages)

  return (
    <div className='flex items-center justify-between'>
      {/* 左侧：总数和每页条数 */}
      <div className='flex items-center gap-4'>
        <div className='text-muted-foreground text-sm'>共 {total} 条记录</div>
        {onPageSizeChange && (
          <div className='flex items-center gap-2'>
            <span className='text-muted-foreground text-sm'>每页</span>
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
              <SelectTrigger className='h-8 w-[80px]'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className='text-muted-foreground text-sm'>条</span>
          </div>
        )}
      </div>

      {/* 右侧：页码按钮 */}
      <div className='flex items-center gap-1'>
        <Button variant='outline' size='icon' className='h-8 w-8'
          onClick={() => onPageChange(1)} disabled={page <= 1}>
          <ChevronsLeft className='h-4 w-4' />
        </Button>
        <Button variant='outline' size='icon' className='h-8 w-8'
          onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          <ChevronLeft className='h-4 w-4' />
        </Button>

        {pageNumbers.map((pageNumber, index) => (
          <div key={`${pageNumber}-${index}`}>
            {pageNumber === '...' ? (
              <span className='text-muted-foreground px-2 text-sm'>...</span>
            ) : (
              <Button
                variant={page === pageNumber ? 'default' : 'outline'}
                className='h-8 min-w-11 px-2.5'
                onClick={() => onPageChange(pageNumber as number)}
              >
                {pageNumber}
              </Button>
            )}
          </div>
        ))}

        <Button variant='outline' size='icon' className='h-8 w-8'
          onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
          <ChevronRight className='h-4 w-4' />
        </Button>
        <Button variant='outline' size='icon' className='h-8 w-8'
          onClick={() => onPageChange(totalPages)} disabled={page >= totalPages}>
          <ChevronsRight className='h-4 w-4' />
        </Button>

        <span className='text-muted-foreground ml-2 text-sm'>
          第 {page} / {totalPages} 页
        </span>
      </div>
    </div>
  )
}
```

### 5.2 页码生成算法

```tsx
// lib/utils.ts
/**
 * 生成带省略号的页码数组
 * @param currentPage - 当前页码 (1-based)
 * @param totalPages - 总页数
 * @returns 页码数组，包含数字和 '...'
 *
 * 示例:
 * - 小数据集 (≤5 页): [1, 2, 3, 4, 5]
 * - 靠近开头: [1, 2, 3, 4, '...', 10]
 * - 在中间: [1, '...', 4, 5, 6, '...', 10]
 * - 靠近结尾: [1, '...', 7, 8, 9, 10]
 */
export function getPageNumbers(currentPage: number, totalPages: number) {
  const maxVisiblePages = 5
  const rangeWithDots: (number | '...')[] = []

  if (totalPages <= maxVisiblePages) {
    for (let i = 1; i <= totalPages; i++) {
      rangeWithDots.push(i)
    }
  } else {
    rangeWithDots.push(1)

    if (currentPage <= 3) {
      // 靠近开头
      for (let i = 2; i <= 4; i++) {
        rangeWithDots.push(i)
      }
      rangeWithDots.push('...', totalPages)
    } else if (currentPage >= totalPages - 2) {
      // 靠近结尾
      rangeWithDots.push('...')
      for (let i = totalPages - 3; i <= totalPages; i++) {
        rangeWithDots.push(i)
      }
    } else {
      // 在中间
      rangeWithDots.push('...')
      for (let i = currentPage - 1; i <= currentPage + 1; i++) {
        rangeWithDots.push(i)
      }
      rangeWithDots.push('...', totalPages)
    }
  }

  return rangeWithDots
}
```

## 6. 筛选器组件

### 6.1 服务端筛选器

```tsx
interface ServerSideFilterProps {
  title: string
  value: string | undefined
  options: { label: string; value: string; icon?: React.ComponentType }[]
  onChange: (value: string | undefined) => void
}

function ServerSideFilter({ title, value, options, onChange }: ServerSideFilterProps) {
  const selectedOption = options.find((opt) => opt.value === value)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant='outline' size='sm' className='h-8 border-dashed'>
          <PlusCircle className='mr-2 h-4 w-4' />
          {title}
          {selectedOption && (
            <>
              <Separator orientation='vertical' className='mx-2 h-4' />
              <Badge variant='secondary' className='rounded-sm px-1 font-normal'>
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
                    onSelect={() => onChange(isSelected ? undefined : option.value)}
                  >
                    <div className={cn(
                      'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                      isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50 [&_svg]:invisible'
                    )}>
                      <Check className='h-4 w-4' />
                    </div>
                    <span>{option.label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {value && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onChange(undefined)} className='justify-center'>
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
```

### 6.2 日期范围选择器

```tsx
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'

const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({})

<Popover>
  <PopoverTrigger asChild>
    <Button
      variant='outline'
      size='sm'
      className={cn('h-8 justify-start text-left font-normal', !dateRange.from && 'text-muted-foreground')}
    >
      <CalendarIcon className='mr-2 h-4 w-4' />
      {dateRange.from ? (
        dateRange.to ? (
          `${format(dateRange.from, 'MM/dd')} - ${format(dateRange.to, 'MM/dd')}`
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
```

## 7. 列可见性控制

```tsx
// components/data-table/view-options.tsx
import { MixerHorizontalIcon } from '@radix-ui/react-icons'
import { type Table } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export function DataTableViewOptions<TData>({
  table,
  columnNames,
}: {
  table: Table<TData>
  columnNames?: Record<string, string>
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' size='sm' className='ms-auto hidden h-8 lg:flex'>
          <MixerHorizontalIcon className='size-4' />
          显示列
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-[150px]'>
        {table
          .getAllColumns()
          .filter((column) => typeof column.accessorFn !== 'undefined' && column.getCanHide())
          .map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={column.getIsVisible()}
              onCheckedChange={(value) => column.toggleVisibility(!!value)}
            >
              {columnNames?.[column.id] || column.id}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

## 8. 加载骨架屏

```tsx
import { Skeleton } from '@/components/ui/skeleton'

// 加载状态
{isLoading ? (
  Array.from({ length: 10 }).map((_, i) => (
    <tr key={i} className='hover:bg-muted/50 border-b transition-colors'>
      {columns.map((_, j) => (
        <td key={j} className='p-2 align-middle whitespace-nowrap'>
          <Skeleton className='h-4 w-full' />
        </td>
      ))}
    </tr>
  ))
) : (
  // 实际数据
)}
```

## 9. 依赖清单

```json
{
  "dependencies": {
    "@tanstack/react-table": "^8.x",
    "@radix-ui/react-icons": "^1.x",
    "lucide-react": "^0.x",
    "date-fns": "^3.x",
    "clsx": "^2.x",
    "tailwind-merge": "^2.x"
  }
}
```

## 10. 文件结构建议

```
src/
├── components/
│   ├── data-table/
│   │   ├── index.ts              # 导出所有组件
│   │   ├── column-header.tsx     # 列头（排序、隐藏）
│   │   ├── select-column.tsx     # 选择列
│   │   ├── simple-pagination.tsx # 服务端分页
│   │   ├── pagination.tsx        # 客户端分页
│   │   ├── view-options.tsx      # 列可见性
│   │   └── faceted-filter.tsx    # 分面筛选
│   ├── layout/
│   │   ├── header.tsx
│   │   └── main.tsx
│   └── ui/                       # shadcn/ui 组件
├── features/
│   └── [feature-name]/
│       ├── index.tsx             # 页面入口
│       ├── components/
│       │   ├── data-table.tsx    # 表格组件
│       │   └── columns.tsx       # 列定义
│       ├── api/
│       │   └── index.ts          # API hooks
│       └── types.ts              # 类型定义
└── lib/
    └── utils.ts                  # 工具函数（cn, getPageNumbers）
```

## 11. 关键样式类

| 类名 | 用途 |
|------|------|
| `flex flex-1 flex-col overflow-hidden` | 容器填充剩余空间 |
| `min-h-0 flex-1 overflow-auto` | 表格区域可滚动 |
| `flex-shrink-0` | 工具栏/分页器不收缩 |
| `mt-auto` | 分页器固定底部 |
| `sticky top-0 z-10` | 表头固定 |
| `hover:bg-muted/50` | 行悬停效果 |
| `data-[state=selected]:bg-muted` | 选中行高亮 |
| `whitespace-nowrap` | 单元格不换行 |
| `max-w-[120px] truncate` | 文字截断 |
