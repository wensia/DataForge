import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { ApiResponse } from '@/lib/types'
import type {
  Page,
  PageCreate,
  PageUpdate,
  PageGroup,
  PageGroupCreate,
  PageGroupUpdate,
  ReorderRequest,
} from '../types'

// Query Keys
export const pageKeys = {
  all: ['pages'] as const,
  lists: () => [...pageKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...pageKeys.lists(), filters] as const,
  detail: (id: number) => [...pageKeys.all, 'detail', id] as const,
}

export const groupKeys = {
  all: ['page-groups'] as const,
  lists: () => [...groupKeys.all, 'list'] as const,
}

// ============================================================================
// 页面 API
// ============================================================================

// 获取所有页面（管理员用）
export function usePages() {
  return useQuery({
    queryKey: pageKeys.lists(),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<Page[]>>('/pages/all')
      return response.data.data || []
    },
    staleTime: 1000 * 60 * 5,
  })
}

// 创建页面
export function useCreatePage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: PageCreate) => {
      const response = await apiClient.post<ApiResponse<Page>>('/pages', data)
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pageKeys.all })
      queryClient.invalidateQueries({ queryKey: ['user-nav-config'] })
    },
  })
}

// 更新页面
export function useUpdatePage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: PageUpdate }) => {
      const response = await apiClient.put<ApiResponse<Page>>(`/pages/${id}`, data)
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pageKeys.all })
      queryClient.invalidateQueries({ queryKey: ['user-nav-config'] })
    },
  })
}

// 删除页面
export function useDeletePage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/pages/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pageKeys.all })
      queryClient.invalidateQueries({ queryKey: ['user-nav-config'] })
    },
  })
}

// 批量更新排序
export function useReorderPages() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: ReorderRequest) => {
      await apiClient.put('/pages/reorder', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pageKeys.all })
      queryClient.invalidateQueries({ queryKey: groupKeys.all })
      queryClient.invalidateQueries({ queryKey: ['user-nav-config'] })
    },
  })
}

// ============================================================================
// 分组 API
// ============================================================================

// 获取所有分组
export function useGroups() {
  return useQuery({
    queryKey: groupKeys.lists(),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<PageGroup[]>>('/page-groups')
      return response.data.data || []
    },
    staleTime: 1000 * 60 * 5,
  })
}

// 创建分组
export function useCreateGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: PageGroupCreate) => {
      const response = await apiClient.post<ApiResponse<PageGroup>>('/page-groups', data)
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.all })
      queryClient.invalidateQueries({ queryKey: pageKeys.all })
    },
  })
}

// 更新分组
export function useUpdateGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: PageGroupUpdate }) => {
      const response = await apiClient.put<ApiResponse<PageGroup>>(`/page-groups/${id}`, data)
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.all })
      queryClient.invalidateQueries({ queryKey: pageKeys.all })
    },
  })
}

// 删除分组
export function useDeleteGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/page-groups/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.all })
      queryClient.invalidateQueries({ queryKey: pageKeys.all })
      queryClient.invalidateQueries({ queryKey: ['user-nav-config'] })
    },
  })
}
