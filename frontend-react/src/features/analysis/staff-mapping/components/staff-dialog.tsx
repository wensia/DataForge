/**
 * 员工表单对话框
 */

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Input } from '@/components/ui/input'
import { useCreateStaff, useUpdateStaff } from '../api'
import type { Staff } from '../types'

const staffSchema = z.object({
  name: z.string().min(1, '请输入员工姓名'),
  phone: z.string().optional(),
  is_active: z.boolean(),
})

type StaffFormData = z.infer<typeof staffSchema>

interface StaffDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  staff?: Staff | null
}

export function StaffDialog({ open, onOpenChange, staff }: StaffDialogProps) {
  const isEdit = !!staff
  const createMutation = useCreateStaff()
  const updateMutation = useUpdateStaff()

  const form = useForm<StaffFormData>({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      name: '',
      phone: '',
      is_active: true,
    },
  })

  // Reset form when dialog opens/closes or staff changes
  useEffect(() => {
    if (open) {
      if (staff) {
        form.reset({
          name: staff.name,
          phone: staff.phone || '',
          is_active: staff.is_active,
        })
      } else {
        form.reset({
          name: '',
          phone: '',
          is_active: true,
        })
      }
    }
  }, [open, staff, form])

  const onSubmit = async (data: StaffFormData) => {
    try {
      if (isEdit && staff) {
        await updateMutation.mutateAsync({
          id: staff.id,
          data: {
            name: data.name,
            phone: data.phone || null,
            is_active: data.is_active,
          },
        })
        toast.success('员工更新成功')
      } else {
        await createMutation.mutateAsync({
          name: data.name,
          phone: data.phone || null,
          is_active: data.is_active,
        })
        toast.success('员工创建成功')
      }
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : '操作失败'
      toast.error(message)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[425px]'>
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑员工' : '添加员工'}</DialogTitle>
          <DialogDescription>
            {isEdit ? '修改员工基本信息' : '添加新的员工到系统中'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>姓名</FormLabel>
                  <FormControl>
                    <Input placeholder='请输入员工姓名' {...field} />
                  </FormControl>
                  <FormDescription>员工姓名需要与通话记录中的名称一致</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='phone'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>手机号（可选）</FormLabel>
                  <FormControl>
                    <Input placeholder='请输入手机号' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='is_active'
              render={({ field }) => (
                <FormItem className='flex flex-row items-start space-x-3 space-y-0'>
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className='space-y-1 leading-none'>
                    <FormLabel>在职状态</FormLabel>
                    <FormDescription>取消勾选表示该员工已离职</FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type='submit' disabled={isPending}>
                {isPending ? '保存中...' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
