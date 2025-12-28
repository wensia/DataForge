import { useState } from 'react'
import { Loader2, Phone, Search, ExternalLink } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { useBatchPhoneStats } from '../api'
import type { PhoneStats } from '../types'
import { formatDate } from '../types'

interface BatchPhoneQueryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectPhone: (phone: string) => void
}

export function BatchPhoneQueryDialog({
  open,
  onOpenChange,
  onSelectPhone,
}: BatchPhoneQueryDialogProps) {
  const [phoneInput, setPhoneInput] = useState('')
  const [startDate, setStartDate] = useState<Date | undefined>()
  const [endDate, setEndDate] = useState<Date | undefined>()
  const [results, setResults] = useState<PhoneStats[] | null>(null)
  const [notFound, setNotFound] = useState<string[]>([])

  const batchQuery = useBatchPhoneStats()

  const handleQuery = async () => {
    // 解析手机号（支持换行、逗号、空格分隔）
    const phones = phoneInput
      .split(/[\n,\s]+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)

    if (phones.length === 0) {
      return
    }

    try {
      const data = await batchQuery.mutateAsync({
        phones,
        start_date: startDate ? format(startDate, 'yyyy-MM-dd') : undefined,
        end_date: endDate ? format(endDate, 'yyyy-MM-dd') : undefined,
      })
      setResults(data.items)
      setNotFound(data.not_found)
    } catch (error) {
      console.error('批量查询失败:', error)
    }
  }

  const handleRowClick = (phone: string) => {
    onSelectPhone(phone)
    onOpenChange(false)
  }

  const handleClose = (open: boolean) => {
    if (!open) {
      // 清空状态
      setResults(null)
      setNotFound([])
    }
    onOpenChange(open)
  }

  const phoneCount = phoneInput
    .split(/[\n,\s]+/)
    .filter((p) => p.trim().length > 0).length

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className='max-w-3xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Phone className='h-5 w-5' />
            批量查询手机号
          </DialogTitle>
          <DialogDescription>
            输入多个手机号查询通话频次和最后通话时间，点击结果行可在主表格中查看详情
          </DialogDescription>
        </DialogHeader>

        {/* 输入区域 */}
        <div className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='phones'>
              手机号列表
              {phoneCount > 0 && (
                <span className='text-muted-foreground ml-2 text-xs'>
                  已输入 {phoneCount} 个
                </span>
              )}
            </Label>
            <Textarea
              id='phones'
              placeholder='请输入手机号，每行一个（也支持逗号或空格分隔）'
              className='min-h-[120px] font-mono text-sm'
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
            />
          </div>

          {/* 日期范围 */}
          <div className='flex flex-wrap items-center gap-4'>
            <div className='flex items-center gap-2'>
              <Label className='whitespace-nowrap text-sm'>日期范围</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant='outline'
                    size='sm'
                    className={cn(
                      'w-[130px] justify-start text-left font-normal',
                      !startDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className='mr-2 h-4 w-4' />
                    {startDate ? format(startDate, 'yyyy-MM-dd') : '开始日期'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-auto p-0' align='start'>
                  <Calendar
                    mode='single'
                    selected={startDate}
                    onSelect={setStartDate}
                    locale={zhCN}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <span className='text-muted-foreground'>~</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant='outline'
                    size='sm'
                    className={cn(
                      'w-[130px] justify-start text-left font-normal',
                      !endDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className='mr-2 h-4 w-4' />
                    {endDate ? format(endDate, 'yyyy-MM-dd') : '结束日期'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-auto p-0' align='start'>
                  <Calendar
                    mode='single'
                    selected={endDate}
                    onSelect={setEndDate}
                    locale={zhCN}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {(startDate || endDate) && (
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => {
                    setStartDate(undefined)
                    setEndDate(undefined)
                  }}
                >
                  清除
                </Button>
              )}
            </div>
            <div className='flex-1' />
            <Button
              onClick={handleQuery}
              disabled={phoneCount === 0 || batchQuery.isPending}
            >
              {batchQuery.isPending ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <Search className='mr-2 h-4 w-4' />
              )}
              查询
            </Button>
          </div>
        </div>

        {/* 结果区域 */}
        {results !== null && (
          <div className='space-y-2'>
            <div className='text-sm text-muted-foreground'>
              查询结果：找到 {results.length} 个，未找到 {notFound.length} 个
            </div>

            {results.length > 0 && (
              <div className='max-h-[300px] overflow-auto rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>手机号</TableHead>
                      <TableHead className='text-right'>呼入</TableHead>
                      <TableHead className='text-right'>呼出</TableHead>
                      <TableHead className='text-right'>合计</TableHead>
                      <TableHead className='text-right'>最后通话</TableHead>
                      <TableHead className='w-[60px]'></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((item) => (
                      <TableRow
                        key={item.phone}
                        className='cursor-pointer hover:bg-muted/50'
                        onClick={() => handleRowClick(item.phone)}
                      >
                        <TableCell className='font-mono font-medium'>
                          {item.phone}
                        </TableCell>
                        <TableCell className='text-right text-blue-600'>
                          {item.inbound_count}
                        </TableCell>
                        <TableCell className='text-right text-green-600'>
                          {item.outbound_count}
                        </TableCell>
                        <TableCell className='text-right font-medium'>
                          {item.total_count}
                        </TableCell>
                        <TableCell className='text-right text-muted-foreground'>
                          {item.last_call_time
                            ? formatDate(item.last_call_time)
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <ExternalLink className='h-4 w-4 text-muted-foreground' />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {notFound.length > 0 && (
              <div className='rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950'>
                <div className='text-sm font-medium text-amber-800 dark:text-amber-200'>
                  未找到记录的手机号：
                </div>
                <div className='mt-1 text-sm text-amber-600 dark:text-amber-400'>
                  {notFound.join('、')}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
