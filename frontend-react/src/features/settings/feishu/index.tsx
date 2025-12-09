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
  ChevronRight,
  Table2,
  Database,
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
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

/** 飞书客户端类型 */
interface FeishuClient {
  id: number
  name: string
  app_id: string
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

/** 飞书多维表格类型 */
interface FeishuBitable {
  id: number
  client_id: number
  name: string
  app_token: string
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
  client_name: string
  client_app_id: string
  table_count: number
  table_preview: string[]
}

// Query Keys
const feishuKeys = {
  all: ['feishu'] as const,
  clients: () => [...feishuKeys.all, 'clients'] as const,
  bitables: () => [...feishuKeys.all, 'bitables'] as const,
}

// 获取飞书客户端列表
function useFeishuClients() {
  return useQuery({
    queryKey: feishuKeys.clients(),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<FeishuClient[]>>(
        '/feishu/clients'
      )
      return response.data.data
    },
  })
}

// 获取所有多维表格
function useFeishuBitables() {
  return useQuery({
    queryKey: feishuKeys.bitables(),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<FeishuBitable[]>>(
        '/feishu/bitables'
      )
      return response.data.data
    },
  })
}

// 创建飞书客户端
function useCreateClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      name: string
      app_id: string
      app_secret: string
      notes?: string
    }) => {
      const response = await apiClient.post<ApiResponse<FeishuClient>>(
        '/feishu/clients',
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feishuKeys.all })
    },
  })
}

// 删除飞书客户端
function useDeleteClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/feishu/clients/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feishuKeys.all })
    },
  })
}

// 创建多维表格
function useCreateBitable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      client_id: number
      name: string
      app_token: string
      notes?: string
    }) => {
      const response = await apiClient.post<ApiResponse<unknown>>(
        `/feishu/clients/${data.client_id}/bitables`,
        {
          name: data.name,
          app_token: data.app_token,
          notes: data.notes,
        }
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feishuKeys.all })
    },
  })
}

// 删除多维表格
function useDeleteBitable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/feishu/bitables/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feishuKeys.all })
    },
  })
}

// 同步数据表
function useSyncTables() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (bitableId: number) => {
      const response = await apiClient.post<
        ApiResponse<{ added: number; updated: number; deactivated: number }>
      >(`/feishu/bitables/${bitableId}/sync-tables`)
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feishuKeys.all })
    },
  })
}

const clientFormSchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  app_id: z.string().min(1, 'App ID 不能为空'),
  app_secret: z.string().min(1, 'App Secret 不能为空'),
  notes: z.string().optional(),
})

const bitableFormSchema = z.object({
  client_id: z.number().min(1, '请选择客户端'),
  name: z.string().min(1, '名称不能为空'),
  app_token: z.string().min(1, 'App Token 不能为空'),
  notes: z.string().optional(),
})

type ClientForm = z.infer<typeof clientFormSchema>
type BitableForm = z.infer<typeof bitableFormSchema>

