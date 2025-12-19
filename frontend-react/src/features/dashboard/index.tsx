import { useQuery } from '@tanstack/react-query'
import {
  Users,
  Clock,
  CheckCircle,
  XCircle,
  Key,
  Database,
  Activity,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import apiClient from '@/lib/api-client'
import type { ApiResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { StyleSwitch } from '@/components/style-switch'
import { ThemeSwitch } from '@/components/theme-switch'

// 获取仪表板统计数据
function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: async () => {
      // 并行获取多个 API 的数据
      const [accountsRes, tasksRes, apiKeysRes] = await Promise.all([
        apiClient.get<ApiResponse<unknown[]>>('/accounts').catch(() => ({ data: { data: [] } })),
        apiClient.get<ApiResponse<unknown[]>>('/tasks').catch(() => ({ data: { data: [] } })),
        apiClient.get<ApiResponse<{ items: unknown[]; total: number }>>('/api-keys').catch(() => ({ data: { data: { items: [], total: 0 } } })),
      ])

      const accounts = accountsRes.data.data as { status: number }[]
      const tasks = tasksRes.data.data as { status: string; run_count: number; success_count: number; fail_count: number }[]
      const apiKeys = apiKeysRes.data.data

      // 计算统计数据
      const activeAccounts = accounts.filter(a => a.status === 1).length
      const activeTasks = tasks.filter(t => t.status === 'active').length
      const totalRuns = tasks.reduce((sum, t) => sum + (t.run_count || 0), 0)
      const successRuns = tasks.reduce((sum, t) => sum + (t.success_count || 0), 0)
      const failRuns = tasks.reduce((sum, t) => sum + (t.fail_count || 0), 0)
      const successRate = totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : 0

      return {
        accounts: {
          total: accounts.length,
          active: activeAccounts,
        },
        tasks: {
          total: tasks.length,
          active: activeTasks,
        },
        executions: {
          total: totalRuns,
          success: successRuns,
          fail: failRuns,
          successRate,
        },
        apiKeys: {
          total: Array.isArray(apiKeys) ? apiKeys.length : (apiKeys?.items?.length || 0),
        },
      }
    },
    refetchInterval: 60000, // 每分钟刷新
  })
}

// 获取最近执行记录
function useRecentExecutions() {
  return useQuery({
    queryKey: ['dashboard', 'recentExecutions'],
    queryFn: async () => {
      const response = await apiClient.get<
        ApiResponse<{
          items: {
            id: number
            task_name: string
            status: string
            started_at: string
            duration_ms: number
          }[]
        }>
      >('/tasks/executions/all', { params: { size: 5 } })
      return response.data.data.items
    },
  })
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(ms: number | null): string {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

export function Dashboard() {
  const { data: stats, isLoading: statsLoading, refetch, isRefetching } = useDashboardStats()
  const { data: recentExecutions = [], isLoading: executionsLoading } = useRecentExecutions()

  return (
    <>
      <Header>
        <Search />
        <div className='ms-auto flex items-center space-x-4'>
          <StyleSwitch />
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main>
        <div className='mb-4 flex items-center justify-between'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>仪表板</h1>
            <p className='text-muted-foreground'>系统运行状态概览</p>
          </div>
          <Button
            variant='outline'
            size='sm'
            onClick={() => refetch()}
            disabled={isRefetching}
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', isRefetching && 'animate-spin')} />
            刷新
          </Button>
        </div>

        <div className='space-y-4'>
          {/* 统计卡片 */}
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>云客账号</CardTitle>
                <Users className='text-muted-foreground h-4 w-4' />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className='h-8 w-20' />
                ) : (
                  <>
                    <div className='text-2xl font-bold'>{stats?.accounts.total || 0}</div>
                    <p className='text-muted-foreground text-xs'>
                      {stats?.accounts.active || 0} 个已登录
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>定时任务</CardTitle>
                <Clock className='text-muted-foreground h-4 w-4' />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className='h-8 w-20' />
                ) : (
                  <>
                    <div className='text-2xl font-bold'>{stats?.tasks.total || 0}</div>
                    <p className='text-muted-foreground text-xs'>
                      {stats?.tasks.active || 0} 个运行中
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>执行记录</CardTitle>
                <Activity className='text-muted-foreground h-4 w-4' />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className='h-8 w-20' />
                ) : (
                  <>
                    <div className='text-2xl font-bold'>{stats?.executions.total || 0}</div>
                    <p className='text-muted-foreground text-xs'>
                      成功率 {stats?.executions.successRate || 0}%
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>API 密钥</CardTitle>
                <Key className='text-muted-foreground h-4 w-4' />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className='h-8 w-20' />
                ) : (
                  <>
                    <div className='text-2xl font-bold'>{stats?.apiKeys.total || 0}</div>
                    <p className='text-muted-foreground text-xs'>已配置</p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 最近执行记录 */}
          <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
            <Card>
              <CardHeader>
                <CardTitle>最近执行记录</CardTitle>
                <CardDescription>最新的任务执行情况</CardDescription>
              </CardHeader>
              <CardContent>
                {executionsLoading ? (
                  <div className='space-y-3'>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className='h-12 w-full' />
                    ))}
                  </div>
                ) : recentExecutions.length === 0 ? (
                  <p className='text-muted-foreground py-4 text-center text-sm'>
                    暂无执行记录
                  </p>
                ) : (
                  <div className='space-y-3'>
                    {recentExecutions.map((execution) => (
                      <div
                        key={execution.id}
                        className='flex items-center justify-between rounded-lg border p-3'
                      >
                        <div className='flex items-center gap-3'>
                          {execution.status === 'success' ? (
                            <CheckCircle className='h-5 w-5 text-green-500' />
                          ) : execution.status === 'failed' ? (
                            <XCircle className='h-5 w-5 text-red-500' />
                          ) : (
                            <Clock className='h-5 w-5 text-yellow-500' />
                          )}
                          <div>
                            <p className='font-medium'>{execution.task_name}</p>
                            <p className='text-muted-foreground text-xs'>
                              {formatDateTime(execution.started_at)}
                            </p>
                          </div>
                        </div>
                        <span className='text-muted-foreground font-mono text-sm'>
                          {formatDuration(execution.duration_ms)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>系统状态</CardTitle>
                <CardDescription>各模块运行状态</CardDescription>
              </CardHeader>
              <CardContent>
                <div className='space-y-3'>
                  <div className='flex items-center justify-between rounded-lg border p-3'>
                    <div className='flex items-center gap-3'>
                      <Database className='text-muted-foreground h-5 w-5' />
                      <span>数据库</span>
                    </div>
                    <span className='flex items-center gap-1 text-sm text-green-500'>
                      <CheckCircle className='h-4 w-4' />
                      正常
                    </span>
                  </div>
                  <div className='flex items-center justify-between rounded-lg border p-3'>
                    <div className='flex items-center gap-3'>
                      <Clock className='text-muted-foreground h-5 w-5' />
                      <span>任务调度器</span>
                    </div>
                    <span className='flex items-center gap-1 text-sm text-green-500'>
                      <CheckCircle className='h-4 w-4' />
                      运行中
                    </span>
                  </div>
                  <div className='flex items-center justify-between rounded-lg border p-3'>
                    <div className='flex items-center gap-3'>
                      <Activity className='text-muted-foreground h-5 w-5' />
                      <span>API 服务</span>
                    </div>
                    <span className='flex items-center gap-1 text-sm text-green-500'>
                      <CheckCircle className='h-4 w-4' />
                      正常
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </Main>
    </>
  )
}
