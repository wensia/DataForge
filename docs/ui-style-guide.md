# UI 样式规范文档

> 基于 DataForge Analysis 页面提取的样式规范，可复用到其他 React + shadcn/ui 项目。

---

## 1. 页面整体布局

```tsx
// 页面容器：flex 布局，垂直方向，填满空间
<div className='flex flex-1 flex-col gap-4 overflow-hidden'>
  {/* 工具栏区域 - 固定高度不收缩 */}
  <div className='flex flex-shrink-0 flex-col gap-2'>
    {/* 第一行：筛选区 */}
    <div className='flex flex-wrap items-center gap-2'>
      {/* 筛选组件... */}
    </div>
    {/* 第二行：操作按钮 */}
    <div className='flex items-center gap-2'>
      {/* 操作按钮... */}
    </div>
  </div>

  {/* 表格区域 - 可滚动，填满剩余空间 */}
  <div className='min-h-0 flex-1 overflow-auto rounded-md border'>
    {/* 表格内容... */}
  </div>

  {/* 分页区域 - 固定在底部 */}
  <div className='mt-auto flex-shrink-0'>
    {/* 分页组件... */}
  </div>
</div>
```

**关键点**：
- 使用 `flex-1 flex-col overflow-hidden` 实现页面填满
- 工具栏使用 `flex-shrink-0` 防止被压缩
- 表格区域使用 `min-h-0 flex-1 overflow-auto` 实现滚动
- 分页使用 `mt-auto flex-shrink-0` 固定在底部

---

## 2. 组件尺寸规范

### 2.1 Button 尺寸

| 尺寸 | 高度 | 内边距 | 字号 | 圆角 | 使用场景 |
|------|------|--------|------|------|----------|
| `default` | h-10 (40px) | px-5 py-2.5 | text-sm (14px) | rounded-lg | 主要操作 |
| `sm` | h-9 (36px) | px-4 | text-sm | rounded-lg | 次要操作 |
| `xs` | h-8 (32px) | px-3 | text-xs (12px) | rounded-md | **工具栏按钮** |
| `lg` | h-11 (44px) | px-8 | text-sm | rounded-lg | 大型按钮 |
| `icon` | 40x40 | - | - | - | 图标按钮 |
| `icon-sm` | 36x36 | - | - | - | 小图标按钮 |
| `icon-xs` | 32x32 | - | - | - | **工具栏图标按钮** |
| `icon-lg` | 44x44 | - | - | - | 大图标按钮 |

```tsx
// Button 变体定义
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-lg text-sm font-medium transition-all ...",
  {
    variants: {
      size: {
        default: "h-10 px-5 py-2.5 has-[>svg]:px-4",
        sm: "h-9 rounded-lg gap-2 px-4 has-[>svg]:px-3",
        xs: "h-8 rounded-md gap-1.5 px-3 text-xs has-[>svg]:px-2.5",
        lg: "h-11 rounded-lg px-8 has-[>svg]:px-6",
        icon: "size-10",
        "icon-sm": "size-9",
        "icon-xs": "size-8",
        "icon-lg": "size-11",
      },
    },
  }
)
```

**工具栏推荐**：使用 `size="xs"` 或 `size="icon-xs"`

### 2.2 Input 尺寸

| 尺寸 | 高度 | 内边距 | 字号 | 使用场景 |
|------|------|--------|------|----------|
| `default` | h-10 (40px) | px-4 py-2 | text-base/text-sm | 表单输入 |
| `sm` | h-9 (36px) | px-3 py-1.5 | text-sm | 紧凑表单 |
| `xs` | h-8 (32px) | px-3 py-1 | text-sm | **工具栏搜索框** |

```tsx
const inputSizeClasses = {
  default: 'h-10 px-4 py-2 text-base md:text-sm',
  sm: 'h-9 px-3 py-1.5 text-sm',
  xs: 'h-8 px-3 py-1 text-sm',
}

// 使用示例
<Input inputSize='xs' placeholder='被叫手机号' className='w-32' />
```

### 2.3 Select 尺寸

