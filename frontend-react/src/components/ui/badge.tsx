import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import {
  getTagColorClass,
  type TagColorName,
  type TagColorStyle,
} from '@/lib/colors'

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        destructive:
          'border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

interface BadgeProps
  extends React.ComponentProps<'span'>,
    VariantProps<typeof badgeVariants> {
  asChild?: boolean
  /** 使用全局颜色系统的颜色名称 */
  color?: TagColorName
  /** 颜色样式：soft(柔和)、solid(实心)、outline(边框) */
  colorStyle?: TagColorStyle
}

function Badge({
  className,
  variant,
  asChild = false,
  color,
  colorStyle = 'soft',
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot : 'span'

  // 如果提供了 color，使用全局颜色系统
  const colorClass = color ? getTagColorClass(color, colorStyle) : undefined

  return (
    <Comp
      data-slot='badge'
      className={cn(
        badgeVariants({ variant: color ? undefined : variant }),
        // 当使用 color 时，应用基础样式但不应用 variant 的颜色
        color &&
          'inline-flex items-center justify-center rounded-md border-transparent px-2 py-0.5 text-xs font-medium',
        colorClass,
        className
      )}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
export type { BadgeProps }
