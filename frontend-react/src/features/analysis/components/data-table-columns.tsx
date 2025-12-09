/**
 * 数据表格列定义
 */
import { type ColumnDef } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTableColumnHeader, createSelectColumn } from '@/components/data-table'
import { callTypeMap, callResultMap, formatDate, type CallRecord } from '../types'

interface ColumnOptions {
  onPlayAudio: (url: string) => void
  onCopyUrl: (url: string) => void
  audioLoading: boolean
}

// 列名映射（用于显示中文名）
export const columnNames: Record<string, string> = {
  select: '选择',
  call_time: '日期',
  caller: '主叫',
  callee: '被叫',
  duration: '时长',
  call_type: '类型',
  call_result: '结果',
  customer_name: '客户',
  staff_name: '员工',
  department: '部门',
  transcript: '转写文本',
  record_url: '录音',
}

// 默认列顺序
export const defaultColumnOrder = [
  'select',
  'call_time',
  'caller',
  'callee',
  'duration',
  'call_type',
  'call_result',
  'customer_name',
  'staff_name',
  'department',
  'transcript',
  'record_url',
]

// 默认列可见性
export const defaultColumnVisibility: Record<string, boolean> = {
  select: true,
  call_time: true,
  caller: true,
  callee: true,
  duration: true,
  call_type: true,
  call_result: true,
  customer_name: true,
  staff_name: true,
  department: true,
  transcript: false, // 默认隐藏转写文本
  record_url: true,
}

export function getColumns(options: ColumnOptions): ColumnDef<CallRecord>[] {
  return [
    // 选择列
    createSelectColumn<CallRecord>(),
    {
      accessorKey: 'call_time',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='日期' />
      ),
      cell: ({ row }) => formatDate(row.original.call_time),
      enableSorting: true,
      enableHiding: true,
      size: 110,
    },
    {
      accessorKey: 'caller',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='主叫' />
      ),
      cell: ({ row }) => (
        <span className='block max-w-[120px] truncate'>
          {row.original.caller || '-'}
        </span>
      ),
      enableSorting: true,
      enableHiding: true,
      size: 120,
    },
    {
      accessorKey: 'callee',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='被叫' />
      ),
      cell: ({ row }) => (
        <span className='block max-w-[120px] truncate'>
          {row.original.callee || '-'}
        </span>
      ),
      enableSorting: true,
      enableHiding: true,
      size: 120,
    },
    {
      accessorKey: 'duration',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='时长' />
      ),
      cell: ({ row }) =>
        row.original.duration ? `${row.original.duration}秒` : '-',
      enableSorting: true,
      enableHiding: true,
      size: 80,
    },
    {
      accessorKey: 'call_type',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='类型' />
      ),
      cell: ({ row }) => {
        const callType = row.original.call_type
        if (!callType) return '-'
        const info = callTypeMap[callType] || {
          label: callType,
          variant: 'outline' as const,
        }
        return <Badge variant={info.variant}>{info.label}</Badge>
      },
      enableSorting: true,
      enableHiding: true,
      size: 80,
    },
    {
      accessorKey: 'call_result',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='结果' />
      ),
      cell: ({ row }) => {
        const callResult = row.original.call_result
        if (!callResult) return '-'
        const info = callResultMap[callResult] || {
          label: callResult,
          variant: 'outline' as const,
        }
        return <Badge variant={info.variant}>{info.label}</Badge>
      },
      enableSorting: true,
      enableHiding: true,
      size: 80,
    },
    {
      accessorKey: 'customer_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='客户' />
      ),
      cell: ({ row }) => (
        <span className='block max-w-[120px] truncate'>
          {row.original.customer_name || '-'}
        </span>
      ),
      enableSorting: true,
      enableHiding: true,
      size: 120,
    },
    {
      accessorKey: 'staff_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='员工' />
      ),
      cell: ({ row }) => row.original.staff_name || '-',
      enableSorting: true,
      enableHiding: true,
      size: 100,
    },
    {
      accessorKey: 'department',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='部门' />
      ),
      cell: ({ row }) => row.original.department || '-',
      enableSorting: true,
      enableHiding: true,
      size: 100,
    },
    {
      accessorKey: 'transcript',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='转写文本' />
      ),
      cell: ({ row }) => (
        <span className='block max-w-[200px] truncate'>
          {row.original.transcript || '-'}
        </span>
      ),
      enableSorting: false,
      enableHiding: true,
    },
    {
      id: 'record_url',
      header: '录音',
      cell: ({ row }) => {
        const recordUrl = row.original.raw_data?.['录音地址'] as
          | string
          | undefined
        if (!recordUrl) return '-'
        return (
          <div className='flex gap-1'>
            <Button
              variant='outline'
              size='sm'
              disabled={options.audioLoading}
              onClick={() => options.onPlayAudio(recordUrl)}
            >
              播放
            </Button>
            <Button
              variant='ghost'
              size='sm'
              onClick={() => options.onCopyUrl(recordUrl)}
            >
              复制
            </Button>
          </div>
        )
      },
      enableSorting: false,
      enableHiding: true,
      size: 120,
    },
  ]
}
