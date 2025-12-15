import { z } from 'zod'

/** 任务类型 */
export const taskTypeEnum = z.enum(['cron', 'interval', 'date', 'manual'])
export type TaskType = z.infer<typeof taskTypeEnum>

/** 任务状态 */
export const taskStatusEnum = z.enum(['active', 'paused', 'disabled'])
export type TaskStatus = z.infer<typeof taskStatusEnum>

/** 执行状态 */
export const executionStatusEnum = z.enum([
  'pending',
  'running',
  'success',
  'failed',
  'cancelled',
])
export type ExecutionStatus = z.infer<typeof executionStatusEnum>

/** 任务 */
export const taskSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  task_type: taskTypeEnum,
  cron_expression: z.string().nullable(),
  interval_seconds: z.number().nullable(),
  run_date: z.string().nullable(),
  handler_path: z.string(),
  handler_kwargs: z.string().nullable(),
  status: taskStatusEnum,
  is_system: z.boolean(),
  category: z.string().nullable(),
  notify_on_success: z.boolean(),
  notify_on_failure: z.boolean(),
  robot_config_id: z.number().nullable(),
  last_run_at: z.string().nullable(),
  next_run_at: z.string().nullable(),
  run_count: z.number(),
  success_count: z.number(),
  fail_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type Task = z.infer<typeof taskSchema>

/** 创建任务参数 */
export const taskCreateSchema = z.object({
  name: z.string().min(1, '任务名称不能为空'),
  description: z.string().optional().default(''),
  task_type: taskTypeEnum,
  cron_expression: z.string().optional(),
  interval_seconds: z.number().optional(),
  run_date: z.string().optional(),
  handler_path: z.string().min(1, '处理函数不能为空'),
  handler_kwargs: z.string().optional(),
  category: z.string().optional(),
  notify_on_success: z.boolean().optional().default(false),
  notify_on_failure: z.boolean().optional().default(false),
  robot_config_id: z.number().nullable().optional(),
})
export type TaskCreate = z.infer<typeof taskCreateSchema>

/** 更新任务参数 */
export const taskUpdateSchema = z.object({
  description: z.string().optional(),
  task_type: taskTypeEnum.optional(),
  cron_expression: z.string().optional(),
  interval_seconds: z.number().optional(),
  run_date: z.string().optional(),
  handler_kwargs: z.string().optional(),
  status: taskStatusEnum.optional(),
  category: z.string().optional(),
  notify_on_success: z.boolean().optional(),
  notify_on_failure: z.boolean().optional(),
  robot_config_id: z.number().nullable().optional(),
})
export type TaskUpdate = z.infer<typeof taskUpdateSchema>

/** 任务执行记录 */
export const taskExecutionSchema = z.object({
  id: z.number(),
  task_id: z.number(),
  task_name: z.string().optional(),
  status: executionStatusEnum,
  trigger_type: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  duration_ms: z.number().nullable(),
  result: z.string().nullable(),
  error_message: z.string().nullable(),
  log_output: z.string().nullable().optional(),
  created_at: z.string(),
})
export type TaskExecution = z.infer<typeof taskExecutionSchema>

/** 处理函数参数 */
export const taskHandlerParamSchema = z.object({
  name: z.string(),
  type: z.string(),
  default: z.string().nullable(),
  required: z.boolean(),
})
export type TaskHandlerParam = z.infer<typeof taskHandlerParamSchema>

/** 处理函数 */
export const taskHandlerSchema = z.object({
  path: z.string(),
  name: z.string(),
  description: z.string(),
  doc: z.string(),
  params: z.array(taskHandlerParamSchema),
})
export type TaskHandler = z.infer<typeof taskHandlerSchema>
