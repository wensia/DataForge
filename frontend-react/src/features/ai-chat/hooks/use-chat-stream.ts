/**
 * 流式聊天 Hook
 *
 * 处理 SSE 连接，管理流式响应状态。
 */

import { useState, useCallback, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'

// SSE 事件类型
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

interface UseChatStreamOptions {
  conversationId: number | null
  onError?: (error: string) => void
  onComplete?: (assistantMessageId: number, tokensUsed: number) => void
}

interface UseChatStreamReturn {
  // 状态
  isStreaming: boolean
  streamingContent: string
  streamingReasoning: string
  pendingUserMessage: string | null
  error: string | null
  streamingMessageId: number | null // 当前流式消息的 ID

  // 方法
  sendMessage: (content: string, aiProvider?: string, useDeepThinking?: boolean) => Promise<void>
  stopStreaming: () => void
  clearError: () => void
}

export function useChatStream({
  conversationId,
  onError,
  onComplete,
}: UseChatStreamOptions): UseChatStreamReturn {
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingReasoning, setStreamingReasoning] = useState('')
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [streamingMessageId, setStreamingMessageId] = useState<number | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const queryClient = useQueryClient()

  const sendMessage = useCallback(
    async (content: string, aiProvider?: string, useDeepThinking?: boolean) => {
      if (!conversationId) {
        setError('请先选择或创建对话')
        return
      }

      // 清理之前的状态并立即显示用户消息
      // 使用 flushSync 强制同步更新，确保用户消息在 fetch 开始前渲染
      flushSync(() => {
        setError(null)
        setStreamingContent('')
        setStreamingReasoning('')
        setPendingUserMessage(content) // 立即显示用户消息
        setIsStreaming(true)
      })

      // 创建 AbortController 用于取消请求
      abortControllerRef.current = new AbortController()

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
            signal: abortControllerRef.current.signal,
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

          if (done) {
            break
          }

          buffer += decoder.decode(value, { stream: true })

          // 处理 SSE 格式的数据
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // 保留未完成的行

          for (const line of lines) {
            const trimmedLine = line.trim()
            if (!trimmedLine || !trimmedLine.startsWith('data: ')) {
              continue
            }

            const dataStr = trimmedLine.slice(6) // 去掉 "data: "

            // 检查结束标记
            if (dataStr === '[DONE]') {
              continue
            }

            try {
              const event: SSEEvent = JSON.parse(dataStr)

              switch (event.type) {
                case 'start':
                  // 用户消息和 AI 消息已保存到数据库，保存流式消息 ID 并刷新消息列表
                  if (event.assistant_message_id) {
                    setStreamingMessageId(event.assistant_message_id)
                  }
                  queryClient.invalidateQueries({
                    queryKey: ['chat', 'conversation', conversationId],
                  })
                  break

                case 'tool_start':
                  // 工具开始执行，显示查询状态
                  if (event.tool_name) {
                    const toolNames: Record<string, string> = {
                      query_call_records: '查询通话记录',
                      get_call_statistics: '统计通话数据',
                      get_staff_list: '获取员工列表',
                      get_call_ranking: '获取通话排行',
                      get_current_date: '获取当前日期',
                    }
                    const displayName =
                      toolNames[event.tool_name] || event.tool_name
                    setStreamingContent(
                      (prev) => prev + `\n🔍 正在${displayName}...\n`
                    )
                  }
                  break

                case 'tool_result':
                  // 工具执行完成
                  if (event.success) {
                    setStreamingContent((prev) => prev + '✅ 数据查询完成\n\n')
                  }
                  break

                case 'reasoning':
                  // 思考过程内容
                  if (event.reasoning) {
                    setStreamingReasoning((prev) => prev + event.reasoning)
                  }
                  break

                case 'content':
                  if (event.content) {
                    setStreamingContent((prev) => prev + event.content)
                  }
                  break

                case 'done':
                  // 清除流式消息 ID 并刷新消息列表
                  setStreamingMessageId(null)
                  queryClient.invalidateQueries({
                    queryKey: ['chat', 'conversation', conversationId],
                  })
                  queryClient.invalidateQueries({
                    queryKey: ['chat', 'conversations'],
                  })
                  if (
                    onComplete &&
                    event.assistant_message_id !== undefined
                  ) {
                    onComplete(
                      event.assistant_message_id,
                      event.tokens_used || 0
                    )
                  }
                  break

                case 'error':
                  setStreamingMessageId(null)
                  setError(event.error || '未知错误')
                  if (onError && event.error) {
                    onError(event.error)
                  }
                  break
              }
            } catch (e) {
              console.warn('解析 SSE 事件失败:', e, dataStr)
            }
          }
        }
      } catch (err) {
        if (err instanceof Error) {
          if (err.name === 'AbortError') {
            // 用户主动取消，不设置错误
            console.log('流式请求被取消')
          } else {
            setError(err.message)
            if (onError) {
              onError(err.message)
            }
          }
        }
      } finally {
        setIsStreaming(false)
        setStreamingContent('')
        setStreamingReasoning('')
        setPendingUserMessage(null)
        setStreamingMessageId(null)
        abortControllerRef.current = null
      }
    },
    [conversationId, queryClient, onError, onComplete]
  )

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    isStreaming,
    streamingContent,
    streamingReasoning,
    pendingUserMessage,
    error,
    streamingMessageId,
    sendMessage,
    stopStreaming,
    clearError,
  }
}
