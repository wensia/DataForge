/**
 * 数据表格列定义
 */
import { type ColumnDef } from '@tanstack/react-table'
import { Mic, FileCheck, Minus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { DataTableColumnHeader, createSelectColumn } from '@/components/data-table'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { callTypeMap, callResultMap, formatDate, type CallRecord } from '../types'

interface ColumnOptions {
  onOpenRecordModal: (record: CallRecord) => void
}

// 列名映射（用于显示中文名）
export const columnNames: Record<string, string> = {
  select: '选择',
  call_time: '通话时间',
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
        <DataTableColumnHeader column={column} title='通话时间' />
      ),
      cell: ({ row }) => formatDate(row.original.call_time),
      enableSorting: true,
      enableHiding: true,
      size: 160,
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
      cell: ({ row }) => {
        const transcript = row.original.transcript
        if (!transcript || transcript.length === 0) return '-'
        // 显示第一条文本的摘要
        const firstText = transcript[0]?.text || ''
        return (
          <span className='block max-w-[200px] truncate' title={firstText}>
            {`[${transcript.length}句] ${firstText}`}
          </span>
        )
      },
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
        const hasTranscript = !!row.original.transcript
        const transcriptStatus = row.original.transcript_status

        // 无录音
        if (!recordUrl) {
          return (
            <div className='flex w-full items-center justify-center'>
              <span className='flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-400'>
                <Minus className='h-4 w-4' />
              </span>
            </div>
          )
        }

        // 空音频（已标记）
        if (transcriptStatus === 'empty') {
          return (
            <div className='flex w-full items-center justify-center'>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className='flex h-7 w-7 cursor-default items-center justify-center rounded-full bg-gray-100 text-gray-400'>
                    <Minus className='h-4 w-4' />
                  </span>
                </TooltipTrigger>
                <TooltipContent>空音频</TooltipContent>
              </Tooltip>
            </div>
          )
        }

        // 有录音，根据是否有转写结果显示不同图标
        if (hasTranscript) {
          return (
            <div className='flex w-full items-center justify-center'>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className='flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-green-100 text-green-600 transition-colors hover:bg-green-200'
                    onClick={() => options.onOpenRecordModal(row.original)}
                  >
                    <FileCheck className='h-4 w-4' />
                  </button>
                </TooltipTrigger>
                <TooltipContent>已转写 - 点击查看</TooltipContent>
              </Tooltip>
            </div>
          )
        }

        // 有录音但未转写
        return (
          <div className='flex w-full items-center justify-center'>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className='flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-blue-100 text-blue-600 transition-colors hover:bg-blue-200'
                  onClick={() => options.onOpenRecordModal(row.original)}
                >
                  <Mic className='h-4 w-4' />
                </button>
              </TooltipTrigger>
              <TooltipContent>有录音 - 点击播放</TooltipContent>
            </Tooltip>
          </div>
        )
      },
      enableSorting: false,
      enableHiding: true,
      size: 60,
    },
  ]
}
