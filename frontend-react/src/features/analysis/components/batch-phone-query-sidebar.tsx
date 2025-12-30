import { useState } from 'react'
import {
    Loader2,
    Search,
    Calendar as CalendarIcon,
    X,
    Info,
    ChevronRight,
    Plus,
    Phone,
    BarChart3,
} from 'lucide-react'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { useBatchPhoneStats } from '../api'
import type { PhoneStats } from '../types'
import { formatDate, formatDuration } from '../types'
import { useAnalysis } from './analysis-provider'

export function BatchPhoneQuerySidebar() {
    const { showBatchSidebar: isVisible, setShowBatchSidebar } = useAnalysis()
    const [phoneInput, setPhoneInput] = useState('')
    const [startDate, setStartDate] = useState<Date | undefined>()
    const [endDate, setEndDate] = useState<Date | undefined>()
    const [results, setResults] = useState<PhoneStats[] | null>(null)
    const [notFound, setNotFound] = useState<string[]>([])
    const [isDialogOpen, setIsDialogOpen] = useState(false)

    const batchQuery = useBatchPhoneStats()

    if (!isVisible) return null

    const handleQuery = async () => {
        const phones = phoneInput
            .split(/[\n,\s]+/)
            .map((p: string) => p.trim())
            .filter((p: string) => p.length > 0)

        if (phones.length === 0) return

        try {
            const data = await batchQuery.mutateAsync({
                phones,
                start_date: startDate ? format(startDate, 'yyyy-MM-dd') : undefined,
                end_date: endDate ? format(endDate, 'yyyy-MM-dd') : undefined,
            })
            setResults(data.items)
            setNotFound(data.not_found)
            setIsDialogOpen(false) // 查询成功后关闭弹窗
        } catch (error) {
            console.error('批量查询失败:', error)
        }
    }

    const phoneCount = phoneInput
        .split(/[\n,\s]+/)
        .filter((p: string) => p.trim().length > 0).length

    const { batchSidebarWidth: width } = useAnalysis()

    return (
        <div
            style={{ width: `${width}px` }}
            className='flex h-full flex-col border-l bg-background shadow-xl animate-in slide-in-from-right duration-300 relative'
        >
            <div className='flex items-center justify-between border-b p-4'>
                <div className='flex flex-col gap-0.5'>
                    <h2 className='text-lg font-semibold'>批量查询手机号</h2>
                    <p className='text-xs text-muted-foreground'>检索多个号码的通话概况</p>
                </div>
                <div className='flex items-center gap-1'>
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button variant='outline' size='icon' className='h-8 w-8 rounded-full'>
                                <Plus className='h-4 w-4' />
                            </Button>
                        </DialogTrigger>
                        <DialogContent className='max-w-[480px] p-6'>
                            <DialogHeader>
                                <DialogTitle>新建批量查询</DialogTitle>
                                <DialogDescription>
                                    请输入需要检索的手机号码，并选择统计时间段。
                                </DialogDescription>
                            </DialogHeader>
                            <div className='space-y-6 pt-4'>
                                <div className='space-y-2'>
                                    <div className='flex items-center justify-between'>
                                        <Label htmlFor='dialog-phones' className='text-xs font-semibold'>
                                            手机号列表
                                        </Label>
                                        {phoneCount > 0 && (
                                            <Badge variant='secondary' className='font-mono px-1.5 py-0 text-[10px]'>
                                                {phoneCount} 个号码
                                            </Badge>
                                        )}
                                    </div>
                                    <Textarea
                                        id='dialog-phones'
                                        placeholder='每行一个、逗号或空格分隔...'
                                        className='min-h-[120px] max-h-[200px] bg-background text-sm font-mono resize-none focus-visible:ring-primary/20'
                                        value={phoneInput}
                                        onChange={(e) => setPhoneInput(e.target.value)}
                                    />
                                </div>

                                <div className='space-y-3'>
                                    <div className='flex flex-col gap-2'>
                                        <span className='text-[10px] font-medium text-muted-foreground uppercase tracking-wider'>统计时段</span>
                                        <div className='flex items-center gap-1 overflow-hidden rounded-md border bg-background p-1'>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        variant='ghost'
                                                        size='sm'
                                                        className={cn(
                                                            'h-8 flex-1 px-2 text-xs font-normal hover:bg-muted',
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
                                            <span className='text-muted-foreground/30 text-xs'>~</span>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        variant='ghost'
                                                        size='sm'
                                                        className={cn(
                                                            'h-8 flex-1 px-2 text-xs font-normal hover:bg-muted',
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
                                                    className='h-7 w-7 rounded-full hover:bg-destructive/10 hover:text-destructive'
                                                    onClick={() => {
                                                        setStartDate(undefined)
                                                        setEndDate(undefined)
                                                    }}
                                                >
                                                    <X className='h-3.5 w-3.5' />
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    <Button
                                        onClick={handleQuery}
                                        disabled={phoneCount === 0 || batchQuery.isPending}
                                        className='w-full shadow-md h-10 mt-2'
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
                        </DialogContent>
                    </Dialog>
                    <Button
                        variant='ghost'
                        size='icon'
                        className='h-8 w-8 rounded-full'
                        onClick={() => setShowBatchSidebar(false)}
                    >
                        <ChevronRight className='h-4 w-4' />
                    </Button>
                </div>
            </div>

            <ScrollArea className='flex-1 min-h-0'>
                <div className='flex flex-col p-4 space-y-4'>
                    {results === null ? (
                        <div className='flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500 py-20'>
                            <div className='mb-4 rounded-full bg-primary/5 p-6'>
                                <Phone className='h-12 w-12 text-primary/40' />
                            </div>
                            <h3 className='mb-2 text-base font-semibold'>暂无查询结果</h3>
                            <p className='mb-6 text-sm text-muted-foreground max-w-[240px]'>
                                点击上方“+”号按钮，输入手机号开始批量分析。
                            </p>
                            <Button variant='default' onClick={() => setIsDialogOpen(true)} className='rounded-full px-6'>
                                <Plus className='mr-2 h-4 w-4' />
                                开始查询
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className='flex items-center justify-between rounded-lg bg-muted/20 px-3 py-2'>
                                <div className='flex gap-4'>
                                    <div className='flex items-center gap-1.5'>
                                        <BarChart3 className='h-3.5 w-3.5 text-blue-500' />
                                        <span className='text-xs font-medium'>{results.length}</span>
                                        <span className='text-[11px] text-muted-foreground'>条匹配</span>
                                    </div>
                                    {notFound.length > 0 && (
                                        <div className='flex items-center gap-1.5'>
                                            <div className='h-1.5 w-1.5 rounded-full bg-amber-400' />
                                            <span className='text-xs font-medium'>{notFound.length}</span>
                                            <span className='text-[11px] text-muted-foreground'>未录入</span>
                                        </div>
                                    )}
                                </div>
                                <div className='flex items-center gap-1 text-[10px] text-muted-foreground'>
                                    <Info className='h-3 w-3' />
                                    点击行联动主表
                                </div>
                            </div>

                            {results.length > 0 && (
                                <div className='rounded-xl border bg-background shadow-sm overflow-hidden'>
                                    <Table>
                                        <TableHeader className='bg-muted/30 sticky top-0 z-10 shadow-sm'>
                                            <TableRow className='hover:bg-transparent'>
                                                <TableHead className='pl-3 text-[10px] font-bold h-10'>手机号/最后记录</TableHead>
                                                <TableHead className='text-center text-[10px] font-bold h-10'>呼入/出/接通</TableHead>
                                                <TableHead className='text-right pr-3 text-[10px] font-bold h-10'>共计/时长</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {results.map((item: PhoneStats) => (
                                                <TableRow
                                                    key={item.phone}
                                                    className='group cursor-pointer transition-colors hover:bg-muted/50'
                                                    onClick={() => {
                                                        const event = new CustomEvent('select-phone-filter', { detail: item.phone })
                                                        window.dispatchEvent(event)
                                                    }}
                                                >
                                                    <TableCell className='py-3 pl-3'>
                                                        <div className='flex flex-col gap-0.5'>
                                                            <span className='font-mono text-xs font-medium'>{item.phone}</span>
                                                            <span className='text-[10px] text-muted-foreground font-mono'>
                                                                {item.last_call_time ? formatDate(item.last_call_time) : '—'}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className='text-center whitespace-nowrap py-2'>
                                                        <div className='flex flex-col items-center gap-1'>
                                                            <div className='flex items-center justify-center gap-1'>
                                                                <Badge variant='secondary' title='呼入次数' className='h-5 px-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-none font-mono text-[10px] font-bold leading-none'>
                                                                    {item.inbound_count}
                                                                </Badge>
                                                                <Badge variant='secondary' title='呼出次数' className='h-5 px-1.5 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-none font-mono text-[10px] font-bold leading-none'>
                                                                    {item.outbound_count}
                                                                </Badge>
                                                                <Badge variant='secondary' title='接通次数' className='h-5 px-1.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-none font-mono text-[10px] font-bold leading-none'>
                                                                    {item.answered_count}
                                                                </Badge>
                                                            </div>
                                                            <span className='text-[10px] font-bold text-amber-600/80 dark:text-amber-500/80'>
                                                                {item.answer_rate}% 接通率
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className='text-right pr-3'>
                                                        <div className='flex flex-col items-end gap-0.5'>
                                                            <span className='text-xs font-bold'>{item.total_count}</span>
                                                            <span className='text-[10px] text-muted-foreground'>
                                                                {formatDuration(item.total_duration)}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}

                            {notFound.length > 0 && (
                                <Alert className='rounded-xl border-amber-100 bg-amber-50/30 p-4 dark:border-amber-900/40 dark:bg-amber-900/10'>
                                    <div className='flex gap-2'>
                                        <Info className='h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0' />
                                        <div className='text-xs leading-relaxed text-amber-800 dark:text-amber-300'>
                                            <span className='font-bold block mb-1'>以下号码未查询到记录：</span>
                                            <div className='flex flex-wrap gap-1.5 mt-2'>
                                                {notFound.map(p => (
                                                    <Badge key={p} variant='outline' className='bg-amber-100/50 border-amber-200 text-amber-700 dark:bg-amber-800/20 dark:border-amber-700 dark:text-amber-400 font-mono text-[10px]'>
                                                        {p}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </Alert>
                            )}
                        </>
                    )}
                </div>
            </ScrollArea>
        </div>
    )
}

