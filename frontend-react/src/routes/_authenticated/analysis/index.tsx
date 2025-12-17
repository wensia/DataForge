import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { DataAnalysis } from '@/features/analysis'

const analysisSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(20),
  source: z.array(z.string()).optional().catch([]),
  callType: z.array(z.string()).optional().catch([]),
  callResult: z.array(z.string()).optional().catch([]),
  startDate: z.string().optional().catch(undefined),
  endDate: z.string().optional().catch(undefined),
  staffName: z.string().optional().catch(undefined),
  department: z.string().optional().catch(undefined),
  callee: z.string().optional().catch(undefined),
  durationMin: z.number().optional().catch(undefined),
  durationMax: z.number().optional().catch(undefined),
})

export const Route = createFileRoute('/_authenticated/analysis/')({
  validateSearch: analysisSearchSchema,
  component: DataAnalysis,
})
