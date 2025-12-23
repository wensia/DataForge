import { createFileRoute } from '@tanstack/react-router'
import { MediaEditor } from '@/features/media/pages/editor'

export const Route = createFileRoute('/_authenticated/media/editor')({
  component: MediaEditor,
})
