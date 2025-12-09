/**
 * 映射历史表格组件
 */

import { useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { Edit, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DataTablePagination } from '@/components/data-table'
import { useDeleteMapping, useMappingsList, useStaffList } from '../api'
import type { StaffMapping } from '../types'
import { MappingDialog } from './mapping-dialog'

// 扩展 StaffMapping 类型，包含员工名称
interface MappingWithStaffName extends StaffMapping {
  staff_name?: string
}

export function MappingTable() {
  const [includeExpired, setIncludeExpired] = useState(true)
  const [staffFilter, setStaffFilter] = useState<string>('all')

  const { data: staffList = [] } = useStaffList(true)
  const {
    data: mappings = [],
    isLoading,
    refetch,
    isRefetching,
  } = useMappingsList({
    staffId: staffFilter !== 'all' ? Number(staffFilter) : undefined,
    includeExpired,
  })

  const [sorting, setSorting] = useState<SortingState>([])

  // Dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedMapping, setSelectedMapping] = useState<StaffMapping | null>(null)

  const deleteMutation = useDeleteMapping()

  // 创建员工 ID 到名称的映射
  const staffNameMap = new Map(staffList.map((s) => [s.id, s.name]))

  // 添加员工名称到映射数据
  const mappingsWithName: MappingWithStaffName[] = mappings.map((m) => ({
    ...m,
    staff_name: staffNameMap.get(m.staff_id) || '未知',
  }))

  const columns: ColumnDef<MappingWithStaffName>[] = [
    {
      accessorKey: 'staff_name',
      header: '员工',
      cell: ({ row }) => (
        <span className='font-medium'>{row.original.staff_name}</span>
      ),
    },
    {
      accessorKey: 'campus',
      header: '校区',
      cell: ({ row }) =>
        row.original.campus ? (
          <Badge variant='outline'>{row.original.campus}</Badge>
        ) : (
          '-'
        ),
    },
    {
      accessorKey: 'department',
      header: '部门',
      cell: ({ row }) => row.original.department || '-',
    },
    {
      accessorKey: 'position',
      header: '职位',
      cell: ({ row }) => row.original.position || '-',
    },
    {
      accessorKey: 'effective_from',
      header: '生效开始',
      cell: ({ row }) => row.original.effective_from,
    },
    {
      accessorKey: 'effective_to',
      header: '生效结束',
      cell: ({ row }) => {
        const to = row.original.effective_to
        if (!to) {
          return <Badge variant='secondary'>至今</Badge>
        }
        // 检查是否已过期
        const isExpired = new Date(to) < new Date()
        return (
          <span className={isExpired ? 'text-muted-foreground' : ''}>
            {to}
            {isExpired && (
              <Badge variant='outline' className='ml-2 text-xs'>
                已过期
              </Badge>
            )}
          </span>
        )
      },
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <div className='flex items-center gap-2'>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => {
              setSelectedMapping(row.original)
              setEditDialogOpen(true)
            }}
          >
            <Edit className='h-4 w-4' />
          </Button>
          <Button
            variant='ghost'
            size='sm'
            className='text-destructive hover:text-destructive'
            onClick={() => {
              setSelectedMapping(row.original)
              setDeleteDialogOpen(true)
            }}
          >
            <Trash2 className='h-4 w-4' />
          </Button>
        </div>
      ),
    },
  ]

  const table = useReactTable({
    data: mappingsWithName,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const handleDelete = async () => {
    if (!selectedMapping) return
    try {
      await deleteMutation.mutateAsync(selectedMapping.id)
      toast.success('映射删除成功')
      setDeleteDialogOpen(false)
      setSelectedMapping(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除失败'
      toast.error(message)
    }
  }

  if (isLoading) {
    return (
      <div className='flex flex-1 flex-col gap-4'>
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-64 w-full' />
      </div>
    )
  }

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-4'>
      {/* Toolbar */}
      <div className='flex items-center justify-between gap-4'>
        <div className='flex items-center gap-4'>
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger className='w-48'>
              <SelectValue placeholder='筛选员工' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>全部员工</SelectItem>
              {staffList.map((staff) => (
                <SelectItem key={staff.id} value={String(staff.id)}>
                  {staff.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className='flex items-center gap-2 text-sm'>
            <Checkbox
              checked={includeExpired}
              onCheckedChange={(checked) => setIncludeExpired(checked === true)}
            />
            显示已过期
          </label>
        </div>
        <Button
          variant='outline'
          size='sm'
          onClick={() => refetch()}
          disabled={isRefetching}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* Table */}
      <div className='flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border'>
        <div className='flex-1 overflow-auto'>
          <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className='h-24 text-center'>
                  暂无映射数据
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </div>

      <DataTablePagination table={table} />

      {/* Edit Dialog */}
      <MappingDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        mapping={selectedMapping}
        staffId={selectedMapping?.staff_id}
        staffName={staffNameMap.get(selectedMapping?.staff_id || 0)}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除这条映射记录吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
