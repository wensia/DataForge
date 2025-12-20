// 后端 API 响应类型

// 页面分组
export interface PageGroup {
  id: number
  title: string
  order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// 页面配置
export interface Page {
  id: number
  key: string
  title: string
  url: string
  icon: string
  group_id: number | null
  order: number
  is_public: boolean
  is_admin_only: boolean
  allowed_user_ids: number[] | null
  api_paths: string[] | null
  is_active: boolean
  created_at: string
  updated_at: string
  group?: PageGroup | null
}

// 创建页面请求
export interface PageCreate {
  key: string
  title: string
  url: string
  icon?: string
  group_id?: number | null
  order?: number
  is_public?: boolean
  is_admin_only?: boolean
  allowed_user_ids?: number[] | null
  api_paths?: string[] | null
}

// 更新页面请求
export interface PageUpdate {
  title?: string
  url?: string
  icon?: string
  group_id?: number | null
  order?: number
  is_public?: boolean
  is_admin_only?: boolean
  allowed_user_ids?: number[] | null
  api_paths?: string[] | null
  is_active?: boolean
}

// 创建分组请求
export interface PageGroupCreate {
  title: string
  order?: number
}

// 更新分组请求
export interface PageGroupUpdate {
  title?: string
  order?: number
  is_active?: boolean
}

// 排序项
export interface ReorderItem {
  id: number
  order: number
  group_id?: number | null
}

// 排序请求
export interface ReorderRequest {
  pages?: ReorderItem[]
  groups?: ReorderItem[]
}

// 用户导航配置（给侧边栏用）
export interface NavItem {
  id: number
  key: string
  title: string
  url: string
  icon: string
  order: number
}

export interface NavGroup {
  id: number
  title: string
  order: number
  items: NavItem[]
}

export interface NavConfig {
  groups: NavGroup[]
}

// 权限类型
export type PermissionType = 'public' | 'admin_only' | 'specific_users'

// 获取页面权限类型
export function getPermissionType(page: Page): PermissionType {
  if (page.is_public) return 'public'
  if (page.is_admin_only) return 'admin_only'
  return 'specific_users'
}

// 权限类型标签
export const permissionLabels: Record<PermissionType, string> = {
  public: '公开',
  admin_only: '仅管理员',
  specific_users: '指定用户',
}

// 权限类型颜色
export const permissionColors: Record<PermissionType, string> = {
  public: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  admin_only: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  specific_users: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
}
