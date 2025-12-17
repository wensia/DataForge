/**
 * 数据浏览页面
 * 使用 Provider 模式管理状态，布局参考 shadcn-admin tasks 页面
 */
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { AnalysisProvider } from './components/analysis-provider'
import { AnalysisTable } from './components/analysis-table'
import { AnalysisDialogs } from './components/analysis-dialogs'

export function DataAnalysis() {
  return (
    <AnalysisProvider>
      <Header fixed>
        <div className='flex items-center gap-4'>
          <h1 className='text-xl font-semibold'>数据浏览</h1>
        </div>
      </Header>

      <Main fixed className='min-h-0'>
        <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-hidden'>
          <div className='mb-2'>
            <p className='text-muted-foreground text-sm'>
              查看和管理通话记录数据
            </p>
          </div>
          <AnalysisTable />
        </div>
      </Main>

      <AnalysisDialogs />
    </AnalysisProvider>
  )
}
