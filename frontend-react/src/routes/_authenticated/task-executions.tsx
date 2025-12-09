import { createFileRoute } from '@tanstack/react-router'
import { TaskExecutions } from '@/features/task-executions'

export const Route = createFileRoute('/_authenticated/task-executions')({
  component: TaskExecutions,
})
