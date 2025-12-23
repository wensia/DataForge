import { createFileRoute } from '@tanstack/react-router'
import { MediaTags } from '@/features/media/pages/tags'

export const Route = createFileRoute('/_authenticated/media/tags')({
  component: MediaTags,
})
