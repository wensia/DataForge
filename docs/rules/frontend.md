# 前端开发规则

> React 18 + Vite + shadcn/ui + TanStack

## 技术栈

| 组件 | 技术 |
|------|------|
| 框架 | React 18 (Hooks) |
| 构建工具 | Vite |
| UI 组件库 | shadcn/ui |
| 图标库 | Lucide React |
| 状态管理 | TanStack Query |
| 表格 | TanStack Table |
| 路由 | TanStack Router |
| 样式 | Tailwind CSS |
| 格式化 | ESLint + Prettier |

## 项目结构

```
frontend-react/
├── src/
│   ├── main.tsx              # 应用入口
│   ├── routes.tsx            # 路由配置
│   ├── components/           # shadcn/ui 组件
│   │   ├── ui/               # 基础 UI 组件
│   │   └── layout/           # 布局组件 (Header, Main, Sidebar)
│   ├── features/             # 功能模块
│   │   ├── analysis/         # 数据分析模块
│   │   │   ├── index.tsx     # 页面组件
│   │   │   ├── api/          # API Hooks
│   │   │   ├── components/   # 模块专用组件
│   │   │   └── types.ts      # 类型定义
│   │   └── ...
│   ├── hooks/                # 全局自定义 Hooks
│   ├── lib/                  # 工具库
│   │   ├── api-client.ts     # Axios 实例
│   │   ├── utils.ts          # 工具函数
│   │   └── types.ts          # 全局类型
│   └── styles/               # 全局样式
│       ├── index.css         # 入口样式
│       └── theme.css         # 主题变量
├── components.json           # shadcn/ui 配置
├── tailwind.config.js
├── vite.config.ts
└── package.json
```

## shadcn/ui 使用规范

### 安装组件

```bash
# 使用 CLI 安装组件
npx shadcn@latest add button
npx shadcn@latest add table
npx shadcn@latest add dialog
```

### 组件使用示例

```tsx
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

// 按钮变体
<Button>默认按钮</Button>
<Button variant="outline">线框按钮</Button>
<Button variant="destructive">危险按钮</Button>
<Button size="icon"><SearchIcon /></Button>

// 下拉选择
<Select value={value} onValueChange={setValue}>
  <SelectTrigger className="w-[120px]">
    <SelectValue placeholder="选择..." />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">全部</SelectItem>
    <SelectItem value="option1">选项1</SelectItem>
  </SelectContent>
</Select>
```

### 图标使用

使用 Lucide React 图标库：

```tsx
import { Search, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'

<Button>
  <Search className="mr-2 h-4 w-4" />
  搜索
</Button>

// 加载状态
<Button disabled>
  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  加载中
</Button>
```

## TanStack Query 规范

### Query Keys 组织（重要）

**禁止**将整个对象直接作为 Query Key 的一部分，这可能导致无限循环请求：

```typescript
// ❌ 错误：直接传递整个 params 对象
list: (params?: ArticleParams) => [...keys.all, 'list', params] as const

// ✅ 正确：扁平化参数
list: (params?: ArticleParams) => [
  ...keys.all,
  'list',
  params?.page,
  params?.page_size,
  params?.search,
] as const

// ✅ 或者使用 JSON 序列化（确保稳定）
list: (params?: ArticleParams) => [
  ...keys.all,
  'list',
  JSON.stringify(params),
] as const
```

**推荐示例**：

```typescript
// features/analysis/api/index.ts
export const analysisKeys = {
  all: ['analysis'] as const,
  records: (params?: RecordsParams) => [...analysisKeys.all, 'records', params] as const,
  stats: (params?: StatsParams) => [...analysisKeys.all, 'stats', params] as const,
  providers: () => [...analysisKeys.all, 'providers'] as const,
}
```

### 错误重试配置

业务错误码（如 400、404）不应触发自动重试。全局配置已在 `main.tsx` 中设置：

```typescript
// main.tsx 中的 retry 配置
retry: (failureCount, error) => {
  // 开发环境不重试
  if (import.meta.env.DEV) return false

  // 生产环境最多重试 3 次
  if (failureCount > 3) return false

  // 不重试业务错误
  if (error instanceof AxiosError) {
    const httpStatus = error.response?.status ?? 0
    const businessCode = error.code ? parseInt(error.code, 10) : 0

    if ([401, 403].includes(httpStatus)) return false
    if ([400, 404].includes(businessCode)) return false
  }

  return true
},
```

### 避免循环渲染

使用 `useMemo` 稳定化传递给 Query 的参数：

