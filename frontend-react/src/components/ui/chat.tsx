/**
 * AI 聊天组件
 *
 * 提供消息气泡、消息列表、输入框等聊天界面组件。
 * 参考 shadcn-chatbot-kit 设计。
 */

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Bot, Copy, Check, User, Loader2, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'

// ============ ChatContainer ============

interface ChatContainerProps extends React.HTMLAttributes<HTMLDivElement> {}

const ChatContainer = React.forwardRef<HTMLDivElement, ChatContainerProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('flex h-full min-w-0 flex-col', className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)
ChatContainer.displayName = 'ChatContainer'

// ============ ChatMessages ============

interface ChatMessagesProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

const ChatMessages = React.forwardRef<HTMLDivElement, ChatMessagesProps>(
  ({ className, children }, _ref) => {
    const scrollRef = React.useRef<HTMLDivElement>(null)
    const [shouldAutoScroll, setShouldAutoScroll] = React.useState(true)

    // 自动滚动到底部
    React.useEffect(() => {
      if (shouldAutoScroll && scrollRef.current) {
        const scrollContainer = scrollRef.current.querySelector(
          '[data-radix-scroll-area-viewport]'
        )
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight
        }
      }
    }, [children, shouldAutoScroll])

    // 检测用户是否手动滚动
    const handleScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
      const target = e.target as HTMLDivElement
      const isAtBottom =
        Math.abs(target.scrollHeight - target.scrollTop - target.clientHeight) < 50
      setShouldAutoScroll(isAtBottom)
    }, [])

    return (
      <div className={cn('min-h-0 min-w-0 flex-1 overflow-hidden', className)}>
        <ScrollArea
          ref={scrollRef}
          className="h-full px-4"
          onScrollCapture={handleScroll}
        >
          <div className="flex flex-col gap-4 py-4">{children}</div>
        </ScrollArea>
      </div>
    )
  }
)
ChatMessages.displayName = 'ChatMessages'

// ============ ChatBubble ============

const chatBubbleVariants = cva(
  'relative min-w-0 max-w-[85%] break-words rounded-2xl px-4 py-3 text-sm overflow-hidden',
  {
    variants: {
      variant: {
        user: 'ml-auto bg-primary text-primary-foreground',
        assistant: 'mr-auto bg-muted',
      },
    },
    defaultVariants: {
      variant: 'assistant',
    },
  }
)

interface ChatBubbleProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof chatBubbleVariants> {
  children: React.ReactNode
  showAvatar?: boolean
  showCopy?: boolean
  onCopy?: () => void
}

const ChatBubble = React.forwardRef<HTMLDivElement, ChatBubbleProps>(
  (
    {
      className,
      variant,
      children,
      showAvatar = true,
      showCopy = false,
      onCopy,
      ...props
    },
    ref
  ) => {
    const [copied, setCopied] = React.useState(false)

    const handleCopy = React.useCallback(() => {
      if (onCopy) {
        onCopy()
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }, [onCopy])

    const isUser = variant === 'user'

    return (
      <div
        className={cn(
          'flex min-w-0 gap-3',
          isUser ? 'flex-row-reverse' : 'flex-row'
        )}
      >
        {showAvatar && (
          <div
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
              isUser ? 'bg-primary' : 'bg-muted'
            )}
          >
            {isUser ? (
              <User className="h-4 w-4 text-primary-foreground" />
            ) : (
              <Bot className="h-4 w-4" />
            )}
          </div>
        )}
        <div
          ref={ref}
          className={cn(chatBubbleVariants({ variant }), 'group', className)}
          {...props}
        >
          {children}
          {showCopy && !isUser && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute -right-10 top-0 h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>
    )
  }
)
ChatBubble.displayName = 'ChatBubble'

// ============ ChatInput ============

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder?: string
  disabled?: boolean
  isLoading?: boolean
  className?: string
}

const ChatInput = React.forwardRef<HTMLTextAreaElement, ChatInputProps>(
  (
    {
      value,
      onChange,
      onSubmit,
      placeholder = '输入消息...',
      disabled = false,
      isLoading = false,
      className,
    },
    ref
  ) => {
    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          if (!disabled && !isLoading && value.trim()) {
            onSubmit()
          }
        }
      },
      [disabled, isLoading, value, onSubmit]
    )

    return (
      <div className={cn('border-t bg-background px-4 py-6', className)}>
        <div className="relative flex items-end gap-2">
          <Textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isLoading}
            className="min-h-[60px] max-h-[200px] resize-none py-4 pr-12"
            rows={1}
          />
          <Button
            size="icon"
            className="absolute bottom-2 right-2 h-8 w-8"
            disabled={disabled || isLoading || !value.trim()}
            onClick={onSubmit}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="mt-2 hidden text-center text-xs text-muted-foreground md:block">
          Enter 发送，Shift+Enter 换行
        </p>
      </div>
    )
  }
)
ChatInput.displayName = 'ChatInput'

// ============ ChatTypingIndicator ============

interface ChatTypingIndicatorProps {
  className?: string
}

const ChatTypingIndicator: React.FC<ChatTypingIndicatorProps> = ({
  className,
}) => {
  return (
    <div className={cn('flex gap-3', className)}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <Bot className="h-4 w-4" />
      </div>
      <div className="flex items-center gap-1 rounded-2xl bg-muted px-4 py-3">
        <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/50 [animation-delay:-0.3s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/50 [animation-delay:-0.15s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/50" />
      </div>
    </div>
  )
}
ChatTypingIndicator.displayName = 'ChatTypingIndicator'

// ============ ChatEmpty ============

interface ChatEmptyProps {
  title?: string
  description?: string
  icon?: React.ReactNode
  className?: string
}

const ChatEmpty: React.FC<ChatEmptyProps> = ({
  title = '开始新对话',
  description = '发送消息开始与 AI 对话',
  icon,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-4 text-center',
        className
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        {icon || <Bot className="h-8 w-8 text-muted-foreground" />}
      </div>
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
ChatEmpty.displayName = 'ChatEmpty'

// ============ Exports ============

export {
  ChatContainer,
  ChatMessages,
  ChatBubble,
  ChatInput,
  ChatTypingIndicator,
  ChatEmpty,
  chatBubbleVariants,
}
