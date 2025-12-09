import { DotsHorizontalIcon } from '@radix-ui/react-icons'
import { type Row } from '@tanstack/react-table'
import { Trash2, Play, Pause, PlayCircle, Edit, Copy } from 'lucide-react'
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
import { usePauseTask, useResumeTask } from '../api'
import { taskSchema, type Task } from '../data/schema'
import { useTasks } from './tasks-provider'

type DataTableRowActionsProps<TData> = {
  row: Row<TData>
}

export function DataTableRowActions<TData>({
  row,
}: DataTableRowActionsProps<TData>) {
  const task = taskSchema.parse(row.original) as Task
  const { setOpen, setCurrentRow } = useTasks()

  const pauseTask = usePauseTask()
  const resumeTask = useResumeTask()

  const handlePause = async () => {
    try {
      await pauseTask.mutateAsync(task.id)
      toast.success('任务已暂停')
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '暂停失败，请重试'
      toast.error(message)
    }
  }

  const handleResume = async () => {
    try {
      await resumeTask.mutateAsync(task.id)
      toast.success('任务已恢复')
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '恢复失败，请重试'
      toast.error(message)
    }
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          className='data-[state=open]:bg-muted flex h-8 w-8 p-0'
        >
          <DotsHorizontalIcon className='h-4 w-4' />
          <span className='sr-only'>打开菜单</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-[160px]'>
        <DropdownMenuItem
          onClick={() => {
            setCurrentRow(task)
            setOpen('run')
          }}
        >
          <Play className='mr-2 h-4 w-4' />
          立即执行
        </DropdownMenuItem>

        {task.status === 'active' ? (
          <DropdownMenuItem
            onClick={handlePause}
            disabled={pauseTask.isPending}
          >
            <Pause className='mr-2 h-4 w-4' />
            暂停任务
          </DropdownMenuItem>
        ) : task.status === 'paused' ? (
          <DropdownMenuItem
            onClick={handleResume}
            disabled={resumeTask.isPending}
          >
            <PlayCircle className='mr-2 h-4 w-4' />
            恢复任务
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => {
            setCurrentRow(task)
            setOpen('update')
          }}
        >
          <Edit className='mr-2 h-4 w-4' />
          编辑
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => {
            setCurrentRow(task)
            setOpen('copy')
          }}
        >
          <Copy className='mr-2 h-4 w-4' />
          复制
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => {
            setCurrentRow(task)
            setOpen('delete')
          }}
          className='text-destructive focus:text-destructive'
          disabled={task.is_system}
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
