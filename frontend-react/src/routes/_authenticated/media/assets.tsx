import { createFileRoute } from '@tanstack/react-router'
import { MediaAssets } from '@/features/media/pages/assets'

export const Route = createFileRoute('/_authenticated/media/assets')({
  component: MediaAssets,
})
