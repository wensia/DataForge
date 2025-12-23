import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
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
import { Textarea } from '@/components/ui/textarea'
import {
  useCreateTemplate,
  useExtractVariables,
  useTemplateCategories,
  useUpdateTemplate,
} from '../api'
import type { HtmlTemplate } from '../data/schema'

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
  const [extractedVars, setExtractedVars] = useState<string[]>([])

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
        // 显示已有变量
        if (template.variables) {
          setExtractedVars(template.variables.map((v) => v.name))
        }
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
      const variables = await extractVariables.mutateAsync(htmlContent)
      setExtractedVars(variables)
      if (variables.length > 0) {
        toast.success(`提取到 ${variables.length} 个变量: ${variables.join(', ')}`)
      } else {
        toast.info('未找到变量，请使用 {{变量名}} 格式定义变量')
      }
    } catch {
      toast.error('提取变量失败')
    }
  }

  const onSubmit = async (data: FormValues) => {
    try {
      if (isUpdate && template) {
        await updateTemplate.mutateAsync({ id: template.id, data })
        toast.success('模板更新成功')
      } else {
        await createTemplate.mutateAsync(data)
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
        <SheetHeader>
          <SheetTitle>{isUpdate ? '编辑模板' : '创建模板'}</SheetTitle>
          <SheetDescription>
            {isUpdate
              ? '修改 HTML 模板内容和配置'
              : '创建新的 HTML 模板，支持 {{变量名}} 格式的变量'}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className='min-h-0 flex-1'>
          <Form {...form}>
            <form
              id='template-form'
              onSubmit={form.handleSubmit(onSubmit)}
              className='space-y-4 px-1 pb-4'
            >
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>模板名称</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='输入模板名称' />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='description'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>描述（可选）</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='简短描述模板用途' />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='category_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>分类（可选）</FormLabel>
                    <Select
                      value={field.value?.toString() || ''}
                      onValueChange={(v) =>
                        field.onChange(v ? parseInt(v) : undefined)
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='选择分类' />
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
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                    <FormDescription>
                      使用 {'{{变量名}}'} 格式定义变量，如: {'{{title}}'},
                      {'{{content}}'}
                    </FormDescription>
                    {extractedVars.length > 0 && (
                      <p className='text-muted-foreground text-sm'>
                        已提取变量: {extractedVars.join(', ')}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                        className='min-h-[100px] font-mono text-sm'
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className='grid grid-cols-2 gap-4'>
                <FormField
                  control={form.control}
                  name='width'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>宽度 (px)</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          {...field}
                          onChange={(e) =>
                            field.onChange(parseInt(e.target.value) || 800)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='height'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>高度 (px)</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          {...field}
                          onChange={(e) =>
                            field.onChange(parseInt(e.target.value) || 600)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name='is_active'
                render={({ field }) => (
                  <FormItem className='flex items-center justify-between rounded-lg border p-3'>
                    <div>
                      <FormLabel>启用状态</FormLabel>
                      <p className='text-muted-foreground text-sm'>
                        禁用后模板将不在列表中显示
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </ScrollArea>

        <SheetFooter className='gap-2'>
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
