/**
 * 独立 AI 对话页面
 *
 * 无需登录即可使用的 AI 对话界面。
 * 包含完整的对话功能，适合分享给他人使用。
 */
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  MessageSquare,
  Plus,
  Loader2,
  Trash2,
  MoreVertical,
  Bot,
  StopCircle,
  Moon,
  Sun,
  Menu,
  X,
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
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
import {
  ChatContainer,
  ChatMessages,
  ChatBubble,
  ChatInput,
  ChatTypingIndicator,
  ChatEmpty,
} from '@/components/ui/chat'
import {
  useConversations,
  useConversation,
  useProviders,
  useCreateConversation,
  useDeleteConversation,
} from './api'
import { useChatStream } from './hooks/use-chat-stream'
import { MarkdownContent } from './components/markdown-content'
import type { Conversation, Message } from './types'
import { useTheme } from '@/context/theme-provider'

export function StandaloneAIChat() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [inputMessage, setInputMessage] = useState('')
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [conversationToDelete, setConversationToDelete] = useState<
    number | null
  >(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { theme, setTheme } = useTheme()

  // API Hooks
  const { data: conversationsData, isLoading: isLoadingConversations } =
    useConversations()
  const { data: conversationData, isLoading: isLoadingConversation } =
    useConversation(selectedId)
  const { data: providers } = useProviders()
  const createMutation = useCreateConversation()
  const deleteMutation = useDeleteConversation()

  // 流式聊天 Hook
  const { isStreaming, streamingContent, sendMessage, stopStreaming } =
    useChatStream({
      conversationId: selectedId,
      onError: (err) => toast.error(err),
    })

  const conversations = conversationsData?.items || []
  const messages = conversationData?.messages || []

  // 设置默认 provider
  useEffect(() => {
    if (providers && providers.length > 0 && !selectedProvider) {
      setSelectedProvider(providers[0].id)
    }
  }, [providers, selectedProvider])

  // 创建新对话
  const handleCreateConversation = async () => {
    try {
      const conversation = await createMutation.mutateAsync({
        ai_provider: selectedProvider || 'kimi',
      })
      setSelectedId(conversation.id)
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

  // 发送消息（流式）
  const handleSendMessage = useCallback(async () => {
    if (!inputMessage.trim() || !selectedId || isStreaming) return

    const content = inputMessage.trim()
    setInputMessage('')

    try {
      await sendMessage(content, selectedProvider || undefined)
    } catch {
      toast.error('发送失败，请重试')
      setInputMessage(content)
    }
  }, [inputMessage, selectedId, isStreaming, sendMessage, selectedProvider])

  // 复制消息内容
  const handleCopyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content)
    toast.success('已复制到剪贴板')
  }, [])

  return (
    <div className="bg-background flex h-screen flex-col">
      {/* 顶部导航栏 */}
      <header className="bg-card border-b px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary flex h-10 w-10 items-center justify-center rounded-lg">
              <Bot className="text-primary-foreground h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">AI 对话助手</h1>
              <p className="text-muted-foreground text-xs">
                锐满分教育 · DataForge
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* AI 服务选择 */}
            {providers && providers.length > 0 && (
              <Select
                value={selectedProvider}
                onValueChange={setSelectedProvider}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="AI 服务" />
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
            {/* 主题切换 */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </Button>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-4 overflow-hidden p-4">
        {/* 左侧：对话列表 */}
        <div className="bg-card flex w-64 flex-col rounded-lg border shadow-sm">
          <div className="flex items-center justify-between border-b p-3">
            <span className="text-sm font-medium">对话列表</span>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleCreateConversation}
              disabled={createMutation.isPending}
              className="h-8 w-8"
            >
              {createMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Plus size={16} />
              )}
            </Button>
          </div>

          <ScrollArea className="flex-1 p-2">
            {isLoadingConversations ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="text-muted-foreground animate-spin" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-muted-foreground py-8 text-center">
                <MessageSquare className="mx-auto mb-2 h-8 w-8" />
                <p className="text-sm">暂无对话</p>
                <p className="text-xs">点击 + 创建新对话</p>
              </div>
            ) : (
              conversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isSelected={selectedId === conv.id}
                  onSelect={() => setSelectedId(conv.id)}
                  onDelete={() => {
                    setConversationToDelete(conv.id)
                    setDeleteDialogOpen(true)
                  }}
                />
              ))
            )}
          </ScrollArea>
        </div>

        {/* 右侧：对话内容 */}
        {selectedId ? (
          <ChatContainer className="bg-card flex-1 rounded-lg border shadow-sm">
            {/* 对话头部 */}
            <div className="flex items-center justify-between border-b p-4">
              <div className="flex items-center gap-2">
                <Bot className="text-primary" />
                <span className="font-medium">
                  {conversationData?.title || '新对话'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {conversationData?.ai_provider?.toUpperCase()}
                </Badge>
                {isStreaming && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={stopStreaming}
                    className="h-7 gap-1"
                  >
                    <StopCircle className="h-3 w-3" />
                    停止
                  </Button>
                )}
              </div>
            </div>

            {/* 消息列表 */}
            {isLoadingConversation ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="text-muted-foreground animate-spin" />
              </div>
            ) : messages.length === 0 && !isStreaming ? (
              <ChatEmpty
                title="开始对话"
                description="发送消息与 AI 开始交流"
              />
            ) : (
              <ChatMessages>
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onCopy={() => handleCopyMessage(message.content)}
                  />
                ))}
                {/* 流式响应中的消息 */}
                {isStreaming && streamingContent && (
                  <ChatBubble variant="assistant" showCopy={false}>
                    <MarkdownContent content={streamingContent} />
                  </ChatBubble>
                )}
                {/* 正在等待响应 */}
                {isStreaming && !streamingContent && <ChatTypingIndicator />}
              </ChatMessages>
            )}

            {/* 输入框 */}
            <ChatInput
              value={inputMessage}
              onChange={setInputMessage}
              onSubmit={handleSendMessage}
              placeholder="输入消息..."
              disabled={!selectedId}
              isLoading={isStreaming}
            />
          </ChatContainer>
        ) : (
          <div className="bg-card flex flex-1 flex-col items-center justify-center rounded-lg border shadow-sm">
            <div className="flex flex-col items-center space-y-6">
              <div className="border-border flex size-20 items-center justify-center rounded-full border-2">
                <Bot className="size-10" />
              </div>
              <div className="space-y-2 text-center">
                <h2 className="text-xl font-semibold">AI 对话助手</h2>
                <p className="text-muted-foreground text-sm">
                  选择或创建一个对话开始聊天
                </p>
              </div>
              <Button
                onClick={handleCreateConversation}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <Loader2 className="mr-2 animate-spin" />
                ) : (
                  <Plus className="mr-2" />
                )}
                新建对话
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              删除后将无法恢复，确定要删除这个对话吗？
            </AlertDialogDescription>
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

