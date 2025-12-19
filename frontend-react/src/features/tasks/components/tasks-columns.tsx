import { type ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { DataTableColumnHeader, TruncatedCell, createSelectColumn } from '@/components/data-table'
import { statuses, taskTypes, categories } from '../data/data'
import { type Task } from '../data/schema'

/** 格式化时间 */
function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 格式化间隔时间 */
function formatInterval(seconds: number | null): string {
  if (!seconds) return '-'
  if (seconds < 60) return `${seconds}秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时`
  return `${Math.floor(seconds / 86400)}天`
}

export const tasksColumns: ColumnDef<Task>[] = [
  createSelectColumn<Task>(),
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='任务名称' />
    ),
    cell: ({ row }) => {
      const taskType = taskTypes.find((t) => t.value === row.original.task_type)
      return (
        <div className='flex flex-col gap-1'>
          <div className='flex items-center gap-2'>
            {taskType && (
              <Badge variant='outline' className='text-xs'>
                {taskType.label}
              </Badge>
            )}
            <TruncatedCell maxWidth={200} className='font-medium'>
              {row.getValue('name')}
            </TruncatedCell>
          </div>
          {row.original.description && (
            <TruncatedCell
              maxWidth={300}
              className='text-muted-foreground text-xs'
            >
              {row.original.description}
            </TruncatedCell>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: 'category',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='分类' />
    ),
    cell: ({ row }) => {
      const categoryValue = row.getValue('category') as string | null
      if (!categoryValue) {
        return <span className='text-muted-foreground'>-</span>
      }

      const category = categories.find((c) => c.value === categoryValue)
      const label = category?.label || categoryValue
      const Icon = category?.icon
      const color = category?.color || 'gray'

      return (
        <Badge color={color} className='gap-1'>
          {Icon && <Icon className='size-3' />}
          {label}
        </Badge>
      )
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='状态' />
    ),
    cell: ({ row }) => {
      const status = statuses.find((s) => s.value === row.getValue('status'))
      if (!status) return null

      return (
        <div className='flex items-center gap-2'>
          {status.icon && (
            <status.icon
              className={`size-4 ${
                status.value === 'active'
                  ? 'text-green-500'
                  : status.value === 'paused'
                    ? 'text-yellow-500'
                    : 'text-gray-400'
              }`}
            />
          )}
          <span>{status.label}</span>
        </div>
      )
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    accessorKey: 'schedule',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='调度配置' />
    ),
    cell: ({ row }) => {
      const task = row.original
      let scheduleText = '-'

      if (task.task_type === 'cron' && task.cron_expression) {
        scheduleText = task.cron_expression
      } else if (task.task_type === 'interval' && task.interval_seconds) {
        scheduleText = `每 ${formatInterval(task.interval_seconds)}`
      } else if (task.task_type === 'date' && task.run_date) {
        scheduleText = formatDateTime(task.run_date)
      }

      return (
        <TruncatedCell
          maxWidth={150}
          className='text-muted-foreground font-mono text-sm'
        >
          {scheduleText}
        </TruncatedCell>
      )
    },
    enableSorting: false,
  },
  {
    accessorKey: 'run_count',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='执行统计' />
    ),
    cell: ({ row }) => {
      const task = row.original
      const successRate =
        task.run_count > 0
          ? Math.round((task.success_count / task.run_count) * 100)
          : 0

      return (
        <div className='flex flex-col gap-1 text-sm'>
          <div className='flex items-center gap-2'>
            <span className='text-muted-foreground'>总计:</span>
            <span className='font-medium'>{task.run_count}</span>
          </div>
          <div className='flex items-center gap-2 text-xs'>
            <span className='text-green-600'>{task.success_count}</span>
            <span className='text-muted-foreground'>/</span>
            <span className='text-red-600'>{task.fail_count}</span>
            <span className='text-muted-foreground'>({successRate}%)</span>
          </div>
        </div>
      )
    },
  },
  {
    accessorKey: 'last_run_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='上次执行' />
    ),
    cell: ({ row }) => {
      return (
        <div className='text-muted-foreground text-sm'>
          {formatDateTime(row.getValue('last_run_at'))}
        </div>
      )
    },
  },
  {
    accessorKey: 'next_run_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='下次执行' />
    ),
    cell: ({ row }) => {
      const task = row.original
      if (task.status !== 'active') {
        return <span className='text-muted-foreground text-sm'>-</span>
      }
      return (
        <div className='text-sm'>{formatDateTime(row.getValue('next_run_at'))}</div>
      )
    },
  },
]
