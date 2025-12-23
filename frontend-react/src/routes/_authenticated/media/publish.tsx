import { createFileRoute } from '@tanstack/react-router'
import { MediaPublish } from '@/features/media/pages/publish'

export const Route = createFileRoute('/_authenticated/media/publish')({
  component: MediaPublish,
})
