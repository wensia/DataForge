import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { AxiosError } from 'axios'
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { handleServerError } from '@/lib/handle-server-error'
import { DirectionProvider } from './context/direction-provider'
import { FontProvider } from './context/font-provider'
import { StyleProvider } from './context/style-provider'
import { ThemeProvider } from './context/theme-provider'
// Generated Routes
import { routeTree } from './routeTree.gen'
// Styles
import './styles/index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // eslint-disable-next-line no-console
        if (import.meta.env.DEV) console.log({ failureCount, error })

        // 开发环境不重试
        if (import.meta.env.DEV) return false

        // 生产环境最多重试 3 次
        if (failureCount > 3) return false

        // 不重试的情况
        if (error instanceof AxiosError) {
          const httpStatus = error.response?.status ?? 0
          // 业务错误码存储在 error.code 中（由 api-client 设置）
          const businessCode = error.code ? parseInt(error.code, 10) : 0

          // 不重试认证错误
          if ([401, 403].includes(httpStatus)) return false
          // 不重试业务错误（400=请求错误, 404=资源不存在）
          if ([400, 404].includes(businessCode)) return false
        }

        return true
      },
      refetchOnWindowFocus: import.meta.env.PROD,
      staleTime: 10 * 1000, // 10s
    },
    mutations: {
      onError: (error) => {
        handleServerError(error)

        if (error instanceof AxiosError) {
          if (error.response?.status === 304) {
            toast.error('Content not modified!')
          }
        }
      },
    },
  },
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof AxiosError) {
        if (error.response?.status === 401) {
          // 避免在登录页重复导航
          const currentPath = window.location.pathname
          if (currentPath !== '/sign-in') {
            toast.error('登录已过期，请重新登录')
            useAuthStore.getState().auth.reset()
            const redirect = `${router.history.location.href}`
            router.navigate({ to: '/sign-in', search: { redirect } })
          }
        }
        if (error.response?.status === 500) {
          toast.error('服务器内部错误')
          // Only navigate to error page in production to avoid disrupting HMR in development
          if (import.meta.env.PROD) {
            router.navigate({ to: '/500' })
          }
        }
        if (error.response?.status === 403) {
          // router.navigate("/forbidden", { replace: true });
        }
      }
    },
  }),
})

// Create a new router instance
const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
})

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Render the app
const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <StyleProvider>
            <FontProvider>
              <DirectionProvider>
                <RouterProvider router={router} />
              </DirectionProvider>
            </FontProvider>
          </StyleProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}
