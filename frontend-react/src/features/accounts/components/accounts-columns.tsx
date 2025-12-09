import { type ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { DataTableColumnHeader, createSelectColumn } from '@/components/data-table'
import { statuses } from '../data/data'
import { type Account } from '../data/schema'
import { AccountsRowActions } from './accounts-row-actions'

/** 格式化时间 */
function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const accountsColumns: ColumnDef<Account>[] = [
  createSelectColumn<Account>(),
  {
    accessorKey: 'phone',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='手机号' />
    ),
    cell: ({ row }) => {
      return (
        <span className='font-medium'>{row.getValue('phone')}</span>
      )
    },
  },
  {
    accessorKey: 'company_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='公司' />
    ),
    cell: ({ row }) => {
      return (
        <div className='flex flex-col gap-1'>
          <span className='font-medium'>{row.getValue('company_name')}</span>
          <span className='text-muted-foreground text-xs'>
            {row.original.company_code}
          </span>
        </div>
      )
    },
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='状态' />
    ),
    cell: ({ row }) => {
      const statusValue = row.getValue('status') as number
      const status = statuses.find((s) => s.value === statusValue)
      if (!status) return null

      return (
        <Badge
          variant={statusValue === 1 ? 'default' : 'secondary'}
          className='gap-1'
        >
          {status.icon && (
            <status.icon
              className={`size-3 ${
                statusValue === 1 ? 'text-green-400' : 'text-gray-400'
              }`}
            />
          )}
          {status.label}
        </Badge>
      )
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    accessorKey: 'user_id',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='用户ID' />
    ),
    cell: ({ row }) => {
      const userId = row.getValue('user_id') as string | null
      return (
        <span className='text-muted-foreground font-mono text-sm'>
          {userId || '-'}
        </span>
      )
    },
  },
  {
    accessorKey: 'last_login',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='最后登录' />
    ),
    cell: ({ row }) => {
      return (
        <span className='text-muted-foreground text-sm'>
          {formatDateTime(row.getValue('last_login'))}
        </span>
      )
    },
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='创建时间' />
    ),
    cell: ({ row }) => {
      return (
        <span className='text-muted-foreground text-sm'>
          {formatDateTime(row.getValue('created_at'))}
        </span>
      )
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => <AccountsRowActions row={row} />,
  },
]
