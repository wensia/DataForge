import { DotsHorizontalIcon } from '@radix-ui/react-icons'
import { type Row } from '@tanstack/react-table'
import { Trash2, LogIn, Edit, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLoginAccount } from '../api'
import { type Account } from '../data/schema'
import { useAccountsContext } from './accounts-provider'

type AccountsRowActionsProps<TData> = {
  row: Row<TData>
}

export function AccountsRowActions<TData>({
  row,
}: AccountsRowActionsProps<TData>) {
  const account = row.original as Account
  const { setOpen, setCurrentRow } = useAccountsContext()

  const loginAccount = useLoginAccount()

  const handleLogin = async () => {
    try {
      await loginAccount.mutateAsync(account.id)
      toast.success('登录成功')
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '登录失败，请重试'
      toast.error(message)
    }
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          size='icon-xs'
          className='data-[state=open]:bg-muted'
        >
          <DotsHorizontalIcon className='h-4 w-4' />
          <span className='sr-only'>打开菜单</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-[160px]'>
        <DropdownMenuItem
          onClick={handleLogin}
          disabled={loginAccount.isPending}
        >
          {loginAccount.isPending ? (
            <RefreshCw className='mr-2 h-4 w-4 animate-spin' />
          ) : (
            <LogIn className='mr-2 h-4 w-4' />
          )}
          {account.status === 1 ? '刷新登录' : '登录'}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => {
            setCurrentRow(account)
            setOpen('update')
          }}
        >
          <Edit className='mr-2 h-4 w-4' />
          编辑密码
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => {
            setCurrentRow(account)
            setOpen('delete')
          }}
          className='text-destructive focus:text-destructive'
        >
          删除
          <DropdownMenuShortcut>
            <Trash2 size={16} />
          </DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
