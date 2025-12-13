/**
 * 快捷话术组件
 *
 * 显示分配给当前用户的快捷话术，点击后填充到输入框。
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, MessageCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import apiClient from '@/lib/api-client'
import type { ApiResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

interface Prompt {
  id: number
  title: string
  content: string
  category: string | null
  description: string | null
}

// 获取分配给当前用户的话术
function useMyPrompts() {
  return useQuery({
    queryKey: ['prompts', 'my'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<Prompt[]>>('/prompts/my')
      return response.data.data
    },
  })
}

interface QuickPromptsProps {
  onSelect: (content: string) => void
  className?: string
}

export function QuickPrompts({ onSelect, className }: QuickPromptsProps) {
  const { data: prompts = [], isLoading } = useMyPrompts()
  const [isOpen, setIsOpen] = useState(true)

  // 没有话术时不显示
  if (!isLoading && prompts.length === 0) {
    return null
  }

  // 按分类分组
  const groupedPrompts = prompts.reduce(
    (acc, prompt) => {
      const category = prompt.category || '未分类'
      if (!acc[category]) {
        acc[category] = []
      }
      acc[category].push(prompt)
      return acc
    },
    {} as Record<string, Prompt[]>
  )

  const categories = Object.keys(groupedPrompts)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <CollapsibleTrigger asChild>
        <Button
          variant='ghost'
          size='sm'
          className='flex w-full items-center justify-between px-2 py-1 text-xs text-muted-foreground hover:text-foreground'
        >
          <span className='flex items-center gap-1'>
            <MessageCircle className='h-3 w-3' />
            快捷话术
            {!isLoading && <span className='ml-1'>({prompts.length})</span>}
          </span>
          {isOpen ? (
            <ChevronUp className='h-3 w-3' />
          ) : (
            <ChevronDown className='h-3 w-3' />
          )}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className='data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down'>
        {isLoading ? (
          <div className='flex items-center justify-center py-2'>
            <Loader2 className='h-4 w-4 animate-spin text-muted-foreground' />
          </div>
        ) : (
          <div className='space-y-2 py-2'>
            {categories.map((category) => (
              <div key={category}>
                {categories.length > 1 && (
                  <p className='mb-1 text-xs font-medium text-muted-foreground'>
                    {category}
                  </p>
                )}
                <ScrollArea className='w-full whitespace-nowrap'>
                  <div className='flex gap-2 pb-2'>
                    {groupedPrompts[category].map((prompt) => (
                      <PromptButton
                        key={prompt.id}
                        prompt={prompt}
                        onClick={() => onSelect(prompt.content)}
                      />
                    ))}
                  </div>
                  <ScrollBar orientation='horizontal' />
                </ScrollArea>
              </div>
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

interface PromptButtonProps {
  prompt: Prompt
  onClick: () => void
}

function PromptButton({ prompt, onClick }: PromptButtonProps) {
  return (
    <Button
      variant='outline'
      size='sm'
      onClick={onClick}
      className={cn(
        'h-auto shrink-0 px-3 py-1.5 text-xs',
        'hover:bg-primary/10 hover:border-primary'
      )}
      title={prompt.description || prompt.content}
    >
      {prompt.title}
    </Button>
  )
}
