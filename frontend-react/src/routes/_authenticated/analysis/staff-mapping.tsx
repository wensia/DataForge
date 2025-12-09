import { createFileRoute } from '@tanstack/react-router'
import { StaffMappingPage } from '@/features/analysis/staff-mapping'

export const Route = createFileRoute('/_authenticated/analysis/staff-mapping')({
  component: StaffMappingPage,
})
