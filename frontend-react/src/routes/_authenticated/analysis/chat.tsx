import { createFileRoute } from '@tanstack/react-router'
import { AIChat } from '@/features/analysis/chat'

export const Route = createFileRoute('/_authenticated/analysis/chat')({
  component: AIChat,
})
