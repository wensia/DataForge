/**
 * 数据分析 API (TanStack Query)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { ApiResponse } from '@/lib/types'
import type {
  AIProvider,
  AnalysisRequest,
  AnalysisResult,
  CallRecord,
  CallRecordStats,
  ChatRequest,
  PaginatedResponse,
  RecordsParams,
} from '../types'

// Query Keys
export const analysisKeys = {
  all: ['analysis'] as const,
  records: (params?: RecordsParams) => [...analysisKeys.all, 'records', params] as const,
  stats: (params?: { start_time?: string; end_time?: string }) =>
    [...analysisKeys.all, 'stats', params] as const,
  providers: () => [...analysisKeys.all, 'providers'] as const,
  history: (params?: { analysis_type?: string; page?: number; page_size?: number }) =>
    [...analysisKeys.all, 'history', params] as const,
}

// 获取筛选选项（员工列表等）
export function useFilterOptions() {
  return useQuery({
    queryKey: [...analysisKeys.all, 'filter-options'],
    queryFn: async () => {
      const response = await apiClient.get<
        ApiResponse<{
          staff_names: string[]
        }>
      >('/analysis/filter-options')
      return response.data.data
    },
  })
}

// 获取通话记录列表
export function useRecords(params: RecordsParams = {}) {
  return useQuery({
    queryKey: analysisKeys.records(params),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<PaginatedResponse<CallRecord>>>(
        '/analysis/records',
        { params }
      )
      return response.data.data
    },
  })
}

// 获取通话记录统计
export function useRecordsStats(params: { start_time?: string; end_time?: string } = {}) {
  return useQuery({
    queryKey: analysisKeys.stats(params),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<CallRecordStats>>(
        '/analysis/records/stats',
        { params }
      )
      return response.data.data
    },
  })
}

// 获取 AI 服务列表
export function useAIProviders() {
  return useQuery({
    queryKey: analysisKeys.providers(),
    queryFn: async () => {
      const response = await apiClient.get<
        ApiResponse<{ providers: AIProvider[]; default: string }>
      >('/analysis/providers')
      return response.data.data
    },
  })
}

// 获取分析历史
export function useAnalysisHistory(
  params: { analysis_type?: string; page?: number; page_size?: number } = {}
) {
  return useQuery({
    queryKey: analysisKeys.history(params),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<PaginatedResponse<AnalysisResult>>>(
        '/analysis/history',
        { params }
      )
      return response.data.data
    },
  })
}

// 同步数据
export function useSyncData() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<
        ApiResponse<{
          success: number
          failed: number
          details: Array<{
            table: string
            status: string
            result?: Record<string, number>
            error?: string
          }>
        }>
      >('/analysis/sync')
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: analysisKeys.records() })
      queryClient.invalidateQueries({ queryKey: analysisKeys.stats() })
    },
  })
}

// 生成数据摘要
export function useGenerateSummary() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: AnalysisRequest) => {
      const response = await apiClient.post<ApiResponse<AnalysisResult>>(
        '/analysis/summary',
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: analysisKeys.history() })
    },
  })
}

// 分析数据趋势
export function useAnalyzeTrend() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: AnalysisRequest & { focus?: string }) => {
      const { focus, ...rest } = data
      const response = await apiClient.post<ApiResponse<AnalysisResult>>(
        '/analysis/trend',
        rest,
        { params: focus ? { focus } : undefined }
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: analysisKeys.history() })
    },
  })
}

// 检测数据异常
export function useDetectAnomalies() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: AnalysisRequest & { threshold?: string }) => {
      const { threshold, ...rest } = data
      const response = await apiClient.post<ApiResponse<AnalysisResult>>(
        '/analysis/anomaly',
        rest,
        { params: threshold ? { threshold } : undefined }
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: analysisKeys.history() })
    },
  })
}

// 智能问答
export function useChatWithData() {
  return useMutation({
    mutationFn: async (data: ChatRequest) => {
      const response = await apiClient.post<ApiResponse<AnalysisResult>>(
        '/analysis/chat',
        data
      )
      return response.data.data
    },
  })
}

// 代理获取录音文件
export async function proxyRecord(url: string): Promise<Blob> {
  const response = await fetch('/api/v1/record-proxy/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  })

  if (!response.ok) {
    throw new Error(`获取录音失败: ${response.status}`)
  }

  return response.blob()
}

// ============ 用户偏好 API ============

// 用户偏好类型
export interface TablePreference {
  columnVisibility: Record<string, boolean>
  columnOrder: string[]
  sorting: Array<{ id: string; desc: boolean }>
}

export interface UserPreferenceResponse {
  id: number
  user_id: number
  preference_key: string
  preference_value: string
  created_at: string
  updated_at: string
}

// 偏好 Query Keys
export const preferenceKeys = {
  all: ['user-preferences'] as const,
  detail: (key: string) => [...preferenceKeys.all, key] as const,
}

// 获取用户偏好
export function useUserPreference<T = unknown>(key: string) {
  return useQuery({
    queryKey: preferenceKeys.detail(key),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<UserPreferenceResponse | null>>(
        `/user-preferences/${key}`
      )
      const data = response.data.data
      if (!data) return null
      try {
        return JSON.parse(data.preference_value) as T
      } catch {
        return null
      }
    },
    staleTime: 1000 * 60 * 5, // 5 分钟缓存
  })
}

// 保存用户偏好
export function useSaveUserPreference() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      const response = await apiClient.put<ApiResponse<UserPreferenceResponse>>(
        `/user-preferences/${key}`,
        { preference_value: JSON.stringify(value) }
      )
      return response.data.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: preferenceKeys.detail(variables.key) })
    },
  })
}

// 删除用户偏好
export function useDeleteUserPreference() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (key: string) => {
      await apiClient.delete(`/user-preferences/${key}`)
    },
    onSuccess: (_, key) => {
      queryClient.invalidateQueries({ queryKey: preferenceKeys.detail(key) })
    },
  })
}
