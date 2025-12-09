/**
 * 数据分析类型定义
 */

export interface CallRecord {
  id: number
  source: string
  record_id: string
  caller: string | null
  callee: string | null
  call_time: string | null
  duration: number | null
  call_type: string | null
  call_result: string | null
  customer_name: string | null
  staff_name: string | null
  department: string | null
  transcript: string | null
  raw_data: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CallRecordStats {
  total_count: number
  total_duration: number
  avg_duration: number
  by_source: Record<string, number>
  by_call_type: Record<string, number>
  by_department: Record<string, number>
}

export interface AnalysisResult {
  id: number
  analysis_type: string
  ai_provider: string
  query: string | null
  data_range: Record<string, unknown>
  data_summary: string | null
  result: string
  tokens_used: number | null
  status: string
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface AIProvider {
  id: string
  name: string
  description: string
  available: boolean
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AnalysisRequest {
  analysis_type?: string
  ai_provider?: string
  date_start?: string
  date_end?: string
  filters?: Record<string, unknown>
  max_records?: number
}

export interface ChatRequest {
  question: string
  ai_provider?: string
  context_records?: number
  history?: ChatMessage[]
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface RecordsParams {
  source?: string
  start_time?: string
  end_time?: string
  department?: string
  staff_name?: string
  call_type?: string
  call_result?: string
  page?: number
  page_size?: number
}

// 通话类型映射
export const callTypeMap: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  inbound: { label: '呼入', variant: 'secondary' },
  outbound: { label: '呼出', variant: 'default' },
  missed: { label: '未接', variant: 'destructive' },
  internal: { label: '内部', variant: 'outline' },
}

// 通话结果映射
export const callResultMap: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  '0': { label: '未接通', variant: 'outline' },
  '1': { label: '通话中', variant: 'secondary' },
  '2': { label: '已接通', variant: 'default' },
  '3': { label: '忙线', variant: 'outline' },
  '4': { label: '无人接听', variant: 'destructive' },
  '5': { label: '已挂断', variant: 'secondary' },
}

// 分析类型选项
export const analysisTypeOptions = [
  { label: '数据摘要', value: 'summary' },
  { label: '趋势分析', value: 'trend' },
  { label: '异常检测', value: 'anomaly' },
]

export function getAnalysisTypeLabel(type: string): string {
  const map: Record<string, string> = {
    summary: '数据摘要',
    trend: '趋势分析',
    anomaly: '异常检测',
    qa: '智能问答',
  }
  return map[type] || type
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (minutes < 60) return `${minutes}分${secs}秒`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}时${mins}分`
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
