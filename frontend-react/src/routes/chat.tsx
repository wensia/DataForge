/**
 * 独立 AI 对话页面
 *
 * 可直接分享给他人使用，无需登录认证。
 * 访问路径: /chat
 */
import { createFileRoute } from '@tanstack/react-router'
import { StandaloneAIChat } from '@/features/ai-chat/standalone'

export const Route = createFileRoute('/chat')({
  component: StandaloneAIChat,
})
