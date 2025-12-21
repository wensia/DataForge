import {
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Phone,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react'

export interface FilterOption {
  label: string
  value: string
  icon?: LucideIcon
}

// 通话类型筛选选项
export const callTypeOptions: FilterOption[] = [
  { label: '呼入', value: 'inbound', icon: PhoneIncoming },
  { label: '呼出', value: 'outbound', icon: PhoneOutgoing },
  { label: '未接', value: 'missed', icon: PhoneMissed },
  { label: '内部', value: 'internal', icon: Phone },
]

// 通话结果筛选选项
export const callResultOptions: FilterOption[] = [
  { label: '未接通', value: '0', icon: XCircle },
  { label: '通话中', value: '1', icon: Clock },
  { label: '已接通', value: '2', icon: CheckCircle2 },
  { label: '忙线', value: '3', icon: XCircle },
  { label: '无人接听', value: '4', icon: PhoneMissed },
  { label: '已挂断', value: '5', icon: XCircle },
]

// 无效通话筛选选项（转写为空但时长>30秒）
export const invalidCallOptions: FilterOption[] = [
  { label: '疑似无效', value: 'true', icon: AlertTriangle },
  { label: '正常通话', value: 'false', icon: CheckCircle2 },
]
