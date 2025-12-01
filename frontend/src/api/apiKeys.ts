import type { ResponseModel } from '@/types'
import request from './request'

// API 密钥类型定义
export interface ApiKey {
  id: number
  key: string
  name: string
  is_active: boolean
  created_at: string
  expires_at: string | null
  last_used_at: string | null
  usage_count: number
  notes: string | null
}

export interface ApiKeyCreate {
  name: string
  key?: string
  expires_at?: string
  notes?: string
}

export interface ApiKeyUpdate {
  name?: string
  is_active?: boolean
  expires_at?: string
  notes?: string
}

export interface ApiKeyListResponse {
  items: ApiKey[]
  total: number
}

/**
 * 获取 API 密钥列表
 */
export const getApiKeys = (
  skip = 0,
  limit = 100,
  isActive?: boolean
): Promise<ResponseModel<ApiKeyListResponse>> => {
  const params: Record<string, unknown> = { skip, limit }
  if (isActive !== undefined) {
    params.is_active = isActive
  }
  return request.get('/api-keys', { params })
}

/**
 * 获取单个 API 密钥详情
 */
export const getApiKey = (id: number): Promise<ResponseModel<ApiKey>> => {
  return request.get(`/api-keys/${id}`)
}

/**
 * 创建新的 API 密钥
 */
export const createApiKey = (data: ApiKeyCreate): Promise<ResponseModel<ApiKey>> => {
  return request.post('/api-keys', data)
}

/**
 * 更新 API 密钥
 */
export const updateApiKey = (id: number, data: ApiKeyUpdate): Promise<ResponseModel<ApiKey>> => {
  return request.put(`/api-keys/${id}`, data)
}

/**
 * 删除 API 密钥
 */
export const deleteApiKey = (id: number): Promise<ResponseModel> => {
  return request.delete(`/api-keys/${id}`)
}
