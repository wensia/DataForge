/**
 * 公众号管理相关类型定义
 */

/** 公众号标签（简要信息） */
export interface WechatAccountTagBrief {
  id: number
  name: string
  color: string
}

/** 公众号标签（完整信息） */
export interface WechatAccountTag {
  id: number
  name: string
  color: string
  sort_order: number
  account_count: number
  created_at: string
  updated_at: string
}

/** 公众号账号 */
export interface WechatAccount {
  id: number
  biz: string
  name: string
  avatar_url: string | null
  local_avatar: string | null // 本地头像路径（优先使用）
  tags: WechatAccountTagBrief[] // 标签列表
  is_collection_enabled: boolean
  collection_frequency: string | null
  last_collection_at: string | null
  article_count: number
  notes: string | null
  created_at: string
  updated_at: string
}

/** 创建标签请求 */
export interface CreateTagRequest {
  name: string
  color?: string
  sort_order?: number
}

/** 更新标签请求 */
export interface UpdateTagRequest {
  name?: string
  color?: string
  sort_order?: number
}

/** 创建公众号请求 */
export interface CreateAccountRequest {
  biz: string
  name: string
  avatar_url?: string
  tag_ids?: number[] // 标签 ID 列表
  is_collection_enabled?: boolean
  collection_frequency?: string
  notes?: string
}

/** 更新公众号请求 */
export interface UpdateAccountRequest {
  name?: string
  avatar_url?: string
  tag_ids?: number[] // 标签 ID 列表
  is_collection_enabled?: boolean
  collection_frequency?: string
  notes?: string
}

/** 公众号查询参数 */
export interface AccountParams {
  page?: number
  page_size?: number
  tag_ids?: number[] // 标签 ID 列表（OR 逻辑）
  is_collection_enabled?: boolean
  search?: string
}

/** 分配标签请求 */
export interface AssignTagsRequest {
  tag_ids: number[]
}

/** 分页响应 */
export interface PaginatedAccountResponse {
  items: WechatAccount[]
  total: number
  page: number
  page_size: number
}
