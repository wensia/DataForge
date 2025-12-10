/**
 * 转写文本格式化展示组件
 *
 * 展示 ASR 转写结果
 * 展示样式：聊天框式
 * - 客户消息：靠左显示（蓝色气泡）
 * - 员工消息：靠右显示（灰色气泡）
 */
import { cn } from '@/lib/utils'
import type { TranscriptSegment } from '../types'

/**
 * 格式化秒数为时间字符串
 * @example formatTime(65.5) => "01:05"
 */
function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

/**
 * 检查是否是客户说话
 */
function isCustomerSpeaker(speaker: string): boolean {
  return speaker === 'customer' || speaker.includes('客户')
}

/**
 * 获取说话人显示名称
 */
function getSpeakerName(speaker: string): string {
  if (speaker === 'staff') return '员工'
  if (speaker === 'customer') return '客户'
  return speaker
}

interface TranscriptViewerProps {
  transcript: TranscriptSegment[]
}

/**
 * 转写文本查看组件
 */
export function TranscriptViewer({ transcript }: TranscriptViewerProps) {
  if (!transcript || transcript.length === 0) {
    return (
      <div className='text-muted-foreground py-8 text-center text-sm'>
        暂无转写内容
      </div>
    )
  }

  return (
    <div className='space-y-3 p-3'>
      {transcript.map((seg, index) => {
        const isCustomer = isCustomerSpeaker(seg.speaker)
        const startTime = formatTime(seg.start_time)
        const endTime = formatTime(seg.end_time)
        const duration = (seg.end_time - seg.start_time).toFixed(1)

        return (
          <div
            key={index}
            className={cn(
              'flex',
              isCustomer ? 'justify-start' : 'justify-end'
            )}
          >
            <div
              className={cn(
                'flex max-w-[80%] flex-col gap-1 rounded-lg px-3 py-2',
                isCustomer
                  ? 'bg-blue-50 dark:bg-blue-950'
                  : 'bg-gray-100 dark:bg-gray-800'
              )}
            >
              {/* 说话人和时间信息 */}
              <div
                className={cn(
                  'flex items-center gap-2',
                  isCustomer ? 'justify-start' : 'justify-end'
                )}
              >
                <span
                  className={cn(
                    'text-xs font-medium',
                    isCustomer
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-400'
                  )}
                >
                  {getSpeakerName(seg.speaker)}
                </span>
                <span className='text-muted-foreground font-mono text-xs'>
                  {startTime}-{endTime}
                </span>
                <span className='text-muted-foreground text-xs'>
                  {duration}s
                </span>
              </div>
              {/* 文本内容 */}
              <div className='text-sm leading-relaxed'>{seg.text}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