export function FeishuSettings() {
  const {
    data: clients = [],
    isLoading: clientsLoading,
    refetch: refetchClients,
    isRefetching: clientsRefetching,
  } = useFeishuClients()
  const {
    data: bitables = [],
    isLoading: bitablesLoading,
    refetch: refetchBitables,
    isRefetching: bitablesRefetching,
  } = useFeishuBitables()

  const createClient = useCreateClient()
  const deleteClient = useDeleteClient()
  const createBitable = useCreateBitable()
  const deleteBitable = useDeleteBitable()
  const syncTables = useSyncTables()

  const [createClientOpen, setCreateClientOpen] = useState(false)
  const [createBitableOpen, setCreateBitableOpen] = useState(false)
  const [deleteClientOpen, setDeleteClientOpen] = useState(false)
  const [deleteBitableOpen, setDeleteBitableOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<FeishuClient | null>(
    null
  )
  const [selectedBitable, setSelectedBitable] = useState<FeishuBitable | null>(
    null
  )
  const [expandedClients, setExpandedClients] = useState<number[]>([])

  const clientForm = useForm<ClientForm>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      name: '',
      app_id: '',
      app_secret: '',
      notes: '',
    },
  })

  const bitableForm = useForm<BitableForm>({
    resolver: zodResolver(bitableFormSchema),
    defaultValues: {
      client_id: 0,
      name: '',
      app_token: '',
      notes: '',
    },
  })

  const onCreateClient = async (data: ClientForm) => {
    try {
      await createClient.mutateAsync(data)
      toast.success('飞书客户端创建成功')
      setCreateClientOpen(false)
      clientForm.reset()
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '创建失败，请重试'
      toast.error(message)
    }
  }

  const onCreateBitable = async (data: BitableForm) => {
    try {
      await createBitable.mutateAsync(data)
      toast.success('多维表格创建成功')
      setCreateBitableOpen(false)
      bitableForm.reset()
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '创建失败，请重试'
      toast.error(message)
    }
  }

  const handleDeleteClient = async () => {
    if (!selectedClient) return
    try {
      await deleteClient.mutateAsync(selectedClient.id)
      toast.success('飞书客户端删除成功')
      setDeleteClientOpen(false)
      setSelectedClient(null)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '删除失败，请重试'
      toast.error(message)
    }
  }

  const handleDeleteBitable = async () => {
    if (!selectedBitable) return
    try {
      await deleteBitable.mutateAsync(selectedBitable.id)
      toast.success('多维表格删除成功')
      setDeleteBitableOpen(false)
      setSelectedBitable(null)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '删除失败，请重试'
      toast.error(message)
    }
  }

  const handleSyncTables = async (bitableId: number) => {
    try {
      const result = await syncTables.mutateAsync(bitableId)
      toast.success(
        `同步完成：新增 ${result.added} 个，更新 ${result.updated} 个`
      )
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '同步失败'
      toast.error(message)
    }
  }

  const toggleClientExpand = (clientId: number) => {
    setExpandedClients((prev) =>
      prev.includes(clientId)
        ? prev.filter((id) => id !== clientId)
        : [...prev, clientId]
    )
  }

  const isLoading = clientsLoading || bitablesLoading
  const isRefetching = clientsRefetching || bitablesRefetching

  return (
    <div className='flex flex-1 flex-col'>
      <div className='flex-none'>
        <h3 className='text-lg font-medium'>飞书配置</h3>
        <p className='text-muted-foreground text-sm'>
          管理飞书客户端凭证和多维表格配置。
        </p>
      </div>
      <Separator className='my-4 flex-none' />

      <div className='flex flex-col gap-6'>
        {/* 飞书客户端部分 */}
        <div>
          <div className='mb-4 flex items-center justify-between'>
            <h4 className='font-medium'>飞书客户端</h4>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => {
                  refetchClients()
                  refetchBitables()
                }}
                disabled={isRefetching}
              >
                <RefreshCw
                  className={cn(
                    'mr-2 h-4 w-4',
                    isRefetching && 'animate-spin'
                  )}
                />
                刷新
              </Button>
              <Button size='sm' onClick={() => setCreateClientOpen(true)}>
                <Plus className='mr-2 h-4 w-4' />
                添加客户端
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className='space-y-2'>
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className='h-24 w-full' />
              ))}
            </div>
          ) : clients.length === 0 ? (
            <Card>
              <CardContent className='flex h-24 items-center justify-center'>
                <p className='text-muted-foreground'>暂无飞书客户端配置</p>
              </CardContent>
            </Card>
          ) : (
            <div className='space-y-3'>
              {clients.map((client) => {
                const clientBitables = bitables.filter(
                  (b) => b.client_id === client.id
                )
                const isExpanded = expandedClients.includes(client.id)

                return (
                  <Collapsible
                    key={client.id}
                    open={isExpanded}
                    onOpenChange={() => toggleClientExpand(client.id)}
                  >
                    <Card>
                      <CardHeader className='pb-2'>
                        <div className='flex items-center justify-between'>
                          <div className='flex items-center gap-3'>
                            <CollapsibleTrigger asChild>
                              <Button variant='ghost' size='icon' className='h-6 w-6'>
                                <ChevronRight
                                  className={cn(
                                    'h-4 w-4 transition-transform',
                                    isExpanded && 'rotate-90'
                                  )}
                                />
                              </Button>
                            </CollapsibleTrigger>
                            <div>
                              <CardTitle className='text-base'>
                                {client.name}
                              </CardTitle>
                              <CardDescription className='font-mono text-xs'>
                                {client.app_id}
                              </CardDescription>
                            </div>
                          </div>
                          <div className='flex items-center gap-2'>
                            <Badge
                              variant={client.is_active ? 'default' : 'secondary'}
                            >
                              {client.is_active ? (
                                <CheckCircle className='mr-1 h-3 w-3' />
                              ) : (
                                <XCircle className='mr-1 h-3 w-3' />
                              )}
                              {client.is_active ? '启用' : '禁用'}
                            </Badge>
                            <Badge variant='outline'>
                              <Database className='mr-1 h-3 w-3' />
                              {clientBitables.length} 个表格
                            </Badge>
                            <Button
                              variant='ghost'
                              size='icon'
                              className='text-destructive hover:text-destructive h-8 w-8'
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedClient(client)
                                setDeleteClientOpen(true)
                              }}
                            >
                              <Trash2 className='h-4 w-4' />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CollapsibleContent>
                        <CardContent className='pt-2'>
                          {clientBitables.length === 0 ? (
                            <p className='text-muted-foreground py-2 text-sm'>
                              暂无多维表格
                            </p>
                          ) : (
                            <div className='space-y-2'>
                              {clientBitables.map((bitable) => (
                                <div
                                  key={bitable.id}
                                  className='bg-muted/50 flex items-center justify-between rounded-md p-3'
                                >
                                  <div className='flex items-center gap-3'>
                                    <Table2 className='text-muted-foreground h-4 w-4' />
                                    <div>
                                      <p className='font-medium'>{bitable.name}</p>
                                      <p className='text-muted-foreground text-xs'>
                                        {bitable.table_count} 个数据表
                                        {bitable.table_preview.length > 0 &&
                                          ` (${bitable.table_preview.join(', ')}${bitable.table_count > 3 ? '...' : ''})`}
                                      </p>
                                    </div>
                                  </div>
                                  <div className='flex gap-1'>
                                    <Button
                                      variant='ghost'
                                      size='sm'
                                      onClick={() => handleSyncTables(bitable.id)}
                                      disabled={syncTables.isPending}
                                    >
                                      <RefreshCw
                                        className={cn(
                                          'mr-1 h-3 w-3',
                                          syncTables.isPending && 'animate-spin'
                                        )}
                                      />
                                      同步
                                    </Button>
                                    <Button
                                      variant='ghost'
                                      size='icon'
                                      className='text-destructive hover:text-destructive h-8 w-8'
                                      onClick={() => {
                                        setSelectedBitable(bitable)
                                        setDeleteBitableOpen(true)
                                      }}
                                    >
                                      <Trash2 className='h-3 w-3' />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          <Button
                            variant='outline'
                            size='sm'
                            className='mt-3'
                            onClick={() => {
                              bitableForm.setValue('client_id', client.id)
                              setCreateBitableOpen(true)
                            }}
                          >
                            <Plus className='mr-1 h-3 w-3' />
                            添加多维表格
                          </Button>
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 创建客户端对话框 */}
      <Dialog open={createClientOpen} onOpenChange={setCreateClientOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加飞书客户端</DialogTitle>
            <DialogDescription>
              配置飞书应用的 App ID 和 App Secret。
            </DialogDescription>
          </DialogHeader>
          <Form {...clientForm}>
            <form
              onSubmit={clientForm.handleSubmit(onCreateClient)}
              className='space-y-4'
            >
              <FormField
                control={clientForm.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>名称</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='输入客户端名称' />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={clientForm.control}
                name='app_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>App ID</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='cli_xxx' className='font-mono' />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={clientForm.control}
                name='app_secret'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>App Secret</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='password'
                        placeholder='输入 App Secret'
                        className='font-mono'
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={clientForm.control}
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
                  onClick={() => setCreateClientOpen(false)}
                >
                  取消
                </Button>
                <Button type='submit' disabled={createClient.isPending}>
                  {createClient.isPending ? '创建中...' : '创建'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* 创建多维表格对话框 */}
      <Dialog open={createBitableOpen} onOpenChange={setCreateBitableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加多维表格</DialogTitle>
            <DialogDescription>
              配置飞书多维表格的 App Token。
            </DialogDescription>
          </DialogHeader>
          <Form {...bitableForm}>
            <form
              onSubmit={bitableForm.handleSubmit(onCreateBitable)}
              className='space-y-4'
            >
              <FormField
                control={bitableForm.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>名称</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='输入多维表格名称' />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={bitableForm.control}
                name='app_token'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>App Token</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='bascnxxx' className='font-mono' />
                    </FormControl>
                    <FormDescription>
                      多维表格 URL 中的 app_token 参数
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={bitableForm.control}
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
                  onClick={() => setCreateBitableOpen(false)}
                >
                  取消
                </Button>
                <Button type='submit' disabled={createBitable.isPending}>
                  {createBitable.isPending ? '创建中...' : '创建'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <ConfirmDialog
        destructive
        open={deleteClientOpen}
        onOpenChange={setDeleteClientOpen}
        handleConfirm={handleDeleteClient}
        isLoading={deleteClient.isPending}
        className='max-w-md'
        title={`删除客户端: ${selectedClient?.name}?`}
        desc={
          <>
            您即将删除飞书客户端 <strong>{selectedClient?.name}</strong>。
            <br />
            关联的多维表格和数据表也将被删除。此操作无法撤销。
          </>
        }
        confirmText='删除'
      />

      <ConfirmDialog
        destructive
        open={deleteBitableOpen}
        onOpenChange={setDeleteBitableOpen}
        handleConfirm={handleDeleteBitable}
        isLoading={deleteBitable.isPending}
        className='max-w-md'
        title={`删除多维表格: ${selectedBitable?.name}?`}
        desc={
          <>
            您即将删除多维表格 <strong>{selectedBitable?.name}</strong>。
            <br />
            关联的数据表配置也将被删除。此操作无法撤销。
          </>
        }
        confirmText='删除'
      />
    </div>
  )
}
