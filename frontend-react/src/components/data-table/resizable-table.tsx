/**
 * 可调整列宽的数据表格组件
 * 基于 TanStack Table 的 column resizing 功能
 */
import * as React from 'react'
import { flexRender, type Table as TanstackTable, type Header } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type ResizableTableProps<TData> = {
  table: TanstackTable<TData>
  /** 无数据时显示的文本 */
  emptyText?: string
  /** 表格容器的 className */
  className?: string
}

/**
 * 列宽调整手柄组件
 */
function ColumnResizer<TData>({ header }: { header: Header<TData, unknown> }) {
  if (!header.column.getCanResize()) {
    return null
  }

  return (
    <div
      onDoubleClick={() => header.column.resetSize()}
      onMouseDown={header.getResizeHandler()}
      onTouchStart={header.getResizeHandler()}
      className={cn(
        'absolute top-0 right-0 h-full w-1 cursor-col-resize select-none touch-none',
        'bg-transparent hover:bg-primary/50 transition-colors',
        header.column.getIsResizing() && 'bg-primary'
      )}
      style={{
        transform: 'translateX(50%)',
      }}
    />
  )
}

export function ResizableTable<TData>({
  table,
  emptyText = '暂无数据',
  className,
}: ResizableTableProps<TData>) {
  const columns = table.getAllColumns()

  return (
    <div className={cn('overflow-hidden rounded-md border', className)}>
      <Table
        style={{
          width: table.getCenterTotalSize(),
        }}
      >
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    className={cn(
                      'relative',
                      header.column.columnDef.meta?.className,
                      header.column.columnDef.meta?.thClassName
                    )}
                    style={{
                      width: header.getSize(),
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                    <ColumnResizer header={header} />
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      cell.column.columnDef.meta?.className,
                      cell.column.columnDef.meta?.tdClassName
                    )}
                    style={{
                      width: cell.column.getSize(),
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className='h-24 text-center'>
                {emptyText}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
