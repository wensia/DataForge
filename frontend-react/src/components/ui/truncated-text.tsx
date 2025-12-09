import { useRef, useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface TruncatedTextProps {
  children: React.ReactNode
  className?: string
  /** 最大宽度，默认使用父容器宽度 */
  maxWidth?: number | string
  /** Tooltip 内容，默认使用 children */
  tooltipContent?: React.ReactNode
  /** Tooltip 最大宽度，默认 300px */
  tooltipMaxWidth?: number
}

/**
 * 自动检测文本截断并显示 Tooltip 的组件
 *
 * 当文本内容超出容器宽度被截断时，鼠标悬浮自动显示完整内容。
 *
 * @example
 * ```tsx
 * // 基础用法
 * <TruncatedText className="max-w-[200px]">
 *   这是一段很长的文本内容...
 * </TruncatedText>
 *
 * // 在表格中使用
 * <TableCell>
 *   <TruncatedText className="max-w-[150px]">
 *     {row.getValue('description')}
 *   </TruncatedText>
 * </TableCell>
 * ```
 */
export function TruncatedText({
  children,
  className,
  maxWidth,
  tooltipContent,
  tooltipMaxWidth = 300,
}: TruncatedTextProps) {
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

    // 监听窗口大小变化
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
      <TooltipContent
        className="max-w-[var(--tooltip-max-width)] break-words whitespace-pre-wrap"
        style={{ '--tooltip-max-width': `${tooltipMaxWidth}px` } as React.CSSProperties}
      >
        {tooltipContent ?? children}
      </TooltipContent>
    </Tooltip>
  )
}
