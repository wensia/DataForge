/**
 * 录音下载 API (TanStack Query)
 */
import { useMutation, useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { ApiResponse } from '@/lib/types'
import type { CallLogQuery, CallLogResponse, RecordUrlResponse } from '../types'

// Query Keys - 使用扁平化参数避免循环渲染
export const recordKeys = {
  all: ['records'] as const,
  callLogs: (params: CallLogQuery) =>
    [
      ...recordKeys.all,
      'call-logs',
      params.accountId,
      params.startTime,
      params.endTime,
      params.page,
      params.pageSize,
      params.callType,
      params.searchPhone,
    ] as const,
  recordUrl: (accountId: number, voiceId: string) =>
    [...recordKeys.all, 'url', accountId, voiceId] as const,
}

// 获取通话记录列表
export function useCallLogs(params: CallLogQuery, enabled = true) {
  return useQuery({
    queryKey: recordKeys.callLogs(params),
    queryFn: async () => {
      const response = await apiClient.post<ApiResponse<CallLogResponse>>('/yunke/call-logs', {
        account_id: params.accountId,
        start_time: params.startTime,
        end_time: params.endTime,
        page: params.page || 1,
        page_size: params.pageSize || 20,
        call_type: params.callType === 'outbound' ? 1 : params.callType === 'inbound' ? 2 : undefined,
        search_phone: params.searchPhone || undefined,
      })
      return response.data.data
    },
    enabled: enabled && params.accountId > 0,
  })
}

// 获取录音下载地址
export function useRecordUrl() {
  return useMutation({
    mutationFn: async ({ accountId, voiceId }: { accountId: number; voiceId: string }) => {
      const response = await apiClient.post<ApiResponse<RecordUrlResponse>>('/yunke/record/url', {
        account_id: accountId,
        voice_id: voiceId,
      })
      return response.data.data
    },
  })
}

// 下载录音文件
export function useDownloadRecord() {
  return useMutation({
    mutationFn: async ({ accountId, voiceId }: { accountId: number; voiceId: string }) => {
      const response = await apiClient.post('/yunke/record/download', {
        account_id: accountId,
        voice_id: voiceId,
      }, {
        responseType: 'blob',
      })
      return {
        blob: response.data as Blob,
        voiceId,
      }
    },
  })
}

// 通过代理获取录音流（解决跨域问题）
export function useProxyRecord() {
  return useMutation({
    mutationFn: async ({ url }: { url: string }) => {
      const response = await apiClient.post('/record-proxy/stream', {
        url,
      }, {
        responseType: 'blob',
      })
      return response.data as Blob
    },
  })
}