```typescript
// ✅ 正确：使用 useMemo 稳定化参数
const stableParams = useMemo(() => ({
  page: filters.page,
  page_size: filters.page_size,
}), [filters.page, filters.page_size])

const { data } = useQuery({
  queryKey: ['items', stableParams],
  queryFn: () => fetchItems(stableParams),
})

// ✅ 或者直接使用原始值
const { data } = useQuery({
  queryKey: ['items', 'list', filters.page, filters.page_size],
  queryFn: () => fetchItems(filters),
})
```

### useQuery Hook

```typescript
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { ApiResponse } from '@/lib/types'

export function useRecords(params: RecordsParams = {}) {
  return useQuery({
    queryKey: analysisKeys.records(params),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<PaginatedResponse<CallRecord>>>(
        '/analysis/records',
        { params }
      )
      return response.data.data
    },
  })
}
```

### useMutation Hook

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'

export function useSyncData() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<ApiResponse<SyncResult>>('/analysis/sync')
      return response.data.data
    },
    onSuccess: () => {
      // 刷新相关查询
      queryClient.invalidateQueries({ queryKey: analysisKeys.records() })
      queryClient.invalidateQueries({ queryKey: analysisKeys.stats() })
    },
  })
}
```

## TanStack Table 规范

### 选择列（固定宽度）

使用 `createSelectColumn<T>()` 工具函数创建固定宽度的多选列：

```tsx
import { createSelectColumn } from '@/components/data-table'

export const columns: ColumnDef<MyData>[] = [
  createSelectColumn<MyData>(),
  // 其他列...
]

// 带额外配置（如响应式布局）
createSelectColumn<MyData>({
  meta: {
    className: cn('max-md:sticky start-0 z-10'),
  },
})
```

**特性**：
- 固定 40px 宽度，不可调整
- 支持全选/取消全选
- 支持单行选择
- 禁用排序和隐藏

**组件路径**: `@/components/data-table/select-column.tsx`

### 列定义

```typescript
// features/analysis/components/data-table-columns.tsx
import { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import type { CallRecord } from '../types'

export function getColumns(options: ColumnOptions): ColumnDef<CallRecord>[] {
  return [
    {
      accessorKey: 'call_time',
      header: '通话时间',
      cell: ({ row }) => formatDate(row.getValue('call_time')),
    },
    {
      accessorKey: 'call_type',
      header: '类型',
      cell: ({ row }) => {
        const type = row.getValue('call_type') as string
        const config = callTypeMap[type]
        return <Badge variant={config?.variant}>{config?.label || type}</Badge>
      },
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <Button size="sm" onClick={() => options.onPlayAudio(row.original.record_url)}>
          播放
        </Button>
      ),
    },
  ]
}
```

### 表格实例

```typescript
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'

const table = useReactTable({
  data: recordsData?.items || [],
  columns,
  getCoreRowModel: getCoreRowModel(),
})

// 渲染表格
<Table>
  <TableHeader>
    {table.getHeaderGroups().map((headerGroup) => (
      <TableRow key={headerGroup.id}>
        {headerGroup.headers.map((header) => (
          <TableHead key={header.id}>
            {flexRender(header.column.columnDef.header, header.getContext())}
          </TableHead>
        ))}
      </TableRow>
    ))}
  </TableHeader>
  <TableBody>
    {table.getRowModel().rows.map((row) => (
      <TableRow key={row.id}>
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
    ))}
  </TableBody>
</Table>
```

### 列宽拖拽调整

使用 `ResizableTable` 组件实现列宽可拖拽调整：

```tsx
import { ResizableTable } from '@/components/data-table'

// 1. 启用列宽调整
const table = useReactTable({
  data,
  columns,
  getCoreRowModel: getCoreRowModel(),
  enableColumnResizing: true,
  columnResizeMode: 'onChange',
})

// 2. 使用 ResizableTable 替代普通 Table
<ResizableTable table={table} />
```

**列宽配置**：

```tsx
const columns: ColumnDef<MyData>[] = [
  {
    accessorKey: 'name',
    header: '名称',
    size: 150,           // 默认宽度
    minSize: 100,        // 最小宽度
    maxSize: 300,        // 最大宽度
    enableResizing: true, // 默认为 true
  },
  {
    id: 'select',
    size: 40,
    minSize: 40,
    maxSize: 40,
    enableResizing: false, // 禁用调整（固定宽度）
  },
]
```

**组件路径**: `@/components/data-table/resizable-table.tsx`

## 数据表页面布局模板

所有包含数据表的页面应使用统一的布局结构，确保表格正确滚动和分页组件一致。

### 核心组件

| 组件 | 路径 | 说明 |
|------|------|------|
| `DataPageContent` | `@/components/layout/data-page-layout` | 数据页面内容布局 |
| `SimplePagination` | `@/components/data-table` | 手动分页组件 |

### 完整页面模板

```tsx
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { DataPageContent } from '@/components/layout/data-page-layout'
import { SimplePagination } from '@/components/data-table'