| 尺寸 | 高度 | 内边距 | 使用场景 |
|------|------|--------|----------|
| `default` | h-10 | px-4 py-2 | 表单选择 |
| `sm` | h-9 | px-3 py-1.5 | 紧凑表单 |
| `xs` | h-8 | px-3 py-1 | **工具栏/分页** |

```tsx
const selectTriggerSizeClasses = {
  default: 'h-10 px-4 py-2',
  sm: 'h-9 px-3 py-1.5',
  xs: 'h-8 px-3 py-1',
}

// 使用示例
<SelectTrigger selectSize='xs' className='w-[80px]'>
  <SelectValue />
</SelectTrigger>
```

### 2.4 Badge 尺寸

```tsx
// 固定尺寸
'rounded-lg border px-2.5 py-1 text-xs font-medium'
// 即：圆角 rounded-lg，内边距 px-2.5 py-1，字号 12px
```

---

## 3. 字体大小规范

| 用途 | Tailwind 类 | 像素值 | 场景 |
|------|-------------|--------|------|
| 表格正文 | `text-sm` | 14px | 表格内容、列表 |
| 辅助文本 | `text-sm text-muted-foreground` | 14px | 分页信息、提示 |
| 小号文本 | `text-xs` | 12px | 按钮(xs)、Badge、状态 |
| 加载状态 | `text-xs text-muted-foreground` | 12px | "保存中..." |

**表格样式**：
```tsx
<table className='w-full caption-bottom text-sm'>
  <thead className='bg-card sticky top-0 z-10'>
    <th className='text-foreground bg-card h-10 px-2 text-start align-middle font-medium whitespace-nowrap'>
      {/* 表头 */}
    </th>
  </thead>
  <tbody>
    <td className='p-2 align-middle whitespace-nowrap'>
      {/* 单元格 */}
    </td>
  </tbody>
</table>
```

---

## 4. 间距规范

| 用途 | 间距值 | 说明 |
|------|--------|------|
| 页面区块间距 | `gap-4` (16px) | 工具栏与表格之间 |
| 工具栏行间距 | `gap-2` (8px) | 筛选行与操作行之间 |
| 组件间距 | `gap-2` (8px) | 筛选按钮之间 |
| 分页按钮间距 | `gap-1` (4px) | 分页按钮之间 |
| Popover 内边距 | `p-5` (20px) | 弹窗内容区 |
| Popover 内容间距 | `space-y-4` (16px) | 弹窗内各区块 |

---

## 5. 组件样式模板

### 5.1 筛选按钮（带 Badge）

```tsx
<Button variant='outline' size='xs' className='border-dashed'>
  <PlusCircle className='mr-2 h-4 w-4' />
  {title}
  {selectedValue && (
    <>
      <Separator orientation='vertical' className='mx-2 h-4' />
      <Badge variant='secondary' className='rounded-sm px-1 font-normal'>
        {selectedLabel}
      </Badge>
    </>
  )}
</Button>
```

### 5.2 高级筛选 Popover

```tsx
<Popover>
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
      {/* 筛选项 */}
      <div className='space-y-2'>
        <h4 className='font-medium text-sm'>筛选标题</h4>
        {/* 输入控件 */}
      </div>

      <Separator />

      {/* 按钮区 */}
      <div className='flex justify-end gap-2'>
        <Button variant='outline' size='xs'>重置</Button>
        <Button size='xs'>确认</Button>
      </div>
    </div>
  </PopoverContent>
</Popover>
```

### 5.3 表格行样式

```tsx
// 表格行
<tr className='hover:bg-muted/50 border-b transition-colors data-[state=selected]:bg-muted'>
  {/* 单元格 */}
</tr>

// 单元格
<td className='p-2 align-middle whitespace-nowrap'>
  {/* 内容 */}
</td>

// 表头（固定）
<thead className='bg-card sticky top-0 z-10 [&_tr]:border-b'>
  <th className='text-foreground bg-card h-10 px-2 text-start align-middle font-medium whitespace-nowrap'>
    {/* 表头内容 */}
  </th>
</thead>
```

### 5.4 分页组件

