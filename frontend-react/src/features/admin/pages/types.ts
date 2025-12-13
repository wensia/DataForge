export interface NavItemConfig {
  id: string
  title: string
  url: string
  icon: string
  order: number
  isVisible: boolean
  badge?: string
}

export interface NavGroupConfig {
  id: string
  title: string
  order: number
  isCollapsed: boolean
  items: NavItemConfig[]
}

export interface NavPageConfig {
  version: number
  groups: NavGroupConfig[]
}

export interface UserPreferenceResponse {
  id: number
  user_id: number
  preference_key: string
  preference_value: string
  created_at: string
  updated_at: string
}