// 对话列表项组件
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
    <>
      <div
        className={cn(
          'group flex cursor-pointer items-center justify-between rounded-md px-2 py-2',
          'hover:bg-accent hover:text-accent-foreground',
          isSelected && 'bg-muted'
        )}
        onClick={onSelect}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{conversation.title}</p>
          <p className="text-muted-foreground text-xs">
            {format(new Date(conversation.updated_at), 'MM-dd HH:mm')}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100"
            >
              <MoreVertical size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Separator className="my-1" />
    </>
  )
}

// 消息气泡组件
function MessageBubble({
  message,
  onCopy,
}: {
  message: Message
  onCopy: () => void
}) {
  const isUser = message.role === 'user'

  return (
    <ChatBubble
      variant={isUser ? 'user' : 'assistant'}
      showCopy={!isUser}
      onCopy={onCopy}
    >
      {isUser ? (
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
      ) : (
        <MarkdownContent content={message.content} />
      )}
      <div
        className={cn(
          'mt-2 text-xs opacity-60',
          isUser ? 'text-right' : 'text-left'
        )}
      >
        {format(new Date(message.created_at), 'HH:mm')}
        {message.tokens_used && (
          <span className="ml-2">({message.tokens_used} tokens)</span>
        )}
      </div>
    </ChatBubble>
  )
}

export default StandaloneAIChat
