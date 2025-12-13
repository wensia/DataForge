import type { NavPageConfig } from '../types'

export const defaultNavConfig: NavPageConfig = {
  version: 1,
  groups: [
    {
      id: 'overview',
      title: '概览',
      order: 0,
      isCollapsed: false,
      items: [
        {
          id: 'dashboard',
          title: '仪表板',
          url: '/',
          icon: 'LayoutDashboard',
          order: 0,
          isVisible: true,
        },
      ],
    },
    {
      id: 'account-management',
      title: '账号管理',
      order: 1,
      isCollapsed: false,
      items: [
        {
          id: 'accounts',
          title: '云客账号',
          url: '/accounts',
          icon: 'FolderTree',
          order: 0,
          isVisible: true,
        },
        {
          id: 'record-download',
          title: '录音下载',
          url: '/record-download',
          icon: 'Download',
          order: 1,
          isVisible: true,
        },
      ],
    },
    {
      id: 'scheduled-tasks',
      title: '定时任务',
      order: 2,
      isCollapsed: false,
      items: [
        {
          id: 'tasks',
          title: '任务管理',
          url: '/tasks',
          icon: 'ListTodo',
          order: 0,
          isVisible: true,
        },
        {
          id: 'task-executions',
          title: '执行记录',
          url: '/task-executions',
          icon: 'History',
          order: 1,
          isVisible: true,
        },
      ],
    },
    {
      id: 'data-analysis',
      title: '数据分析',
      order: 3,
      isCollapsed: false,
      items: [
        {
          id: 'analysis',
          title: '数据浏览',
          url: '/analysis',
          icon: 'BarChart3',
          order: 0,
          isVisible: true,
        },
        {
          id: 'analysis-ai',
          title: 'AI 分析',
          url: '/analysis/ai',
          icon: 'Bot',
          order: 1,
          isVisible: true,
        },
        {
          id: 'analysis-chat',
          title: '智能问答',
          url: '/analysis/chat',
          icon: 'MessageSquare',
          order: 2,
          isVisible: true,
        },
        {
          id: 'staff-mapping',
          title: '员工映射',
          url: '/analysis/staff-mapping',
          icon: 'UserRoundCog',
          order: 3,
          isVisible: true,
        },
      ],
    },
    {
      id: 'ai-chat',
      title: 'AI 对话',
      order: 4,
      isCollapsed: false,
      items: [
        {
          id: 'ai-chat-page',
          title: 'AI 对话',
          url: '/ai-chat',
          icon: 'Bot',
          order: 0,
          isVisible: true,
        },
      ],
    },
    {
      id: 'system-settings',
      title: '系统设置',
      order: 5,
      isCollapsed: false,
      items: [
        {
          id: 'api-keys',
          title: 'API 密钥',
          url: '/settings/api-keys',
          icon: 'Key',
          order: 0,
          isVisible: true,
        },
        {
          id: 'feishu',
          title: '飞书配置',
          url: '/settings/feishu',
          icon: 'Link2',
          order: 1,
          isVisible: true,
        },
        {
          id: 'ai-config',
          title: 'AI 配置',
          url: '/settings/ai',
          icon: 'Bot',
          order: 2,
          isVisible: true,
        },
        {
          id: 'asr-config',
          title: 'ASR 配置',
          url: '/settings/asr',
          icon: 'Mic',
          order: 3,
          isVisible: true,
        },
        {
          id: 'users',
          title: '用户管理',
          url: '/settings/users',
          icon: 'Users',
          order: 4,
          isVisible: true,
        },
        {
          id: 'personal-settings',
          title: '个人设置',
          url: '/settings',
          icon: 'UserCog',
          order: 5,
          isVisible: true,
        },
      ],
    },
  ],
}

export function getDefaultNavConfig(): NavPageConfig {
  return JSON.parse(JSON.stringify(defaultNavConfig))
}