export function DataTablePage() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const { data, isLoading } = useData({ page, page_size: pageSize })

  return (
    <>
      <Header fixed>
        <h1 className="text-xl font-semibold">页面标题</h1>
        <div className="ms-auto flex items-center gap-2">
          {/* 右侧操作按钮 */}
        </div>
      </Header>

      <Main fixed className="min-h-0">
        <DataPageContent
          toolbar={
            <>
              {/* 筛选条件 */}
              <Select>...</Select>
              <Input placeholder="搜索..." />
              <Button>查询</Button>
              <div className="flex-1" />
              {/* 右侧工具 */}
              <Button variant="outline">刷新</Button>
            </>
          }
          pagination={
            data && (
              <SimplePagination
                page={page}
                pageSize={pageSize}
                total={data.total}
                totalPages={data.pages}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size)
                  setPage(1)
                }}
              />
            )
          }
        >
          {/* 表格内容 */}
          <Table>
            <TableHeader>...</TableHeader>
            <TableBody>
              {isLoading ? (
                // 骨架屏
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : data?.items.length ? (
                // 数据行
                data.items.map((item) => (
                  <TableRow key={item.id}>...</TableRow>
                ))
              ) : (
                // 空状态
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    暂无数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DataPageContent>
      </Main>
    </>
  )
}
```

### 关键布局类

```tsx
// Main 组件必须添加这两个类
<Main fixed className="min-h-0">

// DataPageContent 内部结构（自动应用）
<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
  {toolbar}
  <div className="flex min-h-0 flex-1 flex-col rounded-md border shadow-sm overflow-hidden">
    <div className="flex-1 overflow-auto">
      {children}
    </div>
  </div>
  {pagination}
</div>
```

### SimplePagination Props

| 属性 | 类型 | 说明 |
|------|------|------|
| `page` | `number` | 当前页码 |
| `pageSize` | `number` | 每页条数 |
| `total` | `number` | 总记录数 |
| `totalPages` | `number` | 总页数 |
| `onPageChange` | `(page: number) => void` | 页码变化回调 |
| `onPageSizeChange` | `(size: number) => void` | 每页条数变化回调（可选） |
| `pageSizeOptions` | `number[]` | 每页条数选项，默认 `[10, 20, 50, 100]` |

### 简化布局（无分页）

对于使用 TanStack Table 内置分页或无分页的页面：

```tsx
<Main fixed className="min-h-0">
  <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
    <div className="flex flex-wrap items-end justify-between gap-2">
      {/* 工具栏 */}
    </div>
    <YourTableComponent />
  </div>
</Main>
```

### 已使用此模板的页面

- `features/analysis/index.tsx` - 数据浏览
- `features/task-executions/index.tsx` - 任务执行记录
- `features/tasks/index.tsx` - 任务管理
- `features/accounts/index.tsx` - 账号管理

## 表格单元格截断与 Tooltip

当表格列宽有限导致内容被截断时，使用 `TruncatedCell` 组件自动检测并显示完整内容的 Tooltip。

### 组件

| 组件 | 路径 | 说明 |
|------|------|------|
| `TruncatedCell` | `@/components/data-table` | 表格专用截断组件 |
| `TruncatedText` | `@/components/ui/truncated-text` | 通用截断组件 |

### 在列定义中使用

```tsx
import { TruncatedCell } from '@/components/data-table'

const columns: ColumnDef<MyData>[] = [
  {
    accessorKey: 'name',
    header: '名称',
    cell: ({ row }) => (
      <TruncatedCell maxWidth={150}>
        {row.getValue('name')}
      </TruncatedCell>
    ),
  },
  {
    accessorKey: 'description',
    header: '描述',
    cell: ({ row }) => (
      <TruncatedCell maxWidth={200}>
        {row.getValue('description')}
      </TruncatedCell>
    ),
  },
  {
    accessorKey: 'error_message',
    header: '错误信息',
    cell: ({ row }) => (
      <TruncatedCell
        maxWidth={250}
        tooltipContent={<pre className="text-xs">{row.original.error_message}</pre>}
      >
        {row.original.error_message}
      </TruncatedCell>
    ),
  },
]
```

### TruncatedCell Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `children` | `ReactNode` | - | 显示的内容 |
| `maxWidth` | `number` | `200` | 最大宽度（px） |
| `tooltipContent` | `ReactNode` | `children` | 自定义 Tooltip 内容 |
| `className` | `string` | - | 额外的 CSS 类 |

### 工作原理

组件会自动检测内容是否被截断（`scrollWidth > clientWidth`）：
- **未截断**：正常显示文本
- **已截断**：显示截断文本 + 悬浮 Tooltip

### 通用场景

对于非表格场景，使用 `TruncatedText` 组件：

```tsx
import { TruncatedText } from '@/components/ui/truncated-text'

<TruncatedText className="max-w-[200px]">
  这是一段很长的文本内容，可能会被截断...
</TruncatedText>
```

## 全局样式配置

### styles/index.css

```css
@import 'tailwindcss';
@import 'tw-animate-css';
@import './theme.css';

@custom-variant dark (&:is(.dark *));

@layer base {
  * {
    @apply border-border;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }

  /* 移除所有焦点样式 */
  *:focus,
  *:focus-visible {
    outline: none !important;
    box-shadow: none !important;
  }

  html {
    @apply overflow-x-hidden;
  }

  body {
    @apply bg-background text-foreground min-h-svh w-full;
  }

  /* 按钮默认指针样式 */
  button:not(:disabled),
  [role='button']:not(:disabled) {
    cursor: pointer;
  }

  /* 移动端防止输入框缩放 */
  @media screen and (max-width: 767px) {
    input,
    select,
    textarea {
      font-size: 16px !important;
    }
  }
}

@utility no-scrollbar {
  &::-webkit-scrollbar {
    display: none;
  }
  -ms-overflow-style: none;
  scrollbar-width: none;
}
```

## 抽屉组件复用模式

### 新建/编辑/复制共用抽屉

使用 `isCopy` 属性区分复制模式和编辑模式：

```tsx
// types
type DialogType = 'add' | 'edit' | 'copy' | 'delete'

// 抽屉组件
interface MutateDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: MyData | null
  isCopy?: boolean  // 区分复制和编辑
}

