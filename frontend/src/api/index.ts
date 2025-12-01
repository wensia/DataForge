import request from './request'
import type { ResponseModel } from '@/types'

/**
 * 健康检查
 */
export const getHealthStatus = (): Promise<ResponseModel<{ status: string }>> => {
  return request.get('/health')
}




