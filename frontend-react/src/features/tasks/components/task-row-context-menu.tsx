import { type Row } from '@tanstack/react-table'
import { Trash2, Play, Pause, PlayCircle, Edit, Copy } from 'lucide-react'
import { toast } from 'sonner'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { usePauseTask, useResumeTask } from '../api'
import { taskSchema, type Task } from '../data/schema'
import { useTasks } from './tasks-provider'

type TaskRowContextMenuProps = {
  row: Row<Task>
  children: React.ReactNode
}

export function TaskRowContextMenu({ row, children }: TaskRowContextMenuProps) {
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
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className='w-[160px]'>
        <ContextMenuItem
          onClick={() => {
            setCurrentRow(task)
            setOpen('run')
          }}
        >
          <Play className='mr-2 h-4 w-4' />
          立即执行
        </ContextMenuItem>

        {task.status === 'active' ? (
          <ContextMenuItem
            onClick={handlePause}
            disabled={pauseTask.isPending}
          >
            <Pause className='mr-2 h-4 w-4' />
            暂停任务
          </ContextMenuItem>
        ) : task.status === 'paused' ? (
          <ContextMenuItem
            onClick={handleResume}
            disabled={resumeTask.isPending}
          >
            <PlayCircle className='mr-2 h-4 w-4' />
            恢复任务
          </ContextMenuItem>
        ) : null}

        <ContextMenuSeparator />

        <ContextMenuItem
          onClick={() => {
            setCurrentRow(task)
            setOpen('update')
          }}
        >
          <Edit className='mr-2 h-4 w-4' />
          编辑
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => {
            setCurrentRow(task)
            setOpen('copy')
          }}
        >
          <Copy className='mr-2 h-4 w-4' />
          复制
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem
          onClick={() => {
            setCurrentRow(task)
            setOpen('delete')
          }}
          variant='destructive'
          disabled={task.is_system}
        >
          删除
          <ContextMenuShortcut>
            <Trash2 size={16} />
          </ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
