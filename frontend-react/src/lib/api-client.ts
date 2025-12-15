/**
 * Axios API 客户端配置
 */
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

// 创建 axios 实例
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器 - 添加认证 token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截器 - 统一处理响应
apiClient.interceptors.response.use(
  (response) => {
    // blob 类型响应直接返回，不检查 code
    if (response.config.responseType === 'blob') {
      return response
    }
    // 后端统一返回 { code, message, data } 格式
    const data = response.data
    // 如果 code 不是 200，抛出错误
    if (data.code !== 200) {
      const error = new AxiosError(
        data.message || '请求失败',
        String(data.code), // 业务错误码存储在 error.code 中
        response.config,
        response.request,
        response
      )
      // 添加业务状态码属性，便于 retry 配置识别
      ;(error as AxiosError & { businessCode: number }).businessCode = data.code
      return Promise.reject(error)
    }
    return response
  },
  (error) => {
    // 统一处理未授权：清除 token 并跳转登录
    const status = error?.response?.status
    if (status === 401) {
      try {
        localStorage.removeItem('auth_token')
      } catch {
        // ignore
      }
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname
        // 独立页面不重定向到登录页
        const standalonePaths = ['/sign-in', '/chat', '/record-download']
        const isStandalonePage = standalonePaths.some((p) => currentPath.startsWith(p))
        if (!isStandalonePage) {
          const redirect = encodeURIComponent(window.location.href)
          window.location.href = `/sign-in?redirect=${redirect}`
        }
      }
    }
    return Promise.reject(error)
  }
)

// 导出类型化的请求方法
export default apiClient
