/**
 * 标签管理页面
 */
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ComingSoon } from '@/components/coming-soon'

export function MediaTags() {
  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-4'>
          <h1 className='text-xl font-semibold'>标签管理</h1>
        </div>
      </Header>

      <Main fixed>
        <ComingSoon />
      </Main>
    </>
  )
}
