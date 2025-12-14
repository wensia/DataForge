import { PanelLeftClose, PanelLeft } from 'lucide-react'
import { useLayout } from '@/context/layout-provider'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
// import { AppTitle } from './app-title'
import { sidebarData } from './data/sidebar-data'
import { NavGroup } from './nav-group'
import { NavUser } from './nav-user'
import { TeamSwitcher } from './team-switcher'

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

export function AppSidebar() {
  const { collapsible, variant } = useLayout()
  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        {/* 展开状态：显示 TeamSwitcher + 折叠按钮 */}
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:hidden">
          <div className="flex-1 min-w-0">
            <TeamSwitcher teams={sidebarData.teams} />
          </div>
          <SidebarCollapseButton />
        </div>
        {/* 折叠状态：只显示展开按钮 */}
        <div className="hidden group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
          <SidebarCollapseButton />
        </div>

        {/* Replace <TeamSwitch /> with the following <AppTitle />
         /* if you want to use the normal app title instead of TeamSwitch dropdown */}
        {/* <AppTitle /> */}
      </SidebarHeader>
      <SidebarContent>
        {sidebarData.navGroups.map((props) => (
          <NavGroup key={props.title} {...props} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={sidebarData.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
