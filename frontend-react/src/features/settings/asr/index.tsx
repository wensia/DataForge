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
  Mic,
  Eye,
  EyeOff,
  Star,
  ExternalLink,
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
import { Switch } from '@/components/ui/switch'
import { ConfirmDialog } from '@/components/confirm-dialog'

/** ASR 配置类型 */
interface AsrConfig {
  id: number
  provider: string
  name: string
  credentials: Record<string, string>
  is_active: boolean
  is_default: boolean
  last_verified_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/** 提供商字段定义 */
interface ProviderField {
  key: string
  label: string
  required: boolean
  default?: string
  hint?: string
}

/** 提供商预设 */
interface ProviderPreset {
  name: string
  fields: ProviderField[]
  doc_url: string
}

// Query Keys
const asrKeys = {
  all: ['asr-configs'] as const,
  list: () => [...asrKeys.all, 'list'] as const,
  presets: () => [...asrKeys.all, 'presets'] as const,
}

// 获取 ASR 配置列表
function useAsrConfigs() {
  return useQuery({
    queryKey: asrKeys.list(),
    queryFn: async () => {
      const response =
        await apiClient.get<ApiResponse<AsrConfig[]>>('/asr-configs')
      return response.data.data
    },
  })
}

// 获取预设配置
function useProviderPresets() {
  return useQuery({
    queryKey: asrKeys.presets(),
    queryFn: async () => {
      const response = await apiClient.get<
        ApiResponse<Record<string, ProviderPreset>>
      >('/asr-configs/presets')
      return response.data.data
    },
  })
}

// 创建 ASR 配置
function useCreateAsrConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      name: string
      provider: string
      credentials: Record<string, string>
      is_active?: boolean
      is_default?: boolean
      notes?: string
    }) => {
      const response = await apiClient.post<ApiResponse<AsrConfig>>(
        '/asr-configs',
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: asrKeys.all })
    },
  })
}

// 更新 ASR 配置
function useUpdateAsrConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number
      data: {
        name?: string
        credentials?: Record<string, string>
        is_active?: boolean
        is_default?: boolean
        notes?: string
      }
    }) => {
      const response = await apiClient.put<ApiResponse<AsrConfig>>(
        `/asr-configs/${id}`,
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: asrKeys.all })
    },
  })
}

// 删除 ASR 配置
function useDeleteAsrConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/asr-configs/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: asrKeys.all })
    },
  })
}

// 验证 ASR 配置
function useVerifyAsrConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const response = await apiClient.post<
        ApiResponse<{ success: boolean; config: AsrConfig; detail?: unknown }>
      >(`/asr-configs/${id}/verify`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: asrKeys.all })
    },
  })
}

const providerOptions = [
  { value: 'tencent', label: '腾讯云 ASR' },
  { value: 'alibaba', label: '阿里云智能语音' },
  { value: 'volcengine', label: '火山引擎 ASR' },
]

const formSchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  provider: z.string().min(1, '请选择提供商'),
  credentials: z.partialRecord(z.string(), z.string()),
  is_active: z.boolean(),
  is_default: z.boolean(),
  notes: z.string().optional(),
})

type AsrConfigForm = z.infer<typeof formSchema>

/** 密钥显示组件 */
function CredentialDisplay({
  label,
  value,
}: {
  label: string
  value: string
}) {
  const [visible, setVisible] = useState(false)
  const displayValue = visible ? value : value.slice(0, 4) + '••••••••'

  return (
    <div className='flex items-center justify-between'>
      <span className='text-muted-foreground text-xs'>{label}:</span>
      <div className='flex items-center gap-2'>
        <code className='bg-muted rounded px-2 py-0.5 font-mono text-xs'>
          {displayValue}
        </code>
        <Button
          variant='ghost'
          size='icon'
          className='h-5 w-5'
          onClick={() => setVisible(!visible)}
        >
          {visible ? (
            <EyeOff className='h-3 w-3' />
          ) : (
            <Eye className='h-3 w-3' />
          )}
        </Button>
      </div>
    </div>
  )
}

