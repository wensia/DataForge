/**
 * AI 聊天测试页面 - 使用 shadcn-chatbot-kit 组件
 *
 * 移动端优化版本，用于测试新组件效果
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  MessageSquare,
  Plus,
  Loader2,
  Trash2,
  Bot,
  PanelLeftClose,
  PanelLeft,
  MoreHorizontal,
  Brain,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'

// 使用新的 shadcn-chatbot-kit 组件
import { Chat } from '@/components/ui/chat'
import type { Message as ChatKitMessage } from '@/components/ui/chat-message'

// 复用现有的 API hooks 和类型
import {
  useConversations,
  useConversation,
  useProviders,
  useCreateConversation,
  useDeleteConversation,
} from '@/features/ai-chat/api'
import { useChatStream } from '@/features/ai-chat/hooks/use-chat-stream'
import type { Conversation, Message } from '@/features/ai-chat/types'

// 消息格式适配：将现有消息转换为 chatbot-kit 格式
function adaptMessages(
  messages: Message[],
  pendingUserMessage: string | null,
  streamingContent: string,
  streamingReasoning: string
): ChatKitMessage[] {
  const adapted: ChatKitMessage[] = messages.map((msg) => ({
    id: String(msg.id),
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
    createdAt: new Date(msg.created_at),
  }))

  // 添加待发送的用户消息
  if (pendingUserMessage && !messages.some((m) => m.role === 'user' && m.content === pendingUserMessage)) {
    adapted.push({
      id: 'pending-user',
      role: 'user',
      content: pendingUserMessage,
      createdAt: new Date(),
    })
  }

  // 添加流式响应（包含思考过程）
  if (streamingContent || streamingReasoning) {
    let content = streamingContent
    if (streamingReasoning) {
      content = `> 💭 **思考中...**\n> ${streamingReasoning.replace(/\n/g, '\n> ')}\n\n${streamingContent}`
    }
    adapted.push({
      id: 'streaming',
      role: 'assistant',
      content: content || '正在思考...',
      createdAt: new Date(),
    })
  }

  return adapted
}

export function AIChatTest() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [inputMessage, setInputMessage] = useState('')
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [conversationToDelete, setConversationToDelete] = useState<number | null>(null)
  const [useDeepThinking, setUseDeepThinking] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // API Hooks
  const { data: conversationsData, isLoading: isLoadingConversations } = useConversations()
  const { data: conversationData, isLoading: isLoadingConversation } = useConversation(selectedId)
  const { data: providers } = useProviders()
  const createMutation = useCreateConversation()
  const deleteMutation = useDeleteConversation()

  // 流式聊天 Hook
  const {
    isStreaming,
    streamingContent,
    streamingReasoning,
    pendingUserMessage,
    sendMessage,
    stopStreaming,
  } = useChatStream({
    conversationId: selectedId,
    onError: (err) => toast.error(err),
  })

  const conversations = conversationsData?.items || []
  const messages = conversationData?.messages || []

  // 适配消息格式
  const adaptedMessages = useMemo(
    () => adaptMessages(messages, pendingUserMessage, streamingContent, streamingReasoning),
    [messages, pendingUserMessage, streamingContent, streamingReasoning]
  )

  // 设置默认 provider
  useEffect(() => {
    if (providers && providers.length > 0 && !selectedProvider) {
      const deepseek = providers.find((p) => p.id === 'deepseek')
      setSelectedProvider(deepseek?.id || providers[0].id)
    }
  }, [providers, selectedProvider])

  // 创建新对话
  const handleCreateConversation = async () => {
    try {
      const conversation = await createMutation.mutateAsync({
        ai_provider: selectedProvider || 'deepseek',
      })
      setSelectedId(conversation.id)
      setMobileSidebarOpen(false)
    } catch {
      toast.error('创建对话失败')
    }
  }

  // 删除对话
  const handleDeleteConversation = async () => {
    if (!conversationToDelete) return
    try {
      await deleteMutation.mutateAsync(conversationToDelete)
      if (selectedId === conversationToDelete) {
        setSelectedId(null)
      }
      toast.success('删除成功')
    } catch {
      toast.error('删除失败')
    } finally {
      setDeleteDialogOpen(false)
      setConversationToDelete(null)
    }
  }

  // shadcn-chatbot-kit 接口适配
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value)
  }, [])

  const handleSubmit = useCallback(
    async (event?: { preventDefault?: () => void }) => {
      event?.preventDefault?.()
      if (!inputMessage.trim() || isStreaming) return

      // 如果没有选中对话，先创建一个
      let targetId = selectedId
      if (!targetId) {
        try {
          const conversation = await createMutation.mutateAsync({
            ai_provider: selectedProvider || 'deepseek',
          })
          targetId = conversation.id
          setSelectedId(targetId)
        } catch {
          toast.error('创建对话失败')
          return
        }
      }

      const content = inputMessage.trim()
      setInputMessage('')

      try {
        await sendMessage(content, selectedProvider || undefined, useDeepThinking)
      } catch {
        toast.error('发送失败，请重试')
        setInputMessage(content)
      }
    },
    [inputMessage, selectedId, isStreaming, sendMessage, selectedProvider, useDeepThinking, createMutation]
  )

  // 侧边栏内容
  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      {/* 新建对话按钮 */}
      <div className="p-2">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={handleCreateConversation}
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          新建对话
        </Button>
      </div>

      {/* AI 服务选择 */}
      {providers && providers.length > 0 && (
        <div className="px-2 pb-2">
          <Select value={selectedProvider} onValueChange={setSelectedProvider}>
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
        </div>
      )}

      <Separator />

      {/* 对话列表 */}
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {isLoadingConversations ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-muted-foreground" size={20} />
            </div>
          ) : conversations.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <MessageSquare className="mx-auto mb-2 h-6 w-6 opacity-50" />
              <p className="text-xs">暂无对话</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isSelected={selectedId === conv.id}
                onSelect={() => {
                  setSelectedId(conv.id)
                  setMobileSidebarOpen(false)
                }}
                onDelete={() => {
                  setConversationToDelete(conv.id)
                  setDeleteDialogOpen(true)
                }}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* 桌面端侧边栏 */}
      <div
        className={cn(
          'hidden h-full flex-col border-r bg-muted/30 transition-all duration-300 md:flex',
          sidebarOpen ? 'w-64' : 'w-0 overflow-hidden border-r-0'
        )}
      >
        <SidebarContent />
      </div>

      {/* 移动端侧边栏 (Sheet) */}
      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>对话列表</SheetTitle>
          </SheetHeader>
          <SidebarContent />
        </SheetContent>
      </Sheet>

      {/* 主内容区 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* 顶部栏 */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b px-2 sm:px-4">
          <div className="flex items-center gap-2">
            {/* 移动端菜单按钮 */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 md:hidden"
              onClick={() => setMobileSidebarOpen(true)}
            >
              <PanelLeft size={18} />
            </Button>
            {/* 桌面端折叠按钮 */}
            <Button
              variant="ghost"
              size="icon"
              className="hidden h-8 w-8 md:flex"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
            </Button>
            <span className="max-w-[200px] truncate text-sm font-medium">
              {conversationData?.title || 'DataForge AI (测试版)'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* 深度思考开关 */}
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

        {/* 聊天区域 - 使用 shadcn-chatbot-kit */}
        <div className="min-h-0 flex-1 overflow-hidden p-2 sm:p-4">
          {isLoadingConversation ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="animate-spin text-muted-foreground" size={24} />
            </div>
          ) : adaptedMessages.length === 0 && !isStreaming ? (
            // 空状态
            <div className="flex h-full flex-col items-center justify-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Bot className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="mb-2 text-xl font-semibold">有什么可以帮您？</h2>
              <p className="mb-6 text-sm text-muted-foreground">开始输入消息吧</p>
            </div>
          ) : (
            <Chat
              messages={adaptedMessages}
              input={inputMessage}
              handleInputChange={handleInputChange}
              handleSubmit={handleSubmit}
              isGenerating={isStreaming}
              stop={stopStreaming}
              className="h-full"
            />
          )}
        </div>

        {/* 空状态时的输入框 */}
        {adaptedMessages.length === 0 && !isStreaming && !isLoadingConversation && (
          <div className="shrink-0 border-t bg-background p-2 sm:p-4">
            <Chat
              messages={[]}
              input={inputMessage}
              handleInputChange={handleInputChange}
              handleSubmit={handleSubmit}
              isGenerating={isStreaming}
              stop={stopStreaming}
              className="h-auto"
            />
          </div>
        )}
      </div>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>删除后将无法恢复，确定要删除这个对话吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConversation}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// 对话列表项
function ConversationItem({
  conversation,
  isSelected,
  onSelect,
  onDelete,
}: {
  conversation: Conversation
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={cn(
        'group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors',
        'hover:bg-accent',
        isSelected && 'bg-accent'
      )}
      onClick={onSelect}
    >
      <MessageSquare size={16} className="shrink-0 opacity-50" />
      <span className="flex-1 truncate">{conversation.title}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100">
            <MoreHorizontal size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem
            className="text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default AIChatTest
