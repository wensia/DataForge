/**
 * 转写文本格式化展示组件
 *
 * 展示 ASR 转写结果
 * 展示样式：聊天框式
 * - 客户消息：靠左显示（蓝色气泡）
 * - 员工消息：靠右显示（灰色气泡）
 * - 支持根据音频播放进度高亮当前片段并自动滚动
 */
import { useEffect, useMemo, useRef } from 'react'
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

/**
 * 情绪标签配置
 */
const emotionConfig: Record<string, { label: string; className: string }> = {
  angry: { label: '生气', className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  happy: { label: '开心', className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  neutral: { label: '平静', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  sad: { label: '悲伤', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  surprise: { label: '惊讶', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
}

interface TranscriptViewerProps {
  transcript: TranscriptSegment[]
  currentTime?: number // 当前音频播放时间（秒）
  onSeek?: (time: number) => void // 点击片段跳转到指定时间
}

/**
 * 转写文本查看组件
 */
export function TranscriptViewer({
  transcript,
  currentTime = 0,
  onSeek,
}: TranscriptViewerProps) {
  // 存储每个片段的 DOM 引用
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([])

  // 计算当前活动片段索引
  const activeIndex = useMemo(() => {
    if (!currentTime || currentTime === 0) return -1
    return transcript.findIndex(
      (seg) => currentTime >= seg.start_time && currentTime < seg.end_time
    )
  }, [transcript, currentTime])

  // 当活动片段改变时，自动滚动到该片段
  useEffect(() => {
    if (activeIndex >= 0 && segmentRefs.current[activeIndex]) {
      segmentRefs.current[activeIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }
  }, [activeIndex])

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
        const isActive = index === activeIndex

        return (
          <div
            key={index}
            ref={(el) => {
              segmentRefs.current[index] = el
            }}
            className={cn(
              'flex transition-all duration-300',
              isCustomer ? 'justify-start' : 'justify-end'
            )}
          >
            <div
              onClick={() => onSeek?.(seg.start_time)}
              title="点击跳转到此处播放"
              className={cn(
                'flex max-w-[80%] flex-col gap-1 rounded-lg px-3 py-2 transition-all duration-300',
                isCustomer
                  ? 'bg-blue-50 dark:bg-blue-950'
                  : 'bg-gray-100 dark:bg-gray-800',
                isActive &&
                  'scale-[1.02] shadow-lg shadow-primary/20 ring-1 ring-primary/50',
                onSeek && 'cursor-pointer hover:opacity-80'
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
                {/* 情绪标签 */}
                {seg.emotion && emotionConfig[seg.emotion] && (
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-xs',
                      emotionConfig[seg.emotion].className
                    )}
                  >
                    {emotionConfig[seg.emotion].label}
                  </span>
                )}
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
