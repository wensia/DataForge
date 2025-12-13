/**
 * AI 对话 API (TanStack Query)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { ApiResponse } from '@/lib/types'
import type {
  AIProvider,
  Conversation,
  ConversationCreate,
  ConversationUpdate,
  ConversationWithMessages,
  Message,
  PaginatedResponse,
  SendMessageRequest,
  SendMessageResponse,
} from '../types'

// Query Keys
export const chatKeys = {
  all: ['chat'] as const,
  conversations: (params?: { conversation_type?: string; include_archived?: boolean }) =>
    [...chatKeys.all, 'conversations', params] as const,
  conversation: (id: number) => [...chatKeys.all, 'conversation', id] as const,
  messages: (conversationId: number, params?: { page?: number; page_size?: number }) =>
    [...chatKeys.all, 'messages', conversationId, params] as const,
  providers: () => [...chatKeys.all, 'providers'] as const,
}

// 获取对话列表
export function useConversations(
  params: {
    conversation_type?: string
    include_archived?: boolean
    page?: number
    page_size?: number
  } = {}
) {
  return useQuery({
    queryKey: chatKeys.conversations(params),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<PaginatedResponse<Conversation>>>(
        '/chat/conversations',
        { params }
      )
      return response.data.data
    },
  })
}

// 获取单个对话详情
export function useConversation(conversationId: number | null, includeMessages = true) {
  return useQuery({
    queryKey: [...chatKeys.conversation(conversationId ?? 0), includeMessages],
    queryFn: async () => {
      if (!conversationId) return null
      const response = await apiClient.get<ApiResponse<ConversationWithMessages>>(
        `/chat/conversations/${conversationId}`,
        { params: { include_messages: includeMessages } }
      )
      return response.data.data
    },
    enabled: !!conversationId,
  })
}

// 获取对话消息
export function useMessages(
  conversationId: number | null,
  params: { page?: number; page_size?: number } = {}
) {
  return useQuery({
    queryKey: chatKeys.messages(conversationId ?? 0, params),
    queryFn: async () => {
      if (!conversationId) return null
      const response = await apiClient.get<ApiResponse<PaginatedResponse<Message>>>(
        `/chat/conversations/${conversationId}/messages`,
        { params }
      )
      return response.data.data
    },
    enabled: !!conversationId,
  })
}

// 获取 AI 提供商列表
export function useProviders() {
  return useQuery({
    queryKey: chatKeys.providers(),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<{ providers: AIProvider[] }>>(
        '/chat/providers'
      )
      return response.data.data.providers
    },
  })
}

// 创建对话
export function useCreateConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: ConversationCreate) => {
      const response = await apiClient.post<ApiResponse<Conversation>>(
        '/chat/conversations',
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations() })
    },
  })
}

// 更新对话
export function useUpdateConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      conversationId,
      data,
    }: {
      conversationId: number
      data: ConversationUpdate
    }) => {
      const response = await apiClient.put<ApiResponse<Conversation>>(
        `/chat/conversations/${conversationId}`,
        data
      )
      return response.data.data
    },
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations() })
      queryClient.invalidateQueries({ queryKey: chatKeys.conversation(conversationId) })
    },
  })
}

// 删除对话
export function useDeleteConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (conversationId: number) => {
      await apiClient.delete(`/chat/conversations/${conversationId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations() })
    },
  })
}

// 发送消息
export function useSendMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      conversationId,
      data,
    }: {
      conversationId: number
      data: SendMessageRequest
    }) => {
      const response = await apiClient.post<ApiResponse<SendMessageResponse>>(
        `/chat/conversations/${conversationId}/messages`,
        data
      )
      return response.data.data
    },
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.conversation(conversationId) })
      queryClient.invalidateQueries({ queryKey: chatKeys.messages(conversationId) })
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations() })
    },
  })
}
