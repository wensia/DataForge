import { createFileRoute } from '@tanstack/react-router'
import RecordDownload from '@/features/record-download'

export const Route = createFileRoute('/_authenticated/record-download')({
  component: RecordDownload,
})
