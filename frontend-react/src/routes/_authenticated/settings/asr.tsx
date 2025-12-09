import { createFileRoute } from '@tanstack/react-router'
import { AsrSettings } from '@/features/settings/asr'

export const Route = createFileRoute('/_authenticated/settings/asr')({
  component: AsrSettings,
})
