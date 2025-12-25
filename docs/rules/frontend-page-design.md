# 前端页面设计规范（可复用）

> 适用：React + Tailwind CSS v4 + shadcn/ui（Radix UI）风格的后台/工具类 Web 应用  
> 目标：统一页面布局、视觉层级、交互反馈与响应式规则，便于在其他项目快速复用

## 1. 总体原则

1. **信息架构固定**：标题/操作区 → 主内容区 → 弹窗/抽屉（挂在页面末尾，避免遮挡主布局）。
2. **语义化样式优先**：优先使用主题 token（`bg-background`/`text-foreground`/`border-border`…），避免到处写硬编码颜色。
3. **组件优先**：优先用 `@/components/ui/*`（shadcn/ui）与 `@/components/layout/*`，减少手写结构导致的风格漂移。
4. **轻阴影 + 边框**：面板/表格容器默认 `border + shadow-sm`，避免重阴影。
5. **可滚动容器要“可收缩”**：涉及表格/列表滚动时，父级必须 `min-h-0`，否则滚动会失效。

## 2. 设计 Tokens（主题/字体/圆角）

### 2.1 颜色（Light/Dark）

- 定义位置：`frontend-react/src/styles/theme.css`
- 使用方式：使用语义类名（由 Tailwind v4 + `@theme inline` 映射）
  - 背景/文字：`bg-background`、`text-foreground`
  - 卡片：`bg-card`、`text-card-foreground`
  - 次级信息：`text-muted-foreground`
  - 边框/输入：`border-border`、`bg-input`
  - 语义主色：`bg-primary`、`text-primary-foreground`
- 图表颜色：`--chart-1` ~ `--chart-5`（用于 Recharts 等图表库的统一配色）

### 2.2 圆角（Maia 风格）

- 基准：`--radius = 0.75rem`（≈ 12px）
- 建议用法（保持一致即可，不必强制）：
  - 控件（按钮/输入/下拉）：`rounded-lg`
  - 普通卡片/表格容器：`rounded-md` 或 `rounded-lg`
  - 大容器/Inset 内容区：`rounded-xl`

### 2.3 字体

- 字体选项：`inter` / `manrope` / `system`（见 `frontend-react/src/config/fonts.ts`）
- 全局切换：`frontend-react/src/context/font-provider.tsx`（通过给 `html` 添加 `font-*` class 控制）
- 添加新字体（迁移到其他项目也按此做）：
  1. 在 `frontend-react/src/config/fonts.ts` 增加字体名
  2. 在 `frontend-react/index.html` 引入字体（如 Google Fonts）
  3. 在 `frontend-react/src/styles/theme.css` 的 `@theme inline` 中新增 `--font-xxx`

### 2.4 文本层级（推荐）

- 页面标题（H1）：`text-2xl font-bold tracking-tight`
- 区块标题：`text-lg font-semibold`
- 描述/辅助信息：`text-sm text-muted-foreground`（或 `text-xs`）
- 数据/数值强调：`text-2xl font-bold`（统计卡片常用）

## 3. 页面布局系统

### 3.1 应用骨架（侧边栏 + 内容区）

推荐用组合（见 `frontend-react/src/components/layout/authenticated-layout.tsx`）：

- `LayoutProvider`：管理 sidebar 变体（`inset|floating|sidebar`）与折叠方式（`offcanvas|icon|none`）
- `SidebarProvider` + `AppSidebar`：导航侧边栏
- `SidebarInset`：内容区域容器（建议加 `@container/content` 以便使用 container query）

关键点：
- 移动端（<768）侧边栏自动切换为 `Sheet`（抽屉）交互
- 桌面端通过 `data-variant` / `data-collapsible` 控制样式（避免写复杂 JS）

### 3.2 Header（顶部栏）

组件：`frontend-react/src/components/layout/header.tsx`

- 高度固定：`h-16`
- `fixed` 模式：`sticky top-0` + 滚动超过阈值自动加 `shadow` + `backdrop-blur`
- 常用排布（推荐）：
  - 左侧：搜索/标题
  - 右侧：`ms-auto flex items-center space-x-4`（主题切换、设置、用户菜单等）

### 3.3 Main（内容区）

组件：`frontend-react/src/components/layout/main.tsx`

- 默认内边距：`px-4 py-6`
- `fixed` 模式：主容器 `flex grow flex-col overflow-hidden`，适合“内容区内部滚动”的页面
- 表格/列表页强制建议：
  - `Main`：`<Main fixed className="min-h-0">`
  - 内层滚动容器：`flex min-h-0 flex-1 ... overflow-hidden`

### 3.4 标准页面模板（建议直接复用）

