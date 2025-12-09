import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { cn, getPageNumbers } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface SimplePaginationProps {
  page: number
  pageSize: number
  total: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: number[]
  className?: string
}

/**
 * 简单分页组件 - 用于手动分页场景
 *
 * 与 DataTablePagination 不同，此组件不依赖 TanStack Table，
 * 适用于使用 useState 管理分页状态的场景。
 */
export function SimplePagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100, 300, 500, 1000],
  className,
}: SimplePaginationProps) {
  const pageNumbers = getPageNumbers(page, totalPages)

  return (
    <div className={cn('flex items-center justify-between', className)}>
      <div className='flex items-center gap-4'>
        <div className='text-muted-foreground text-sm'>共 {total} 条记录</div>
        {onPageSizeChange && (
          <div className='flex items-center gap-2'>
            <span className='text-muted-foreground text-sm'>每页</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => onPageSizeChange(Number(value))}
            >
              <SelectTrigger className='h-8 w-[80px]'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className='text-muted-foreground text-sm'>条</span>
          </div>
        )}
      </div>
      <div className='flex items-center gap-1'>
        <Button
          variant='outline'
          size='icon'
          className='h-8 w-8'
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
        >
          <ChevronsLeft className='h-4 w-4' />
        </Button>
        <Button
          variant='outline'
          size='icon'
          className='h-8 w-8'
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className='h-4 w-4' />
        </Button>

        {pageNumbers.map((pageNumber, index) => (
          <div key={`${pageNumber}-${index}`}>
            {pageNumber === '...' ? (
              <span className='text-muted-foreground px-2 text-sm'>...</span>
            ) : (
              <Button
                variant={page === pageNumber ? 'default' : 'outline'}
                className='h-8 min-w-11 px-2.5'
                onClick={() => onPageChange(pageNumber as number)}
              >
                {pageNumber}
              </Button>
            )}
          </div>
        ))}

        <Button
          variant='outline'
          size='icon'
          className='h-8 w-8'
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          <ChevronRight className='h-4 w-4' />
        </Button>
        <Button
          variant='outline'
          size='icon'
          className='h-8 w-8'
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
        >
          <ChevronsRight className='h-4 w-4' />
        </Button>
        <span className='text-muted-foreground ml-2 text-sm'>
          第 {page} / {totalPages} 页
        </span>
      </div>
    </div>
  )
}
