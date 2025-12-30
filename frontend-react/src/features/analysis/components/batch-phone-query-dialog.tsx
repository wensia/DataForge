import { useState } from 'react'
import { Loader2, Search, ExternalLink, Calendar as CalendarIcon, X, Info } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
      <DialogContent className='max-w-[720px] p-0 overflow-hidden gap-0'>
        <DialogHeader className='p-6 pb-4'>
          <div className='flex items-center justify-between'>
            <div className='space-y-1'>
              <DialogTitle className='text-xl'>
                批量查询手机号
              </DialogTitle>
              <DialogDescription>
                快速检索多个手机号的通话概况与活跃时间
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className='px-6 pb-6 space-y-6'>
          {/* 输入区域面板 */}
          <div className='rounded-xl border bg-muted/30 p-4 space-y-4'>
            <div className='space-y-2'>
              <div className='flex items-center justify-between'>
                <Label htmlFor='phones' className='text-sm font-semibold'>
                  手机号列表
                </Label>
                {phoneCount > 0 && (
                  <Badge variant='secondary' className='font-mono px-2 py-0 text-[10px]'>
                    已识别 {phoneCount} 个号码
                  </Badge>
                )}
              </div>
              <Textarea
                id='phones'
                placeholder='请输入手机号，支持每行一个、逗号或空格分隔...'
                className='min-h-[100px] max-h-[160px] font-mono text-sm bg-background border-muted-foreground/20 focus-visible:ring-primary/30 transition-shadow resize-none'
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
              />
            </div>

            <div className='flex flex-wrap items-center gap-3 pt-1'>
              <div className='flex items-center gap-2 bg-background border rounded-md p-1 pl-2.5'>
                <span className='text-xs font-medium text-muted-foreground whitespace-nowrap'>统计时段</span>
                <Separator orientation='vertical' className='h-4' />
                <div className='flex items-center gap-1'>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant='ghost'
                        size='sm'
                        className={cn(
                          'h-7 px-2 text-xs font-normal hover:bg-muted',
                          !startDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className='mr-1.5 h-3.5 w-3.5' />
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
                  <span className='text-muted-foreground/50 text-[10px]'>至</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant='ghost'
                        size='sm'
                        className={cn(
                          'h-7 px-2 text-xs font-normal hover:bg-muted',
                          !endDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className='mr-1.5 h-3.5 w-3.5' />
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
                      size='icon'
                      className='h-6 w-6 rounded-full hover:bg-destructive/10 hover:text-destructive'
                      onClick={() => {
                        setStartDate(undefined)
                        setEndDate(undefined)
                      }}
                    >
                      <X className='h-3 w-3' />
                    </Button>
                  )}
                </div>
              </div>

              <div className='flex-1' />
              <Button
                onClick={handleQuery}
                disabled={phoneCount === 0 || batchQuery.isPending}
                className='shadow-sm px-6 h-9 transition-all active:scale-95'
              >
                {batchQuery.isPending ? (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                ) : (
                  <Search className='mr-2 h-4 w-4' />
                )}
                立即查询
              </Button>
            </div>
          </div>

          {/* 结果区域 */}
          {results !== null && (
            <div className='space-y-4 animate-in fade-in slide-in-from-top-2 duration-300'>
              <div className='flex items-center justify-between bg-muted/10 px-1 py-0.5 rounded-lg'>
                <div className='flex gap-4'>
                  <div className='flex items-center gap-1.5'>
                    <div className='w-1.5 h-1.5 rounded-full bg-blue-500' />
                    <span className='text-xs text-muted-foreground'>匹配记录</span>
                    <Badge variant='outline' className='bg-blue-50/50 text-blue-600 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20 px-1.5 py-0 min-w-[20px] justify-center'>
                      {results.length}
                    </Badge>
                  </div>
                  {notFound.length > 0 && (
                    <div className='flex items-center gap-1.5'>
                      <div className='w-1.5 h-1.5 rounded-full bg-amber-500' />
                      <span className='text-xs text-muted-foreground'>未找到</span>
                      <Badge variant='outline' className='bg-amber-50/50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 px-1.5 py-0 min-w-[20px] justify-center'>
                        {notFound.length}
                      </Badge>
                    </div>
                  )}
                </div>
                <span className='text-[10px] text-muted-foreground flex items-center gap-1'>
                  <Info className='h-3 w-3' />
                  点击行可查看详细记录
                </span>
              </div>

              {results.length > 0 && (
                <div className='rounded-xl border shadow-sm overflow-hidden bg-background'>
                  <ScrollArea className='h-[320px]'>
                    <Table>
                      <TableHeader className='bg-muted/30 sticky top-0 z-10'>
                        <TableRow className='hover:bg-transparent border-b'>
                          <TableHead className='w-[140px] pl-4 font-semibold text-xs'>手机号</TableHead>
                          <TableHead className='w-[70px] text-center font-semibold text-xs'>呼入</TableHead>
                          <TableHead className='w-[70px] text-center font-semibold text-xs'>呼出</TableHead>
                          <TableHead className='w-[70px] text-center font-semibold text-xs'>合计</TableHead>
                          <TableHead className='text-right pr-12 font-semibold text-xs'>最后通话时间</TableHead>
                          <TableHead className='w-[40px]'></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.map((item) => (
                          <TableRow
                            key={item.phone}
                            className='group cursor-pointer hover:bg-muted/50 transition-colors border-b last:border-0'
                            onClick={() => handleRowClick(item.phone)}
                          >
                            <TableCell className='font-mono text-sm font-medium pl-4 py-3'>
                              {item.phone}
                            </TableCell>
                            <TableCell className='text-center'>
                              <span className='inline-flex items-center justify-center min-w-[24px] rounded px-1 text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400 font-medium text-xs'>
                                {item.inbound_count}
                              </span>
                            </TableCell>
                            <TableCell className='text-center'>
                              <span className='inline-flex items-center justify-center min-w-[24px] rounded px-1 text-green-600 bg-green-50 dark:bg-green-500/10 dark:text-green-400 font-medium text-xs'>
                                {item.outbound_count}
                              </span>
                            </TableCell>
                            <TableCell className='text-center'>
                              <span className='font-bold text-xs'>
                                {item.total_count}
                              </span>
                            </TableCell>
                            <TableCell className='text-right pr-4 text-muted-foreground text-xs font-mono'>
                              {item.last_call_time
                                ? formatDate(item.last_call_time)
                                : '—'}
                            </TableCell>
                            <TableCell className='px-2'>
                              <ExternalLink className='h-3.5 w-3.5 text-muted-foreground/0 group-hover:text-primary transition-colors duration-200' />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              )}

              {notFound.length > 0 && (
                <Alert className='bg-amber-50/50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900 shadow-none px-4 py-3 flex items-start gap-3 rounded-xl'>
                  <AlertDescription className='text-xs leading-relaxed'>
                    <span className='font-bold text-amber-800 dark:text-amber-300 mr-2'>未录入系统：</span>
                    <span className='text-amber-700 dark:text-amber-400 font-mono'>
                      {notFound.join('、')}
                    </span>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
