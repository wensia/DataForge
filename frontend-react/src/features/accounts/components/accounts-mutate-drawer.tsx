import { useEffect } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
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
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useCreateAccount, useUpdateAccount } from '../api'
import { type Account } from '../data/schema'

type AccountMutateDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: Account
}

const createFormSchema = z.object({
  phone: z
    .string()
    .min(11, '手机号必须是11位')
    .max(11, '手机号必须是11位')
    .regex(/^1\d{10}$/, '请输入正确的手机号'),
  password: z.string().min(1, '密码不能为空'),
  company_code: z.string().min(1, '公司代码不能为空'),
  company_name: z.string().min(1, '公司名称不能为空'),
  domain: z.string().optional(),
})

const updateFormSchema = z.object({
  password: z.string().min(1, '密码不能为空'),
})

type CreateAccountForm = z.infer<typeof createFormSchema>
type UpdateAccountForm = z.infer<typeof updateFormSchema>

export function AccountsMutateDrawer({
  open,
  onOpenChange,
  currentRow,
}: AccountMutateDrawerProps) {
  const isUpdate = !!currentRow

  const createAccount = useCreateAccount()
  const updateAccount = useUpdateAccount()

  const createForm = useForm<CreateAccountForm>({
    resolver: zodResolver(createFormSchema),
    defaultValues: {
      phone: '',
      password: '',
      company_code: '',
      company_name: '',
      domain: '',
    },
  })

  const updateForm = useForm<UpdateAccountForm>({
    resolver: zodResolver(updateFormSchema),
    defaultValues: {
      password: '',
    },
  })

  // 重置表单
  useEffect(() => {
    if (open) {
      if (isUpdate) {
        updateForm.reset({ password: '' })
      } else {
        createForm.reset()
      }
    }
  }, [open, isUpdate, createForm, updateForm])

  const onCreateSubmit = async (data: CreateAccountForm) => {
    try {
      await createAccount.mutateAsync(data)
      toast.success('账号创建成功')
      onOpenChange(false)
      createForm.reset()
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '创建失败，请重试'
      toast.error(message)
    }
  }

  const onUpdateSubmit = async (data: UpdateAccountForm) => {
    if (!currentRow) return

    try {
      await updateAccount.mutateAsync({
        id: currentRow.id,
        data: { password: data.password },
      })
      toast.success('密码更新成功')
      onOpenChange(false)
      updateForm.reset()
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '更新失败，请重试'
      toast.error(message)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) {
          createForm.reset()
          updateForm.reset()
        }
      }}
    >
      <SheetContent className='flex flex-col sm:max-w-lg'>
        <SheetHeader className='text-start'>
          <SheetTitle>{isUpdate ? '编辑密码' : '添加账号'}</SheetTitle>
          <SheetDescription>
            {isUpdate
              ? `更新账号 ${currentRow?.phone} 的密码`
              : '填写账号信息添加新的云客账号。'}
          </SheetDescription>
        </SheetHeader>

        {isUpdate ? (
          <Form {...updateForm}>
            <form
              id='account-form'
              onSubmit={updateForm.handleSubmit(onUpdateSubmit)}
              className='flex-1 space-y-5 overflow-y-auto px-1'
            >
              <FormField
                control={updateForm.control}
                name='password'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>新密码</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='password'
                        placeholder='输入新密码'
                        autoComplete='new-password'
                      />
                    </FormControl>
                    <FormDescription>
                      更新密码后需要重新登录账号
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        ) : (
          <Form {...createForm}>
            <form
              id='account-form'
              onSubmit={createForm.handleSubmit(onCreateSubmit)}
              className='flex-1 space-y-5 overflow-y-auto px-1'
            >
              <FormField
                control={createForm.control}
                name='phone'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>手机号</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='输入手机号' />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name='password'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>密码</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='password'
                        placeholder='输入密码'
                        autoComplete='new-password'
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name='company_code'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>公司代码</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='输入公司代码' />
                    </FormControl>
                    <FormDescription>云客CRM系统的公司代码</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name='company_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>公司名称</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='输入公司名称' />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name='domain'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>域名（可选）</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder='https://crm.example.com'
                      />
                    </FormControl>
                    <FormDescription>
                      如果是私有化部署，请填写域名
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        )}

        <SheetFooter className='gap-2'>
          <SheetClose asChild>
            <Button variant='outline'>取消</Button>
          </SheetClose>
          <Button
            form='account-form'
            type='submit'
            disabled={createAccount.isPending || updateAccount.isPending}
          >
            {createAccount.isPending || updateAccount.isPending
              ? '保存中...'
              : '保存'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
