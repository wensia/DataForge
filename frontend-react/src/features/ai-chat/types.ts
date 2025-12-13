/**
 * AI 对话类型定义
 */

export interface Conversation {
  id: number
  user_id: number
  title: string
  ai_provider: string
  conversation_type: 'general' | 'analysis'
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface Message {
  id: number
  conversation_id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  tokens_used: number | null
  created_at: string
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[]
}

export interface AIProvider {
  id: string
  name: string
  default_model: string | null
}

export interface SendMessageResponse {
  user_message: Message
  assistant_message: Message
  tokens_used: number | null
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface ConversationCreate {
  title?: string
  ai_provider?: string
  conversation_type?: 'general' | 'analysis'
}

export interface ConversationUpdate {
  title?: string
  ai_provider?: string
  is_archived?: boolean
}

export interface SendMessageRequest {
  content: string
  ai_provider?: string
}
