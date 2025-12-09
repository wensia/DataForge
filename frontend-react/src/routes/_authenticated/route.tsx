import { createFileRoute, redirect } from '@tanstack/react-router'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'

const AUTH_TOKEN_KEY = 'auth_token'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    // 检查是否有认证 token
    const token = localStorage.getItem(AUTH_TOKEN_KEY)
    if (!token) {
      // 未认证，重定向到登录页面，并保存当前路径用于登录后跳转
      throw redirect({
        to: '/sign-in',
        search: {
          redirect: location.href,
        },
      })
    }
  },
  component: AuthenticatedLayout,
})
