import { Download, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTasks } from './tasks-provider'

export function TasksPrimaryButtons() {
  const { setOpen } = useTasks()
  return (
    <div className='flex gap-2'>
      <Button
        variant='outline'
        size='sm'
        onClick={() => setOpen('import')}
      >
        <Download className='size-4' />
        导入
      </Button>
      <Button size='sm' onClick={() => setOpen('create')}>
        <Plus className='size-4' />
        新建
      </Button>
    </div>
  )
}