function MutateDrawer({ open, onOpenChange, currentRow, isCopy }: MutateDrawerProps) {
  // 编辑模式：有 currentRow 且不是复制
  const isUpdate = !!currentRow && !isCopy

  // 表单默认值
  const defaultValues = currentRow
    ? {
        ...currentRow,
        name: isCopy ? `${currentRow.name}（副本）` : currentRow.name,
      }
    : { name: '' }

  // 标题和描述
  const title = isCopy ? '复制任务' : isUpdate ? '编辑任务' : '新建任务'
  const description = isCopy
    ? '基于现有任务创建副本'
    : isUpdate
      ? '修改任务配置'
      : '创建新任务'

  // 提交逻辑
  const onSubmit = (data: FormData) => {
    if (isUpdate) {
      updateMutation.mutate({ id: currentRow.id, data })
    } else {
      createMutation.mutate(data)  // 新建和复制都走创建接口
    }
  }
}

// 调用方
<MutateDrawer
  open={type === 'edit' || type === 'copy'}
  onOpenChange={(open) => !open && setType(null)}
  currentRow={currentRow}
  isCopy={type === 'copy'}  // 复制模式
/>
```

## 常用模式

### 1. 页面组件结构

```tsx
// features/analysis/index.tsx
export function DataAnalysis() {
  // 筛选状态
  const [filters, setFilters] = useState<RecordsParams>({
    page: 1,
    page_size: 20,
  })
  const [sourceFilter, setSourceFilter] = useState<string>('')

  // API Hooks
  const { data: recordsData, isLoading } = useRecords(filters)
  const { data: filterOptions } = useFilterOptions()
  const syncMutation = useSyncData()

  // 事件处理
  const handleSearch = () => {
    setFilters({
      ...filters,
      page: 1,
      source: sourceFilter && sourceFilter !== 'all' ? sourceFilter : undefined,
    })
  }

  return (
    <>
      <Header fixed>
        <h1>数据浏览</h1>
        <Button onClick={() => syncMutation.mutateAsync()}>
          {syncMutation.isPending ? <Loader2 className="animate-spin" /> : null}
          同步数据
        </Button>
      </Header>

      <Main fixed className="min-h-0">
        {/* 筛选器 */}
        <div className="flex gap-2">
          <Select value={sourceFilter} onValueChange={setSourceFilter}>...</Select>
          <Button onClick={handleSearch}>查询</Button>
        </div>

        {/* 数据表格 */}
        <div className="flex-1 overflow-auto">
          <Table>...</Table>
        </div>

        {/* 分页 */}
        {recordsData && <Pagination ... />}
      </Main>

      {/* 弹窗 */}
      <Dialog>...</Dialog>
    </>
  )
}
```

### 2. 筛选器模式

```tsx
// 下拉选择 + 类型映射
const callTypeMap = {
  inbound: { label: '呼入', variant: 'secondary' },
  outbound: { label: '呼出', variant: 'default' },
}

