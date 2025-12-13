/**
 * AI 对话页面
 *
 * 支持流式响应、Markdown 渲染、代码高亮。
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
  Pencil,
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { ProfileDropdown } from '@/components/profile-dropdown'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  useUpdateConversation,
  useDeleteConversation,
} from './api'
import { useChatStream } from './hooks/use-chat-stream'
import { MarkdownContent } from './components/markdown-content'
import { QuickPrompts } from './components/quick-prompts'
import type { Conversation, Message } from './types'

export function AIChat() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [inputMessage, setInputMessage] = useState('')
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [conversationToDelete, setConversationToDelete] = useState<
    number | null
  >(null)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [conversationToRename, setConversationToRename] = useState<
    Conversation | null
  >(null)
  const [newTitle, setNewTitle] = useState('')

  // API Hooks
  const { data: conversationsData, isLoading: isLoadingConversations } =
    useConversations()
  const { data: conversationData, isLoading: isLoadingConversation } =
    useConversation(selectedId)
  const { data: providers } = useProviders()
  const createMutation = useCreateConversation()
  const updateMutation = useUpdateConversation()
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

  // 打开重命名对话框
  const handleOpenRename = (conversation: Conversation) => {
    setConversationToRename(conversation)
    setNewTitle(conversation.title)
    setRenameDialogOpen(true)
  }

  // 重命名对话
  const handleRenameConversation = async () => {
    if (!conversationToRename || !newTitle.trim()) return
    try {
      await updateMutation.mutateAsync({
        conversationId: conversationToRename.id,
        data: { title: newTitle.trim() },
      })
      toast.success('重命名成功')
    } catch {
      toast.error('重命名失败')
    } finally {
      setRenameDialogOpen(false)
      setConversationToRename(null)
      setNewTitle('')
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
    <>
      <Header>
        <Search />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>

      <Main fixed>
        <section className="flex h-full gap-6">
          {/* 左侧：对话列表 */}
          <div className="flex w-full flex-col gap-2 sm:w-56 lg:w-72 2xl:w-80">
            <div className="bg-background sticky top-0 z-10 -mx-4 px-4 pb-3 shadow-md sm:static sm:z-auto sm:mx-0 sm:p-0 sm:shadow-none">
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">AI 对话</h1>
                  <Bot size={20} className="text-muted-foreground" />
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleCreateConversation}
                  disabled={createMutation.isPending}
                  className="rounded-lg"
                >
                  {createMutation.isPending ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <Plus size={20} />
                  )}
                </Button>
              </div>

              {/* AI 服务选择 */}
              {providers && providers.length > 0 && (
                <Select
                  value={selectedProvider}
                  onValueChange={setSelectedProvider}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择 AI 服务" />
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

            {/* 对话列表 */}
            <ScrollArea className="-mx-3 h-full p-3">
              {isLoadingConversations ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="animate-spin text-muted-foreground" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
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
                    onRename={() => handleOpenRename(conv)}
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
            <ChatContainer className="bg-background flex-1 rounded-md border shadow-xs">
              {/* 对话头部 */}
              <div className="bg-card flex items-center justify-between rounded-t-md p-4 shadow-sm">
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
                  <Loader2 className="animate-spin text-muted-foreground" />
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
                  {isStreaming && !streamingContent && (
                    <ChatTypingIndicator />
                  )}
                </ChatMessages>
              )}

              {/* 快捷话术 */}
              <QuickPrompts
                onSelect={(content) => setInputMessage(content)}
                className="border-t px-4 pt-2"
              />

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
            <div className="bg-card flex flex-1 flex-col items-center justify-center rounded-md border shadow-xs">
              <div className="flex flex-col items-center space-y-6">
                <div className="border-border flex size-16 items-center justify-center rounded-full border-2">
                  <Bot className="size-8" />
                </div>
                <div className="space-y-2 text-center">
                  <h1 className="text-xl font-semibold">AI 对话助手</h1>
                  <p className="text-sm text-muted-foreground">
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
        </section>

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

        {/* 重命名对话框 */}
        <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>重命名对话</DialogTitle>
              <DialogDescription>
                为对话设置一个新的名称
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="title">对话名称</Label>
                <Input
                  id="title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="输入对话名称"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleRenameConversation()
                    }
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
                取消
              </Button>
              <Button
                onClick={handleRenameConversation}
                disabled={!newTitle.trim() || updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                保存
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Main>
    </>
  )
}

// 对话列表项组件
function ConversationItem({
  conversation,
  isSelected,
  onSelect,
  onRename,
  onDelete,
}: {
  conversation: Conversation
  isSelected: boolean
  onSelect: () => void
  onRename: () => void
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
          <p className="text-xs text-muted-foreground">
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
              onClick={(e) => {
                e.stopPropagation()
                onRename()
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              重命名
            </DropdownMenuItem>
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

export default AIChat
