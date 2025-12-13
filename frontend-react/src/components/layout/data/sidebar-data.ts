import {
  LayoutDashboard,
  ListTodo,
  Users,
  UserCog,
  Key,
  Link2,
  History,
  BarChart3,
  Hammer,
  Bot,
  FolderTree,
  MessageSquare,
  Mic,
  UserRoundCog,
  Layers,
  Download,
  MessageCircle,
} from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: '用户',
    email: 'user@example.com',
    avatar: '/avatars/default.jpg',
  },
  teams: [
    {
      name: 'DataForge',
      logo: Hammer,
      plan: '数据熔炉',
    },
  ],
  navGroups: [
    {
      title: '概览',
      items: [
        {
          title: '仪表板',
          url: '/',
          icon: LayoutDashboard,
        },
      ],
    },
    {
      title: '账号管理',
      items: [
        {
          title: '云客账号',
          url: '/accounts',
          icon: FolderTree,
        },
        {
          title: '录音下载',
          url: '/record-download',
          icon: Download,
        },
      ],
    },
    {
      title: '定时任务',
      items: [
        {
          title: '任务管理',
          url: '/tasks',
          icon: ListTodo,
        },
        {
          title: '执行记录',
          url: '/task-executions',
          icon: History,
        },
      ],
    },
    {
      title: '数据分析',
      items: [
        {
          title: '数据浏览',
          url: '/analysis',
          icon: BarChart3,
        },
        {
          title: 'AI 分析',
          url: '/analysis/ai',
          icon: Bot,
        },
        {
          title: '智能问答',
          url: '/analysis/chat',
          icon: MessageSquare,
        },
        {
          title: '员工映射',
          url: '/analysis/staff-mapping',
          icon: UserRoundCog,
        },
      ],
    },
    {
      title: 'AI 对话',
      items: [
        {
          title: 'AI 对话',
          url: '/ai-chat',
          icon: Bot,
        },
        {
          title: '快捷话术',
          url: '/settings/prompts',
          icon: MessageCircle,
        },
      ],
    },
    {
      title: '系统设置',
      items: [
        {
          title: 'API 密钥',
          url: '/settings/api-keys',
          icon: Key,
        },
        {
          title: '飞书配置',
          url: '/settings/feishu',
          icon: Link2,
        },
        {
          title: 'AI 配置',
          url: '/settings/ai',
          icon: Bot,
        },
        {
          title: 'ASR 配置',
          url: '/settings/asr',
          icon: Mic,
        },
        {
          title: '用户管理',
          url: '/settings/users',
          icon: Users,
        },
        {
          title: '页面管理',
          url: '/admin/pages',
          icon: Layers,
        },
        {
          title: '个人设置',
          url: '/settings',
          icon: UserCog,
        },
      ],
    },
  ],
}
