import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { StyleSwitch } from '@/components/style-switch'
import { ThemeSwitch } from '@/components/theme-switch'
import { TasksDialogs } from './components/tasks-dialogs'
import { TasksPrimaryButtons } from './components/tasks-primary-buttons'
import { TasksProvider } from './components/tasks-provider'
import { TasksTable } from './components/tasks-table'

export function Tasks() {
  return (
    <TasksProvider>
      <Header fixed>
        <Search />
        <div className='ms-auto flex items-center space-x-4'>
          <StyleSwitch />
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main fixed className='min-h-0'>
        <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-hidden'>
          <div className='flex flex-wrap items-end justify-between gap-2'>
            <TasksPrimaryButtons />
          </div>
          <TasksTable />
        </div>
      </Main>

      <TasksDialogs />
    </TasksProvider>
  )
}
