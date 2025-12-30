import type { QueryClient } from '@tanstack/react-query'
import { create } from 'zustand'

import { chatKeys } from '@/features/ai-chat/api'

// SSE 事件类型（与后端保持一致）
interface SSEEvent {
  type: 'start' | 'tool_start' | 'tool_result' | 'reasoning' | 'content' | 'done' | 'error'
  content?: string
  reasoning?: string
  user_message_id?: number
  assistant_message_id?: number
  tokens_used?: number
  error?: string
  tool_name?: string
  success?: boolean
}

type StartOptions = {
  conversationId: number
  content: string
  aiProvider?: string
  useDeepThinking?: boolean
}

type AiChatStreamState = {
  conversationId: number | null
  isStreaming: boolean
  streamingContent: string
  streamingReasoning: string
  pendingUserMessage: string | null
  streamingMessageId: number | null
  error: string | null

  start: (options: StartOptions) => Promise<void>
  stop: () => void
  clearError: () => void
  bindQueryClient: (queryClient: QueryClient) => void
}

let boundQueryClient: QueryClient | null = null
let abortController: AbortController | null = null
let runSeq = 0

export const useAiChatStreamStore = create<AiChatStreamState>((set, get) => ({
  conversationId: null,
  isStreaming: false,
  streamingContent: '',
  streamingReasoning: '',
  pendingUserMessage: null,
  streamingMessageId: null,
  error: null,

  bindQueryClient: (queryClient) => {
    boundQueryClient = queryClient
  },

  clearError: () => set({ error: null }),

  stop: () => {
    runSeq += 1
    abortController?.abort()
    abortController = null
    set({
      isStreaming: false,
      conversationId: null,
      streamingContent: '',
      streamingReasoning: '',
      pendingUserMessage: null,
      streamingMessageId: null,
    })
  },

  start: async ({ conversationId, content, aiProvider, useDeepThinking }) => {
    if (get().isStreaming) {
      set({ error: '已有生成任务正在进行，请先停止或等待完成。' })
      return
    }

    const seq = (runSeq += 1)

    set({
      conversationId,
      isStreaming: true,
      streamingContent: '',
      streamingReasoning: '',
      pendingUserMessage: content,
      streamingMessageId: null,
      error: null,
    })

    abortController = new AbortController()

    try {
      const token = localStorage.getItem('auth_token')
      const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1'

      const response = await fetch(
        `${baseUrl}/chat/conversations/${conversationId}/messages/stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content,
            ai_provider: aiProvider,
            enable_tools: true,
            use_deep_thinking: useDeepThinking ?? false,
          }),
          signal: abortController.signal,
        }
      )

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('无法获取响应流')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmedLine = line.trim()
          if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue

          const dataStr = trimmedLine.slice(6)
          if (dataStr === '[DONE]') continue

          try {
            const event: SSEEvent = JSON.parse(dataStr)

            // 已被新的 run 覆盖/停止
            if (seq !== runSeq) return

            switch (event.type) {
              case 'start': {
                if (event.assistant_message_id) {
                  set({ streamingMessageId: event.assistant_message_id })
                }

                boundQueryClient?.invalidateQueries({
                  queryKey: chatKeys.conversation(conversationId),
                })
                boundQueryClient?.invalidateQueries({
                  queryKey: chatKeys.conversationsRoot(),
                })
                break
              }

              case 'tool_start': {
                if (event.tool_name) {
                  const toolNames: Record<string, string> = {
                    query_call_records: '查询通话记录',
                    get_call_statistics: '统计通话数据',
                    get_staff_list: '获取员工列表',
                    get_call_ranking: '获取通话排行',
                    get_current_date: '获取当前日期',
                  }
                  const displayName = toolNames[event.tool_name] || event.tool_name
                  set((s) => ({
                    streamingContent: s.streamingContent + `\n🔍 正在${displayName}...\n`,
                  }))
                }
                break
              }

              case 'tool_result': {
                if (event.success) {
                  set((s) => ({ streamingContent: s.streamingContent + '✅ 数据查询完成\n\n' }))
                }
                break
              }

              case 'reasoning': {
                if (event.reasoning) {
                  set((s) => ({ streamingReasoning: s.streamingReasoning + event.reasoning }))
                }
                break
              }

              case 'content': {
                if (event.content) {
                  set((s) => ({ streamingContent: s.streamingContent + event.content }))
                }
                break
              }

              case 'done': {
                boundQueryClient?.invalidateQueries({
                  queryKey: chatKeys.conversation(conversationId),
                })
                boundQueryClient?.invalidateQueries({
                  queryKey: chatKeys.messagesRoot(conversationId),
                })
                boundQueryClient?.invalidateQueries({
                  queryKey: chatKeys.conversationsRoot(),
                })
                break
              }

              case 'error': {
                set({ error: event.error || '未知错误' })
                break
              }
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('解析 SSE 事件失败:', e, dataStr)
          }
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          // 用户主动取消或被新的 run 覆盖，不提示错误
        } else {
          set({ error: err.message })
        }
      }
    } finally {
      if (seq === runSeq) {
        set({
          isStreaming: false,
          conversationId: null,
          streamingContent: '',
          streamingReasoning: '',
          pendingUserMessage: null,
          streamingMessageId: null,
        })
      }
      abortController = null
    }
  },
}))

