import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type {
  HtmlTemplate,
  HtmlTemplateCreate,
  HtmlTemplateUpdate,
  RenderResult,
  TemplateCategory,
  TemplateCategoryCreate,
} from '../data/schema'

interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

// Query Keys
export const templateKeys = {
  all: ['html-templates'] as const,
  list: (params?: Record<string, unknown>) =>
    [...templateKeys.all, 'list', params] as const,
  detail: (id: number) => [...templateKeys.all, 'detail', id] as const,
}

export const categoryKeys = {
  all: ['template-categories'] as const,
  list: () => [...categoryKeys.all, 'list'] as const,
}

// ========== 分类 API ==========

export function useTemplateCategories() {
  return useQuery({
    queryKey: categoryKeys.list(),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<TemplateCategory[]>>(
        '/template-categories'
      )
      return response.data.data
    },
  })
}

export function useCreateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: TemplateCategoryCreate) => {
      const response = await apiClient.post<ApiResponse<{ id: number }>>(
        '/template-categories',
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.all })
    },
  })
}

export function useDeleteCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/template-categories/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.all })
    },
  })
}

// ========== 模板 API ==========

export function useHtmlTemplates(params?: {
  category_id?: number
  is_active?: boolean
  keyword?: string
}) {
  return useQuery({
    queryKey: templateKeys.list(params),
    queryFn: async () => {
      const response = await apiClient.get<
        ApiResponse<{ items: HtmlTemplate[]; total: number }>
      >('/html-templates', { params })
      return response.data.data
    },
  })
}

export function useHtmlTemplate(id: number) {
  return useQuery({
    queryKey: templateKeys.detail(id),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<HtmlTemplate>>(
        `/html-templates/${id}`
      )
      return response.data.data
    },
    enabled: id > 0,
  })
}

export function useCreateTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: HtmlTemplateCreate) => {
      const response = await apiClient.post<ApiResponse<{ id: number }>>(
        '/html-templates',
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all })
    },
  })
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number
      data: HtmlTemplateUpdate
    }) => {
      await apiClient.put(`/html-templates/${id}`, data)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all })
      queryClient.invalidateQueries({
        queryKey: templateKeys.detail(variables.id),
      })
    },
  })
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/html-templates/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all })
    },
  })
}

export function useExtractVariables() {
  return useMutation({
    mutationFn: async (html_content: string) => {
      const response = await apiClient.post<
        ApiResponse<{ variables: string[] }>
      >('/html-templates/extract-variables', { html_content })
      return response.data.data.variables
    },
  })
}

export function useRenderTemplate() {
  return useMutation({
    mutationFn: async ({
      templateId,
      variables,
    }: {
      templateId: number
      variables: Record<string, string>
    }) => {
      const response = await apiClient.post<ApiResponse<RenderResult>>(
        `/html-templates/${templateId}/render`,
        { template_id: templateId, variables }
      )
      return response.data.data
    },
  })
}
