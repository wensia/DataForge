/**
 * 素材库页面
 */
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ComingSoon } from '@/components/coming-soon'

export function MediaAssets() {
  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-4'>
          <h1 className='text-xl font-semibold'>素材库</h1>
        </div>
      </Header>

      <Main fixed>
        <ComingSoon />
      </Main>
    </>
  )
}
