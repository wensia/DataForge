/**
 * AI 对话页面 - assistant-ui + shadcn/ui
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Brain, PanelLeft, PanelLeftClose } from 'lucide-react'
import {
  AssistantRuntimeProvider,
  type AppendMessage,
  type MessageStatus as AuiMessageStatus,
  type ThreadMessageLike,
  useExternalStoreRuntime,
} from '@assistant-ui/react'

import { Thread } from '@/components/assistant-ui/thread'
import { ThreadList } from '@/components/assistant-ui/thread-list'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
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
import { useChatStream } from './hooks/use-chat-stream'
import type { Conversation, Message as ApiMessage } from './types'

type StoreMessage = {
  id: string
  role: ApiMessage['role']
  content: string
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

function formatStreaming(reasoning: string, content: string): string {
  if (!reasoning) return content
  const quoted = reasoning.replace(/\n/g, '\n> ')
  const body = content ? `\n\n${content}` : ''
  return `> 💭 **思考中...**\n> ${quoted}${body}`
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
  const [selectedId, setSelectedId] = useState<number | null>(null)
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

  // 流式聊天 Hook（自有后端 SSE）
  const {
    isStreaming,
    streamingContent,
    streamingReasoning,
    pendingUserMessage,
    streamingMessageId,
    sendMessage,
    stopStreaming,
  } = useChatStream({
    conversationId: selectedId,
    onError: (err) => toast.error(err),
  })

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
      createdAt: new Date(m.created_at),
      status: m.status,
    }))

    // 覆盖流式消息内容（如果后端已创建 assistant message 记录）
    if (isStreaming && streamingMessageId) {
      const idx = base.findIndex(
        (m) => m.id === String(streamingMessageId) && m.role === 'assistant'
      )
      if (idx >= 0) {
        const streamingText = formatStreaming(streamingReasoning, streamingContent)
        base[idx] = {
          ...base[idx],
          content: streamingText || base[idx].content,
          status: 'streaming',
        }
      }
    }

    // 追加待发送的用户消息（避免重复）
    if (
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

    // 如果后端尚未创建 assistant message 记录，追加一个临时的流式响应
    if (isStreaming && !streamingMessageId && (streamingContent || streamingReasoning)) {
      base.push({
        id: 'streaming',
        role: 'assistant',
        content: formatStreaming(streamingReasoning, streamingContent) || '正在思考...',
        createdAt: new Date(),
        status: 'streaming',
      })
    }

    return base
  }, [
    serverMessages,
    isStreaming,
    pendingUserMessage,
    streamingContent,
    streamingReasoning,
    streamingMessageId,
  ])

  const handleSwitchToNewThread = useCallback(async () => {
    try {
      const conversation = await createConversation.mutateAsync({
        ai_provider: selectedProvider || 'deepseek',
      })
      stopStreaming()
      setSelectedId(conversation.id)
      setMobileSidebarOpen(false)
    } catch {
      toast.error('创建对话失败')
    }
  }, [createConversation, selectedProvider, stopStreaming])

  const handleSwitchToThread = useCallback(
    (threadId: string) => {
      stopStreaming()
      setSelectedId(Number(threadId))
      setMobileSidebarOpen(false)
    },
    [stopStreaming]
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
    isRunning: isStreaming,
    isLoading: isLoadingConversation,
    messages: storeMessages,
    convertMessage: (message): ThreadMessageLike => {
      return {
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
        ...(message.role === 'assistant' ? { status: toAuiAssistantStatus(message.status) } : {}),
      }
    },
    onNew: async (message) => {
      if (isStreaming) return

      const content = extractText(message).trim()
      if (!content) return

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

      await sendMessage(content, selectedProvider || undefined, useDeepThinking, conversationId)
    },
    onCancel: async () => {
      stopStreaming()
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
      <div className="flex h-screen w-full overflow-hidden bg-background">
        {/* 桌面端侧边栏 */}
        <div
          className={cn(
            'hidden h-full flex-col border-r bg-muted/30 transition-all duration-300 md:flex',
            sidebarOpen ? 'w-72' : 'w-0 overflow-hidden border-r-0'
          )}
        >
          <SidebarHeader selectedProvider={selectedProvider} onSelectProvider={setSelectedProvider} />
          <Separator />
          <ScrollArea className="flex-1">
            <div className="p-2">
              <ThreadList />
            </div>
          </ScrollArea>
        </div>

        {/* 移动端侧边栏 */}
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>对话列表</SheetTitle>
            </SheetHeader>
            <div className="flex h-full flex-col">
              <SidebarHeader selectedProvider={selectedProvider} onSelectProvider={setSelectedProvider} />
              <Separator />
              <ScrollArea className="flex-1">
                <div className="p-2">
                  <ThreadList />
                </div>
              </ScrollArea>
            </div>
          </SheetContent>
        </Sheet>

        {/* 主内容区 */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* 顶部栏 */}
          <header className="flex h-12 shrink-0 items-center justify-between border-b px-2 sm:px-4">
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
              <span className="max-w-[240px] truncate text-sm font-medium">
                {conversationData?.title || 'DataForge AI'}
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

function SidebarHeader({
  selectedProvider,
  onSelectProvider,
}: {
  selectedProvider: string
  onSelectProvider: (providerId: string) => void
}) {
  const { data: providers } = useProviders()

  return (
    <div className="p-2 space-y-2">
      {providers && providers.length > 0 && (
        <Select value={selectedProvider} onValueChange={onSelectProvider}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="选择 AI" />
          </SelectTrigger>
          <SelectContent>
            {providers.map((provider) => (
              <SelectItem key={provider.id} value={provider.id}>
                {provider.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

export default AIChat
