import { createFileRoute } from '@tanstack/react-router'
import { UsersSettings } from '@/features/settings/users'

export const Route = createFileRoute('/_authenticated/settings/users')({
  component: UsersSettings,
})
