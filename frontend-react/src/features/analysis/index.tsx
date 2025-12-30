/**
 * 数据浏览页面
 * 使用 Provider 模式管理状态，布局参考 shadcn-admin tasks 页面
 */
import { useCallback } from 'react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { AnalysisProvider, useAnalysis } from './components/analysis-provider'
import { AnalysisTable } from './components/analysis-table'
import { AnalysisDialogs } from './components/analysis-dialogs'
import { BatchPhoneQuerySidebar } from './components/batch-phone-query-sidebar'
import { cn } from '@/lib/utils'

function AnalysisMainContent() {
  const { showBatchSidebar, batchSidebarWidth, setBatchSidebarWidth } = useAnalysis()

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = batchSidebarWidth

    const handleMouseMove = (moveEvent: MouseEvent) => {
      // 侧边栏在右侧，向左拖动宽度增加
      const deltaX = startX - moveEvent.clientX
      const newWidth = Math.max(300, Math.min(800, startWidth + deltaX))
      setBatchSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [batchSidebarWidth, setBatchSidebarWidth])

  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-4'>
          <h1 className='text-xl font-semibold'>数据浏览</h1>
        </div>
      </Header>

      <Main fixed className='min-h-0 p-0'>
        <div className='flex h-full w-full overflow-hidden'>
          {/* 左侧主表区域 */}
          <div className={cn(
            'flex flex-col gap-4 p-4 min-w-0 transition-all duration-300 ease-in-out',
            showBatchSidebar ? 'flex-[1]' : 'flex-[1]'
          )}>
            <div className='mb-2'>
              <p className='text-muted-foreground text-sm'>
                查看和管理通话记录数据
              </p>
            </div>
            <AnalysisTable />
          </div>

          {/* 右侧侧边栏 */}
          {showBatchSidebar && (
            <>
              {/* 调整宽度的手柄 */}
              <div
                className='w-1 h-full cursor-col-resize hover:bg-primary/30 transition-colors z-20 flex-shrink-0'
                onMouseDown={handleMouseDown}
              />
              <div className='h-full flex-shrink-0'>
                <BatchPhoneQuerySidebar />
              </div>
            </>
          )}
        </div>
      </Main>

      <AnalysisDialogs />
    </>
  )
}


export function DataAnalysis() {
  return (
    <AnalysisProvider>
      <AnalysisMainContent />
    </AnalysisProvider>
  )
}
