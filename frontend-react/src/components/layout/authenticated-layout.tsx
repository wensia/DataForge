import { Outlet, useRouterState } from '@tanstack/react-router'
import { getCookie } from '@/lib/cookies'
import { cn } from '@/lib/utils'
import { LayoutProvider } from '@/context/layout-provider'
import { SearchProvider } from '@/context/search-provider'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { SkipToMain } from '@/components/skip-to-main'

type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

// 不显示主侧边栏的路由
const SIDEBAR_HIDDEN_ROUTES = ['/ai-chat']

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const defaultOpen = getCookie('sidebar_state') !== 'false'
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  // 检查当前路由是否需要隐藏侧边栏
  const hideSidebar = SIDEBAR_HIDDEN_ROUTES.some((route) => pathname.startsWith(route))

  // 如果隐藏侧边栏，直接渲染内容
  if (hideSidebar) {
    return (
      <SearchProvider>
        <LayoutProvider>
          <SkipToMain />
          <div className="h-svh w-full">{children ?? <Outlet />}</div>
        </LayoutProvider>
      </SearchProvider>
    )
  }

  return (
    <SearchProvider>
      <LayoutProvider>
        <SidebarProvider defaultOpen={defaultOpen}>
          <SkipToMain />
          <AppSidebar />
          <SidebarInset
            className={cn(
              // Set content container, so we can use container queries
              '@container/content',

              // If layout is fixed, set the height
              // to 100svh to prevent overflow
              'has-data-[layout=fixed]:h-svh',

              // If layout is fixed and sidebar is inset,
              // set the height to 100svh - spacing (total margins) to prevent overflow
              'peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100svh-(var(--spacing)*4))]'
            )}
          >
            {children ?? <Outlet />}
          </SidebarInset>
        </SidebarProvider>
      </LayoutProvider>
    </SearchProvider>
  )
}
