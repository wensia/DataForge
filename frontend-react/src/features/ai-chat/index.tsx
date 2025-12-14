/**
 * AI 对话页面 - ChatGPT 风格布局
 */
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  MessageSquare,
  Plus,
  Loader2,
  Trash2,
  Bot,
  StopCircle,
  Pencil,
  Copy,
  Check,
  Brain,
  PanelLeftClose,
  PanelLeft,
  MoreHorizontal,
  Send,
} from 'lucide-react'
import { format } from 'date-fns'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  const [conversationToDelete, setConversationToDelete] = useState<number | null>(null)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [conversationToRename, setConversationToRename] = useState<Conversation | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [useDeepThinking, setUseDeepThinking] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // API Hooks
  const { data: conversationsData, isLoading: isLoadingConversations } = useConversations()
  const { data: conversationData, isLoading: isLoadingConversation } = useConversation(selectedId)
  const { data: providers } = useProviders()
  const createMutation = useCreateConversation()
  const updateMutation = useUpdateConversation()
  const deleteMutation = useDeleteConversation()

  // 流式聊天 Hook
  const { isStreaming, streamingContent, streamingReasoning, pendingUserMessage, sendMessage, stopStreaming } =
    useChatStream({
      conversationId: selectedId,
      onError: (err) => toast.error(err),
    })

  const conversations = conversationsData?.items || []
  const messages = conversationData?.messages || []

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

  // 重命名对话
  const handleOpenRename = (conversation: Conversation) => {
    setConversationToRename(conversation)
    setNewTitle(conversation.title)
    setRenameDialogOpen(true)
  }

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

  // 发送消息
  const handleSendMessage = useCallback(async () => {
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
  }, [inputMessage, selectedId, isStreaming, sendMessage, selectedProvider, useDeepThinking, createMutation])

  // 键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // 复制消息
  const handleCopyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content)
    toast.success('已复制')
  }, [])

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
          {createMutation.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Plus size={16} />
          )}
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
        <div className="p-2 space-y-1">
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
                onRename={() => handleOpenRename(conv)}
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
            <span className="text-sm font-medium truncate max-w-[200px]">
              {conversationData?.title || 'DataForge AI'}
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
            {isStreaming && (
              <Button size="sm" variant="outline" onClick={stopStreaming} className="h-7 gap-1 text-xs">
                <StopCircle className="h-3 w-3" />
                <span className="hidden sm:inline">停止</span>
              </Button>
            )}
          </div>
        </header>

        {/* 消息区域 */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto max-w-3xl px-2 sm:px-4 py-4">
            {isLoadingConversation ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="animate-spin text-muted-foreground" size={24} />
              </div>
            ) : messages.length === 0 && !isStreaming && !pendingUserMessage ? (
              // 空状态
              <div className="flex flex-col items-center justify-center py-20">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                  <Bot className="h-8 w-8 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-semibold mb-2">有什么可以帮您？</h2>
                <p className="text-sm text-muted-foreground mb-6">开始输入或选择下方的快捷提示</p>
                <QuickPrompts onSelect={(content) => setInputMessage(content)} className="max-w-md" />
              </div>
            ) : (
              <div className="space-y-6 w-full">
                {messages.map((message) => (
                  <MessageItem key={message.id} message={message} onCopy={() => handleCopyMessage(message.content)} />
                ))}
                {/* 待发送的用户消息 */}
                {pendingUserMessage && !messages.some((m) => m.role === 'user' && m.content === pendingUserMessage) && (
                  <MessageItem message={{ role: 'user', content: pendingUserMessage } as Message} />
                )}
                {/* 思考过程 */}
                {isStreaming && streamingReasoning && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                      <Brain className="h-4 w-4 animate-pulse" />
                      思考中...
                    </div>
                    <div className="max-h-40 overflow-y-auto text-sm text-amber-900/80 dark:text-amber-200/80">
                      <MarkdownContent content={streamingReasoning} />
                    </div>
                  </div>
                )}
                {/* 流式响应 */}
                {isStreaming && streamingContent && (
                  <MessageItem message={{ role: 'assistant', content: streamingContent } as Message} isStreaming />
                )}
                {/* 加载指示器 */}
                {isStreaming && !streamingContent && !streamingReasoning && (
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
                      <Bot className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <div className="flex items-center gap-1 pt-2">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/50 [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/50 [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/50" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* 输入区域 */}
        <div className="shrink-0 border-t bg-background px-2 py-2 sm:px-4 sm:py-4">
          <div className="mx-auto max-w-3xl">
            {/* 快捷提示（有消息时显示在输入框上方） */}
            {messages.length > 0 && (
              <QuickPrompts onSelect={(content) => setInputMessage(content)} className="mb-2" compact />
            )}
            <div className="relative">
              <Textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入消息..."
                disabled={isStreaming}
                className="min-h-[52px] max-h-[200px] resize-none rounded-2xl pr-12 py-3.5 text-sm"
                rows={1}
              />
              <Button
                size="icon"
                className="absolute bottom-2 right-2 h-8 w-8 rounded-full"
                disabled={isStreaming || !inputMessage.trim()}
                onClick={handleSendMessage}
              >
                {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="mt-2 hidden text-center text-[10px] text-muted-foreground sm:block">
              Enter 发送 · Shift+Enter 换行
            </p>
          </div>
        </div>
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

      {/* 重命名对话框 */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>重命名对话</DialogTitle>
            <DialogDescription>为对话设置一个新的名称</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="title" className="sr-only">
              对话名称
            </Label>
            <Input
              id="title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="输入对话名称"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameConversation()
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleRenameConversation} disabled={!newTitle.trim() || updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// 对话列表项
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
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
          >
            <MoreHorizontal size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              onRename()
            }}
          >
            <Pencil className="mr-2 h-3.5 w-3.5" />
            重命名
          </DropdownMenuItem>
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

// 消息项
function MessageItem({
  message,
  onCopy,
  isStreaming,
}: {
  message: Message | { role: string; content: string }
  onCopy?: () => void
  isStreaming?: boolean
}) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    onCopy?.()
  }

  return (
    <div className={cn('flex gap-2 sm:gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary' : 'bg-muted'
        )}
      >
        {isUser ? (
          <span className="text-xs font-medium text-primary-foreground">我</span>
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>
      <div className={cn('min-w-0 max-w-[calc(100%-3rem)]', isUser && 'ml-auto')}>
        <div
          className={cn(
            'rounded-2xl px-3 sm:px-4 py-2.5 text-sm',
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
          )}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          ) : (
            <div className="overflow-x-auto">
              <MarkdownContent content={message.content} />
            </div>
          )}
          {isStreaming && (
            <span className="ml-1 inline-flex items-center gap-0.5">
              <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
              <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
              <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
            </span>
          )}
        </div>
        {/* 时间、tokens 和操作按钮 */}
        {'created_at' in message && (
          <div className={cn('mt-1 flex items-center gap-2 text-[10px] text-muted-foreground', isUser && 'justify-end')}>
            <span>
              {format(new Date(message.created_at), 'HH:mm')}
              {'tokens_used' in message && message.tokens_used && ` · ${message.tokens_used} tokens`}
            </span>
            {!isUser && !isStreaming && (
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleCopy}>
                {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default AIChat
