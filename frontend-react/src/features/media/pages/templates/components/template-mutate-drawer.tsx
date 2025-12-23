import { useEffect, useState } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { zodResolver } from '@hookform/resolvers/zod'
import { GripVertical } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  useCreateTemplate,
  useExtractVariables,
  useTemplateCategories,
  useUpdateTemplate,
} from '../api'
import type { HtmlTemplate, TemplateVariable } from '../data/schema'

// 可排序变量项组件
interface SortableVariableItemProps {
  variable: TemplateVariable
  index: number
  onUpdate: (index: number, updates: Partial<TemplateVariable>) => void
}

function SortableVariableItem({
  variable,
  index,
  onUpdate,
}: SortableVariableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: variable.name })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className='rounded-md border bg-background p-3 space-y-2'
    >
      <div className='flex items-center gap-2'>
        <button
          type='button'
          className='cursor-grab touch-none text-muted-foreground hover:text-foreground'
          {...attributes}
          {...listeners}
        >
          <GripVertical className='h-4 w-4' />
        </button>
        <code className='rounded bg-muted px-1.5 py-0.5 text-sm font-mono'>
          {`{{${variable.name}}}`}
        </code>
      </div>
      <div className='grid grid-cols-2 gap-2 pl-6'>
        <div className='space-y-1'>
          <Label className='text-xs text-muted-foreground'>显示名称</Label>
          <Input
            value={variable.label || ''}
            onChange={(e) =>
              onUpdate(index, {
                label: e.target.value || null,
              })
            }
            placeholder={variable.name}
            className='h-8 text-sm'
          />
        </div>
        <div className='space-y-1'>
          <Label className='text-xs text-muted-foreground'>默认值</Label>
          <Input
            value={variable.default_value || ''}
            onChange={(e) =>
              onUpdate(index, {
                default_value: e.target.value || null,
              })
            }
            placeholder='输入默认值'
            className='h-8 text-sm'
          />
        </div>
      </div>
    </div>
  )
}

const formSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(100),
  description: z.string().max(500).optional(),
  html_content: z.string().min(1, 'HTML 内容不能为空'),
  css_content: z.string().optional(),
  width: z.number().min(100).max(4000),
  height: z.number().min(100).max(4000),
  category_id: z.number().optional(),
  is_active: z.boolean(),
})

type FormValues = z.infer<typeof formSchema>

interface TemplateMutateDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template?: HtmlTemplate | null
}

