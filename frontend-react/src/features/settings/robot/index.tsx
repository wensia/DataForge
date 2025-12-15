import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  TestTube,
  MessageSquare,
  Eye,
  EyeOff,
  Pencil,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import apiClient from '@/lib/api-client'
import type { ApiResponse } from '@/lib/types'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'

/** 平台类型 */
type RobotPlatform = 'dingtalk' | 'feishu'

/** 平台配置 */
const PLATFORM_CONFIG = {
  dingtalk: {
    label: '钉钉',
    description: '钉钉群机器人',
    webhookPlaceholder: 'https://oapi.dingtalk.com/robot/send?access_token=xxx',
    webhookHint: '从钉钉群设置中获取机器人 Webhook 地址',
    urlPattern: 'dingtalk',
  },
  feishu: {
    label: '飞书',
    description: '飞书群机器人',
    webhookPlaceholder: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxx',
    webhookHint: '从飞书群设置中获取机器人 Webhook 地址',
    urlPattern: 'feishu',
  },
}

/** 机器人配置类型 */
interface RobotConfig {
  id: number
  platform: RobotPlatform
  name: string
  webhook_url_masked: string
  secret_masked: string
  is_active: boolean
  is_verified: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

// Query Keys
const robotKeys = {
  all: ['robot-configs'] as const,
  list: () => [...robotKeys.all, 'list'] as const,
}

// 获取机器人配置列表
function useRobotConfigs() {
  return useQuery({
    queryKey: robotKeys.list(),
    queryFn: async () => {
      const response =
        await apiClient.get<ApiResponse<RobotConfig[]>>('/robot')
      return response.data.data
    },
  })
}

// 测试机器人 Webhook（创建前测试）
function useTestRobotWebhook() {
  return useMutation({
    mutationFn: async (data: {
      platform: string
      webhook_url: string
      secret: string
      message?: string
    }) => {
      const response = await apiClient.post<
        ApiResponse<{ status: string; error?: string }>
      >('/robot/test', data)
      return response.data
    },
  })
}

// 创建机器人配置
function useCreateRobotConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      platform: string
      name: string
      webhook_url: string
      secret: string
      notes?: string
    }) => {
      const response = await apiClient.post<ApiResponse<RobotConfig>>(
        '/robot',
        data
      )
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: robotKeys.all })
    },
  })
}

// 更新机器人配置
function useUpdateRobotConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number
      data: {
        platform?: string
        name?: string
        webhook_url?: string
        secret?: string
        is_active?: boolean
        notes?: string
      }
    }) => {
      const response = await apiClient.put<ApiResponse<RobotConfig>>(
        `/robot/${id}`,
        data
      )
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: robotKeys.all })
    },
  })
}

// 删除机器人配置
function useDeleteRobotConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/robot/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: robotKeys.all })
    },
  })
}

// 创建表单验证函数
const createFormSchema = (platform: RobotPlatform) =>
  z.object({
    platform: z.enum(['dingtalk', 'feishu']),
    name: z.string().min(1, '名称不能为空'),
    webhook_url: z
      .string()
      .url('请输入有效的 Webhook URL')
      .refine(
        (url) => url.includes(PLATFORM_CONFIG[platform].urlPattern),
        `Webhook URL 必须是${PLATFORM_CONFIG[platform].label}地址`
      ),
    secret: z.string().min(1, '密钥不能为空'),
    notes: z.string().optional(),
  })

const editFormSchema = z.object({
  platform: z.enum(['dingtalk', 'feishu']).optional(),
  name: z.string().min(1, '名称不能为空'),
  webhook_url: z
    .string()
    .url('请输入有效的 Webhook URL')
    .optional()
    .or(z.literal('')),
  secret: z.string().optional(),
  is_active: z.boolean().optional(),
  notes: z.string().optional(),
})

type RobotConfigForm = z.infer<ReturnType<typeof createFormSchema>>
type RobotConfigEditForm = z.infer<typeof editFormSchema>

/** 密钥显示组件 */
function SecretDisplay({ maskedKey }: { maskedKey: string }) {
  const [visible, setVisible] = useState(false)
  const displayKey = visible ? maskedKey : maskedKey.slice(0, 6) + '••••••••'

  return (
    <div className='flex items-center gap-2'>
      <code className='bg-muted rounded px-2 py-1 font-mono text-xs'>
        {displayKey}
      </code>
      <Button
        variant='ghost'
        size='icon'
        className='h-6 w-6'
        onClick={() => setVisible(!visible)}
      >
        {visible ? <EyeOff className='h-3 w-3' /> : <Eye className='h-3 w-3' />}
      </Button>
    </div>
  )
}

