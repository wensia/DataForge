import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useDeleteTask, useRunTask } from '../api'
import { TasksImportDialog } from './tasks-import-dialog'
import { TasksMutateDrawer } from './tasks-mutate-drawer'
import { useTasks } from './tasks-provider'

export function TasksDialogs() {
  const { open, setOpen, currentRow, setCurrentRow } = useTasks()
  const deleteTask = useDeleteTask()
  const runTask = useRunTask()

  const handleDelete = async () => {
    if (!currentRow) return

    try {
      await deleteTask.mutateAsync(currentRow.id)
      toast.success('任务删除成功')
      setOpen(null)
      setTimeout(() => {
        setCurrentRow(null)
      }, 500)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '删除失败，请重试'
      toast.error(message)
    }
  }

  const handleRun = async () => {
    if (!currentRow) return

    try {
      await runTask.mutateAsync(currentRow.id)
      toast.success('任务已加入执行队列')
      setOpen(null)
      setTimeout(() => {
        setCurrentRow(null)
      }, 500)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '执行失败，请重试'
      toast.error(message)
    }
  }

  return (
    <>
      <TasksMutateDrawer
        key='task-create'
        open={open === 'create'}
        onOpenChange={() => setOpen('create')}
      />

      <TasksImportDialog
        key='tasks-import'
        open={open === 'import'}
        onOpenChange={() => setOpen('import')}
      />

      {currentRow && (
        <>
          <TasksMutateDrawer
            key={`task-update-${currentRow.id}`}
            open={open === 'update'}
            onOpenChange={() => {
              setOpen('update')
              setTimeout(() => {
                setCurrentRow(null)
              }, 500)
            }}
            currentRow={currentRow}
          />

          <TasksMutateDrawer
            key={`task-copy-${currentRow.id}`}
            open={open === 'copy'}
            onOpenChange={() => {
              setOpen('copy')
              setTimeout(() => {
                setCurrentRow(null)
              }, 500)
            }}
            currentRow={currentRow}
            isCopy
          />

          <ConfirmDialog
            key='task-delete'
            destructive
            open={open === 'delete'}
            onOpenChange={() => {
              setOpen('delete')
              setTimeout(() => {
                setCurrentRow(null)
              }, 500)
            }}
            handleConfirm={handleDelete}
            isLoading={deleteTask.isPending}
            className='max-w-md'
            title={`删除任务: ${currentRow.name} ?`}
            desc={
              <>
                您即将删除任务 <strong>{currentRow.name}</strong>。
                <br />
                {currentRow.is_system && (
                  <span className='text-destructive'>
                    这是一个系统任务，删除后可能影响系统功能。
                  </span>
                )}
                此操作无法撤销。
              </>
            }
            confirmText='删除'
          />

          <ConfirmDialog
            key='task-run'
            open={open === 'run'}
            onOpenChange={() => {
              setOpen('run')
              setTimeout(() => {
                setCurrentRow(null)
              }, 500)
            }}
            handleConfirm={handleRun}
            isLoading={runTask.isPending}
            className='max-w-md'
            title={`立即执行任务: ${currentRow.name} ?`}
            desc={
              <>
                您即将手动触发任务 <strong>{currentRow.name}</strong> 执行。
                <br />
                这将立即启动任务，不会影响正常调度。
              </>
            }
            confirmText='执行'
          />
        </>
      )}
    </>
  )
}
