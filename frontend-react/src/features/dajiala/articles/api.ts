/**
 * 微信公众号文章 API (TanStack Query)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { ApiResponse } from '@/lib/types'
import type {
  ArticleParams,
  FetchArticlesRequest,
  FetchArticlesResponse,
  FilterOptions,
  PaginatedResponse,
  WechatArticle,
} from './types'

// Query Keys - 使用扁平化参数避免循环渲染
export const articleKeys = {
  all: ['wechat-articles'] as const,
  list: (params?: ArticleParams) =>
    [
      ...articleKeys.all,
      'list',
      params?.page,
      params?.page_size,
      params?.biz,
      params?.account_name,
      params?.title,
      params?.start_time,
      params?.end_time,
      params?.is_original,
      params?.config_id,
    ] as const,
  filterOptions: () => [...articleKeys.all, 'filter-options'] as const,
  detail: (id: number) => [...articleKeys.all, 'detail', id] as const,
}

// 获取文章列表
export function useWechatArticles(params: ArticleParams = {}) {
  return useQuery({
    queryKey: articleKeys.list(params),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<PaginatedResponse<WechatArticle>>>(
        '/wechat-articles',
        { params }
      )
      return response.data.data
    },
  })
}

// 获取筛选选项
export function useArticleFilterOptions() {
  return useQuery({
    queryKey: articleKeys.filterOptions(),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<FilterOptions>>(
        '/wechat-articles/filter-options'
      )
      return response.data.data
    },
  })
}

// 获取单篇文章
export function useWechatArticle(id: number) {
  return useQuery({
    queryKey: articleKeys.detail(id),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<WechatArticle>>(
        `/wechat-articles/${id}`
      )
      return response.data.data
    },
    enabled: !!id,
  })
}

// 采集文章
export function useFetchArticles() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      configId,
      data,
    }: {
      configId: number
      data: FetchArticlesRequest
    }) => {
      const response = await apiClient.post<ApiResponse<FetchArticlesResponse>>(
        `/wechat-articles/fetch`,
        data,
        { params: { config_id: configId } }
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: articleKeys.all })
    },
  })
}

// 删除文章
export function useDeleteArticles() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (articleIds: number[]) => {
      const response = await apiClient.delete<ApiResponse<{ deleted_count: number }>>(
        '/wechat-articles',
        { data: { article_ids: articleIds } }
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: articleKeys.all })
    },
  })
}