<Select value={callTypeFilter} onValueChange={setCallTypeFilter}>
  <SelectTrigger className="w-[100px]">
    <SelectValue placeholder="类型" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">全部</SelectItem>
    {Object.entries(callTypeMap).map(([key, { label }]) => (
      <SelectItem key={key} value={key}>{label}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

### 3. 分页组件模式

```tsx
import { getPageNumbers } from '@/lib/utils'

// 分页按钮
<div className="flex items-center gap-1">
  <Button
    variant="outline"
    size="icon"
    onClick={() => setFilters(prev => ({ ...prev, page: 1 }))}
    disabled={currentPage <= 1}
  >
    <ChevronsLeft className="h-4 w-4" />
  </Button>

  {getPageNumbers(currentPage, totalPages).map((pageNumber, index) => (
    <div key={`${pageNumber}-${index}`}>
      {pageNumber === '...' ? (
        <span className="px-2">...</span>
      ) : (
        <Button
          variant={currentPage === pageNumber ? 'default' : 'outline'}
          size="icon"
          onClick={() => setFilters(prev => ({ ...prev, page: pageNumber as number }))}
        >
          {pageNumber}
        </Button>
      )}
    </div>
  ))}

  <Button
    variant="outline"
    size="icon"
    onClick={() => setFilters(prev => ({ ...prev, page: totalPages }))}
    disabled={currentPage >= totalPages}
  >
    <ChevronsRight className="h-4 w-4" />
  </Button>
</div>
```

### 4. 加载骨架屏

```tsx
import { Skeleton } from '@/components/ui/skeleton'

{isLoading ? (
  Array.from({ length: 10 }).map((_, i) => (
    <TableRow key={i}>
      {columns.map((_, j) => (
        <TableCell key={j}>
          <Skeleton className="h-4 w-full" />
        </TableCell>
      ))}
    </TableRow>
  ))
) : (
  // 实际数据
)}
```

### 5. 弹窗播放模式

```tsx
const [audioUrl, setAudioUrl] = useState<string | null>(null)
const [showAudioModal, setShowAudioModal] = useState(false)

const handlePlayAudio = useCallback(async (url: string) => {
  try {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    const blob = await proxyRecord(url)
    setAudioUrl(URL.createObjectURL(blob))
    setShowAudioModal(true)
  } catch {
    toast.error('获取录音失败')
  }
}, [audioUrl])

<Dialog open={showAudioModal} onOpenChange={setShowAudioModal}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>播放录音</DialogTitle>
    </DialogHeader>
    {audioUrl && <audio src={audioUrl} controls autoPlay className="w-full" />}
  </DialogContent>
</Dialog>
```

## 常用命令

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build

# 预览生产构建
pnpm preview

# 代码检查
pnpm lint

# 代码格式化
pnpm format

# 添加 shadcn/ui 组件
npx shadcn@latest add [component-name]
```

## API 客户端配置

```typescript
// lib/api-client.ts
import axios from 'axios'

const apiClient = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
})

// 请求拦截器
apiClient.interceptors.request.use((config) => {
  // 从 localStorage 获取 API Key
  const apiKey = localStorage.getItem('api_key')
  if (apiKey) {
    config.params = { ...config.params, api_key: apiKey }
  }
  return config
})

// 响应拦截器
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // 处理未授权
    }
    return Promise.reject(error)
  }
)

export default apiClient
```

## 类型定义

```typescript
// lib/types.ts
export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}
```

## 文档优先原则

在编写代码或修复 bug 时，优先查找官方文档：

1. **React**: https://react.dev/
2. **shadcn/ui**: https://ui.shadcn.com/
3. **TanStack Query**: https://tanstack.com/query/latest
4. **TanStack Table**: https://tanstack.com/table/latest
5. **TanStack Router**: https://tanstack.com/router/latest
6. **Tailwind CSS**: https://tailwindcss.com/
7. **Lucide Icons**: https://lucide.dev/
8. **Vite**: https://vitejs.dev/

遵循官方最佳实践和示例代码。
