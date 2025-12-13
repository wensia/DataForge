/**
 * 独立录音下载页面
 *
 * 可直接分享给他人使用，无需登录认证。
 * 访问路径: /record-download
 */
import { createFileRoute } from '@tanstack/react-router'
import { StandaloneRecordDownload } from '@/features/record-download/standalone'

export const Route = createFileRoute('/record-download')({
  component: StandaloneRecordDownload,
})