```tsx
<div className='flex items-center justify-between'>
  {/* 左侧：记录数 + 每页条数 */}
  <div className='flex items-center gap-4'>
    <div className='text-muted-foreground text-sm'>共 {total} 条记录</div>
    <div className='flex items-center gap-2'>
      <span className='text-muted-foreground text-sm'>每页</span>
      <Select>
        <SelectTrigger selectSize='xs' className='w-[80px]'>
          <SelectValue />
        </SelectTrigger>
        {/* ... */}
      </Select>
      <span className='text-muted-foreground text-sm'>条</span>
    </div>
  </div>

  {/* 右侧：分页按钮 */}
  <div className='flex items-center gap-1'>
    <Button variant='outline' size='icon-xs'>
      <ChevronsLeft className='h-4 w-4' />
    </Button>
    {/* 页码按钮 */}
    <Button variant={isActive ? 'default' : 'outline'} size='xs' className='min-w-11'>
      {pageNumber}
    </Button>
    {/* ... */}
    <span className='text-muted-foreground ml-2 text-sm'>
      第 {page} / {totalPages} 页
    </span>
  </div>
</div>
```

---

## 6. 图标规范

| 用途 | 尺寸 | 类名 |
|------|------|------|
| 按钮内图标 | 16x16 | `h-4 w-4` |
| 加载动画 | 16x16 | `h-4 w-4 animate-spin` |
| 小加载 | 12x12 | `h-3 w-3 animate-spin` |
| 操作图标 | 28x28 容器 | `h-7 w-7 ... rounded-full` |

```tsx
// 按钮内图标（左侧）
<Loader2 className='mr-2 h-4 w-4 animate-spin' />

// 操作图标按钮
<button className='flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-blue-100 text-blue-600 transition-colors hover:bg-blue-200'>
  <Mic className='h-4 w-4' />
</button>
```

---

## 7. 颜色变体

### 7.1 Button 变体

| 变体 | 样式 | 使用场景 |
|------|------|----------|
| `default` | 主色背景 | 主要操作 |
| `outline` | 边框+透明背景 | **筛选按钮** |
| `ghost` | 无边框+hover背景 | 工具按钮 |
| `destructive` | 红色背景 | 删除操作 |
| `secondary` | 次要色背景 | 次要操作 |

### 7.2 操作图标颜色

```tsx
// 绿色（已完成）
'bg-green-100 text-green-600 hover:bg-green-200'

// 蓝色（可操作）
'bg-blue-100 text-blue-600 hover:bg-blue-200'

// 琥珀色（警告/待处理）
'bg-amber-100 text-amber-600 hover:bg-amber-200'

// 灰色（禁用/无数据）
'bg-gray-100 text-gray-400'
```

---

## 8. 响应式断点

本项目主要使用的断点：

| 断点 | 宽度 | 用途 |
|------|------|------|
| `md` | 768px | 字号切换 `text-base md:text-sm` |
| `lg` | 1024px | 网格布局 `grid-cols-1 lg:grid-cols-2` |

---

## 9. 完整使用示例

```tsx
// 工具栏完整示例
<div className='flex flex-wrap items-center gap-2'>
  {/* 筛选按钮 */}
  <ServerSideFilter title='类型' value={filter} options={options} onChange={setFilter} />

  <Separator orientation='vertical' className='h-5' />

  {/* 搜索框 */}
  <Input inputSize='xs' placeholder='搜索...' className='w-32' />

  {/* 高级筛选 */}
  <AdvancedFilterPopover {...props} />

  <div className='flex-1' />

  {/* 重置按钮 */}
  <Button variant='ghost' size='icon-xs' title='重置'>
    <RotateCcw className='h-4 w-4' />
  </Button>

  {/* 搜索按钮 */}
  <Button size='icon-xs' title='查询'>
    <Search className='h-4 w-4' />
  </Button>
</div>
```

---

## 10. 快速参考

**工具栏标准尺寸**：
- 按钮: `size="xs"` 或 `size="icon-xs"`
- 输入框: `inputSize="xs"`
- 下拉框: `selectSize="xs"`

**常用间距**：
- 组件间: `gap-2`
- 区块间: `gap-4`
- 分隔符高度: `h-5`

**字号**：
- 正文: `text-sm` (14px)
- 小号: `text-xs` (12px)
