/**
 * 全局类型定义 - 匹配后端 API 响应格式
 */

// API 响应格式 (匹配后端 ResponseModel)
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

// 用户角色 (后端返回小写)
export type UserRole = 'admin' | 'user'

// 用户信息
export interface User {
  id: number
  email: string
  name: string
  role: UserRole
  is_active: boolean
  created_at: string
  last_login_at: string | null
}

// Token 响应
export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

// 登录响应
export interface LoginResponse {
  user: User
  token: TokenResponse
}

// 登录请求
export interface LoginRequest {
  email: string
  password: string
}

// 云客账号
export interface YunkeAccount {
  id: number
  phone: string
  company_name: string
  is_active: boolean
  is_logged_in: boolean
  last_sync_at: string | null
  created_at: string
}

// 定时任务类型
export type TaskType = 'CRON' | 'INTERVAL' | 'DATE'
export type TaskStatus = 'ACTIVE' | 'PAUSED' | 'DISABLED'

// 定时任务
export interface Task {
  id: number
  name: string
  description: string
  task_type: TaskType
  cron_expression: string | null
  interval_seconds: number | null
  run_date: string | null
  handler_path: string
  handler_kwargs: Record<string, unknown> | null
  status: TaskStatus
  is_system: boolean
  last_run_at: string | null
  next_run_at: string | null
  run_count: number
  success_count: number
  fail_count: number
  created_at: string
  updated_at: string
}

// 任务执行记录
export interface TaskExecution {
  id: number
  task_id: number
  task_name: string
  status: 'RUNNING' | 'SUCCESS' | 'FAILED'
  started_at: string
  finished_at: string | null
  duration: number | null
  result: string | null
  error: string | null
}

// API 密钥
export interface ApiKey {
  id: number
  name: string
  key_prefix: string
  is_active: boolean
  expires_at: string | null
  last_used_at: string | null
  created_at: string
}

// 飞书配置
export interface FeishuConfig {
  id: number
  client_name: string
  bitable_name: string
  table_name: string
  is_active: boolean
  sync_enabled: boolean
}
