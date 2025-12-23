import { createFileRoute } from '@tanstack/react-router'
import { MediaArticles } from '@/features/media/pages/articles'

export const Route = createFileRoute('/_authenticated/media/articles')({
  component: MediaArticles,
})
