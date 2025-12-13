import { createFileRoute } from '@tanstack/react-router'
import { PromptsSettings } from '@/features/settings/prompts'

export const Route = createFileRoute('/_authenticated/settings/prompts')({
  component: PromptsSettings,
})
