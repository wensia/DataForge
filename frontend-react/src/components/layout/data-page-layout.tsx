import { cn } from '@/lib/utils'

interface DataPageContentProps {
  toolbar?: React.ReactNode
  children: React.ReactNode
  pagination?: React.ReactNode
  className?: string
}

/**
 * 数据页面内容布局组件
 *
 * 提供统一的数据表页面布局结构：
 * - toolbar: 筛选条件/工具栏区域
 * - children: 数据表格区域（自动添加滚动容器和边框样式）
 * - pagination: 分页区域
 */
export function DataPageContent({
  toolbar,
  children,
  pagination,
  className,
}: DataPageContentProps) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-4 overflow-hidden',
        className
      )}
    >
      {toolbar && <div className='flex flex-wrap gap-2'>{toolbar}</div>}
      <div className='bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border shadow-sm'>
        <div className='flex-1 overflow-auto'>{children}</div>
      </div>
      {pagination}
    </div>
  )
}
