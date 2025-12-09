import {
  CheckCircle,
  Circle,
  Clock,
  AlertCircle,
  XCircle,
  PauseCircle,
  PlayCircle,
  Timer,
  Calendar,
  RefreshCw,
  RefreshCcw,
  Trash2,
  FileText,
  Bell,
  HardDrive,
  Tag,
  Hand,
} from 'lucide-react'
import type { TagColorName } from '@/lib/colors'

/** 任务状态 */
export const statuses = [
  {
    label: '运行中',
    value: 'active' as const,
    icon: PlayCircle,
  },
  {
    label: '已暂停',
    value: 'paused' as const,
    icon: PauseCircle,
  },
  {
    label: '已禁用',
    value: 'disabled' as const,
    icon: XCircle,
  },
]

/** 任务类型 */
export const taskTypes = [
  {
    label: 'Cron 表达式',
    value: 'cron' as const,
    icon: Clock,
    description: '使用 Cron 表达式定义复杂的调度规则',
  },
  {
    label: '固定间隔',
    value: 'interval' as const,
    icon: RefreshCw,
    description: '按固定时间间隔重复执行',
  },
  {
    label: '一次性',
    value: 'date' as const,
    icon: Calendar,
    description: '在指定时间执行一次',
  },
  {
    label: '手动执行',
    value: 'manual' as const,
    icon: Hand,
    description: '仅支持手动触发执行，不自动调度',
  },
]

/** 执行状态 */
export const executionStatuses = [
  {
    label: '等待中',
    value: 'pending' as const,
    icon: Circle,
  },
  {
    label: '运行中',
    value: 'running' as const,
    icon: Timer,
  },
  {
    label: '成功',
    value: 'success' as const,
    icon: CheckCircle,
  },
  {
    label: '失败',
    value: 'failed' as const,
    icon: AlertCircle,
  },
  {
    label: '已取消',
    value: 'cancelled' as const,
    icon: XCircle,
  },
]

/** 任务分类（预设） - 使用全局颜色系统 */
export const categories: Array<{
  label: string
  value: string
  icon: typeof RefreshCcw
  color: TagColorName
}> = [
  {
    label: '数据同步',
    value: 'sync',
    icon: RefreshCcw,
    color: 'primary',
  },
  {
    label: '数据清理',
    value: 'cleanup',
    icon: Trash2,
    color: 'orange',
  },
  {
    label: '报表生成',
    value: 'report',
    icon: FileText,
    color: 'success',
  },
  {
    label: '消息通知',
    value: 'notification',
    icon: Bell,
    color: 'purple',
  },
  {
    label: '数据备份',
    value: 'backup',
    icon: HardDrive,
    color: 'cyan',
  },
  {
    label: '其他',
    value: 'other',
    icon: Tag,
    color: 'gray',
  },
]

// 兼容旧代码的别名（可以后续删除）
export const priorities = taskTypes
export const labels = taskTypes
