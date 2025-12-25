import * as React from 'react'
import { cn } from '@/lib/utils'

const inputSizeClasses = {
  default: 'h-10 px-4 py-2 text-base md:text-sm',
  sm: 'h-9 px-3 py-1.5 text-sm',
  xs: 'h-8 px-3 py-1 text-sm',
}

interface InputProps extends React.ComponentProps<'input'> {
  inputSize?: keyof typeof inputSizeClasses
}

function Input({
  className,
  type,
  inputSize = 'default',
  ...props
}: InputProps) {
  return (
    <input
      type={type}
      data-slot='input'
      data-size={inputSize}
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex w-full min-w-0 rounded-lg border bg-transparent shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        inputSizeClasses[inputSize],
        className
      )}
      {...props}
    />
  )
}

export { Input, type InputProps }
