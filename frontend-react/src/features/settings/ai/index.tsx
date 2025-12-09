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
  Bot,
  Eye,
  EyeOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import apiClient from '@/lib/api-client'
import type { ApiResponse } from '@/lib/types'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

/** AI 配置类型 */
interface AiConfig {
  id: number
  name: string
  provider: string
  base_url: string
  api_key_masked: string
  default_model: string | null
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

// Query Keys
const aiKeys = {
  all: ['ai-configs'] as const,
  list: () => [...aiKeys.all, 'list'] as const,
  presets: () => [...aiKeys.all, 'presets'] as const,
}

// 获取 AI 配置列表
function useAiConfigs() {
  return useQuery({
    queryKey: aiKeys.list(),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<AiConfig[]>>(
        '/ai-configs'
      )
      return response.data.data
    },
  })
}

// 获取预设配置
function useProviderPresets() {
  return useQuery({
    queryKey: aiKeys.presets(),
    queryFn: async () => {
      const response = await apiClient.get<
        ApiResponse<Record<string, { base_url: string; models: string[] }>>
      >('/ai-configs/presets')
      return response.data.data
    },
  })
}

// 创建 AI 配置
function useCreateAiConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      name: string
      provider: string
      base_url: string
      api_key: string
      default_model?: string
      notes?: string
    }) => {
      const response = await apiClient.post<ApiResponse<AiConfig>>(
        '/ai-configs',
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiKeys.all })
    },
  })
}

// 删除 AI 配置
function useDeleteAiConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/ai-configs/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiKeys.all })
    },
  })
}

// 测试 AI 配置
function useTestAiConfig() {
  return useMutation({
    mutationFn: async (id: number) => {
      const response = await apiClient.post<
        ApiResponse<{ status: string; error?: string }>
      >(`/ai-configs/${id}/test`)
      return response.data
    },
  })
}

const providerOptions = [
  { value: 'kimi', label: 'Kimi (月之暗面)' },
  { value: 'deepseek', label: 'DeepSeek (深度求索)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'other', label: '其他' },
]

const formSchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  provider: z.string().min(1, '请选择提供商'),
  base_url: z.string().url('请输入有效的 URL'),
  api_key: z.string().min(1, 'API 密钥不能为空'),
  default_model: z.string().optional(),
  notes: z.string().optional(),
})

type AiConfigForm = z.infer<typeof formSchema>

