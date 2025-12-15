import { createFileRoute } from '@tanstack/react-router'
import { RobotSettings } from '@/features/settings/robot'

export const Route = createFileRoute('/_authenticated/settings/robot')({
  component: RobotSettings,
})
