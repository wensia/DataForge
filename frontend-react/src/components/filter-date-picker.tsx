import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { Calendar as CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

type FilterDatePickerProps = {
  selected: Date | undefined
  onSelect: (date: Date | undefined) => void
  placeholder?: string
  className?: string
}

/**
 * 筛选用日期选择器
 * - 显示中文格式（yyyy年MM月dd日）
 * - 不限制日期范围
 */
export function FilterDatePicker({
  selected,
  onSelect,
  placeholder = '选择日期',
  className,
}: FilterDatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          data-empty={!selected}
          className={cn(
            'data-[empty=true]:text-muted-foreground justify-start text-start font-normal',
            className
          )}
        >
          <CalendarIcon className='mr-2 h-4 w-4 opacity-50' />
          {selected ? (
            format(selected, 'yyyy-MM-dd', { locale: zhCN })
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-auto p-0' align='start'>
        <Calendar
          mode='single'
          captionLayout='dropdown'
          selected={selected}
          onSelect={onSelect}
          locale={zhCN}
        />
      </PopoverContent>
    </Popover>
  )
}
