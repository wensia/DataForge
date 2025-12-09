import { createFileRoute } from '@tanstack/react-router'
import { AiSettings } from '@/features/settings/ai'

export const Route = createFileRoute('/_authenticated/settings/ai')({
  component: AiSettings,
})
