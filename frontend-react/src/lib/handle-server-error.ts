import { AxiosError } from 'axios'
import { toast } from 'sonner'

export function handleServerError(error: unknown) {
  // eslint-disable-next-line no-console
  console.log(error)

  let errMsg = '操作失败，请稍后重试'

  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    Number(error.status) === 204
  ) {
    errMsg = '未找到内容'
  }

  if (error instanceof AxiosError) {
    // 优先使用 error.message（由 api-client 从 API 响应的 message 字段设置）
    // 然后尝试 response.data.message 或 response.data.title
    errMsg =
      error.message ||
      error.response?.data?.message ||
      error.response?.data?.title ||
      errMsg
  } else if (error instanceof Error) {
    errMsg = error.message || errMsg
  }

  toast.error(errMsg)
}
