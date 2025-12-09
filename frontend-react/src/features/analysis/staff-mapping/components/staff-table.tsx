/**
 * 员工列表表格组件
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
import { Edit, Plus, RefreshCw, Trash2 } from 'lucide-react'
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
import { DataTablePagination } from '@/components/data-table'
import { useDeleteStaff, useStaffList } from '../api'
import type { Staff } from '../types'
import { StaffDialog } from './staff-dialog'
import { MappingDialog } from './mapping-dialog'

export function StaffTable() {
  const [includeInactive, setIncludeInactive] = useState(false)
  const { data: staffList = [], isLoading, refetch, isRefetching } = useStaffList(includeInactive)

  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  // Dialog states
  const [staffDialogOpen, setStaffDialogOpen] = useState(false)
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null)

  const deleteMutation = useDeleteStaff()

  const columns: ColumnDef<Staff>[] = [
    {
      accessorKey: 'name',
      header: '姓名',
      cell: ({ row }) => (
        <div className='flex items-center gap-2'>
          <span className='font-medium'>{row.original.name}</span>
          {!row.original.is_active && (
            <Badge variant='secondary' className='text-xs'>
              离职
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'phone',
      header: '手机号',
      cell: ({ row }) => row.original.phone || '-',
    },
    {
      id: 'current_mapping',
      header: '当前映射',
      cell: ({ row }) => {
        const mapping = row.original.current_mapping
        if (!mapping) {
          return <span className='text-muted-foreground text-sm'>未配置</span>
        }
        return (
          <div className='flex flex-col gap-1 text-sm'>
            {mapping.campus && <Badge variant='outline'>{mapping.campus}</Badge>}
            {mapping.department && (
              <span className='text-muted-foreground'>{mapping.department}</span>
            )}
            {mapping.position && (
              <span className='text-muted-foreground'>{mapping.position}</span>
            )}
          </div>
        )
      },
    },
    {
      id: 'effective_period',
      header: '有效期',
      cell: ({ row }) => {
        const mapping = row.original.current_mapping
        if (!mapping) return '-'
        const from = mapping.effective_from
        const to = mapping.effective_to || '至今'
        return (
          <span className='text-muted-foreground text-sm'>
            {from} ~ {to}
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
              setSelectedStaff(row.original)
              setStaffDialogOpen(true)
            }}
          >
            <Edit className='h-4 w-4' />
          </Button>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => {
              setSelectedStaff(row.original)
              setMappingDialogOpen(true)
            }}
          >
            <Plus className='h-4 w-4' />
            映射
          </Button>
          <Button
            variant='ghost'
            size='sm'
            className='text-destructive hover:text-destructive'
            onClick={() => {
              setSelectedStaff(row.original)
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
    data: staffList,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const handleDelete = async () => {
    if (!selectedStaff) return
    try {
      await deleteMutation.mutateAsync(selectedStaff.id)
      toast.success('员工删除成功')
      setDeleteDialogOpen(false)
      setSelectedStaff(null)
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
          <Input
            placeholder='搜索员工姓名...'
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className='w-64'
          />
          <label className='flex items-center gap-2 text-sm'>
            <Checkbox
              checked={includeInactive}
              onCheckedChange={(checked) => setIncludeInactive(checked === true)}
            />
            显示离职员工
          </label>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => refetch()}
            disabled={isRefetching}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button
            size='sm'
            onClick={() => {
              setSelectedStaff(null)
              setStaffDialogOpen(true)
            }}
          >
            <Plus className='mr-2 h-4 w-4' />
            添加员工
          </Button>
        </div>
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
                  暂无员工数据
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </div>

      <DataTablePagination table={table} />

      {/* Staff Dialog */}
      <StaffDialog
        open={staffDialogOpen}
        onOpenChange={setStaffDialogOpen}
        staff={selectedStaff}
      />

      {/* Mapping Dialog */}
      <MappingDialog
        open={mappingDialogOpen}
        onOpenChange={setMappingDialogOpen}
        staffId={selectedStaff?.id}
        staffName={selectedStaff?.name}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除员工「{selectedStaff?.name}」吗？相关的映射记录也会被删除。
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