export function AsrSettings() {
  const {
    data: configs = [],
    isLoading,
    refetch,
    isRefetching,
  } = useAsrConfigs()
  const { data: presets = {} } = useProviderPresets()

  const createConfig = useCreateAsrConfig()
  const updateConfig = useUpdateAsrConfig()
  const deleteConfig = useDeleteAsrConfig()
  const verifyConfig = useVerifyAsrConfig()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedConfig, setSelectedConfig] = useState<AsrConfig | null>(null)
  const [verifyingId, setVerifyingId] = useState<number | null>(null)

  const form = useForm<AsrConfigForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      provider: '',
      credentials: {},
      is_active: true,
      is_default: false,
      notes: '',
    },
  })

  const selectedProvider = form.watch('provider')
  const currentPreset = presets[selectedProvider]

  // 当选择提供商时重置 credentials
  const handleProviderChange = (provider: string) => {
    form.setValue('provider', provider)
    const preset = presets[provider]
    if (preset) {
      const defaultCredentials: Record<string, string> = {}
      preset.fields.forEach((field) => {
        defaultCredentials[field.key] = field.default || ''
      })
      form.setValue('credentials', defaultCredentials)
    }
  }

  const onSubmit = async (data: AsrConfigForm) => {
    try {
      // 过滤掉空值的 credentials
      const filteredCredentials: Record<string, string> = {}
      for (const [key, value] of Object.entries(data.credentials)) {
        if (value && value.trim()) {
          filteredCredentials[key] = value
        }
      }
      await createConfig.mutateAsync({
        ...data,
        credentials: filteredCredentials,
      })
      toast.success('ASR 配置创建成功，密钥已验证')
      setCreateDialogOpen(false)
      form.reset()
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '创建失败，请检查密钥是否正确'
      toast.error(message)
    }
  }

  const handleDelete = async () => {
    if (!selectedConfig) return
    try {
      await deleteConfig.mutateAsync(selectedConfig.id)
      toast.success('ASR 配置删除成功')
      setDeleteDialogOpen(false)
      setSelectedConfig(null)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '删除失败，请重试'
      toast.error(message)
    }
  }

  const handleVerify = async (config: AsrConfig) => {
    setVerifyingId(config.id)
    try {
      const result = await verifyConfig.mutateAsync(config.id)
      if (result.data?.success) {
        toast.success('密钥验证成功')
      } else {
        toast.error(`验证失败: ${result.message}`)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '验证失败'
      toast.error(message)
    } finally {
      setVerifyingId(null)
    }
  }

  const handleSetDefault = async (config: AsrConfig) => {
    try {
      await updateConfig.mutateAsync({
        id: config.id,
        data: { is_default: true },
      })
      toast.success('已设为默认配置')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '设置失败'
      toast.error(message)
    }
  }

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('zh-CN')
  }

  return (
    <div className='flex flex-1 flex-col'>
      <div className='flex-none'>
        <h3 className='text-lg font-medium'>ASR 语音识别配置</h3>
        <p className='text-muted-foreground text-sm'>
          管理腾讯云、阿里云、火山引擎等 ASR 服务的 API 密钥配置。
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
              <Skeleton key={i} className='h-40 w-full' />
            ))}
          </div>
        ) : configs.length === 0 ? (
          <Card>
            <CardContent className='flex h-32 items-center justify-center'>
              <p className='text-muted-foreground'>暂无 ASR 配置</p>
            </CardContent>
          </Card>
        ) : (
          <div className='grid gap-4 md:grid-cols-2'>
            {configs.map((config) => (
              <Card key={config.id}>
                <CardHeader className='pb-2'>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      <Mic className='text-muted-foreground h-5 w-5' />
                      <CardTitle className='text-base'>{config.name}</CardTitle>
                      {config.is_default && (
                        <Badge variant='secondary' className='text-xs'>
                          <Star className='mr-1 h-3 w-3' />
                          默认
                        </Badge>
                      )}
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
                  <CardDescription className='flex items-center gap-2'>
                    {providerOptions.find((p) => p.value === config.provider)
                      ?.label || config.provider}
                    {presets[config.provider]?.doc_url && (
                      <a
                        href={presets[config.provider].doc_url}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-primary hover:underline'
                      >
                        <ExternalLink className='h-3 w-3' />
                      </a>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-3'>
                  <div className='space-y-1'>
                    {Object.entries(config.credentials).map(([key, value]) => (
                      <CredentialDisplay
                        key={key}
                        label={
                          presets[config.provider]?.fields.find(
                            (f) => f.key === key
                          )?.label || key
                        }
                        value={value}
                      />
                    ))}
                  </div>
                  <div className='text-muted-foreground text-xs'>
                    上次验证: {formatDateTime(config.last_verified_at)}
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => handleVerify(config)}
                      disabled={verifyingId === config.id}
                    >
                      <TestTube
                        className={cn(
                          'mr-1 h-3 w-3',
                          verifyingId === config.id && 'animate-pulse'
                        )}
                      />
                      验证密钥
                    </Button>
                    {!config.is_default && (
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => handleSetDefault(config)}
                      >
                        <Star className='mr-1 h-3 w-3' />
                        设为默认
                      </Button>
                    )}
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
            <DialogTitle>添加 ASR 配置</DialogTitle>
            <DialogDescription>
              配置 ASR 语音识别服务的 API 密钥。保存前会自动验证密钥有效性。
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
                      <Input {...field} placeholder='例如：腾讯云 ASR 主账号' />
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
                          <SelectValue placeholder='选择 ASR 提供商' />
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
                    {currentPreset?.doc_url && (
                      <FormDescription>
                        <a
                          href={currentPreset.doc_url}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='text-primary hover:underline'
                        >
                          查看官方文档
                        </a>
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {currentPreset?.fields.map((field) => (
                <FormField
                  key={field.key}
                  control={form.control}
                  name={`credentials.${field.key}`}
                  render={({ field: formField }) => (
                    <FormItem>
                      <FormLabel>
                        {field.label}
                        {field.required && (
                          <span className='text-destructive ml-1'>*</span>
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...formField}
                          type='password'
                          placeholder={field.default || `请输入 ${field.label}`}
                          className='font-mono'
                        />
                      </FormControl>
                      {field.hint && (
                        <FormDescription>{field.hint}</FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}

              <div className='flex items-center gap-6'>
                <FormField
                  control={form.control}
                  name='is_active'
                  render={({ field }) => (
                    <FormItem className='flex items-center gap-2 space-y-0'>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className='font-normal'>启用</FormLabel>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='is_default'
                  render={({ field }) => (
                    <FormItem className='flex items-center gap-2 space-y-0'>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className='font-normal'>设为默认</FormLabel>
                    </FormItem>
                  )}
                />
              </div>

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
                  {createConfig.isPending ? '验证并创建中...' : '验证并创建'}
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
        title={`删除 ASR 配置: ${selectedConfig?.name}?`}
        desc={
          <>
            您即将删除 ASR 配置 <strong>{selectedConfig?.name}</strong>。
            <br />
            此操作无法撤销。
          </>
        }
        confirmText='删除'
      />
    </div>
  )
}