/** API 密钥显示组件 */
function ApiKeyDisplay({ maskedKey }: { maskedKey: string }) {
  const [visible, setVisible] = useState(false)
  const displayKey = visible ? maskedKey : maskedKey.slice(0, 8) + '••••••••'

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

export function AiSettings() {
  const { data: configs = [], isLoading, refetch, isRefetching } = useAiConfigs()
  const { data: presets = {} } = useProviderPresets()

  const createConfig = useCreateAiConfig()
  const deleteConfig = useDeleteAiConfig()
  const testConfig = useTestAiConfig()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedConfig, setSelectedConfig] = useState<AiConfig | null>(null)
  const [testingId, setTestingId] = useState<number | null>(null)

  const form = useForm<AiConfigForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      provider: '',
      base_url: '',
      api_key: '',
      default_model: '',
      notes: '',
    },
  })

  const selectedProvider = form.watch('provider')

  // 当选择提供商时自动填充 base_url
  const handleProviderChange = (provider: string) => {
    form.setValue('provider', provider)
    const preset = presets[provider]
    if (preset?.base_url) {
      form.setValue('base_url', preset.base_url)
    }
  }

  const onSubmit = async (data: AiConfigForm) => {
    try {
      await createConfig.mutateAsync(data)
      toast.success('AI 配置创建成功')
      setCreateDialogOpen(false)
      form.reset()
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '创建失败，请重试'
      toast.error(message)
    }
  }

  const handleDelete = async () => {
    if (!selectedConfig) return
    try {
      await deleteConfig.mutateAsync(selectedConfig.id)
      toast.success('AI 配置删除成功')
      setDeleteDialogOpen(false)
      setSelectedConfig(null)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '删除失败，请重试'
      toast.error(message)
    }
  }

  const handleTest = async (config: AiConfig) => {
    setTestingId(config.id)
    try {
      const result = await testConfig.mutateAsync(config.id)
      if (result.data?.status === 'success') {
        toast.success('连接测试成功')
      } else {
        toast.error(`测试失败: ${result.data?.error || result.message}`)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '测试失败'
      toast.error(message)
    } finally {
      setTestingId(null)
    }
  }

  return (
    <div className='flex flex-1 flex-col'>
      <div className='flex-none'>
        <h3 className='text-lg font-medium'>AI 配置</h3>
        <p className='text-muted-foreground text-sm'>
          管理 Kimi、DeepSeek 等 AI 服务的 API 密钥配置。
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
            <Button size='sm' onClick={() => setCreateDialogOpen(true)}>
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
              <p className='text-muted-foreground'>暂无 AI 配置</p>
            </CardContent>
          </Card>
        ) : (
          <div className='grid gap-4 md:grid-cols-2'>
            {configs.map((config) => (
              <Card key={config.id}>
                <CardHeader className='pb-2'>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      <Bot className='text-muted-foreground h-5 w-5' />
                      <CardTitle className='text-base'>{config.name}</CardTitle>
                    </div>
                    <Badge
                      variant={config.is_active ? 'default' : 'secondary'}
                    >
                      {config.is_active ? (
                        <CheckCircle className='mr-1 h-3 w-3' />
                      ) : (
                        <XCircle className='mr-1 h-3 w-3' />
                      )}
                      {config.is_active ? '启用' : '禁用'}
                    </Badge>
                  </div>
                  <CardDescription>
                    {providerOptions.find((p) => p.value === config.provider)
                      ?.label || config.provider}
                    {config.default_model && ` · ${config.default_model}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-3'>
                  <div>
                    <p className='text-muted-foreground mb-1 text-xs'>API 密钥</p>
                    <ApiKeyDisplay maskedKey={config.api_key_masked} />
                  </div>
                  <div>
                    <p className='text-muted-foreground mb-1 text-xs'>Base URL</p>
                    <code className='text-muted-foreground text-xs'>
                      {config.base_url}
                    </code>
                  </div>
                  <div className='flex gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => handleTest(config)}
                      disabled={testingId === config.id}
                    >
                      <TestTube
                        className={cn(
                          'mr-1 h-3 w-3',
                          testingId === config.id && 'animate-pulse'
                        )}
                      />
                      测试连接
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
            <DialogTitle>添加 AI 配置</DialogTitle>
            <DialogDescription>
              配置 AI 服务的 API 密钥和端点。
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className='space-y-4'
            >
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>名称</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='例如：Kimi 主账号' />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='provider'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>提供商</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={handleProviderChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='选择 AI 提供商' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {providerOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='base_url'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Base URL</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder='https://api.example.com/v1'
                        className='font-mono text-sm'
                      />
                    </FormControl>
                    <FormDescription>API 端点地址</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='api_key'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API 密钥</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='password'
                        placeholder='sk-xxx'
                        className='font-mono'
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='default_model'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>默认模型（可选）</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={
                          selectedProvider === 'kimi'
                            ? 'moonshot-v1-8k'
                            : selectedProvider === 'deepseek'
                              ? 'deepseek-chat'
                              : '模型名称'
                        }
                      />
                    </FormControl>
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

              <DialogFooter>
                <Button
                  variant='outline'
                  type='button'
                  onClick={() => setCreateDialogOpen(false)}
                >
                  取消
                </Button>
                <Button type='submit' disabled={createConfig.isPending}>
                  {createConfig.isPending ? '创建中...' : '创建'}
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
        title={`删除 AI 配置: ${selectedConfig?.name}?`}
        desc={
          <>
            您即将删除 AI 配置 <strong>{selectedConfig?.name}</strong>。
            <br />
            此操作无法撤销。
          </>
        }
        confirmText='删除'
      />
    </div>
  )
}
