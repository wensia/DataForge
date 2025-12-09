import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { AccountsDialogs } from './components/accounts-dialogs'
import { AccountsPrimaryButtons } from './components/accounts-primary-buttons'
import { AccountsProvider } from './components/accounts-provider'
import { AccountsTable } from './components/accounts-table'

export function Accounts() {
  return (
    <AccountsProvider>
      <Header fixed>
        <Search />
        <div className='ms-auto flex items-center space-x-4'>
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main fixed className='min-h-0'>
        <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-hidden'>
          <div className='flex flex-wrap items-end justify-between gap-2'>
            <AccountsPrimaryButtons />
          </div>
          <AccountsTable />
        </div>
      </Main>

      <AccountsDialogs />
    </AccountsProvider>
  )
}
