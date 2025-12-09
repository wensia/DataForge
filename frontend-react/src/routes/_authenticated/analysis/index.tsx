import { createFileRoute } from '@tanstack/react-router'
import { DataAnalysis } from '@/features/analysis'

export const Route = createFileRoute('/_authenticated/analysis/')({
  component: DataAnalysis,
})
