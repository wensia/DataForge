import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2, Mail, Shield, User } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import apiClient from '@/lib/api-client'
import type { ApiResponse, User as UserType } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'

const profileFormSchema = z
  .object({
    name: z.string().min(1, '名称不能为空').max(50, '名称最多 50 个字符'),
    currentPassword: z.string().optional(),
    newPassword: z.string().optional(),
    confirmPassword: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.newPassword && !data.currentPassword) {
        return false
      }
      return true
    },
    {
      message: '请输入当前密码',
      path: ['currentPassword'],
    }
  )
  .refine(
    (data) => {
      if (data.newPassword && data.newPassword.length < 6) {
        return false
      }
      return true
    },
    {
      message: '新密码至少 6 个字符',
      path: ['newPassword'],
    }
  )
  .refine(
    (data) => {
      if (data.newPassword && data.newPassword !== data.confirmPassword) {
        return false
      }
      return true
    },
    {
      message: '两次输入的密码不一致',
      path: ['confirmPassword'],
    }
  )

type ProfileFormValues = z.infer<typeof profileFormSchema>

function useUpdateProfile() {
  const { auth } = useAuthStore()

  return useMutation({
    mutationFn: async (data: {
      name?: string
      current_password?: string
      new_password?: string
    }) => {
      const response = await apiClient.put<ApiResponse<UserType>>(
        '/auth/me',
        data
      )
      return response.data.data
    },
    onSuccess: (user) => {
      auth.setUser(user)
    },
  })
}

export function ProfileForm() {
  const { auth } = useAuthStore()
  const user = auth.user

  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const updateProfile = useUpdateProfile()

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: user?.name || '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  const onSubmit = async (data: ProfileFormValues) => {
    try {
      await updateProfile.mutateAsync({
        name: data.name,
        current_password: data.currentPassword || undefined,
        new_password: data.newPassword || undefined,
      })
      toast.success('个人资料已更新')
      form.reset({
        name: data.name,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '更新失败，请重试'
      toast.error(message)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (!user) {
    return (
      <div className='text-muted-foreground py-8 text-center'>
        请先登录
      </div>
    )
  }

  return (
    <div className='space-y-6'>
      {/* 账户信息展示 */}
      <div className='space-y-4'>
        <div className='flex items-center gap-3'>
          <div className='bg-primary/10 flex h-16 w-16 items-center justify-center rounded-full'>
            <User className='text-primary h-8 w-8' />
          </div>
          <div>
            <h3 className='text-lg font-medium'>{user.name}</h3>
            <div className='text-muted-foreground flex items-center gap-2 text-sm'>
              <Mail className='h-4 w-4' />
              {user.email}
            </div>
          </div>
        </div>

        <div className='flex flex-wrap gap-2'>
          <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
            <Shield className='mr-1 h-3 w-3' />
            {user.role === 'admin' ? '管理员' : '普通用户'}
          </Badge>
          {user.last_login_at && (
            <Badge variant='outline'>
              上次登录: {formatDate(user.last_login_at)}
            </Badge>
          )}
        </div>
      </div>

      <Separator />

      {/* 编辑表单 */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>显示名称</FormLabel>
                <FormControl>
                  <Input {...field} placeholder='输入您的名称' />
                </FormControl>
                <FormDescription>
                  这是您在系统中显示的名称。
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <Separator />

          <div className='space-y-4'>
            <div>
              <h4 className='text-sm font-medium'>修改密码</h4>
              <p className='text-muted-foreground text-sm'>
                如需修改密码，请填写以下信息。留空则不修改。
              </p>
            </div>

            <FormField
              control={form.control}
              name='currentPassword'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>当前密码</FormLabel>
                  <FormControl>
                    <div className='relative'>
                      <Input
                        {...field}
                        type={showCurrentPassword ? 'text' : 'password'}
                        placeholder='输入当前密码'
                        autoComplete='current-password'
                      />
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        className='absolute right-0 top-0 h-full px-3 hover:bg-transparent'
                        onClick={() =>
                          setShowCurrentPassword(!showCurrentPassword)
                        }
                      >
                        {showCurrentPassword ? (
                          <EyeOff className='h-4 w-4' />
                        ) : (
                          <Eye className='h-4 w-4' />
                        )}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='newPassword'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>新密码</FormLabel>
                  <FormControl>
                    <div className='relative'>
                      <Input
                        {...field}
                        type={showNewPassword ? 'text' : 'password'}
                        placeholder='输入新密码'
                        autoComplete='new-password'
                      />
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        className='absolute right-0 top-0 h-full px-3 hover:bg-transparent'
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? (
                          <EyeOff className='h-4 w-4' />
                        ) : (
                          <Eye className='h-4 w-4' />
                        )}
                      </Button>
                    </div>
                  </FormControl>
                  <FormDescription>密码至少 6 个字符。</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='confirmPassword'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>确认新密码</FormLabel>
                  <FormControl>
                    <div className='relative'>
                      <Input
                        {...field}
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder='再次输入新密码'
                        autoComplete='new-password'
                      />
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        className='absolute right-0 top-0 h-full px-3 hover:bg-transparent'
                        onClick={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                      >
                        {showConfirmPassword ? (
                          <EyeOff className='h-4 w-4' />
                        ) : (
                          <Eye className='h-4 w-4' />
                        )}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <Button type='submit' disabled={updateProfile.isPending}>
            {updateProfile.isPending && (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            )}
            保存更改
          </Button>
        </form>
      </Form>
    </div>
  )
}
