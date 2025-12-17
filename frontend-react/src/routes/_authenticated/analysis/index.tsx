import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { DataAnalysis } from '@/features/analysis'

const analysisSearchSchema = z.object({
  page: z.number().optional(),
  pageSize: z.number().optional(),
  source: z.array(z.string()).optional(),
  callType: z.array(z.string()).optional(),
  callResult: z.array(z.string()).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  staffName: z.string().optional(),
  department: z.string().optional(),
  callee: z.string().optional(),
  durationMin: z.number().optional(),
  durationMax: z.number().optional(),
})

export const Route = createFileRoute('/_authenticated/analysis/')({
  validateSearch: analysisSearchSchema,
  component: DataAnalysis,
})
