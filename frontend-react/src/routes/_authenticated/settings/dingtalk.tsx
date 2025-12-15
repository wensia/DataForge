import { createFileRoute } from '@tanstack/react-router'
import { DingTalkSettings } from '@/features/settings/dingtalk'

export const Route = createFileRoute('/_authenticated/settings/dingtalk')({
  component: DingTalkSettings,
})
