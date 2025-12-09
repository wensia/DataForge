import { createFileRoute } from '@tanstack/react-router'
import { AIAnalysis } from '@/features/analysis/ai-analysis'

export const Route = createFileRoute('/_authenticated/analysis/ai')({
  component: AIAnalysis,
})
