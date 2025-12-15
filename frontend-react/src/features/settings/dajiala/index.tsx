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
  Zap,
  Eye,
  EyeOff,
  Star,
  Pencil,
  Wallet,
  Download,
  Loader2,
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
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ConfigDrawer } from '@/components/config-drawer'

/** 极致了配置类型 */
interface DajialaConfig {
  id: number
  name: string
  api_key_masked: string
  verify_code_masked: string | null
  test_biz: string | null
  is_active: boolean
  is_default: boolean
  last_verified_at: string | null
  remain_money: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

// Query Keys
const dajialaKeys = {
  all: ['dajiala-configs'] as const,
  list: () => [...dajialaKeys.all, 'list'] as const,
}

// 获取极致了配置列表
function useDajialaConfigs() {
  return useQuery({
    queryKey: dajialaKeys.list(),
    queryFn: async () => {
      const response =
        await apiClient.get<ApiResponse<DajialaConfig[]>>('/dajiala-configs')
      return response.data.data
    },
  })
}

// 创建极致了配置
function useCreateDajialaConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      name: string
      api_key: string
      verify_code?: string
      test_biz?: string
      is_active?: boolean
      is_default?: boolean
      notes?: string
    }) => {
      const response = await apiClient.post<ApiResponse<DajialaConfig>>(
        '/dajiala-configs',
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dajialaKeys.all })
    },
  })
}

// 更新极致了配置
function useUpdateDajialaConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number
      data: {
        name?: string
        api_key?: string
        verify_code?: string
        test_biz?: string
        is_active?: boolean
        is_default?: boolean
        notes?: string
      }
    }) => {
      const response = await apiClient.put<ApiResponse<DajialaConfig>>(
        `/dajiala-configs/${id}`,
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dajialaKeys.all })
    },
  })
}

// 删除极致了配置
function useDeleteDajialaConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/dajiala-configs/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dajialaKeys.all })
    },
  })
}

// 验证极致了配置
function useVerifyDajialaConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const response = await apiClient.post<
        ApiResponse<{
          success: boolean
          config: DajialaConfig
          remain_money?: number
        }>
      >(`/dajiala-configs/${id}/verify`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dajialaKeys.all })
    },
  })
}

// 采集文章结果
interface FetchArticlesResult {
  total_fetched: number
  total_saved: number
  total_skipped: number
  account_name: string | null
  account_biz: string | null
  remain_money: number | null
}

// 采集公众号文章
function useFetchArticles() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      configId,
      data,
    }: {
      configId: number
      data: { biz?: string; url?: string; name?: string; pages: number }
    }) => {
      const response = await apiClient.post<ApiResponse<FetchArticlesResult>>(
        `/wechat-articles/fetch`,
        data,
        { params: { config_id: configId } }
      )
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dajialaKeys.all })
    },
  })
}

const formSchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  api_key: z.string().min(1, 'API 密钥不能为空'),
  verify_code: z.string().optional(),
  test_biz: z.string().optional(),
  is_active: z.boolean(),
  is_default: z.boolean(),
  notes: z.string().optional(),
})

type DajialaConfigForm = z.infer<typeof formSchema>

const fetchFormSchema = z.object({
  biz: z.string().optional(),
  url: z.string().optional(),
  name: z.string().optional(),
  pages: z.coerce.number().min(1, '至少采集 1 页').max(100, '最多采集 100 页'),
}).refine((data) => data.biz || data.url || data.name, {
  message: '请填写公众号 biz、文章链接或公众号名称中的任意一项',
  path: ['biz'],
})

type FetchForm = z.infer<typeof fetchFormSchema>

