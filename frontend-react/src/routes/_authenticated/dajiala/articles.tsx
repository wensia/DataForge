import { createFileRoute } from '@tanstack/react-router'
import { WechatArticles } from '@/features/dajiala/articles'

export const Route = createFileRoute('/_authenticated/dajiala/articles')({
  component: WechatArticles,
})