```tsx
export function Page() {
  return (
    <>
      <Header fixed>
        <h1 className="text-xl font-semibold">页面标题</h1>
        <div className="ms-auto flex items-center gap-2">
          {/* 右侧操作：主题/设置/用户菜单/主按钮等 */}
        </div>
      </Header>

      <Main fixed className="min-h-0">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          {/* 页面内容 */}
        </div>
      </Main>

      {/* Dialog/Sheet/Confirm 等统一挂在页面末尾 */}
    </>
  )
}
```

### 3.5 数据表页面布局（统一模板）

组件：`frontend-react/src/components/layout/data-page-layout.tsx`（`DataPageContent`）

结构约定：
- `toolbar`：筛选/操作区（允许换行：`flex flex-wrap gap-2`）
- `children`：表格区（内置卡片容器：`bg-card rounded-md border shadow-sm` + `overflow-auto`）
- `pagination`：分页区（置于底部，避免与表格滚动混在一起）

核心规则：**滚动容器必须在卡片内部，且父级必须 `min-h-0`。**

### 3.6 工具栏布局规范（两行分离模式）

适用于复杂数据表页面，将筛选和操作分离为两行：

```tsx
<div className='flex flex-shrink-0 flex-col gap-2'>
  {/* 第一行：筛选区 */}
  <div className='flex flex-wrap items-center gap-2'>
    {/* 筛选控件（日期、下拉筛选、输入框等） */}
    <DateRangePicker />
    <ServerSideFilter title='类型' ... />
    <ServerSideFilter title='状态' ... />

    <Separator orientation='vertical' className='h-5' />

    {/* 其他筛选输入 */}
    <Input inputSize='xs' ... />

    <div className='flex-1' />

    {/* 重置按钮（仅筛选激活时显示） */}
    {isFiltered && (
      <Button variant='ghost' size='icon-xs' title='重置筛选'>
        <RotateCcw />
      </Button>
    )}

    {/* 查询按钮（最右侧） */}
    <Button size='icon-xs' title='查询'>
      <Search />
    </Button>
  </div>

  {/* 第二行：操作按钮 */}
  <div className='flex items-center gap-2'>
    {/* 批量操作（选中时显示） */}
    {selectedCount > 0 && (
      <>
        <span className='text-muted-foreground text-sm'>已选择 {selectedCount} 行</span>
        <Button variant='destructive' size='xs'>删除</Button>
        <Separator orientation='vertical' className='h-5' />
      </>
    )}

    {/* 功能按钮 */}
    <Button variant='outline' size='xs'>统计</Button>

    <div className='flex-1' />

    {/* 右侧工具 */}
    <DataTableViewOptions table={table} />

    {/* 刷新按钮（最右侧） */}
    <Button variant='default' size='icon-xs' title='刷新数据'>
      <RotateCcw />
    </Button>
  </div>
</div>
```

#### 布局原则

| 位置 | 内容 | 说明 |
|------|------|------|
| 第一行左侧 | 筛选控件 | 日期、下拉筛选、输入框等 |
| 第一行右侧 | 重置 + 查询 | 查询在最右，重置仅在有筛选时显示 |
| 第二行左侧 | 批量操作 + 功能按钮 | 选中行时显示批量操作 |
| 第二行右侧 | 列设置 + 刷新 | 刷新按钮在最右侧 |

#### 按钮样式区分

| 按钮类型 | variant | size | 说明 |
|----------|---------|------|------|
| 筛选区重置 | `ghost` | `icon-xs` | 浅色，不抢眼 |
| 筛选区查询 | `default` | `icon-xs` | 实心，易识别 |
| 工具栏刷新 | `default` | `icon-xs` | 实心，与重置区分 |
| 功能按钮 | `outline` | `xs` | 带文字的次级操作 |
| 批量删除 | `destructive` | `xs` | 危险操作，红色 |

#### 组件尺寸规范

工具栏统一使用 `h-8`（32px）高度：

| 组件 | 属性 |
|------|------|
| Button | `size='xs'` 或 `size='icon-xs'` |
| Input | `inputSize='xs'` |
| SelectTrigger | `selectSize='xs'` |

参考实现：`frontend-react/src/features/analysis/components/analysis-table.tsx`

### 3.7 认证页/空白页布局

组件：`frontend-react/src/features/auth/auth-layout.tsx`

- 使用 `container grid h-svh` 垂直水平居中
- 表单建议放在 `Card` 中，标题 + 描述 + 表单三段式

## 4. 组件使用与视觉一致性

### 4.1 Button（主/次/危险）

组件：`frontend-react/src/components/ui/button.tsx`

- 主操作：`variant="default"`
- 次操作：`variant="outline"` / `variant="secondary"`
- 弱操作：`variant="ghost"`
- 危险操作：`variant="destructive"`（配合确认弹窗）
- 工具栏推荐：`size="sm"`；纯图标按钮：`size="icon"` 并提供 `aria-label`/`sr-only`
- 加载态：`disabled + Loader2 animate-spin`（图标大小默认 16px）

