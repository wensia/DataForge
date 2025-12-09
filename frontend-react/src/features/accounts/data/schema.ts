/**
 * 云客账号类型定义
 */

/** 账号响应数据 */
export interface Account {
  id: number
  phone: string
  company_id: number
  company_code: string
  company_name: string
  user_id: string | null
  last_login: string | null
  status: number // 0=未登录, 1=已登录
  created_at: string
  updated_at: string
}

/** 创建账号请求 */
export interface AccountCreate {
  phone: string
  password: string
  company_code: string
  company_name: string
  domain?: string
}

/** 更新账号请求 */
export interface AccountUpdate {
  password?: string
}

/** 账号状态 */
export interface AccountStatus {
  valid: boolean
  status: number
  last_login: string | null
  message: string
}
