import { useEffect, useState, useMemo } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Bell } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { HandlerParamsForm } from './handler-params-form'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SelectDropdown } from '@/components/select-dropdown'
import { useCreateTask, useUpdateTask, useTaskHandlers, useTaskCategories, useRobotConfigs } from '../api'
import { taskTypes, categories as presetCategories } from '../data/data'
import { type Task, type TaskType } from '../data/schema'

type TaskMutateDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: Task
  /** 复制模式：预填表单但作为新任务创建 */
  isCopy?: boolean
}

const formSchema = z
  .object({
    name: z.string().min(1, '任务名称不能为空'),
    description: z.string(),
    task_type: z.enum(['cron', 'interval', 'date', 'manual']),
    cron_expression: z.string().optional(),
    interval_seconds: z.number().optional(),
    run_date: z.string().optional(),
    task_name: z.string().min(1, '请选择处理函数'),
    handler_kwargs: z.string().optional(),
    category: z.string().optional(),
    notify_on_success: z.boolean(),
    notify_on_failure: z.boolean(),
    robot_config_id: z.number().nullable(),
  })
  .refine(
    (data) => {
      if (data.task_type === 'cron') {
        return !!data.cron_expression
      }
      if (data.task_type === 'interval') {
        return !!data.interval_seconds && data.interval_seconds > 0
      }
      if (data.task_type === 'date') {
        return !!data.run_date
      }
      return true
    },
    {
      message: '请填写调度配置',
      path: ['cron_expression'],
    }
  )
  .refine(
    (data) => {
      // 如果启用了通知，必须选择机器人
      if ((data.notify_on_success || data.notify_on_failure) && !data.robot_config_id) {
        return false
      }
      return true
    },
    {
      message: '启用通知时请选择通知机器人',
      path: ['robot_config_id'],
    }
  )

type TaskForm = z.infer<typeof formSchema>

