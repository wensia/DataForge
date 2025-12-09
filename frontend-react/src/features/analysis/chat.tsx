/**
 * 智能问答页面
 */
import { useState, useMemo, useEffect } from 'react'
import { toast } from 'sonner'
import { MessageSquare, Send, Loader2, Trash2 } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useAIProviders, useChatWithData } from './api'
import type { ChatMessage } from './types'

export function AIChat() {
  // AI 服务状态
  const [selectedProvider, setSelectedProvider] = useState<string>('')

  // 智能问答状态
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')

  // API Hooks
  const { data: providersData } = useAIProviders()
  const chatMutation = useChatWithData()

  // 设置默认 AI 服务
  const availableProviders = useMemo(
    () => providersData?.providers.filter((p) => p.available) || [],
    [providersData]
  )

  // 初始化默认 provider
  useEffect(() => {
    if (providersData?.default && !selectedProvider) {
      setSelectedProvider(providersData.default)
    }
  }, [providersData?.default])

  // 发送聊天消息
  const handleSendChat = async () => {
    if (!chatInput.trim()) return

    if (availableProviders.length === 0) {
      toast.warning('没有可用的 AI 服务，请先配置 API 密钥')
      return
    }

    const question = chatInput.trim()
    setChatInput('')
    setChatMessages((prev) => [...prev, { role: 'user', content: question }])

    try {
      const result = await chatMutation.mutateAsync({
        question,
        ai_provider: selectedProvider,
        context_records: 100,
        history: chatMessages,
      })
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: result.result },
      ])
    } catch {
      toast.error('问答失败')
      setChatMessages((prev) => prev.slice(0, -1))
    }
  }

  // 清空对话
  const handleClearChat = () => {
    setChatMessages([])
    toast.success('对话已清空')
  }

  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-4'>
          <h1 className='text-xl font-semibold'>智能问答</h1>
        </div>
      </Header>

      <Main fixed className='min-h-0'>
        <div className='flex h-full flex-col space-y-6'>
          <Card className='flex flex-1 flex-col overflow-hidden'>
            <CardHeader className='flex-row items-center justify-between border-b'>
              <CardTitle className='flex items-center gap-2'>
                <MessageSquare className='h-5 w-5' />
                AI 对话
              </CardTitle>
              <div className='flex items-center gap-2'>
                <span className='text-muted-foreground text-sm'>AI 服务：</span>
                <Select
                  value={selectedProvider}
                  onValueChange={setSelectedProvider}
                  disabled={availableProviders.length === 0}
                >
                  <SelectTrigger className='w-[150px]'>
                    <SelectValue placeholder='选择 AI 服务' />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProviders.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={handleClearChat}
                  disabled={chatMessages.length === 0}
                >
                  <Trash2 className='mr-1 h-4 w-4' />
                  清空对话
                </Button>
              </div>
            </CardHeader>
            <CardContent className='flex flex-1 flex-col gap-4 overflow-hidden p-4'>
              {/* 聊天区域 */}
              <ScrollArea className='flex-1 rounded-md border p-4'>
                {chatMessages.length === 0 ? (
                  <div className='text-muted-foreground flex h-full min-h-[300px] flex-col items-center justify-center gap-4'>
                    <MessageSquare className='h-16 w-16 opacity-50' />
                    <div className='text-center'>
                      <p className='text-lg font-medium'>开始与 AI 对话</p>
                      <p className='text-sm'>
                        基于您的数据回答问题，提供分析洞察
                      </p>
                    </div>
                    {availableProviders.length === 0 && (
                      <p className='text-destructive text-sm'>
                        没有可用的 AI 服务，请先在系统设置中配置 AI API 密钥
                      </p>
                    )}
                  </div>
                ) : (
                  <div className='space-y-4'>
                    {chatMessages.map((msg, index) => (
                      <div
                        key={index}
                        className={cn(
                          'max-w-[80%] rounded-lg p-3',
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground ml-auto'
                            : 'bg-muted'
                        )}
                      >
                        <pre className='whitespace-pre-wrap font-sans text-sm'>
                          {msg.content}
                        </pre>
                      </div>
                    ))}
                    {chatMutation.isPending && (
                      <div className='bg-muted flex max-w-[80%] items-center gap-2 rounded-lg p-3'>
                        <Loader2 className='h-4 w-4 animate-spin' />
                        <span className='text-muted-foreground'>
                          正在思考...
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>

              {/* 输入区域 */}
              <div className='flex gap-2'>
                <Input
                  placeholder='输入您的问题...'
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendChat()
                    }
                  }}
                  disabled={
                    chatMutation.isPending || availableProviders.length === 0
                  }
                  className='flex-1'
                />
                <Button
                  onClick={handleSendChat}
                  disabled={
                    !chatInput.trim() ||
                    chatMutation.isPending ||
                    availableProviders.length === 0
                  }
                >
                  {chatMutation.isPending ? (
                    <Loader2 className='h-4 w-4 animate-spin' />
                  ) : (
                    <Send className='h-4 w-4' />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  )
}
