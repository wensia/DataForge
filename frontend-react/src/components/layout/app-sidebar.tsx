import { PanelLeftClose, PanelLeft, Hammer } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useLayout } from '@/context/layout-provider'
import { useAuthStore } from '@/stores/auth-store'
import apiClient from '@/lib/api-client'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getIcon, defaultIcon } from '@/features/admin/pages/utils/icons'
import { NavGroup } from './nav-group'
import { NavUser } from './nav-user'
import { TeamSwitcher } from './team-switcher'
import type { NavGroup as NavGroupType } from './types'

// API 返回的导航项类型
interface ApiNavItem {
  id: number
  key: string
  title: string
  url: string
  icon: string
  order: number
}

interface ApiNavGroup {
  id: number
  title: string
  order: number
  items: ApiNavItem[]
}

interface ApiNavConfig {
  groups: ApiNavGroup[]
}

// 将 API 数据转换为组件需要的格式
function transformNavData(apiData: ApiNavConfig): NavGroupType[] {
  return apiData.groups.map((group) => ({
    title: group.title,
    items: group.items.map((item) => ({
      title: item.title,
      url: item.url,
      icon: getIcon(item.icon) || defaultIcon,
    })),
  }))
}

// 默认团队数据
const defaultTeams = [
  {
    name: 'DataForge',
    logo: Hammer,
    plan: '数据熔炉',
  },
]

function SidebarCollapseButton() {
  const { state, toggleSidebar } = useSidebar()
  const isCollapsed = state === 'collapsed'

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 shrink-0"
      onClick={toggleSidebar}
      title={isCollapsed ? '展开侧边栏' : '折叠侧边栏'}
    >
      {isCollapsed ? (
        <PanelLeft className="size-4" />
      ) : (
        <PanelLeftClose className="size-4" />
      )}
    </Button>
  )
}

function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Skeleton className="size-8 rounded" />
        <Skeleton className="h-4 flex-1" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <div className="space-y-1 pl-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function AppSidebar() {
  const { collapsible, variant } = useLayout()
  const { auth } = useAuthStore()

  // 从 API 获取导航配置
  const { data: navConfig, isLoading } = useQuery({
    queryKey: ['user-nav-config'],
    queryFn: async () => {
      const response = await apiClient.get<{ data: ApiNavConfig }>('/pages')
      return response.data.data // 返回 ApiNavConfig
    },
    staleTime: 5 * 60 * 1000, // 5 分钟内不重新请求
    enabled: !!auth.accessToken, // 只有登录后才请求
  })

  // 转换数据格式
  const navGroups = navConfig ? transformNavData(navConfig) : []

  // 用户数据
  const userData = {
    name: auth.user?.name || '用户',
    email: auth.user?.email || '',
    avatar: '/avatars/default.jpg',
  }

  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        {/* 展开状态：显示 TeamSwitcher + 折叠按钮 */}
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:hidden">
          <div className="flex-1 min-w-0">
            <TeamSwitcher teams={defaultTeams} />
          </div>
          <SidebarCollapseButton />
        </div>
        {/* 折叠状态：只显示展开按钮 */}
        <div className="hidden group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
          <SidebarCollapseButton />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {isLoading ? (
          <SidebarSkeleton />
        ) : (
          navGroups.map((props) => (
            <NavGroup key={props.title} {...props} />
          ))
        )}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={userData} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
