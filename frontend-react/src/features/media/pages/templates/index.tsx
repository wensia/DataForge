import { useState } from 'react'
import { FolderPlus, Plus, RefreshCw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuthStore } from '@/stores/auth-store'
import { TemplateCard } from './components/template-card'
import { TemplateMutateDrawer } from './components/template-mutate-drawer'
import { TemplateUseDialog } from './components/template-use-dialog'
import {
  useCopyTemplate,
  useDeleteTemplate,
  useHtmlTemplates,
  useTemplateCategories,
} from './api'
import type { HtmlTemplate } from './data/schema'

type TabValue = 'library' | 'mine'

export function HtmlTemplatesPage() {
  const [activeTab, setActiveTab] = useState<TabValue>('library')
  const [keyword, setKeyword] = useState('')
  const [categoryId, setCategoryId] = useState<number | undefined>()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [useDialogOpen, setUseDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<HtmlTemplate | null>(
    null
  )

  const { auth } = useAuthStore()

  // 根据 Tab 切换查询参数
  const queryParams =
    activeTab === 'library'
      ? { is_system: true, category_id: categoryId, keyword: keyword || undefined }
      : { mine: true, category_id: categoryId, keyword: keyword || undefined }

  const { data, isLoading, refetch, isRefetching } = useHtmlTemplates(queryParams)
  const { data: categories = [] } = useTemplateCategories()
  const deleteTemplate = useDeleteTemplate()
  const copyTemplate = useCopyTemplate()

  const templates = data?.items || []

  const handleEdit = (template: HtmlTemplate) => {
    setSelectedTemplate(template)
    setDrawerOpen(true)
  }

  const handleDelete = (template: HtmlTemplate) => {
    setSelectedTemplate(template)
    setDeleteDialogOpen(true)
  }

  const handleUse = (template: HtmlTemplate) => {
    setSelectedTemplate(template)
    setUseDialogOpen(true)
  }

  const handleCopy = async (template: HtmlTemplate) => {
    try {
      await copyTemplate.mutateAsync(template.id)
      toast.success('模板已复制到我的模板')
      // 切换到我的模板 Tab
      setActiveTab('mine')
    } catch {
      toast.error('复制失败')
    }
  }

  const confirmDelete = async () => {
    if (!selectedTemplate) return
    try {
      await deleteTemplate.mutateAsync(selectedTemplate.id)
      toast.success('模板删除成功')
      setDeleteDialogOpen(false)
      setSelectedTemplate(null)
    } catch {
      toast.error('删除失败')
    }
  }

  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-4'>
          <h1 className='text-xl font-semibold'>HTML 模板</h1>
        </div>
        <div className='ms-auto flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => refetch()}
            disabled={isRefetching}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`}
            />
            刷新
          </Button>
          {/* 只有在"我的模板"或管理员在"模板库"时才显示创建按钮 */}
          {(activeTab === 'mine' || auth.isAdmin()) && (
            <Button
              size='sm'
              onClick={() => {
                setSelectedTemplate(null)
                setDrawerOpen(true)
              }}
            >
              <Plus className='mr-2 h-4 w-4' />
              {activeTab === 'library' ? '创建系统模板' : '创建模板'}
            </Button>
          )}
        </div>
      </Header>

      <Main fixed>
        <div className='space-y-6'>
          {/* Tab 切换 */}
          <div className='flex items-center justify-between'>
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as TabValue)}
            >
              <TabsList>
                <TabsTrigger value='library'>模板库</TabsTrigger>
                <TabsTrigger value='mine'>我的模板</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* 筛选栏 */}
            <div className='flex items-center gap-4'>
              <div className='relative w-64'>
                <Search className='text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2' />
                <Input
                  placeholder='搜索模板...'
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className='pl-9'
                />
              </div>

              <Select
                value={categoryId?.toString() || 'all'}
                onValueChange={(v) =>
                  setCategoryId(v === 'all' ? undefined : parseInt(v))
                }
              >
                <SelectTrigger className='w-[180px]'>
                  <SelectValue placeholder='选择分类' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>全部分类</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id.toString()}>
                      {cat.name} ({cat.template_count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 模板网格 */}
          {isLoading ? (
            <div className='grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className='aspect-[4/3] rounded-lg' />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-16 text-center'>
              <FolderPlus className='text-muted-foreground mb-4 h-12 w-12' />
              <h3 className='font-medium'>
                {activeTab === 'library' ? '暂无系统模板' : '暂无我的模板'}
              </h3>
              <p className='text-muted-foreground mt-1 text-sm'>
                {activeTab === 'library'
                  ? auth.isAdmin()
                    ? '点击"创建系统模板"按钮添加第一个系统模板'
                    : '系统模板由管理员创建'
                  : '从模板库复制模板，或点击"创建模板"按钮创建新模板'}
              </p>
            </div>
          ) : (
            <div className='grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isLibrary={activeTab === 'library'}
                  isAdmin={auth.isAdmin()}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onUse={handleUse}
                  onCopy={handleCopy}
                  isCopying={copyTemplate.isPending}
                />
              ))}
            </div>
          )}
        </div>
      </Main>

      {/* Drawer: 创建/编辑 */}
      <TemplateMutateDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        template={selectedTemplate}
        isSystemTemplate={activeTab === 'library' && !selectedTemplate}
      />

      {/* Dialog: 使用模板 */}
      <TemplateUseDialog
        open={useDialogOpen}
        onOpenChange={setUseDialogOpen}
        template={selectedTemplate}
      />

      {/* 删除确认 */}
      <ConfirmDialog
        destructive
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        handleConfirm={confirmDelete}
        isLoading={deleteTemplate.isPending}
        title={`删除模板: ${selectedTemplate?.name}?`}
        desc='此操作无法撤销，确定要删除这个模板吗？'
        confirmText='删除'
      />
    </>
  )
}
