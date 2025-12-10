/**
 * 定时任务 API (TanStack Query)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { ApiResponse } from '@/lib/types'
import type {
  Task,
  TaskCreate,
  TaskUpdate,
  TaskExecution,
  TaskHandler,
} from '../data/schema'

// Query Keys
export const taskKeys = {
  all: ['tasks'] as const,
  list: (params?: {
    status?: string
    category?: string
    page?: number
    size?: number
  }) => [...taskKeys.all, 'list', params] as const,
  detail: (id: number) => [...taskKeys.all, 'detail', id] as const,
  handlers: () => [...taskKeys.all, 'handlers'] as const,
  categories: () => [...taskKeys.all, 'categories'] as const,
  executions: (taskId: number, params?: { page?: number; size?: number }) =>
    [...taskKeys.all, 'executions', taskId, params] as const,
  allExecutions: (params?: {
    task_id?: number
    status?: string
    page?: number
    size?: number
  }) => [...taskKeys.all, 'allExecutions', params] as const,
  executionDetail: (executionId: number) =>
    [...taskKeys.all, 'executionDetail', executionId] as const,
}

// 获取任务列表
export function useTasks(
  params: {
    status?: string
    category?: string
    page?: number
    size?: number
  } = {}
) {
  return useQuery({
    queryKey: taskKeys.list(params),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<Task[]>>('/tasks', {
        params,
      })
      return response.data.data
    },
  })
}

// 获取单个任务详情
export function useTask(id: number) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<Task>>(`/tasks/${id}`)
      return response.data.data
    },
    enabled: id > 0,
  })
}

// 获取可用的任务处理函数
export function useTaskHandlers() {
  return useQuery({
    queryKey: taskKeys.handlers(),
    queryFn: async () => {
      const response =
        await apiClient.get<ApiResponse<TaskHandler[]>>('/tasks/handlers')
      return response.data.data
    },
  })
}

// 获取已有的任务分类列表
export function useTaskCategories() {
  return useQuery({
    queryKey: taskKeys.categories(),
    queryFn: async () => {
      const response =
        await apiClient.get<ApiResponse<string[]>>('/tasks/categories')
      return response.data.data
    },
  })
}

// 获取任务执行历史
export function useTaskExecutions(
  taskId: number,
  params: { page?: number; size?: number } = {}
) {
  return useQuery({
    queryKey: taskKeys.executions(taskId, params),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<TaskExecution[]>>(
        `/tasks/${taskId}/executions`,
        { params }
      )
      return response.data.data
    },
    enabled: taskId > 0,
  })
}

// 获取所有任务的执行记录
export function useAllExecutions(
  params: {
    task_id?: number
    status?: string
    page?: number
    size?: number
  } = {},
  options: {
    refetchInterval?: number | false
  } = {}
) {
  return useQuery({
    queryKey: taskKeys.allExecutions(params),
    queryFn: async () => {
      const response = await apiClient.get<
        ApiResponse<{
          items: TaskExecution[]
          total: number
          page: number
          size: number
        }>
      >('/tasks/executions/all', { params })
      return response.data.data
    },
    refetchInterval: options.refetchInterval,
  })
}

// 获取执行详情
export function useExecutionDetail(executionId: number) {
  return useQuery({
    queryKey: taskKeys.executionDetail(executionId),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<TaskExecution>>(
        `/tasks/executions/${executionId}`
      )
      return response.data.data
    },
    enabled: executionId > 0,
  })
}

// 创建任务
export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: TaskCreate) => {
      const response = await apiClient.post<ApiResponse<Task>>('/tasks', data)
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all })
    },
  })
}

// 更新任务
export function useUpdateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: TaskUpdate }) => {
      const response = await apiClient.put<ApiResponse<Task>>(
        `/tasks/${id}`,
        data
      )
      return response.data.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all })
      queryClient.invalidateQueries({
        queryKey: taskKeys.detail(variables.id),
      })
    },
  })
}

// 删除任务
export function useDeleteTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/tasks/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all })
    },
  })
}

// 手动执行任务
export function useRunTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const response = await apiClient.post<
        ApiResponse<{ task_id: number; message: string }>
      >(`/tasks/${id}/run`)
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all })
    },
  })
}

// 暂停任务
export function usePauseTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.post(`/tasks/${id}/pause`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all })
    },
  })
}

// 恢复任务
export function useResumeTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.post(`/tasks/${id}/resume`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all })
    },
  })
}

// 取消执行中的任务
export function useCancelExecution() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (executionId: number) => {
      const response = await apiClient.post(`/tasks/executions/${executionId}/cancel`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all })
    },
  })
}
