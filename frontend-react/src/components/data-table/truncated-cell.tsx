import { useRef, useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface TruncatedCellProps {
  children: React.ReactNode
  className?: string
  /** 最大宽度，默认 200px */
  maxWidth?: number
  /** Tooltip 内容，默认使用 children */
  tooltipContent?: React.ReactNode
}

/**
 * 表格单元格截断组件
 *
 * 专为数据表设计，当内容超出最大宽度时自动截断并显示 Tooltip。
 *
 * @example
 * ```tsx
 * // 在列定义中使用
 * {
 *   accessorKey: 'description',
 *   header: '描述',
 *   cell: ({ row }) => (
 *     <TruncatedCell maxWidth={200}>
 *       {row.getValue('description')}
 *     </TruncatedCell>
 *   ),
 * }
 * ```
 */
export function TruncatedCell({
  children,
  className,
  maxWidth = 200,
  tooltipContent,
}: TruncatedCellProps) {
  const textRef = useRef<HTMLSpanElement>(null)
  const [isTruncated, setIsTruncated] = useState(false)

  const checkTruncation = useCallback(() => {
    const element = textRef.current
    if (element) {
      setIsTruncated(element.scrollWidth > element.clientWidth)
    }
  }, [])

  useEffect(() => {
    checkTruncation()
    window.addEventListener('resize', checkTruncation)
    return () => window.removeEventListener('resize', checkTruncation)
  }, [checkTruncation, children])

  const textElement = (
    <span
      ref={textRef}
      className={cn('block truncate', className)}
      style={{ maxWidth }}
    >
      {children}
    </span>
  )

  if (!isTruncated) {
    return textElement
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{textElement}</TooltipTrigger>
      <TooltipContent className="max-w-[300px] break-words whitespace-pre-wrap">
        {tooltipContent ?? children}
      </TooltipContent>
    </Tooltip>
  )
}
