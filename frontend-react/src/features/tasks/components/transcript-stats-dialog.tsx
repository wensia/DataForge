import { useQuery } from '@tanstack/react-query'
import { Loader2, BarChart3 } from 'lucide-react'
import apiClient from '@/lib/api-client'
import type { ApiResponse } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface MonthlyTranscriptStats {
  month: string
  total: number
  pending: number
  completed: number
  empty: number
}

interface TranscriptStatsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TranscriptStatsDialog({
  open,
  onOpenChange,
}: TranscriptStatsDialogProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['transcript-stats', 'monthly'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<MonthlyTranscriptStats[]>>(
        '/analysis/transcript-stats/monthly'
      )
      return response.data.data
    },
    enabled: open,
  })

  // 计算总计
  const totals = data?.reduce(
    (acc, item) => ({
      total: acc.total + item.total,
      pending: acc.pending + item.pending,
      completed: acc.completed + item.completed,
      empty: acc.empty + item.empty,
    }),
    { total: 0, pending: 0, completed: 0, empty: 0 }
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <BarChart3 className='h-5 w-5' />
            录音转写统计
          </DialogTitle>
          <DialogDescription>按月份统计录音转写状态</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className='flex h-40 items-center justify-center'>
            <Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
          </div>
        ) : (
          <div className='max-h-[60vh] overflow-auto'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>月份</TableHead>
                  <TableHead className='text-right'>总数</TableHead>
                  <TableHead className='text-right'>待转写</TableHead>
                  <TableHead className='text-right'>已转写</TableHead>
                  <TableHead className='text-right'>空音频</TableHead>
                  <TableHead className='text-right'>转写率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.map((item) => {
                  const rate =
                    item.total > 0
                      ? ((item.completed / item.total) * 100).toFixed(1)
                      : '0.0'
                  return (
                    <TableRow key={item.month}>
                      <TableCell className='font-medium'>{item.month}</TableCell>
                      <TableCell className='text-right'>{item.total.toLocaleString()}</TableCell>
                      <TableCell className='text-right text-amber-600'>
                        {item.pending.toLocaleString()}
                      </TableCell>
                      <TableCell className='text-right text-green-600'>
                        {item.completed.toLocaleString()}
                      </TableCell>
                      <TableCell className='text-right text-muted-foreground'>
                        {item.empty.toLocaleString()}
                      </TableCell>
                      <TableCell className='text-right'>{rate}%</TableCell>
                    </TableRow>
                  )
                })}
                {totals && (
                  <TableRow className='bg-muted/50 font-medium'>
                    <TableCell>总计</TableCell>
                    <TableCell className='text-right'>
                      {totals.total.toLocaleString()}
                    </TableCell>
                    <TableCell className='text-right text-amber-600'>
                      {totals.pending.toLocaleString()}
                    </TableCell>
                    <TableCell className='text-right text-green-600'>
                      {totals.completed.toLocaleString()}
                    </TableCell>
                    <TableCell className='text-right text-muted-foreground'>
                      {totals.empty.toLocaleString()}
                    </TableCell>
                    <TableCell className='text-right'>
                      {totals.total > 0
                        ? ((totals.completed / totals.total) * 100).toFixed(1)
                        : '0.0'}
                      %
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
