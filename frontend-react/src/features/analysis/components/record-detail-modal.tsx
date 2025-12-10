/**
 * 录音详情弹窗组件
 *
 * 展示录音播放器和转写文本
 */
import { Loader2, Volume2, FileText, Clock, User, Phone } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { TranscriptViewer } from './transcript-viewer'
import type { CallRecord } from '../types'
import { formatDate } from '../types'

interface RecordDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  record: CallRecord | null
  audioUrl: string | null
  audioLoading: boolean
}

/**
 * 录音详情弹窗
 */
export function RecordDetailModal({
  open,
  onOpenChange,
  record,
  audioUrl,
  audioLoading,
}: RecordDetailModalProps) {
  if (!record) return null

  const hasTranscript = !!record.transcript

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[85vh] max-w-2xl flex-col overflow-hidden'>
        <DialogHeader className='flex-shrink-0'>
          <DialogTitle className='flex items-center gap-2'>
            <Volume2 className='h-5 w-5' />
            录音详情
          </DialogTitle>
          <DialogDescription asChild>
            <div className='flex flex-wrap items-center gap-3 text-sm'>
              <span className='flex items-center gap-1'>
                <Phone className='h-3 w-3' />
                {record.caller || '-'} - {record.callee || '-'}
              </span>
              <span className='flex items-center gap-1'>
                <Clock className='h-3 w-3' />
                {formatDate(record.call_time)}
              </span>
              {record.staff_name && (
                <span className='flex items-center gap-1'>
                  <User className='h-3 w-3' />
                  {record.staff_name}
                </span>
              )}
              {record.duration && (
                <span className='text-muted-foreground'>
                  时长: {record.duration}秒
                </span>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* 录音播放器区域 */}
        <div className='bg-muted/50 flex-shrink-0 rounded-lg border p-4'>
          {audioLoading ? (
            <div className='flex items-center justify-center gap-2 py-2'>
              <Loader2 className='h-5 w-5 animate-spin' />
              <span className='text-muted-foreground text-sm'>
                正在加载录音...
              </span>
            </div>
          ) : audioUrl ? (
            <audio src={audioUrl} controls autoPlay={false} className='w-full' />
          ) : (
            <div className='text-muted-foreground py-2 text-center text-sm'>
              无法加载录音
            </div>
          )}
        </div>

        {/* 转写文本区域 */}
        <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
          <div className='mb-2 flex flex-shrink-0 items-center gap-2'>
            <FileText className='h-4 w-4' />
            <span className='text-sm font-medium'>转写文本</span>
            {hasTranscript && (
              <span className='text-muted-foreground text-xs'>
                ({record.transcript?.length || 0} 句)
              </span>
            )}
          </div>
          <div className='min-h-0 flex-1 overflow-y-auto rounded-lg border'>
            {hasTranscript ? (
              <TranscriptViewer transcript={record.transcript!} />
            ) : (
              <div className='text-muted-foreground flex h-32 items-center justify-center text-sm'>
                暂无转写内容
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
