/**
 * 公众号管理 API (TanStack Query)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { ApiResponse } from '@/lib/types'
import type {
  AccountParams,
  CreateAccountRequest,
  CreateGroupRequest,
  GroupedAccounts,
  PaginatedAccountResponse,
  UpdateAccountRequest,
  UpdateGroupRequest,
  WechatAccount,
  WechatAccountGroup,
} from '../types/account'

// ============ Query Keys ============

export const accountGroupKeys = {
  all: ['wechat-account-groups'] as const,
  list: () => [...accountGroupKeys.all, 'list'] as const,
}

export const accountKeys = {
  all: ['wechat-accounts'] as const,
  list: (params?: AccountParams) => [...accountKeys.all, 'list', params] as const,
  grouped: () => [...accountKeys.all, 'grouped'] as const,
  detail: (id: number) => [...accountKeys.all, 'detail', id] as const,
}

// ============ 分组 API ============

/** 获取分组列表 */
export function useAccountGroups() {
  return useQuery({
    queryKey: accountGroupKeys.list(),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<WechatAccountGroup[]>>(
        '/wechat-account-groups'
      )
      return response.data.data
    },
  })
}

/** 创建分组 */
export function useCreateGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: CreateGroupRequest) => {
      const response = await apiClient.post<ApiResponse<WechatAccountGroup>>(
        '/wechat-account-groups',
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountGroupKeys.all })
      queryClient.invalidateQueries({ queryKey: accountKeys.grouped() })
    },
  })
}

/** 更新分组 */
export function useUpdateGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateGroupRequest }) => {
      const response = await apiClient.put<ApiResponse<WechatAccountGroup>>(
        `/wechat-account-groups/${id}`,
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountGroupKeys.all })
      queryClient.invalidateQueries({ queryKey: accountKeys.grouped() })
    },
  })
}

/** 删除分组 */
export function useDeleteGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/wechat-account-groups/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountGroupKeys.all })
      queryClient.invalidateQueries({ queryKey: accountKeys.all })
    },
  })
}

/** 切换分组采集状态 */
export function useToggleGroupCollection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const response = await apiClient.put<ApiResponse<WechatAccountGroup>>(
        `/wechat-account-groups/${id}/toggle-collection`
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountGroupKeys.all })
      queryClient.invalidateQueries({ queryKey: accountKeys.grouped() })
    },
  })
}

// ============ 公众号 API ============

/** 获取公众号列表（分页） */
export function useAccounts(params: AccountParams = {}) {
  return useQuery({
    queryKey: accountKeys.list(params),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<PaginatedAccountResponse>>(
        '/wechat-accounts',
        { params }
      )
      return response.data.data
    },
  })
}

/** 获取按分组组织的公众号列表（树形） */
export function useGroupedAccounts() {
  return useQuery({
    queryKey: accountKeys.grouped(),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<GroupedAccounts[]>>(
        '/wechat-accounts/grouped'
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
      queryClient.invalidateQueries({ queryKey: accountGroupKeys.all })
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
      queryClient.invalidateQueries({ queryKey: accountGroupKeys.all })
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

/** 移动公众号到分组 */
export function useMoveAccountToGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, groupId }: { id: number; groupId: number | null }) => {
      const response = await apiClient.put<ApiResponse<WechatAccount>>(
        `/wechat-accounts/${id}/move-group`,
        { group_id: groupId }
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all })
      queryClient.invalidateQueries({ queryKey: accountGroupKeys.all })
    },
  })
}

/** 批量移动公众号到分组 */
export function useBatchMoveToGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      accountIds,
      groupId,
    }: {
      accountIds: number[]
      groupId: number | null
    }) => {
      const response = await apiClient.post<ApiResponse<{ message: string }>>(
        '/wechat-accounts/batch-move-group',
        { account_ids: accountIds, group_id: groupId }
      )
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all })
      queryClient.invalidateQueries({ queryKey: accountGroupKeys.all })
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
