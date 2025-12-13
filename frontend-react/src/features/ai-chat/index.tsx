/**
 * AI 对话页面
 */
import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import {
  MessageSquare,
  Plus,
  Send,
  Loader2,
  Trash2,
  MoreVertical,
  Bot,
  User,
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
  useConversations,
  useConversation,
  useProviders,
  useCreateConversation,
  useDeleteConversation,
  useSendMessage,
} from './api'
import type { Conversation, Message } from './types'

export function AIChat() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [inputMessage, setInputMessage] = useState('')
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [useDeepThinking, setUseDeepThinking] = useState(true)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [conversationToDelete, setConversationToDelete] = useState<number | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // API Hooks
  const { data: conversationsData, isLoading: isLoadingConversations } = useConversations()
  const { data: conversationData, isLoading: isLoadingConversation } = useConversation(selectedId)
  const { data: providers } = useProviders()
  const createMutation = useCreateConversation()
  const deleteMutation = useDeleteConversation()
  const sendMutation = useSendMessage()

  const conversations = conversationsData?.items || []
  const messages = conversationData?.messages || []

  // 设置默认 provider
  useEffect(() => {
    if (providers && providers.length > 0 && !selectedProvider) {
      setSelectedProvider(providers[0].id)
    }
  }, [providers, selectedProvider])

  // 滚动到底部
  const messagesLength = messages.length
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messagesLength])

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

  // 发送消息
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !selectedId) return

    const content = inputMessage.trim()
    setInputMessage('')

    try {
      await sendMutation.mutateAsync({
        conversationId: selectedId,
        data: {
          content,
          ai_provider: selectedProvider || undefined,
          use_deep_thinking: useDeepThinking,
        },
      })
    } catch {
      toast.error('发送失败，请重试')
      setInputMessage(content) // 恢复输入
    }
  }

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

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
                <Select value={selectedProvider} onValueChange={setSelectedProvider}>
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
                <div className="text-center py-8 text-muted-foreground">
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
            <div className="bg-background flex flex-1 flex-col rounded-md border shadow-xs">
              {/* 对话头部 */}
              <div className="bg-card flex items-center justify-between p-4 shadow-sm rounded-t-md">
                <div className="flex items-center gap-2">
                  <Bot className="text-primary" />
                  <span className="font-medium">
                    {conversationData?.title || '新对话'}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {conversationData?.ai_provider?.toUpperCase()}
                </span>
              </div>

              {/* 消息列表 */}
              <ScrollArea className="flex-1 p-4">
                {isLoadingConversation ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <MessageSquare className="h-12 w-12 mb-4" />
                    <p>发送消息开始对话</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <MessageBubble key={message.id} message={message} />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* 输入框 */}
              <div className="p-4 border-t">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="min-h-[60px] max-h-[120px] resize-none"
                    disabled={sendMutation.isPending}
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!inputMessage.trim() || sendMutation.isPending}
                    className="h-auto"
                  >
                    {sendMutation.isPending ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Send />
                    )}
                  </Button>
                </div>
                {/* 深度思考开关 */}
                <div className="flex items-center justify-end gap-2 mt-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2">
                          <Switch
                            id="deep-thinking"
                            checked={useDeepThinking}
                            onCheckedChange={setUseDeepThinking}
                          />
                          <Label
                            htmlFor="deep-thinking"
                            className="text-sm text-muted-foreground cursor-pointer"
                          >
                            深度思考
                          </Label>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>启用后 AI 会进行更深入的思考分析</p>
                        <p className="text-xs text-muted-foreground">仅 DeepSeek 支持</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-card flex flex-1 flex-col items-center justify-center rounded-md border shadow-xs">
              <div className="flex flex-col items-center space-y-6">
                <div className="border-border flex size-16 items-center justify-center rounded-full border-2">
                  <Bot className="size-8" />
                </div>
                <div className="space-y-2 text-center">
                  <h1 className="text-xl font-semibold">AI 对话助手</h1>
                  <p className="text-muted-foreground text-sm">
                    选择或创建一个对话开始聊天
                  </p>
                </div>
                <Button onClick={handleCreateConversation} disabled={createMutation.isPending}>
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
      </Main>
    </>
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
          'group flex items-center justify-between rounded-md px-2 py-2 cursor-pointer',
          'hover:bg-accent hover:text-accent-foreground',
          isSelected && 'bg-muted'
        )}
        onClick={onSelect}
      >
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{conversation.title}</p>
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
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}
      >
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-4 py-2',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted'
        )}
      >
        <div className="whitespace-pre-wrap break-words text-sm">{message.content}</div>
        <div
          className={cn(
            'mt-1 text-xs opacity-70',
            isUser ? 'text-right' : 'text-left'
          )}
        >
          {format(new Date(message.created_at), 'HH:mm')}
          {message.tokens_used && (
            <span className="ml-2">({message.tokens_used} tokens)</span>
          )}
        </div>
      </div>
    </div>
  )
}

export default AIChat