export function TemplateMutateDrawer({
  open,
  onOpenChange,
  template,
}: TemplateMutateDrawerProps) {
  const isUpdate = !!template
  const [extractedVars, setExtractedVars] = useState<TemplateVariable[]>([])
  const [jsonImportValue, setJsonImportValue] = useState('')

  const { data: categories = [] } = useTemplateCategories()
  const createTemplate = useCreateTemplate()
  const updateTemplate = useUpdateTemplate()
  const extractVariables = useExtractVariables()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      html_content: '',
      css_content: '',
      width: 800,
      height: 600,
      category_id: undefined,
      is_active: true,
    },
  })

  useEffect(() => {
    if (open) {
      if (template) {
        form.reset({
          name: template.name,
          description: template.description || '',
          html_content: template.html_content,
          css_content: template.css_content || '',
          width: template.width,
          height: template.height,
          category_id: template.category_id || undefined,
          is_active: template.is_active,
        })
        // 加载已有变量（包含默认值等完整信息）
        if (template.variables) {
          setExtractedVars(template.variables)
        } else {
          setExtractedVars([])
        }
        setJsonImportValue('')
      } else {
        form.reset({
          name: '',
          description: '',
          html_content: '',
          css_content: '',
          width: 800,
          height: 600,
          category_id: undefined,
          is_active: true,
        })
        setExtractedVars([])
        setJsonImportValue('')
      }
    }
  }, [open, template, form])

  // 自动提取变量
  const handleExtractVariables = async () => {
    const htmlContent = form.getValues('html_content')
    if (!htmlContent) {
      toast.error('请先输入 HTML 内容')
      return
    }

    try {
      const variableNames = await extractVariables.mutateAsync(htmlContent)
      // 转换为完整变量对象，保留已有设置
      const newVars: TemplateVariable[] = variableNames.map((name) => {
        const existingVar = extractedVars.find((v) => v.name === name)
        return {
          name,
          label: existingVar?.label || name,
          default_value: existingVar?.default_value || null,
          placeholder: existingVar?.placeholder || null,
          required: existingVar?.required ?? true,
        }
      })
      setExtractedVars(newVars)
      if (variableNames.length > 0) {
        toast.success(`提取到 ${variableNames.length} 个变量`)
      } else {
        toast.info('未找到变量，请使用 {{变量名}} 格式定义变量')
      }
    } catch {
      toast.error('提取变量失败')
    }
  }

  // 更新单个变量的属性
  const updateVariable = (index: number, updates: Partial<TemplateVariable>) => {
    setExtractedVars((prev) =>
      prev.map((v, i) => (i === index ? { ...v, ...updates } : v))
    )
  }

  // 拖拽排序
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setExtractedVars((items) => {
        const oldIndex = items.findIndex((item) => item.name === active.id)
        const newIndex = items.findIndex((item) => item.name === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  // 从 JSON 导入变量默认值
  const handleImportJson = () => {
    if (!jsonImportValue.trim()) {
      toast.error('请先输入 JSON 内容')
      return
    }

    try {
      const importedValues = JSON.parse(jsonImportValue) as Record<string, unknown>
      if (typeof importedValues !== 'object' || importedValues === null || Array.isArray(importedValues)) {
        toast.error('JSON 格式错误，请输入对象格式 {...}')
        return
      }

      // 更新已有变量的默认值
      let updatedCount = 0
      const newVars = extractedVars.map((v) => {
        if (v.name in importedValues) {
          updatedCount++
          return { ...v, default_value: String(importedValues[v.name]) }
        }
        return v
      })

      // 检查是否有新变量需要添加
      const existingNames = new Set(extractedVars.map((v) => v.name))
      const newVariables: TemplateVariable[] = []
      for (const [name, value] of Object.entries(importedValues)) {
        if (!existingNames.has(name)) {
          newVariables.push({
            name,
            label: name,
            default_value: String(value),
            placeholder: null,
            required: true,
          })
        }
      }

      setExtractedVars([...newVars, ...newVariables])

      if (updatedCount > 0 || newVariables.length > 0) {
        toast.success(
          `导入成功：更新 ${updatedCount} 个变量${newVariables.length > 0 ? `，新增 ${newVariables.length} 个变量` : ''}`
        )
        setJsonImportValue('')
      } else {
        toast.info('没有匹配的变量需要更新')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      toast.error(`JSON 解析失败：${message}`)
    }
  }

  const onSubmit = async (data: FormValues) => {
    try {
      // 包含变量详情的提交数据
      const submitData = {
        ...data,
        variables: extractedVars.length > 0 ? extractedVars : undefined,
      }
      if (isUpdate && template) {
        await updateTemplate.mutateAsync({ id: template.id, data: submitData })
        toast.success('模板更新成功')
      } else {
        await createTemplate.mutateAsync(submitData)
        toast.success('模板创建成功')
      }
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : '操作失败'
      toast.error(message)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='flex flex-col sm:max-w-2xl'>
        <SheetHeader className='text-start'>
          <SheetTitle>{isUpdate ? '编辑模板' : '创建模板'}</SheetTitle>
          <SheetDescription>
            {isUpdate
              ? '修改 HTML 模板内容和配置'
              : '创建新的 HTML 模板，支持 {{变量名}} 格式的变量'}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            id='template-form'
            onSubmit={form.handleSubmit(onSubmit)}
            className='flex min-h-0 flex-1 flex-col px-6'
          >
            <Tabs defaultValue='basic' className='flex min-h-0 flex-1 flex-col'>
              <TabsList className='mb-4 grid w-full grid-cols-3'>
                <TabsTrigger value='basic'>基本信息</TabsTrigger>
                <TabsTrigger value='code'>代码编辑</TabsTrigger>
                <TabsTrigger value='variables'>
                  变量设置
                  {extractedVars.length > 0 && (
                    <span className='ml-1 rounded-full bg-primary/10 px-1.5 text-xs'>
                      {extractedVars.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value='basic'
                className='mt-0 min-h-0 flex-1 overflow-y-auto px-1'
              >
                <div className='space-y-4 pb-4'>
                  {/* 模板名称 */}
                  <FormField
                    control={form.control}
                    name='name'
                    render={({ field }) => (
                      <FormItem className='grid grid-cols-6 items-center gap-x-4 gap-y-1 space-y-0'>
                        <FormLabel className='col-span-2 text-end'>
                          模板名称
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder='输入模板名称'
                            className='col-span-4'
                          />
                        </FormControl>
                        <FormMessage className='col-span-4 col-start-3' />
                      </FormItem>
                    )}
                  />

                  {/* 描述 */}
                  <FormField
                    control={form.control}
                    name='description'
                    render={({ field }) => (
                      <FormItem className='grid grid-cols-6 items-center gap-x-4 gap-y-1 space-y-0'>
                        <FormLabel className='col-span-2 text-end'>
                          描述
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder='简短描述模板用途（可选）'
                            className='col-span-4'
                          />
                        </FormControl>
                        <FormMessage className='col-span-4 col-start-3' />
                      </FormItem>
                    )}
                  />

                  {/* 分类 */}
                  <FormField
                    control={form.control}
                    name='category_id'
                    render={({ field }) => (
                      <FormItem className='grid grid-cols-6 items-center gap-x-4 gap-y-1 space-y-0'>
                        <FormLabel className='col-span-2 text-end'>
                          分类
                        </FormLabel>
                        <Select
                          value={field.value?.toString() || ''}
                          onValueChange={(v) =>
                            field.onChange(v ? parseInt(v) : undefined)
                          }
                        >
                          <FormControl>
                            <SelectTrigger className='col-span-4'>
                              <SelectValue placeholder='选择分类（可选）' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {categories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id.toString()}>
                                {cat.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage className='col-span-4 col-start-3' />
                      </FormItem>
                    )}
                  />

                  {/* 宽度 */}
                  <FormField
                    control={form.control}
                    name='width'
                    render={({ field }) => (
                      <FormItem className='grid grid-cols-6 items-center gap-x-4 gap-y-1 space-y-0'>
                        <FormLabel className='col-span-2 text-end'>
                          宽度 (px)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type='number'
                            {...field}
                            onChange={(e) =>
                              field.onChange(parseInt(e.target.value) || 800)
                            }
                            className='col-span-4'
                          />
                        </FormControl>
                        <FormMessage className='col-span-4 col-start-3' />
                      </FormItem>
                    )}
                  />

                  {/* 高度 */}
                  <FormField
                    control={form.control}
                    name='height'
                    render={({ field }) => (
                      <FormItem className='grid grid-cols-6 items-center gap-x-4 gap-y-1 space-y-0'>
                        <FormLabel className='col-span-2 text-end'>
                          高度 (px)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type='number'
                            {...field}
                            onChange={(e) =>
                              field.onChange(parseInt(e.target.value) || 600)
                            }
                            className='col-span-4'
                          />
                        </FormControl>
                        <FormMessage className='col-span-4 col-start-3' />
                      </FormItem>
                    )}
                  />

                  {/* 启用状态 */}
                  <FormField
                    control={form.control}
                    name='is_active'
                    render={({ field }) => (
                      <FormItem className='grid grid-cols-6 items-center gap-x-4 gap-y-1 space-y-0'>
                        <FormLabel className='col-span-2 text-end'>
                          启用状态
                        </FormLabel>
                        <div className='col-span-4 flex items-center gap-2'>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <span className='text-muted-foreground text-sm'>
                            {field.value ? '已启用' : '已禁用'}
                          </span>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              <TabsContent
                value='code'
                className='mt-0 min-h-0 flex-1 overflow-y-auto px-1'
              >
                <div className='space-y-4 pb-4'>
                  {/* HTML 内容 */}
                  <FormField
                    control={form.control}
                    name='html_content'
                    render={({ field }) => (
                      <FormItem>
                        <div className='flex items-center justify-between'>
                          <FormLabel>HTML 内容</FormLabel>
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            onClick={handleExtractVariables}
                            disabled={extractVariables.isPending}
                          >
                            提取变量
                          </Button>
                        </div>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder='输入 HTML 代码，使用 {{变量名}} 作为变量占位符'
                            className='min-h-[200px] font-mono text-sm'
                          />
                        </FormControl>
                        <p className='text-muted-foreground text-xs'>
                          使用 {'{{变量名}}'} 格式定义变量，如: {'{{title}}'},{' '}
                          {'{{content}}'}
                        </p>
                        {extractedVars.length > 0 && (
                          <p className='text-muted-foreground text-sm'>
                            已提取 {extractedVars.length} 个变量，前往「变量设置」Tab 编辑默认值
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* CSS 样式 */}
                  <FormField
                    control={form.control}
                    name='css_content'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CSS 样式（可选）</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder='输入自定义 CSS 样式'
                            className='min-h-[120px] font-mono text-sm'
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              {/* 变量设置 Tab */}
              <TabsContent
                value='variables'
                className='mt-0 min-h-0 flex-1 overflow-y-auto px-1'
              >
                <div className='space-y-4 pb-4'>
                  {/* JSON 导入 */}
                  <div className='space-y-2'>
                    <div className='flex items-center justify-between'>
                      <Label className='text-sm font-medium'>JSON 导入默认值</Label>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={handleImportJson}
                      >
                        导入
                      </Button>
                    </div>
                    <Textarea
                      value={jsonImportValue}
                      onChange={(e) => setJsonImportValue(e.target.value)}
                      placeholder='粘贴 JSON 格式的变量值，如: {"title": "示例标题", "content": "示例内容"}'
                      className='min-h-[100px] font-mono text-sm'
                    />
                    <p className='text-muted-foreground text-xs'>
                      导入后会自动更新对应变量的默认值
                    </p>
                  </div>

                  {/* 变量列表 */}
                  {extractedVars.length > 0 ? (
                    <div className='space-y-3'>
                      <div className='flex items-center justify-between'>
                        <Label className='text-sm font-medium'>
                          变量列表 ({extractedVars.length})
                        </Label>
                        <span className='text-xs text-muted-foreground'>
                          拖拽排序
                        </span>
                      </div>
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={extractedVars.map((v) => v.name)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className='space-y-2'>
                            {extractedVars.map((variable, index) => (
                              <SortableVariableItem
                                key={variable.name}
                                variable={variable}
                                index={index}
                                onUpdate={updateVariable}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  ) : (
                    <div className='flex flex-col items-center justify-center py-8 text-center'>
                      <p className='text-muted-foreground text-sm'>
                        暂无变量，请先在「代码编辑」Tab 中输入 HTML 内容并点击「提取变量」
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </form>
        </Form>

        <SheetFooter className='flex-row justify-end gap-2'>
          <SheetClose asChild>
            <Button variant='outline'>取消</Button>
          </SheetClose>
          <Button
            form='template-form'
            type='submit'
            disabled={createTemplate.isPending || updateTemplate.isPending}
          >
            {createTemplate.isPending || updateTemplate.isPending
              ? '保存中...'
              : '保存'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