/** 获取平台标签 */
function getPlatformLabel(platform: RobotPlatform): string {
  return PLATFORM_CONFIG[platform]?.label || platform
}

export function RobotSettings() {
  const {
    data: configs = [],
    isLoading,
    refetch,
    isRefetching,
  } = useRobotConfigs()

  const testWebhook = useTestRobotWebhook()
  const createConfig = useCreateRobotConfig()
  const updateConfig = useUpdateRobotConfig()
  const deleteConfig = useDeleteRobotConfig()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedConfig, setSelectedConfig] = useState<RobotConfig | null>(null)
  const [editingConfig, setEditingConfig] = useState<RobotConfig | null>(null)
  const [isVerified, setIsVerified] = useState(false)
  const [selectedPlatform, setSelectedPlatform] =
    useState<RobotPlatform>('dingtalk')

  const form = useForm<RobotConfigForm>({
    resolver: zodResolver(createFormSchema(selectedPlatform)),
    defaultValues: {
      platform: 'dingtalk',
      name: '',
      webhook_url: '',
      secret: '',
      notes: '',
    },
  })

  const editForm = useForm<RobotConfigEditForm>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      platform: 'dingtalk',
      name: '',
      webhook_url: '',
      secret: '',
      is_active: true,
      notes: '',
    },
  })

  // 平台切换时重新验证表单
  const handlePlatformChange = (platform: RobotPlatform) => {
    setSelectedPlatform(platform)
    form.setValue('platform', platform)
    form.setValue('webhook_url', '')
    setIsVerified(false)
  }

  // 测试 Webhook
  const handleTest = async () => {
    const values = form.getValues()

    // 先验证表单
    const result = await form.trigger(['webhook_url', 'secret'])
    if (!result) {
      toast.error('请先填写 Webhook URL 和密钥')
      return
    }

    const platformLabel = getPlatformLabel(selectedPlatform)

    try {
      const response = await testWebhook.mutateAsync({
        platform: values.platform,
        webhook_url: values.webhook_url,
        secret: values.secret,
        message: `[DataForge] ${platformLabel}机器人「${values.name || '未命名'}」配置测试消息`,
      })
      if (response.data?.status === 'success') {
        toast.success(`测试成功，请检查${platformLabel}群是否收到消息`)
        setIsVerified(true)
      } else {
        toast.error(`测试失败: ${response.data?.error || response.message}`)
        setIsVerified(false)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '测试失败'
      toast.error(message)
      setIsVerified(false)
    }
  }

  const onSubmit = async (data: RobotConfigForm) => {
    if (!isVerified) {
      toast.error('请先点击「测试连接」验证配置')
      return
    }

    const platformLabel = getPlatformLabel(data.platform as RobotPlatform)

    try {
      const response = await createConfig.mutateAsync(data)
      if (response.code === 200) {
        toast.success(`${platformLabel}机器人配置创建成功`)
        setCreateDialogOpen(false)
        setIsVerified(false)
        form.reset()
      } else {
        toast.error(response.message || '创建失败')
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '创建失败，请重试'
      toast.error(message)
    }
  }

  const handleEdit = (config: RobotConfig) => {
    setEditingConfig(config)
    editForm.reset({
      platform: config.platform,
      name: config.name,
      webhook_url: '',
      secret: '',
      is_active: config.is_active,
      notes: config.notes || '',
    })
    setEditDialogOpen(true)
  }

  const onEditSubmit = async (data: RobotConfigEditForm) => {
    if (!editingConfig) return
    try {
      const updateData: Record<string, unknown> = {
        name: data.name,
        is_active: data.is_active,
        notes: data.notes || null,
      }
      // 只有填写了才更新
      if (data.platform && data.platform !== editingConfig.platform) {
        updateData.platform = data.platform
      }
      if (data.webhook_url && data.webhook_url.trim() !== '') {
        updateData.webhook_url = data.webhook_url
      }
      if (data.secret && data.secret.trim() !== '') {
        updateData.secret = data.secret
      }

      const response = await updateConfig.mutateAsync({
        id: editingConfig.id,
        data: updateData,
      })

      const platformLabel = getPlatformLabel(editingConfig.platform)

      if (response.code === 200) {
        toast.success(`${platformLabel}机器人配置更新成功`)
        setEditDialogOpen(false)
        setEditingConfig(null)
        editForm.reset()
      } else {
        toast.error(response.message || '更新失败')
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '更新失败，请重试'
      toast.error(message)
    }
  }

  const handleDelete = async () => {
    if (!selectedConfig) return
    try {
      await deleteConfig.mutateAsync(selectedConfig.id)
      const platformLabel = getPlatformLabel(selectedConfig.platform)
      toast.success(`${platformLabel}机器人配置删除成功`)
      setDeleteDialogOpen(false)
      setSelectedConfig(null)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '删除失败，请重试'
      toast.error(message)
    }
  }

  // 重置验证状态当 webhook 或 secret 改变时
  const handleFieldChange = () => {
    setIsVerified(false)
  }

  const platformConfig = PLATFORM_CONFIG[selectedPlatform]

  return (
    <div className='flex flex-1 flex-col'>
      <div className='flex-none'>
        <h3 className='text-lg font-medium'>机器人配置</h3>
        <p className='text-muted-foreground text-sm'>
          管理钉钉/飞书群机器人的 Webhook 和签名密钥配置。
        </p>
      </div>
      <Separator className='my-4 flex-none' />

      <div className='flex flex-col gap-4'>
        <div className='flex items-center justify-between'>
          <div />
          <div className='flex gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => refetch()}
              disabled={isRefetching}
            >
              <RefreshCw
                className={cn('mr-2 h-4 w-4', isRefetching && 'animate-spin')}
              />
              刷新
            </Button>
            <Button
              size='sm'
              onClick={() => {
                setIsVerified(false)
                setSelectedPlatform('dingtalk')
                form.reset({
                  platform: 'dingtalk',
                  name: '',
                  webhook_url: '',
                  secret: '',
                  notes: '',
                })
                setCreateDialogOpen(true)
              }}
            >
              <Plus className='mr-2 h-4 w-4' />
              添加配置
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className='space-y-3'>
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className='h-32 w-full' />
            ))}
          </div>
        ) : configs.length === 0 ? (
          <Card>
            <CardContent className='flex h-32 items-center justify-center'>
              <p className='text-muted-foreground'>暂无机器人配置</p>
            </CardContent>
          </Card>
        ) : (
          <div className='grid gap-4 md:grid-cols-2'>
            {configs.map((config) => (
              <Card key={config.id}>
                <CardHeader className='pb-2'>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      <MessageSquare className='text-muted-foreground h-5 w-5' />
                      <CardTitle className='text-base'>{config.name}</CardTitle>
                      <Badge variant='outline'>
                        {getPlatformLabel(config.platform)}
                      </Badge>
                    </div>
                    <div className='flex gap-2'>
                      <Badge
                        variant={config.is_verified ? 'default' : 'secondary'}
                        className='gap-1'
                      >
                        {config.is_verified ? (
                          <ShieldCheck className='h-3 w-3' />
                        ) : (
                          <ShieldAlert className='h-3 w-3' />
                        )}
                        {config.is_verified ? '已验证' : '未验证'}
                      </Badge>
                      <Badge
                        variant={config.is_active ? 'outline' : 'secondary'}
                      >
                        {config.is_active ? (
                          <CheckCircle className='mr-1 h-3 w-3 text-green-500' />
                        ) : (
                          <XCircle className='mr-1 h-3 w-3' />
                        )}
                        {config.is_active ? '启用' : '禁用'}
                      </Badge>
                    </div>
                  </div>
                  <CardDescription>
                    {config.notes ||
                      PLATFORM_CONFIG[config.platform]?.description ||
                      '群机器人'}
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-3'>
                  <div>
                    <p className='text-muted-foreground mb-1 text-xs'>
                      Webhook URL
                    </p>
                    <code className='text-muted-foreground break-all text-xs'>
                      {config.webhook_url_masked}
                    </code>
                  </div>
                  <div>
                    <p className='text-muted-foreground mb-1 text-xs'>
                      签名密钥
                    </p>
                    <SecretDisplay maskedKey={config.secret_masked} />
                  </div>
                  <div className='flex gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => handleEdit(config)}
                    >
                      <Pencil className='mr-1 h-3 w-3' />
                      编辑
                    </Button>
                    <Button
                      variant='ghost'
                      size='sm'
                      className='text-destructive hover:text-destructive'
                      onClick={() => {
                        setSelectedConfig(config)
                        setDeleteDialogOpen(true)
                      }}
                    >
                      <Trash2 className='mr-1 h-3 w-3' />
                      删除
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 创建配置对话框 */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className='max-w-lg'>
          <DialogHeader>
            <DialogTitle>添加机器人配置</DialogTitle>
            <DialogDescription>
              配置钉钉/飞书群机器人的 Webhook URL 和签名密钥。
              <span className='text-destructive font-medium'>
                必须先通过测试验证才能保存。
              </span>
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
              <FormField
                control={form.control}
                name='platform'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>平台</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value: RobotPlatform) => {
                        field.onChange(value)
                        handlePlatformChange(value)
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='选择平台' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='dingtalk'>钉钉</SelectItem>
                        <SelectItem value='feishu'>飞书</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>名称</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='例如：测试群机器人' />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='webhook_url'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Webhook URL</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={platformConfig.webhookPlaceholder}
                        className='font-mono text-sm'
                        onChange={(e) => {
                          field.onChange(e)
                          handleFieldChange()
                        }}
                      />
                    </FormControl>
                    <FormDescription>{platformConfig.webhookHint}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='secret'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>签名密钥 (Secret)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='password'
                        placeholder={
                          selectedPlatform === 'dingtalk' ? 'SEC...' : '密钥'
                        }
                        className='font-mono'
                        onChange={(e) => {
                          field.onChange(e)
                          handleFieldChange()
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      机器人安全设置中的加签密钥
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='notes'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>备注（可选）</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder='输入备注' rows={2} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 验证状态提示 */}
              <div
                className={cn(
                  'flex items-center gap-2 rounded-lg border p-3',
                  isVerified
                    ? 'border-green-500 bg-green-50 dark:bg-green-950'
                    : 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950'
                )}
              >
                {isVerified ? (
                  <>
                    <ShieldCheck className='h-5 w-5 text-green-500' />
                    <span className='text-sm text-green-700 dark:text-green-300'>
                      验证通过，可以保存配置
                    </span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className='h-5 w-5 text-yellow-500' />
                    <span className='text-sm text-yellow-700 dark:text-yellow-300'>
                      请先点击「测试连接」验证配置
                    </span>
                  </>
                )}
              </div>

              <DialogFooter className='gap-2'>
                <Button
                  variant='outline'
                  type='button'
                  onClick={() => setCreateDialogOpen(false)}
                >
                  取消
                </Button>
                <Button
                  variant='secondary'
                  type='button'
                  onClick={handleTest}
                  disabled={testWebhook.isPending}
                >
                  <TestTube
                    className={cn(
                      'mr-2 h-4 w-4',
                      testWebhook.isPending && 'animate-pulse'
                    )}
                  />
                  {testWebhook.isPending ? '测试中...' : '测试连接'}
                </Button>
                <Button
                  type='submit'
                  disabled={createConfig.isPending || !isVerified}
                >
                  {createConfig.isPending ? '保存中...' : '保存'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* 编辑配置对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className='max-w-lg'>
          <DialogHeader>
            <DialogTitle>编辑机器人配置</DialogTitle>
            <DialogDescription>
              修改机器人配置。Webhook URL 和密钥留空表示不修改。
              <span className='text-destructive font-medium'>
                如果修改了 Webhook 或密钥，将自动重新验证。
              </span>
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit(onEditSubmit)}
              className='space-y-4'
            >
              <FormField
                control={editForm.control}
                name='platform'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>平台</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='dingtalk'>钉钉</SelectItem>
                        <SelectItem value='feishu'>飞书</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      平台类型不可更改，如需更改请删除后重新创建
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>名称</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='例如：测试群机器人' />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name='webhook_url'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Webhook URL</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder='留空表示不修改'
                        className='font-mono text-sm'
                      />
                    </FormControl>
                    <FormDescription>
                      当前: {editingConfig?.webhook_url_masked}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name='secret'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>签名密钥 (Secret)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='password'
                        placeholder='留空表示不修改'
                        className='font-mono'
                      />
                    </FormControl>
                    <FormDescription>
                      当前: {editingConfig?.secret_masked}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name='is_active'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
                    <div className='space-y-0.5'>
                      <FormLabel>启用状态</FormLabel>
                      <FormDescription>是否启用此机器人配置</FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name='notes'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>备注（可选）</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder='输入备注' rows={2} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  variant='outline'
                  type='button'
                  onClick={() => setEditDialogOpen(false)}
                >
                  取消
                </Button>
                <Button type='submit' disabled={updateConfig.isPending}>
                  {updateConfig.isPending ? '保存中...' : '保存'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <ConfirmDialog
        destructive
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        handleConfirm={handleDelete}
        isLoading={deleteConfig.isPending}
        className='max-w-md'
        title={`删除机器人配置: ${selectedConfig?.name}?`}
        desc={
          <>
            您即将删除{getPlatformLabel(selectedConfig?.platform as RobotPlatform)}机器人配置{' '}
            <strong>{selectedConfig?.name}</strong>。
            <br />
            此操作无法撤销。
          </>
        }
        confirmText='删除'
      />
    </div>
  )
}
