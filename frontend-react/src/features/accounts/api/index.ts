/**
 * 云客账号 API (TanStack Query)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { ApiResponse } from '@/lib/types'
import type { Account, AccountCreate, AccountUpdate, AccountStatus } from '../data/schema'

// Query Keys
export const accountKeys = {
  all: ['accounts'] as const,
  list: () => [...accountKeys.all, 'list'] as const,
  detail: (id: number) => [...accountKeys.all, 'detail', id] as const,
  status: (id: number) => [...accountKeys.all, 'status', id] as const,
}

// 获取账号列表
export function useAccounts() {
  return useQuery({
    queryKey: accountKeys.list(),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<Account[]>>('/accounts')
      return response.data.data
    },
  })
}

// 获取单个账号
export function useAccount(id: number) {
  return useQuery({
    queryKey: accountKeys.detail(id),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<Account>>(`/accounts/${id}`)
      return response.data.data
    },
    enabled: id > 0,
  })
}

// 获取账号状态
export function useAccountStatus(id: number) {
  return useQuery({
    queryKey: accountKeys.status(id),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<AccountStatus>>(`/accounts/${id}/status`)
      return response.data.data
    },
    enabled: id > 0,
  })
}

// 创建或更新账号
export function useCreateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: AccountCreate) => {
      const response = await apiClient.post<ApiResponse<Account>>('/accounts', data)
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all })
    },
  })
}

// 更新账号
export function useUpdateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: AccountUpdate }) => {
      const response = await apiClient.put<ApiResponse<Account>>(`/accounts/${id}`, data)
      return response.data.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all })
      queryClient.invalidateQueries({ queryKey: accountKeys.detail(variables.id) })
    },
  })
}

// 删除账号
export function useDeleteAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/accounts/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all })
    },
  })
}

// 手动登录账号
export function useLoginAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const response = await apiClient.post<ApiResponse<unknown>>(`/accounts/${id}/login`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all })
    },
  })
}
