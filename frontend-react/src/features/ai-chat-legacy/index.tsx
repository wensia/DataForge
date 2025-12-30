/**
 * AI 对话页面 - assistant-ui + shadcn/ui
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Brain, PanelLeft, PanelLeftClose } from 'lucide-react'
import {
  AssistantRuntimeProvider,
  type AppendMessage,
  type MessageStatus as AuiMessageStatus,
  type ThreadMessageLike,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import { useShallow } from 'zustand/shallow'

import { Thread } from '@/components/assistant-ui/thread'
import { ThreadList } from '@/components/assistant-ui/thread-list'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  useConversations,
  useConversation,
  useCreateConversation,
  useDeleteConversation,
  useProviders,
  useUpdateConversation,
} from './api'
import { useAiChatStreamStore } from './store/chat-stream-store'
import type { Conversation, Message as ApiMessage } from './types'

type StoreMessage = {
  id: string
  role: ApiMessage['role']
  content: string
  reasoning?: string | null
  createdAt: Date
  status?: ApiMessage['status']
}

function toAuiAssistantStatus(status: ApiMessage['status'] | undefined): AuiMessageStatus {
  switch (status) {
    case 'streaming':
      return { type: 'running' }
    case 'failed':
      return { type: 'incomplete', reason: 'error' }
    case 'completed':
    default:
      return { type: 'complete', reason: 'stop' }
  }
}

function extractText(message: AppendMessage): string {
  if (message.role !== 'user') return ''
  const parts = message.content
  if (!Array.isArray(parts)) return ''
  return parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
}

function toThreadData(conversation: Conversation) {
  return {
    id: String(conversation.id),
    remoteId: String(conversation.id),
    externalId: undefined,
    title: conversation.title,
  }
}



export function AIChat() {
  const queryClient = useQueryClient()
  const {
    bindQueryClient,
    clearError,
    conversationId: streamingConversationId,
    error: streamError,
    isStreaming: isStreaming,
    pendingUserMessage,
    start: startStream,
    stop: stopStream,
    streamingContent,
    streamingMessageId,
    streamingReasoning,
  } = useAiChatStreamStore(
    useShallow((s) => ({
      bindQueryClient: s.bindQueryClient,
      clearError: s.clearError,
      conversationId: s.conversationId,
      error: s.error,
      isStreaming: s.isStreaming,
      pendingUserMessage: s.pendingUserMessage,
      start: s.start,
      stop: s.stop,
      streamingContent: s.streamingContent,
      streamingMessageId: s.streamingMessageId,
      streamingReasoning: s.streamingReasoning,
    }))
  )

  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const raw = localStorage.getItem('ai-chat:selectedId')
    const id = raw ? Number(raw) : null
    return id && Number.isFinite(id) && id > 0 ? id : null
  })
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [useDeepThinking, setUseDeepThinking] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const { data: providers } = useProviders()
  const createConversation = useCreateConversation()
  const updateConversation = useUpdateConversation()
  const deleteConversation = useDeleteConversation()

  const { data: conversationsData, isLoading: isLoadingConversations } = useConversations({
    include_archived: true,
  })
  const conversations = conversationsData?.items ?? []

  const { data: conversationData, isLoading: isLoadingConversation } = useConversation(selectedId)
  const serverMessages = conversationData?.messages ?? []

  // 绑定 queryClient，保证切换页面后也能触发数据刷新
  useEffect(() => {
    bindQueryClient(queryClient)
  }, [bindQueryClient, queryClient])

  // 在任意页面触发的流式错误，统一 toast
  useEffect(() => {
    if (!streamError) return
    toast.error(streamError)
    clearError()
  }, [clearError, streamError])

  // 记住上次打开的对话（断点续传：返回页面后仍能定位）
  useEffect(() => {
    if (!selectedId) {
      localStorage.removeItem('ai-chat:selectedId')
      return
    }
    localStorage.setItem('ai-chat:selectedId', String(selectedId))
  }, [selectedId])

  // 如果当前有后台流式任务，但没有选中对话，自动定位到该对话
  useEffect(() => {
    if (selectedId) return
    if (isStreaming && streamingConversationId) {
      setSelectedId(streamingConversationId)
    }
  }, [isStreaming, selectedId, streamingConversationId])

  const isStreamingForCurrent = !!selectedId && isStreaming && streamingConversationId === selectedId

  // 设置默认 provider
  useEffect(() => {
    if (providers && providers.length > 0 && !selectedProvider) {
      const deepseek = providers.find((p) => p.id === 'deepseek')
      setSelectedProvider(deepseek?.id || providers[0].id)
    }
  }, [providers, selectedProvider])

  const regularThreads = useMemo(
    () =>
      conversations
        .filter((c) => !c.is_archived)
        .map((c) => ({ status: 'regular' as const, ...toThreadData(c) })),
    [conversations]
  )

  const archivedThreads = useMemo(
    () =>
      conversations
        .filter((c) => c.is_archived)
        .map((c) => ({ status: 'archived' as const, ...toThreadData(c) })),
    [conversations]
  )

  const storeMessages: StoreMessage[] = useMemo(() => {
    const base: StoreMessage[] = serverMessages.map((m) => ({
      id: String(m.id),
      role: m.role,
      content: m.content,
      reasoning: m.reasoning_content,
      createdAt: new Date(m.created_at),
      status: m.status,
    }))

    // 覆盖流式消息内容（如果后端已创建 assistant message 记录）
    if (isStreamingForCurrent && streamingMessageId) {
      const id = String(streamingMessageId)
      const idx = base.findIndex((m) => m.id === id && m.role === 'assistant')

      if (idx >= 0) {
        base[idx] = {
          ...base[idx],
          content: streamingContent || base[idx].content,
          reasoning: streamingReasoning || base[idx].reasoning,
          status: 'streaming',
        }
      } else {
        base.push({
          id,
          role: 'assistant',
          content: streamingContent,
          reasoning: streamingReasoning,
          createdAt: new Date(),
          status: 'streaming',
        })
      }
    }

    // 追加待发送的用户消息（避免重复）
    if (
      isStreamingForCurrent &&
      pendingUserMessage &&
      !base.some((m) => m.role === 'user' && m.content === pendingUserMessage)
    ) {
      base.push({
        id: 'pending-user',
        role: 'user',
        content: pendingUserMessage,
        createdAt: new Date(),
        status: 'completed',
      })
    }

    return base
  }, [
    serverMessages,
    isStreamingForCurrent,
    pendingUserMessage,
    streamingContent,
    streamingMessageId,
    streamingReasoning,
  ])

  const handleSwitchToNewThread = useCallback(async () => {
    try {
      const conversation = await createConversation.mutateAsync({
        ai_provider: selectedProvider || 'deepseek',
      })
      setSelectedId(conversation.id)
      setMobileSidebarOpen(false)
    } catch {
      toast.error('创建对话失败')
    }
  }, [createConversation, selectedProvider])

  const handleSwitchToThread = useCallback(
    (threadId: string) => {
      setSelectedId(Number(threadId))
      setMobileSidebarOpen(false)
    },
    []
  )

  const handleArchiveThread = useCallback(
    async (threadId: string) => {
      try {
        await updateConversation.mutateAsync({
          conversationId: Number(threadId),
          data: { is_archived: true },
        })
      } catch {
        toast.error('归档失败')
      }
    },
    [updateConversation]
  )

  const handleUnarchiveThread = useCallback(
    async (threadId: string) => {
      try {
        await updateConversation.mutateAsync({
          conversationId: Number(threadId),
          data: { is_archived: false },
        })
      } catch {
        toast.error('取消归档失败')
      }
    },
    [updateConversation]
  )

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      const id = Number(threadId)
      try {
        await deleteConversation.mutateAsync(id)
        if (selectedId === id) {
          setSelectedId(null)
        }
      } catch {
        toast.error('删除失败')
      }
    },
    [deleteConversation, selectedId]
  )

  const runtime = useExternalStoreRuntime<StoreMessage>({
    isRunning: isStreamingForCurrent,
    isLoading: isLoadingConversation,
    messages: storeMessages,
    convertMessage: (message): ThreadMessageLike => {
      return {
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
        metadata: {
          reasoning: message.reasoning,
        } as any,
        ...(message.role === 'assistant' ? { status: toAuiAssistantStatus(message.status) } : {}),
      }
    },
    onNew: async (message) => {
      const content = extractText(message).trim()
      if (!content) return

      // 全局只允许一个流式任务：如果其它对话正在生成，引导用户回到该对话
      if (isStreaming) {
        toast.error('已有对话正在生成，请先等待完成或点击停止。')
        if (streamingConversationId) {
          setSelectedId(streamingConversationId)
        }
        return
      }

      let conversationId = selectedId
      if (!conversationId) {
        try {
          const conversation = await createConversation.mutateAsync({
            ai_provider: selectedProvider || 'deepseek',
          })
          conversationId = conversation.id
          setSelectedId(conversationId)
        } catch {
          toast.error('创建对话失败')
          return
        }
      }

      await startStream({
        conversationId,
        content,
        aiProvider: selectedProvider || undefined,
        useDeepThinking,
      })
    },
    onCancel: async () => {
      stopStream()
    },
    adapters: {
      threadList: {
        isLoading: isLoadingConversations,
        threadId: selectedId ? String(selectedId) : undefined,
        threads: regularThreads,
        archivedThreads,
        onSwitchToNewThread: handleSwitchToNewThread,
        onSwitchToThread: handleSwitchToThread,
        onArchive: handleArchiveThread,
        onUnarchive: handleUnarchiveThread,
        onDelete: handleDeleteThread,
      },
    },
  })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-full w-full overflow-hidden bg-background" data-layout="fixed">
        {/* 桌面端侧边栏 */}
        <div
          className={cn(
            'hidden h-full flex-col border-r bg-muted/50 dark:bg-muted/30 transition-all duration-300 md:flex',
            sidebarOpen ? 'w-72' : 'w-0 overflow-hidden border-r-0'
          )}
        >
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {/* Add a template-like header in sidebar */}
              <div className="px-2 mb-2 font-semibold text-lg tracking-tight">
                Chat History
              </div>
              <ThreadList />
            </div>
          </ScrollArea>
        </div>

        {/* ... Mobile Sidebar ... */}

        {/* 主内容区 */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background/50">
          {/* 顶部栏 */}
          <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 md:hidden"
                onClick={() => setMobileSidebarOpen(true)}
              >
                <PanelLeft size={18} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="hidden h-8 w-8 md:flex"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
              </Button>
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Brain className="h-4 w-4 text-purple-600" />
                {conversationData?.title || 'DataForge AI PRO'}
              </span>
              {isLoadingConversation && selectedId && (
                <span className="text-xs text-muted-foreground">加载中…</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Switch
                  id="deep-thinking"
                  checked={useDeepThinking}
                  onCheckedChange={setUseDeepThinking}
                  disabled={isStreaming}
                  className="scale-90"
                />
                <label
                  htmlFor="deep-thinking"
                  className="hidden cursor-pointer items-center gap-1 text-xs text-muted-foreground sm:flex"
                >
                  <Brain className="h-3.5 w-3.5" />
                  深度思考
                </label>
              </div>
            </div>
          </header>

          {/* 聊天区域 */}
          <div className="min-h-0 flex-1 overflow-hidden">
            <Thread />
          </div>
        </div>
      </div>
    </AssistantRuntimeProvider>
  )
}

export default AIChat
