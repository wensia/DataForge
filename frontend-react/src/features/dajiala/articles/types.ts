/**
 * 微信公众号文章类型定义
 */

export interface WechatArticle {
  id: number
  biz: string
  article_url: string
  title: string
  cover_url: string | null
  post_time: string
  position: number | null
  is_original: boolean
  item_show_type: number | null
  config_id: number
  account_name: string | null
  created_at: string
  updated_at: string
}

export interface ArticleParams {
  page?: number
  page_size?: number
  biz?: string
  account_name?: string
  title?: string
  start_time?: string
  end_time?: string
  is_original?: boolean
  config_id?: number
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface FetchArticlesRequest {
  biz?: string
  url?: string
  name?: string
  pages: number
}

export interface FetchArticlesResponse {
  total_fetched: number
  total_saved: number
  total_skipped: number
  account_name: string | null
  account_biz: string | null
  remain_money: number | null
}

export interface FilterOptions {
  account_names: string[]
  bizs: string[]
}

// 位置显示映射
export const positionMap: Record<number, string> = {
  1: '头条',
  2: '次条',
  3: '第三条',
  4: '第四条',
  5: '第五条',
  6: '第六条',
  7: '第七条',
  8: '第八条',
}

export function getPositionLabel(position: number | null): string {
  if (position === null) return '-'
  return positionMap[position] || `第${position}条`
}
