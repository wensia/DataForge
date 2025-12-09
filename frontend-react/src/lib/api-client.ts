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
    // 后端统一返回 { code, message, data } 格式
    const data = response.data
    // 如果 code 不是 200，抛出错误
    if (data.code !== 200) {
      const error = new AxiosError(
        data.message || '请求失败',
        String(data.code),
        response.config,
        response.request,
        response
      )
      return Promise.reject(error)
    }
    return response
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 导出类型化的请求方法
export default apiClient
