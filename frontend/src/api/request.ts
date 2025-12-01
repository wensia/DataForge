import axios from 'axios'
import type { ResponseModel } from '@/types'

const request = axios.create({
  baseURL: '/api/v1',
  timeout: 10000,
})

// 请求拦截器
request.interceptors.request.use(
  (config) => {
    // 可以在这里添加 token 等
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
request.interceptors.response.use(
  (response) => {
    // 直接返回响应数据，由业务层处理状态码
    return response.data as ResponseModel
  },
  (error) => {
    console.error('请求错误:', error.message)
    return Promise.reject(error)
  }
)

export default request

