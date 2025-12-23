import { createFileRoute } from '@tanstack/react-router'
import { MediaLayout } from '@/features/media'

export const Route = createFileRoute('/_authenticated/media')({
  component: MediaLayout,
})
