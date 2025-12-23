/**
 * 自媒体概览页面
 */
import { BookOpen, FileText, ImageIcon, Users } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const stats = [
  {
    title: '公众号数量',
    value: '12',
    description: '已关联的公众号',
    icon: Users,
  },
  {
    title: '文章总数',
    value: '1,234',
    description: '已采集的文章',
    icon: FileText,
  },
  {
    title: '素材数量',
    value: '567',
    description: '图片和媒体文件',
    icon: ImageIcon,
  },
  {
    title: '本月发布',
    value: '45',
    description: '本月发布的文章',
    icon: BookOpen,
  },
]

export function MediaOverview() {
  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-4'>
          <h1 className='text-xl font-semibold'>自媒体概览</h1>
        </div>
      </Header>

      <Main fixed>
        <div className='flex flex-col gap-6'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>欢迎来到自媒体中心</h2>
            <p className='text-muted-foreground'>
              管理您的公众号、文章和素材内容
            </p>
          </div>

          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
            {stats.map((stat) => {
              const Icon = stat.icon
              return (
                <Card key={stat.title}>
                  <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                    <CardTitle className='text-sm font-medium'>
                      {stat.title}
                    </CardTitle>
                    <Icon className='h-4 w-4 text-muted-foreground' />
                  </CardHeader>
                  <CardContent>
                    <div className='text-2xl font-bold'>{stat.value}</div>
                    <p className='text-xs text-muted-foreground'>
                      {stat.description}
                    </p>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <div className='grid gap-4 md:grid-cols-2'>
            <Card>
              <CardHeader>
                <CardTitle>快速入口</CardTitle>
              </CardHeader>
              <CardContent className='grid gap-2'>
                <p className='text-sm text-muted-foreground'>
                  使用左侧导航栏快速访问各个功能模块
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>最近动态</CardTitle>
              </CardHeader>
              <CardContent>
                <p className='text-sm text-muted-foreground'>暂无最近动态</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </Main>
    </>
  )
}
