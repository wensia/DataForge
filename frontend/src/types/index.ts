/**
 * 统一响应模型
 */
export interface ResponseModel<T = any> {
  code: number
  message: string
  data: T
}

/**
 * 分页请求参数
 */
export interface PageParams {
  page: number
  size: number
}

/**
 * 分页响应数据
 */
export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  size: number
}




