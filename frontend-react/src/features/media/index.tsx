/**
 * 自媒体模块 - 主布局组件
 * 提供独立的左侧边栏导航
 */
import { Outlet } from '@tanstack/react-router'
import { MediaSidebar } from './components/media-sidebar'

export function MediaLayout() {
  return (
    <div className='flex h-svh w-full'>
      {/* 左侧边栏 */}
      <MediaSidebar />

      {/* 主内容区 */}
      <div className='flex flex-1 flex-col overflow-hidden'>
        <Outlet />
      </div>
    </div>
  )
}