### 4.2 Badge/Tag（状态/分类）

组件：`frontend-react/src/components/ui/badge.tsx`  
颜色系统：`frontend-react/src/lib/colors.ts`

约定：
- 状态/分类标签优先使用 `<Badge color="success|warning|danger|info|primary" colorStyle="soft|solid|outline" />`
- 避免在业务组件里零散写 `bg-xxx text-xxx`（需要特殊颜色时再例外）

### 4.3 Card（信息分组）

组件：`frontend-react/src/components/ui/card.tsx`

常用：
- 统计卡片：`grid gap-4 sm:grid-cols-2 lg:grid-cols-4`
- `CardHeader` 常用 `flex flex-row items-center justify-between`
- 描述文字统一用 `text-muted-foreground`

### 4.4 Table（列表/密集信息）

建议组合（按需）：
- 列宽拖拽：`frontend-react/src/components/data-table/resizable-table.tsx`
- 工具栏：`frontend-react/src/components/data-table/toolbar.tsx`
- 分页：`frontend-react/src/components/data-table/pagination.tsx` 或 `SimplePagination`
- 截断 + Tooltip：`frontend-react/src/components/data-table/truncated-cell.tsx`
- Loading：`Skeleton` 行（保持布局稳定）
- 空状态：单行 `TableRow` + `TableCell colSpan` + `h-24 text-center`

### 4.5 Dialog/Sheet（弹窗/抽屉）

统一原则：
- 表单/编辑类优先用 `Sheet`（抽屉），信息确认用 `AlertDialog`
- 删除/不可逆操作必须二次确认：`frontend-react/src/components/confirm-dialog.tsx`
- 新建/编辑/复制复用：用 `isCopy` 区分“复制创建”和“更新”（详见 `docs/rules/frontend.md` 的“抽屉组件复用模式”）

### 4.6 反馈与状态

- Toast：`sonner`（入口在 `frontend-react/src/routes/__root.tsx`）
- 路由加载反馈：`frontend-react/src/components/navigation-progress.tsx`

## 5. 响应式与移动端规则

- 移动端阈值：`<768px`（见 `frontend-react/src/hooks/use-mobile.tsx`）
- Sidebar：移动端抽屉、桌面常驻（由 `Sidebar` 组件内部处理）
- 输入框防止 iOS Safari 聚焦放大：全局在 `frontend-react/src/styles/index.css` 强制 `font-size: 16px`
- 推荐优先用 container query（如 `@max-2xl/content:*`）而不是到处写 viewport 媒体查询

## 6. 可访问性（A11y）约定

- 纯图标按钮必须提供：
  - `aria-label` 或
  - `<span className="sr-only">...</span>`
- 交互组件优先使用 Radix/shadcn 的无障碍实现（Dialog/Select/Tooltip 等）
- 注意：当前全局样式在 `frontend-react/src/styles/index.css` 中移除了 `:focus`/`:focus-visible` 的默认样式；若项目对键盘可达性有要求，建议恢复或实现统一的 focus ring 规范。

## 7. 迁移到其他项目的最小清单

如果想复用“相同的页面观感与布局”，建议迁移：

1. **样式与主题**
   - `frontend-react/src/styles/index.css`
   - `frontend-react/src/styles/theme.css`
2. **Providers（主题/字体/方向/布局）**
   - `frontend-react/src/context/theme-provider.tsx`
   - `frontend-react/src/context/font-provider.tsx`
   - `frontend-react/src/context/direction-provider.tsx`
   - `frontend-react/src/context/layout-provider.tsx`
3. **布局组件**
   - `frontend-react/src/components/layout/header.tsx`
   - `frontend-react/src/components/layout/main.tsx`
   - `frontend-react/src/components/ui/sidebar.tsx` + `frontend-react/src/components/layout/app-sidebar.tsx`
4. **常用设计组件**
   - `frontend-react/src/components/layout/data-page-layout.tsx`
   - `frontend-react/src/components/confirm-dialog.tsx`
   - `frontend-react/src/components/data-table/*`（表格页复用）
   - `frontend-react/src/lib/colors.ts`（Tag/Badge 颜色系统）

## 8. 新页面设计检查清单

- 布局：是否使用 `Header` + `Main` 的标准骨架？
- 主题：是否优先使用语义 token（避免硬编码颜色）？
- 状态：是否具备 Loading / Empty / Error 三态？
- 表格：是否保证 `min-h-0`，滚动是否正确？
- 交互：主次按钮是否区分清晰，危险操作是否确认？
- 响应式：移动端是否可用（侧边栏、工具栏换行、分页布局）？
- A11y：图标按钮是否有 `aria-label`/`sr-only`？
