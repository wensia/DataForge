/**
 * 录音下载相关类型定义
 */

// 通话记录
export interface CallLog {
  id: string
  callId: string
  caller: string
  callee: string
  callType: 'outbound' | 'inbound'
  callTime: string
  duration: number
  voiceId?: string
  recordUrl?: string
  staffName?: string
  departmentName?: string
}

// 通话记录查询参数
export interface CallLogQuery {
  accountId: number
  startTime: string
  endTime: string
  page?: number
  pageSize?: number
  callType?: 'outbound' | 'inbound' | 'all'
  searchPhone?: string
}

// 通话记录响应
export interface CallLogResponse {
  json: {
    success: boolean
    data: {
      list: CallLogItem[]
      total: number
      pageNum: number
      pageSize: number
    }
  }
}

// 云客返回的通话记录项
export interface CallLogItem {
  id: string
  callLogId: string
  callerNumber: string
  calleeNumber: string
  callType: number // 1: 外呼, 2: 呼入
  callTime: string
  talkTime: number
  voiceId?: string
  voiceUrl?: string
  userName?: string
  departName?: string
}

// 录音 URL 响应
export interface RecordUrlResponse {
  download_url: string
}
