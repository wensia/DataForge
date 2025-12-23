import { createFileRoute } from '@tanstack/react-router'
import { MediaAccounts } from '@/features/media/pages/accounts'

export const Route = createFileRoute('/_authenticated/media/accounts')({
  component: MediaAccounts,
})