/** 密钥显示组件 */
function CredentialDisplay({
  label,
  value,
}: {
  label: string
  value: string | null
}) {
  const [visible, setVisible] = useState(false)

  if (!value) return null

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

export function DajialaSettings() {
  const {
    data: configs = [],
    isLoading,
    refetch,
    isRefetching,
  } = useDajialaConfigs()

  const createConfig = useCreateDajialaConfig()
  const updateConfig = useUpdateDajialaConfig()
  const deleteConfig = useDeleteDajialaConfig()
  const verifyConfig = useVerifyDajialaConfig()
  const fetchArticlesMutation = useFetchArticles()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [fetchDialogOpen, setFetchDialogOpen] = useState(false)
  const [selectedConfig, setSelectedConfig] = useState<DajialaConfig | null>(
    null
  )
  const [editingConfig, setEditingConfig] = useState<DajialaConfig | null>(null)
  const [fetchingConfig, setFetchingConfig] = useState<DajialaConfig | null>(null)
  const [verifyingId, setVerifyingId] = useState<number | null>(null)

  const form = useForm<DajialaConfigForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      api_key: '',
      verify_code: '',
      test_biz: '',
      is_active: true,
      is_default: false,
      notes: '',
    },
  })

  const editForm = useForm<DajialaConfigForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      api_key: '',
      verify_code: '',
      test_biz: '',
      is_active: true,
      is_default: false,
      notes: '',
    },
  })

  const fetchForm = useForm<FetchForm>({
    resolver: zodResolver(fetchFormSchema),
    defaultValues: {
      biz: '',
      url: '',
      name: '',
      pages: 1,
    },
  })

  const onSubmit = async (data: DajialaConfigForm) => {
    try {
      await createConfig.mutateAsync({
        name: data.name,
        api_key: data.api_key,
        verify_code: data.verify_code || undefined,
        test_biz: data.test_biz || undefined,
        is_active: data.is_active,
        is_default: data.is_default,
        notes: data.notes || undefined,
      })
      toast.success('极致了配置创建成功，密钥已验证')
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
      toast.success('极致了配置删除成功')
      setDeleteDialogOpen(false)
      setSelectedConfig(null)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '删除失败，请重试'
      toast.error(message)
    }
  }

  const handleVerify = async (config: DajialaConfig) => {
    setVerifyingId(config.id)
    try {
      const result = await verifyConfig.mutateAsync(config.id)
      if (result.data?.success) {
        toast.success(
          `验证成功，余额: ¥${result.data.remain_money?.toFixed(2) || '未知'}`
        )
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

  const handleSetDefault = async (config: DajialaConfig) => {
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

  const handleOpenEditDialog = (config: DajialaConfig) => {
    setEditingConfig(config)
    editForm.reset({
      name: config.name,
      api_key: '', // 编辑时不显示原密钥，需要重新输入
      verify_code: '',
      test_biz: config.test_biz || '',
      is_active: config.is_active,
      is_default: config.is_default,
      notes: config.notes || '',
    })
    setEditDialogOpen(true)
  }

  const handleOpenFetchDialog = (config: DajialaConfig) => {
    setFetchingConfig(config)
    fetchForm.reset({
      biz: '',
      url: '',
      name: '',
      pages: 1,
    })
    setFetchDialogOpen(true)
  }

  const onFetchSubmit = async (data: FetchForm) => {
    if (!fetchingConfig) return
    try {
      const result = await fetchArticlesMutation.mutateAsync({
        configId: fetchingConfig.id,
        data: {
          biz: data.biz || undefined,
          url: data.url || undefined,
          name: data.name || undefined,
          pages: data.pages,
        },
      })
      if (result.data) {
        toast.success(
          `采集完成：获取 ${result.data.total_fetched} 篇，保存 ${result.data.total_saved} 篇，跳过 ${result.data.total_skipped} 篇`
        )
      }
      setFetchDialogOpen(false)
      setFetchingConfig(null)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '采集失败，请重试'
      toast.error(message)
    }
  }

  const onEditSubmit = async (data: DajialaConfigForm) => {
    if (!editingConfig) return
    try {
      const updateData: Record<string, unknown> = {
        name: data.name,
        is_active: data.is_active,
        is_default: data.is_default,
        notes: data.notes || undefined,
        test_biz: data.test_biz || undefined,
      }

      // 只有填写了新密钥才更新
      if (data.api_key) {
        updateData.api_key = data.api_key
        if (data.verify_code) {
          updateData.verify_code = data.verify_code
        }
      }

      await updateConfig.mutateAsync({
        id: editingConfig.id,
        data: updateData,
      })
      toast.success('极致了配置更新成功')
      setEditDialogOpen(false)
      setEditingConfig(null)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '更新失败，请检查密钥是否正确'
      toast.error(message)
    }
  }

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('zh-CN')
  }

  return (
    <>
      <Header fixed>
        <Search />
        <div className='ms-auto flex items-center space-x-4'>
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main>
        <div className='mb-2 flex flex-wrap items-end justify-between gap-4'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>极致了配置</h2>
            <p className='text-muted-foreground'>
              管理极致了微信公众号数据采集服务的 API 密钥配置。
            </p>
          </div>
        </div>
        <Separator className='my-4' />

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
                <p className='text-muted-foreground'>暂无极致了配置</p>
              </CardContent>
            </Card>
          ) : (
            <div className='grid gap-4 md:grid-cols-2'>
              {configs.map((config) => (
                <Card key={config.id}>
                  <CardHeader className='pb-2'>
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-2'>
                        <Zap className='text-muted-foreground h-5 w-5' />
                        <CardTitle className='text-base'>
                          {config.name}
                        </CardTitle>
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
                      <span className='text-muted-foreground/70'>
                        #{config.id}
                      </span>
                      {config.remain_money !== null && (
                        <>
                          <span className='text-muted-foreground/50'>·</span>
                          <span className='flex items-center gap-1 text-green-600'>
                            <Wallet className='h-3 w-3' />¥
                            {config.remain_money.toFixed(2)}
                          </span>
                        </>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className='space-y-3'>
                    <div className='space-y-1'>
                      <CredentialDisplay
                        label='API Key'
                        value={config.api_key_masked}
                      />
                      <CredentialDisplay
                        label='附加码'
                        value={config.verify_code_masked}
                      />
                      {config.test_biz && (
                        <div className='flex items-center justify-between'>
                          <span className='text-muted-foreground text-xs'>
                            测试 Biz:
                          </span>
                          <code className='bg-muted rounded px-2 py-0.5 font-mono text-xs'>
                            {config.test_biz}
                          </code>
                        </div>
                      )}
                    </div>
                    <div className='text-muted-foreground text-xs'>
                      上次验证: {formatDateTime(config.last_verified_at)}
                    </div>
                    {config.notes && (
                      <div className='text-muted-foreground text-xs'>
                        备注: {config.notes}
                      </div>
                    )}
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
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => handleOpenFetchDialog(config)}
                      >
                        <Download className='mr-1 h-3 w-3' />
                        采集文章
                      </Button>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => handleOpenEditDialog(config)}
                      >
                        <Pencil className='mr-1 h-3 w-3' />
                        编辑
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
      </Main>

      {/* 创建配置对话框 */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className='max-w-lg'>
          <DialogHeader>
            <DialogTitle>添加极致了配置</DialogTitle>
            <DialogDescription>
              配置极致了微信公众号数据采集服务的 API
              密钥。保存前会自动验证密钥有效性。
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
                      <Input {...field} placeholder='例如：主账号' />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='api_key'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      API 密钥 <span className='text-destructive'>*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='password'
                        placeholder='请输入 API Key'
                        className='font-mono'
                      />
                    </FormControl>
                    <FormDescription>
                      在极致了平台获取的 API 密钥
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='verify_code'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>附加码（可选）</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='password'
                        placeholder='如设置了附加码，请输入'
                        className='font-mono'
                      />
                    </FormControl>
                    <FormDescription>
                      如果在极致了平台设置了附加码，需要填写
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='test_biz'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>测试公众号 Biz（可选）</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder='用于验证的公众号 biz，如：MjM5MjAxNjM0MA=='
                        className='font-mono'
                      />
                    </FormControl>
                    <FormDescription>
                      用于验证密钥时的测试公众号，留空使用默认值
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

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

      {/* 编辑配置对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className='max-w-lg'>
          <DialogHeader>
            <DialogTitle>编辑极致了配置</DialogTitle>
            <DialogDescription>
              修改极致了配置信息。如需更新密钥，请填写新的密钥。
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit(onEditSubmit)}
              className='space-y-4'
            >
              <FormField
                control={editForm.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>名称</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='例如：主账号' />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name='api_key'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API 密钥</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='password'
                        placeholder='留空保持原密钥不变'
                        className='font-mono'
                      />
                    </FormControl>
                    <FormDescription>
                      如需更新密钥请填写，否则留空
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name='verify_code'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>附加码（可选）</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='password'
                        placeholder='如设置了附加码，请输入'
                        className='font-mono'
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name='test_biz'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>测试公众号 Biz（可选）</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder='用于验证的公众号 biz'
                        className='font-mono'
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className='flex items-center gap-6'>
                <FormField
                  control={editForm.control}
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
                  control={editForm.control}
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
                  {updateConfig.isPending ? '保存中...' : '保存更改'}
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
        title={`删除极致了配置: ${selectedConfig?.name}?`}
        desc={
          <>
            您即将删除极致了配置 <strong>{selectedConfig?.name}</strong>。
            <br />
            此操作无法撤销。
          </>
        }
        confirmText='删除'
      />

      {/* 采集文章对话框 */}
      <Dialog open={fetchDialogOpen} onOpenChange={setFetchDialogOpen}>
        <DialogContent className='max-w-lg'>
          <DialogHeader>
            <DialogTitle>采集公众号文章</DialogTitle>
            <DialogDescription>
              使用配置 "{fetchingConfig?.name}" 采集公众号历史文章。
              请填写公众号 biz、文章链接或公众号名称中的任意一项。
            </DialogDescription>
          </DialogHeader>
          <Form {...fetchForm}>
            <form
              onSubmit={fetchForm.handleSubmit(onFetchSubmit)}
              className='space-y-4'
            >
              <FormField
                control={fetchForm.control}
                name='biz'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>公众号 Biz</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder='例如：MjM5MjAxNjM0MA=='
                        className='font-mono'
                      />
                    </FormControl>
                    <FormDescription>
                      公众号的唯一标识，可从公众号文章链接中获取
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={fetchForm.control}
                name='url'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>文章链接</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='粘贴公众号文章链接' />
                    </FormControl>
                    <FormDescription>
                      任意一篇该公众号的文章链接，系统会自动提取公众号信息
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={fetchForm.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>公众号名称</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='例如：人民日报' />
                    </FormControl>
                    <FormDescription>
                      公众号的名称，需要精确匹配
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={fetchForm.control}
                name='pages'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>采集页数</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='number'
                        min={1}
                        max={100}
                        className='w-24'
                      />
                    </FormControl>
                    <FormDescription>
                      每页约 10 篇文章，建议先采集 1-2 页测试
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  variant='outline'
                  type='button'
                  onClick={() => setFetchDialogOpen(false)}
                >
                  取消
                </Button>
                <Button type='submit' disabled={fetchArticlesMutation.isPending}>
                  {fetchArticlesMutation.isPending ? (
                    <>
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      采集中...
                    </>
                  ) : (
                    <>
                      <Download className='mr-2 h-4 w-4' />
                      开始采集
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  )
}
