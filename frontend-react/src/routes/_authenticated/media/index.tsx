import { createFileRoute } from '@tanstack/react-router'
import { MediaOverview } from '@/features/media/pages/overview'

export const Route = createFileRoute('/_authenticated/media/')({
  component: MediaOverview,
})
