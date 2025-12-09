/**
 * 员工映射管理页面
 *
 * 三个 Tab：
 * 1. 员工列表 - 显示员工及当前映射，支持编辑
 * 2. 映射历史 - 显示所有时间段映射，支持筛选
 * 3. 批量操作 - 同步员工、回写通话记录
 */

import { useState } from 'react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StaffTable } from './components/staff-table'
import { MappingTable } from './components/mapping-table'
import { BatchOperations } from './components/batch-operations'

export function StaffMappingPage() {
  const [activeTab, setActiveTab] = useState('staff')

  return (
    <>
      <Header fixed>
        <h1 className='text-xl font-semibold'>员工映射管理</h1>
      </Header>

      <Main fixed className='min-h-0'>
        <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-hidden'>
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className='flex min-h-0 flex-1 flex-col'
          >
            <TabsList className='w-fit'>
              <TabsTrigger value='staff'>员工列表</TabsTrigger>
              <TabsTrigger value='mappings'>映射历史</TabsTrigger>
              <TabsTrigger value='batch'>批量操作</TabsTrigger>
            </TabsList>

            <TabsContent value='staff' className='mt-4 flex min-h-0 flex-1 flex-col'>
              <StaffTable />
            </TabsContent>

            <TabsContent value='mappings' className='mt-4 flex min-h-0 flex-1 flex-col'>
              <MappingTable />
            </TabsContent>

            <TabsContent value='batch' className='mt-4 flex-1 overflow-auto'>
              <BatchOperations />
            </TabsContent>
          </Tabs>
        </div>
      </Main>
    </>
  )
}

export default StaffMappingPage
