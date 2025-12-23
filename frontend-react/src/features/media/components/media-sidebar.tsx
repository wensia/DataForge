/**
 * 自媒体模块 - 侧边栏组件
 */
import { Link, useRouterState } from '@tanstack/react-router'
import {
  BookOpen,
  FileText,
  FolderOpen,
  Home,
  ImageIcon,
  LayoutTemplate,
  PenTool,
  Send,
  Tags,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    title: '公众号管理',
    items: [
      {
        title: '公众号列表',
        href: '/media/accounts',
        icon: Users,
      },
      {
        title: '文章管理',
        href: '/media/articles',
        icon: FileText,
      },
      {
        title: '标签管理',
        href: '/media/tags',
        icon: Tags,
      },
    ],
  },
  {
    title: '内容创作',
    items: [
      {
        title: '文章编辑',
        href: '/media/editor',
        icon: PenTool,
      },
      {
        title: '素材库',
        href: '/media/assets',
        icon: ImageIcon,
      },
      {
        title: 'HTML 模板',
        href: '/media/templates',
        icon: LayoutTemplate,
      },
      {
        title: '发布管理',
        href: '/media/publish',
        icon: Send,
      },
    ],
  },
]

export function MediaSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <aside className='flex h-full w-64 flex-col border-r bg-background'>
      {/* 顶部标题 */}
      <div className='flex h-14 items-center border-b px-4'>
        <Link to='/' className='flex items-center gap-2 font-semibold'>
          <BookOpen className='h-5 w-5' />
          <span>自媒体中心</span>
        </Link>
      </div>

      {/* 导航区域 */}
      <ScrollArea className='flex-1 px-3 py-4'>
        <nav className='flex flex-col gap-6'>
          {/* 返回首页 */}
          <Link
            to='/'
            className={cn(
              buttonVariants({ variant: 'ghost' }),
              'justify-start gap-2'
            )}
          >
            <Home className='h-4 w-4' />
            返回首页
          </Link>

          <Separator />

          {/* 导航分组 */}
          {navGroups.map((group) => (
            <div key={group.title} className='flex flex-col gap-1'>
              <h3 className='mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
                {group.title}
              </h3>
              {group.items.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={cn(
                      buttonVariants({ variant: 'ghost' }),
                      'justify-start gap-2',
                      isActive && 'bg-accent text-accent-foreground'
                    )}
                  >
                    <Icon className='h-4 w-4' />
                    {item.title}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
      </ScrollArea>

      {/* 底部区域 */}
      <div className='border-t p-4'>
        <Link
          to='/media'
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'w-full justify-start gap-2'
          )}
        >
          <FolderOpen className='h-4 w-4' />
          概览
        </Link>
      </div>
    </aside>
  )
}
