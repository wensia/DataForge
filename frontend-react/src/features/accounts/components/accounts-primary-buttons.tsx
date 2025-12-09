import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAccountsContext } from './accounts-provider'

export function AccountsPrimaryButtons() {
  const { setOpen } = useAccountsContext()

  return (
    <div className='flex gap-2'>
      <Button className='space-x-1' onClick={() => setOpen('create')}>
        <span>添加账号</span> <Plus size={18} />
      </Button>
    </div>
  )
}
