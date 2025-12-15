import { createFileRoute } from '@tanstack/react-router'
import { DajialaSettings } from '@/features/settings/dajiala'

export const Route = createFileRoute('/_authenticated/dajiala/')({
  component: DajialaSettings,
})
