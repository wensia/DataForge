import { createFileRoute } from '@tanstack/react-router'
import { ApiKeysSettings } from '@/features/settings/api-keys'

export const Route = createFileRoute('/_authenticated/settings/api-keys')({
  component: ApiKeysSettings,
})
