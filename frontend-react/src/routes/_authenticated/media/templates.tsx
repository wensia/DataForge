import { createFileRoute } from '@tanstack/react-router'
import { HtmlTemplatesPage } from '@/features/media/pages/templates'

export const Route = createFileRoute('/_authenticated/media/templates')({
  component: HtmlTemplatesPage,
})
