import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import PagesManagement from '@/features/admin/pages'

export const Route = createFileRoute('/_authenticated/admin/pages')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()
    if (!auth.isAdmin()) {
      throw redirect({ to: '/403' })
    }
  },
  component: PagesManagement,
})
