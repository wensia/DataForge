import { createFileRoute } from '@tanstack/react-router'
import { AIChatTest } from '@/features/ai-chat-test'

export const Route = createFileRoute('/_authenticated/ai-chat-test/')({
  component: AIChatTest,
})