export function TasksMutateDrawer({
  open,
  onOpenChange,
  currentRow,
  isCopy = false,
}: TaskMutateDrawerProps) {
  // 复制模式：有 currentRow 但作为新任务创建
  const isUpdate = !!currentRow && !isCopy

  const { data: handlers = [] } = useTaskHandlers()
  const { data: existingCategories = [] } = useTaskCategories()
  const { data: robotConfigs = [] } = useRobotConfigs()
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()

  // 动态参数值状态
  const [paramsValue, setParamsValue] = useState<Record<string, unknown>>({})

  // 合并预设分类和已有分类
  const categoryOptions = [
    ...presetCategories.map((c) => ({ label: c.label, value: c.value })),
    ...existingCategories
      .filter((c) => !presetCategories.some((p) => p.value === c))
      .map((c) => ({ label: c, value: c })),
  ]

  const form = useForm<TaskForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      task_type: 'interval',
      cron_expression: '',
      interval_seconds: 3600,
      run_date: '',
      task_name: '',
      handler_kwargs: '',
      category: '',
      notify_on_success: false,
      notify_on_failure: false,
      robot_config_id: null,
    },
  })

  // 当编辑或复制时，填充表单
  useEffect(() => {
    if (currentRow && open) {
      // 优先使用 task_name，向后兼容 handler_path
      const taskNameValue = currentRow.task_name || currentRow.handler_path || ''
      form.reset({
        // 复制模式下，给名称添加"(副本)"后缀
        name: isCopy ? `${currentRow.name} (副本)` : currentRow.name,
        description: currentRow.description || '',
        task_type: currentRow.task_type,
        cron_expression: currentRow.cron_expression || '',
        interval_seconds: currentRow.interval_seconds || 3600,
        run_date: currentRow.run_date || '',
        task_name: taskNameValue,
        handler_kwargs: currentRow.handler_kwargs || '',
        category: currentRow.category || '',
        notify_on_success: currentRow.notify_on_success || false,
        notify_on_failure: currentRow.notify_on_failure || false,
        robot_config_id: currentRow.robot_config_id || null,
      })

      // 解析 handler_kwargs JSON 填充 paramsValue
      if (currentRow.handler_kwargs) {
        try {
          const parsed = JSON.parse(currentRow.handler_kwargs)
          setParamsValue(parsed)
        } catch {
          setParamsValue({})
        }
      } else {
        setParamsValue({})
      }
    }
  }, [currentRow, open, form, isCopy])

  const taskType = form.watch('task_type')
  const taskName = form.watch('task_name')

  // 获取当前选中处理函数的参数列表
  const currentHandlerParams = useMemo(() => {
    const handler = handlers.find((h) => h.path === taskName)
    return handler?.params || []
  }, [handlers, taskName])

  // 当 task_name 变化时，重置参数值（仅在创建模式）
  useEffect(() => {
    if (!isUpdate && taskName) {
      setParamsValue({})
    }
  }, [taskName, isUpdate])

  const onSubmit = async (data: TaskForm) => {
    try {
      // 将参数值序列化为 JSON 字符串
      const handlerKwargsJson =
        Object.keys(paramsValue).length > 0
          ? JSON.stringify(paramsValue)
          : undefined

      if (isUpdate && currentRow) {
        await updateTask.mutateAsync({
          id: currentRow.id,
          data: {
            name: data.name,
            description: data.description,
            task_type: data.task_type,
            cron_expression:
              data.task_type === 'cron' ? data.cron_expression : undefined,
            interval_seconds:
              data.task_type === 'interval' ? data.interval_seconds : undefined,
            run_date: data.task_type === 'date' ? data.run_date : undefined,
            handler_kwargs: handlerKwargsJson,
            category: data.category || undefined,
            notify_on_success: data.notify_on_success,
            notify_on_failure: data.notify_on_failure,
            robot_config_id: data.robot_config_id,
          },
        })
        toast.success('任务更新成功')
      } else {
        await createTask.mutateAsync({
          name: data.name,
          description: data.description || '',
          task_type: data.task_type as TaskType,
          cron_expression:
            data.task_type === 'cron' ? data.cron_expression : undefined,
          interval_seconds:
            data.task_type === 'interval' ? data.interval_seconds : undefined,
          run_date: data.task_type === 'date' ? data.run_date : undefined,
          task_name: data.task_name,
          handler_kwargs: handlerKwargsJson,
          category: data.category || undefined,
          notify_on_success: data.notify_on_success,
          notify_on_failure: data.notify_on_failure,
          robot_config_id: data.robot_config_id,
        })
        toast.success('任务创建成功')
      }
      onOpenChange(false)
      form.reset()
      setParamsValue({})
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '操作失败，请重试'
      toast.error(message)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) {
          form.reset()
        }
      }}
    >
      <SheetContent className='flex h-full flex-col gap-0 p-0 sm:max-w-lg'>
        <SheetHeader className='border-b px-6 py-4'>
          <SheetTitle>{isUpdate ? '编辑' : isCopy ? '复制' : '创建'}任务</SheetTitle>
          <SheetDescription>
            {isUpdate
              ? '修改任务配置信息，完成后点击保存。'
              : isCopy
                ? '基于现有任务创建副本，可修改配置后保存。'
                : '填写任务信息创建新的定时任务。'}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className='min-h-0 flex-1'>
          <Form {...form}>
            <form
              id='tasks-form'
              onSubmit={form.handleSubmit(onSubmit)}
              className='space-y-4 p-6'
            >
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>任务名称</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder='输入任务名称'
                      />
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
                    <FormLabel>任务描述</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder='输入任务描述（可选）'
                        rows={2}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className='grid grid-cols-2 gap-4'>
                <FormField
                  control={form.control}
                  name='category'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>任务分类</FormLabel>
                      <SelectDropdown
                        defaultValue={field.value}
                        onValueChange={field.onChange}
                        placeholder='选择分类'
                        items={categoryOptions}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='task_name'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>处理函数</FormLabel>
                      <SelectDropdown
                        defaultValue={field.value}
                        onValueChange={field.onChange}
                        placeholder='选择函数'
                        disabled={isUpdate}
                        isControlled
                        items={handlers.map((h) => ({
                          label: h.name,
                          value: h.path,
                        }))}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {handlers.find((h) => h.path === form.watch('task_name'))?.description && (
                <p className='text-muted-foreground text-xs'>
                  {handlers.find((h) => h.path === form.watch('task_name'))?.description}
                </p>
              )}

              <FormField
                control={form.control}
                name='task_type'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>任务类型</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className='flex gap-4'
                      >
                        {taskTypes.map((type) => (
                          <FormItem
                            key={type.value}
                            className='flex items-center space-x-2 space-y-0'
                          >
                            <FormControl>
                              <RadioGroupItem value={type.value} />
                            </FormControl>
                            <FormLabel className='flex items-center gap-1 font-normal'>
                              {type.icon && <type.icon className='h-3.5 w-3.5' />}
                              <span>{type.label}</span>
                            </FormLabel>
                          </FormItem>
                        ))}
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {taskType === 'cron' && (
                <FormField
                  control={form.control}
                  name='cron_expression'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cron 表达式</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder='0 0 * * *' />
                      </FormControl>
                      <FormDescription>
                        例如: 0 0 * * * 表示每天 0 点执行
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {taskType === 'interval' && (
                <FormField
                  control={form.control}
                  name='interval_seconds'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>间隔时间（秒）</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          min={1}
                          placeholder='3600'
                          value={field.value ?? ''}
                          onChange={(e) =>
                            field.onChange(e.target.value ? Number(e.target.value) : undefined)
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        例如 3600 表示每小时执行一次
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {taskType === 'date' && (
                <FormField
                  control={form.control}
                  name='run_date'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>执行时间</FormLabel>
                      <FormControl>
                        <Input {...field} type='datetime-local' />
                      </FormControl>
                      <FormDescription>选择一次性执行的时间</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* 处理函数参数 - 动态表单 */}
              {taskName && currentHandlerParams.length > 0 && (
                <div className='space-y-2'>
                  <Label className='text-sm font-medium'>函数参数</Label>
                  <div className='rounded-md border p-4'>
                    <HandlerParamsForm
                      params={currentHandlerParams}
                      value={paramsValue}
                      onChange={setParamsValue}
                    />
                  </div>
                </div>
              )}

              {/* 通知配置 */}
              <div className='space-y-4'>
                <div className='flex items-center gap-2'>
                  <Bell className='h-4 w-4' />
                  <Label className='text-sm font-medium'>通知配置</Label>
                </div>
                <div className='rounded-md border p-4 space-y-4'>
                  <FormField
                    control={form.control}
                    name='robot_config_id'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>通知机器人</FormLabel>
                        <SelectDropdown
                          defaultValue={field.value?.toString() || ''}
                          onValueChange={(v) => field.onChange(v ? Number(v) : null)}
                          placeholder='选择机器人'
                          items={robotConfigs.map((r) => ({
                            label: `${r.name} (${r.platform === 'dingtalk' ? '钉钉' : '飞书'})`,
                            value: r.id.toString(),
                          }))}
                        />
                        <FormDescription>
                          选择任务执行完成后发送通知的机器人
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className='grid grid-cols-2 gap-4'>
                    <FormField
                      control={form.control}
                      name='notify_on_success'
                      render={({ field }) => (
                        <FormItem className='flex items-center justify-between rounded-md border p-3'>
                          <div className='space-y-0.5'>
                            <FormLabel className='text-sm'>成功通知</FormLabel>
                            <FormDescription className='text-xs'>
                              任务执行成功时发送通知
                            </FormDescription>
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

                    <FormField
                      control={form.control}
                      name='notify_on_failure'
                      render={({ field }) => (
                        <FormItem className='flex items-center justify-between rounded-md border p-3'>
                          <div className='space-y-0.5'>
                            <FormLabel className='text-sm'>失败通知</FormLabel>
                            <FormDescription className='text-xs'>
                              任务执行失败时发送通知
                            </FormDescription>
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
                  </div>
                </div>
              </div>
            </form>
          </Form>
        </ScrollArea>

        <SheetFooter className='flex-row justify-end gap-2 border-t px-6 py-4'>
          <SheetClose asChild>
            <Button variant='outline'>取消</Button>
          </SheetClose>
          <Button
            form='tasks-form'
            type='submit'
            disabled={createTask.isPending || updateTask.isPending}
          >
            {createTask.isPending || updateTask.isPending
              ? '保存中...'
              : '保存'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
