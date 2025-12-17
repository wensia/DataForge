/**
 * 公众号管理 API (TanStack Query)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { ApiResponse } from '@/lib/types'
import type {
  AccountParams,
  AssignTagsRequest,
  CreateAccountRequest,
  CreateTagRequest,
  PaginatedAccountResponse,
  UpdateAccountRequest,
  UpdateTagRequest,
  WechatAccount,
  WechatAccountTag,
} from '../types/account'

// ============ Query Keys ============

export const accountTagKeys = {
  all: ['wechat-account-tags'] as const,
  list: () => [...accountTagKeys.all, 'list'] as const,
}

export const accountKeys = {
  all: ['wechat-accounts'] as const,
  list: (params?: AccountParams) => [...accountKeys.all, 'list', params] as const,
  detail: (id: number) => [...accountKeys.all, 'detail', id] as const,
}

// ============ 标签 API ============

/** 获取标签列表 */
export function useTags() {
  return useQuery({
    queryKey: accountTagKeys.list(),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<WechatAccountTag[]>>(
        '/wechat-account-tags'
      )
      return response.data.data
    },
  })
}

/** 创建标签 */
export function useCreateTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: CreateTagRequest) => {
      const response = await apiClient.post<ApiResponse<WechatAccountTag>>(
        '/wechat-account-tags',
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountTagKeys.all })
    },
  })
}

/** 更新标签 */
export function useUpdateTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateTagRequest }) => {
      const response = await apiClient.put<ApiResponse<WechatAccountTag>>(
        `/wechat-account-tags/${id}`,
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountTagKeys.all })
    },
  })
}

/** 删除标签 */
export function useDeleteTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/wechat-account-tags/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountTagKeys.all })
      queryClient.invalidateQueries({ queryKey: accountKeys.all })
    },
  })
}

// ============ 公众号 API ============

/** 获取公众号列表（分页） */
export function useAccounts(params: AccountParams = {}) {
  return useQuery({
    queryKey: accountKeys.list(params),
    queryFn: async () => {
      // 将 tag_ids 数组转换为逗号分隔的字符串
      const queryParams: Record<string, unknown> = { ...params }
      if (params.tag_ids && params.tag_ids.length > 0) {
        queryParams.tag_ids = params.tag_ids.join(',')
      } else {
        delete queryParams.tag_ids
      }
      const response = await apiClient.get<ApiResponse<PaginatedAccountResponse>>(
        '/wechat-accounts',
        { params: queryParams }
      )
      return response.data.data
    },
  })
}

/** 获取单个公众号 */
export function useAccount(id: number) {
  return useQuery({
    queryKey: accountKeys.detail(id),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<WechatAccount>>(
        `/wechat-accounts/${id}`
      )
      return response.data.data
    },
    enabled: !!id,
  })
}

/** 创建公众号 */
export function useCreateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: CreateAccountRequest) => {
      const response = await apiClient.post<ApiResponse<WechatAccount>>(
        '/wechat-accounts',
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all })
      queryClient.invalidateQueries({ queryKey: accountTagKeys.all })
    },
  })
}

/** 更新公众号 */
export function useUpdateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateAccountRequest }) => {
      const response = await apiClient.put<ApiResponse<WechatAccount>>(
        `/wechat-accounts/${id}`,
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all })
      queryClient.invalidateQueries({ queryKey: accountTagKeys.all })
    },
  })
}

/** 删除公众号 */
export function useDeleteAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/wechat-accounts/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all })
      queryClient.invalidateQueries({ queryKey: accountTagKeys.all })
    },
  })
}

/** 切换公众号采集状态 */
export function useToggleAccountCollection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const response = await apiClient.put<ApiResponse<WechatAccount>>(
        `/wechat-accounts/${id}/toggle-collection`
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all })
    },
  })
}

/** 更新公众号标签 */
export function useUpdateAccountTags() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: AssignTagsRequest }) => {
      const response = await apiClient.put<ApiResponse<WechatAccount>>(
        `/wechat-accounts/${id}/tags`,
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all })
      queryClient.invalidateQueries({ queryKey: accountTagKeys.all })
    },
  })
}

// ============ URL 解析 API ============

/** 解析结果类型 */
export interface ParseUrlResponse {
  biz: string
  name: string
  avatar_url: string | null
  user_name: string | null
}

/** 从文章链接解析公众号信息 */
export function useParseArticleUrl() {
  return useMutation({
    mutationFn: async (url: string) => {
      const response = await apiClient.post<ApiResponse<ParseUrlResponse>>(
        '/wechat-accounts/parse-url',
        { url }
      )
      return response.data.data
    },
  })
}

// ============ 头像同步 API ============

/** 同步头像结果 */
export interface SyncAvatarsResult {
  synced: number
  failed: number
}

/** 批量同步公众号头像到本地 */
export function useSyncAvatars() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<ApiResponse<SyncAvatarsResult>>(
        '/wechat-accounts/sync-avatars'
      )
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all })
    },
  })
}
