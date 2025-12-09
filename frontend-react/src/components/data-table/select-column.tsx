/**
 * 通用的多选列定义
 * 用于数据表格的行选择功能，固定宽度不可调整
 */
import { type ColumnDef } from '@tanstack/react-table'
import { Checkbox } from '@/components/ui/checkbox'

type SelectColumnOptions = {
  /** 额外的 meta 配置（如 className 用于响应式布局） */
  meta?: Record<string, unknown>
}

/**
 * 创建一个标准的多选列
 * - 固定宽度 40px，不可调整
 * - 支持全选/取消全选
 * - 支持单行选择
 */
export function createSelectColumn<TData>(
  options: SelectColumnOptions = {}
): ColumnDef<TData> {
  return {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label='Select all'
        className='translate-y-[2px]'
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label='Select row'
        className='translate-y-[2px]'
      />
    ),
    size: 40,
    minSize: 40,
    maxSize: 40,
    enableResizing: false,
    enableSorting: false,
    enableHiding: false,
    ...(options.meta && { meta: options.meta }),
  }
}
