import { createFileRoute } from '@tanstack/react-router'
import { FeishuSettings } from '@/features/settings/feishu'

export const Route = createFileRoute('/_authenticated/settings/feishu')({
  component: FeishuSettings,
})
