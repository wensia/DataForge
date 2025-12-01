import request from './request'
import type { ResponseModel } from '@/types'

/**
 * 账号信息
 */
export interface Account {
  id: number
  phone: string
  company_id: number
  company_code: string
  company_name: string
  user_id: string | null
  last_login: string | null
  status: number
  created_at: string
  updated_at: string
}

/**
 * 创建/更新账号参数
 */
export interface CreateAccountParams {
  phone: string
  password: string
  company_code: string
  company_name: string
  domain?: string
}

/**
 * 更新账号参数
 */
export interface UpdateAccountParams {
  password?: string
}

/**
 * 获取所有账号
 */
export const getAccounts = (): Promise<ResponseModel<Account[]>> => {
  return request.get('/accounts')
}

/**
 * 获取单个账号
 */
export const getAccount = (id: number): Promise<ResponseModel<Account>> => {
  return request.get(`/accounts/${id}`)
}

/**
 * 创建或更新账号（Upsert）
 */
export const createOrUpdateAccount = (data: CreateAccountParams): Promise<ResponseModel<Account>> => {
  return request.post('/accounts', data)
}

/**
 * 更新账号密码
 */
export const updateAccount = (id: number, data: UpdateAccountParams): Promise<ResponseModel<Account>> => {
  return request.put(`/accounts/${id}`, data)
}

/**
 * 删除账号
 */
export const deleteAccount = (id: number): Promise<ResponseModel> => {
  return request.delete(`/accounts/${id}`)
}

/**
 * 手动登录账号
 */
export const loginAccount = (id: number): Promise<ResponseModel> => {
  return request.post(`/accounts/${id}/login`)
}

/**
 * 检查账号状态
 */
export const checkAccountStatus = (id: number): Promise<ResponseModel<{
  valid: boolean
  status: number
  last_login: string | null
}>> => {
  return request.get(`/accounts/${id}/status`)
}

/**
 * 公司信息
 */
export interface CompanyInfo {
  userId: string
  userType: number
  companyCode: string
  company: string
  domain: string
}

/**
 * 验证账号并获取公司列表
 */
export const checkAndGetUsers = (account: string, password: string): Promise<ResponseModel<{
  json: {
    code: number
    msg: string
    data: CompanyInfo[]
  }
  cookies: Record<string, string>
}>> => {
  return request.post('/yunke/check-users', { account, password })
}
