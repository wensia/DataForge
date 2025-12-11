import { useEffect, useState, useRef, useCallback } from 'react'
import {
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Ban,
  Terminal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useExecutionDetail } from '@/features/tasks/api'
import type { TaskExecution } from '@/features/tasks/data/schema'

interface ExecutionDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  execution: TaskExecution | null
}

const statusConfig = {
  success: { label: '成功', icon: CheckCircle, variant: 'default' as const },
  failed: { label: '失败', icon: XCircle, variant: 'destructive' as const },
  running: { label: '运行中', icon: Loader2, variant: 'secondary' as const },
  pending: { label: '等待中', icon: Clock, variant: 'outline' as const },
  cancelled: { label: '已取消', icon: Ban, variant: 'outline' as const },
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatDuration(ms: number | null): string {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  return `${(ms / 60000).toFixed(2)}m`
}

export function ExecutionDetailDialog({
  open,
  onOpenChange,
  execution,
}: ExecutionDetailDialogProps) {
  const [logs, setLogs] = useState<string[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentStatus, setCurrentStatus] = useState<string>('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const initializedRef = useRef(false)

  // 获取执行详情（包含 log_output）
  const { data: detailData, isLoading: isLoadingDetail } = useExecutionDetail(
    open && execution ? execution.id : 0
  )

  // 清理 SSE 连接
  const cleanupSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setIsStreaming(false)
  }, [])

  // 建立 SSE 连接
  const connectSSE = useCallback((executionId: number) => {
    // 如果已经有连接，不重复创建
    if (eventSourceRef.current) return

    const authToken = localStorage.getItem('auth_token')
    const sseUrl = authToken
      ? `/api/v1/tasks/executions/${executionId}/logs/stream?token=${authToken}`
      : `/api/v1/tasks/executions/${executionId}/logs/stream`

    console.log('[SSE] Connecting to:', sseUrl)
    const eventSource = new EventSource(sseUrl)
    eventSourceRef.current = eventSource
    setIsStreaming(true)

    eventSource.onopen = () => {
      console.log('[SSE] Connection opened')
    }

    eventSource.onmessage = (event) => {
      console.log('[SSE] Message received:', event.data)
      try {
        const data = JSON.parse(event.data)
        if (data.log) {
          setLogs((prev) => [...prev, data.log])
        }
        if (data.status) {
          setCurrentStatus(data.status)
        }
        if (data.finished) {
          console.log('[SSE] Task finished')
          setIsStreaming(false)
          eventSource.close()
          eventSourceRef.current = null
        }
      } catch {
        // 忽略解析错误（如心跳）
      }
    }

    eventSource.onerror = (error) => {
      console.error('[SSE] Error:', error)
      setIsStreaming(false)
      eventSource.close()
      eventSourceRef.current = null
    }
  }, [])

  // 弹窗打开时初始化
  useEffect(() => {
    if (!open || !execution) {
      // 弹窗关闭时重置状态
      setLogs([])
      setCurrentStatus('')
      initializedRef.current = false
      cleanupSSE()
      return
    }

    // 设置初始状态
    setCurrentStatus(execution.status)
  }, [open, execution, cleanupSSE])

  // 弹窗打开时，根据任务状态决定如何获取日志
  useEffect(() => {
    if (!open || !execution || initializedRef.current) return

    // 标记已初始化，避免重复执行
    initializedRef.current = true

    // 如果任务正在运行或等待中，直接建立 SSE 连接（SSE 会先发送已有日志）
    // 如果任务已完成，等 detailData 加载完成后显示日志
    if (execution.status === 'running' || execution.status === 'pending') {
      connectSSE(execution.id)
    }
  }, [open, execution, connectSSE])

  // 当详情数据加载完成后，显示已完成任务的日志
  useEffect(() => {
    if (!open || !execution || !detailData) return

    // 更新状态
    setCurrentStatus(detailData.status)

    // 如果任务已完成，从 detailData 加载日志
    if (detailData.status !== 'running' && detailData.status !== 'pending') {
      if (detailData.log_output) {
        setLogs(detailData.log_output.split('\n').filter(Boolean))
      }
    }
  }, [open, execution, detailData])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      cleanupSSE()
    }
  }, [cleanupSSE])

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  if (!execution) return null

  // 使用实时状态或详情数据
  const displayStatus = currentStatus || detailData?.status || execution.status
  const displayData = detailData || execution
  const status = statusConfig[displayStatus as keyof typeof statusConfig]
  const StatusIcon = status?.icon || Clock

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[80vh] flex-col sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            执行详情 #{execution.id}
            {isStreaming && (
              <Badge variant='secondary' className='gap-1'>
                <Loader2 className='h-3 w-3 animate-spin' />
                实时
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* 基本信息 */}
        <div className='grid grid-cols-2 gap-4 border-b pb-4'>
          <div>
            <p className='text-muted-foreground text-sm'>任务名称</p>
            <p className='font-medium'>
              {displayData.task_name || `任务 #${displayData.task_id}`}
            </p>
          </div>
          <div>
            <p className='text-muted-foreground text-sm'>状态</p>
            <Badge variant={status?.variant} className='mt-1 gap-1'>
              <StatusIcon
                className={cn(
                  'h-3 w-3',
                  displayStatus === 'running' && 'animate-spin'
                )}
              />
              {status?.label || displayStatus}
            </Badge>
          </div>
          <div>
            <p className='text-muted-foreground text-sm'>开始时间</p>
            <p className='font-mono text-sm'>
              {formatDateTime(displayData.started_at)}
            </p>
          </div>
          <div>
            <p className='text-muted-foreground text-sm'>耗时</p>
            <p className='font-mono text-sm'>
              {formatDuration(displayData.duration_ms)}
            </p>
          </div>
          <div>
            <p className='text-muted-foreground text-sm'>触发方式</p>
            <Badge variant='outline'>
              {displayData.trigger_type === 'manual'
                ? '手动'
                : displayData.trigger_type === 'scheduled'
                  ? '调度'
                  : displayData.trigger_type}
            </Badge>
          </div>
          {displayData.error_message && (
            <div className='col-span-2'>
              <p className='text-muted-foreground text-sm'>错误信息</p>
              <p className='text-destructive text-sm'>
                {displayData.error_message}
              </p>
            </div>
          )}
        </div>

        {/* 日志区域 */}
        <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
          <div className='mb-2 flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <Terminal className='h-4 w-4' />
              <span className='text-sm font-medium'>执行日志</span>
              {/* 日志数量 - 实时更新 */}
              <Badge variant='secondary' className='text-xs'>
                {logs.length} 条
              </Badge>
              {isLoadingDetail && (
                <span className='text-muted-foreground text-xs'>
                  (加载中...)
                </span>
              )}
            </div>

            {/* 跟踪按钮 - 仅在任务运行中时显示 */}
            {(displayStatus === 'running' || displayStatus === 'pending') && (
              <Button
                variant={isStreaming ? 'default' : 'outline'}
                size='sm'
                onClick={() => {
                  if (isStreaming) {
                    cleanupSSE()
                  } else {
                    connectSSE(execution.id)
                  }
                }}
              >
                {isStreaming ? (
                  <>
                    <Loader2 className='mr-1 h-3 w-3 animate-spin' />
                    跟踪中
                  </>
                ) : (
                  '开始跟踪'
                )}
              </Button>
            )}
          </div>
          <ScrollArea
            className='bg-muted/50 h-[300px] rounded-md border'
            ref={scrollRef}
          >
            <div className='min-h-[268px] p-4'>
              {isLoadingDetail ? (
                <div className='space-y-2'>
                  <Skeleton className='h-4 w-full' />
                  <Skeleton className='h-4 w-3/4' />
                  <Skeleton className='h-4 w-5/6' />
                </div>
              ) : logs.length > 0 ? (
                <pre className='whitespace-pre-wrap font-mono text-xs'>
                  {logs.map((line, index) => (
                    <div
                      key={index}
                      className={cn(
                        'py-0.5',
                        line.toLowerCase().includes('error') &&
                          'text-destructive',
                        line.toLowerCase().includes('warn') &&
                          'text-yellow-600 dark:text-yellow-500',
                        line.toLowerCase().includes('success') &&
                          'text-green-600 dark:text-green-500'
                      )}
                    >
                      {line}
                    </div>
                  ))}
                </pre>
              ) : (
                <p className='text-muted-foreground text-center text-sm'>
                  暂无日志
                </p>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className='flex justify-end pt-2'>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
