/**
 * 公众号管理相关类型定义
 */

/** 公众号分组 */
export interface WechatAccountGroup {
  id: number
  name: string
  description: string | null
  is_collection_enabled: boolean
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
  group_id: number | null
  group_name: string | null
  is_collection_enabled: boolean
  collection_frequency: string | null
  last_collection_at: string | null
  article_count: number
  notes: string | null
  created_at: string
  updated_at: string
}

/** 创建分组请求 */
export interface CreateGroupRequest {
  name: string
  description?: string
  is_collection_enabled?: boolean
  sort_order?: number
}

/** 更新分组请求 */
export interface UpdateGroupRequest {
  name?: string
  description?: string
  is_collection_enabled?: boolean
  sort_order?: number
}

/** 创建公众号请求 */
export interface CreateAccountRequest {
  biz: string
  name: string
  avatar_url?: string
  group_id?: number | null
  is_collection_enabled?: boolean
  collection_frequency?: string
  notes?: string
}

/** 更新公众号请求 */
export interface UpdateAccountRequest {
  name?: string
  avatar_url?: string
  group_id?: number | null
  is_collection_enabled?: boolean
  collection_frequency?: string
  notes?: string
}

/** 公众号查询参数 */
export interface AccountParams {
  page?: number
  page_size?: number
  group_id?: number | null
  is_collection_enabled?: boolean
  search?: string
}

/** 分组和公众号列表（树形结构） */
export interface GroupedAccounts {
  group: {
    id: number | null
    name: string
    description: string | null
    is_collection_enabled: boolean
    sort_order: number
  }
  accounts: WechatAccount[]
}

/** 分页响应 */
export interface PaginatedAccountResponse {
  items: WechatAccount[]
  total: number
  page: number
  page_size: number
}
