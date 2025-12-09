/**
 * 映射表单对话框
 */

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCampusOptions, useCreateMapping, useUpdateMapping } from '../api'
import type { StaffMapping } from '../types'

const mappingSchema = z
  .object({
    position: z.string().optional(),
    department: z.string().optional(),
    campus: z.string().optional(),
    effective_from: z.string().min(1, '请选择生效开始日期'),
    effective_to: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.effective_to && data.effective_from) {
        return new Date(data.effective_to) >= new Date(data.effective_from)
      }
      return true
    },
    {
      message: '结束日期不能早于开始日期',
      path: ['effective_to'],
    }
  )

type MappingFormData = z.infer<typeof mappingSchema>

interface MappingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mapping?: StaffMapping | null
  staffId?: number
  staffName?: string
}

export function MappingDialog({
  open,
  onOpenChange,
  mapping,
  staffId,
  staffName,
}: MappingDialogProps) {
  const isEdit = !!mapping
  const { data: campusOptions = [] } = useCampusOptions()
  const createMutation = useCreateMapping()
  const updateMutation = useUpdateMapping()

  const form = useForm<MappingFormData>({
    resolver: zodResolver(mappingSchema),
    defaultValues: {
      position: '',
      department: '',
      campus: '',
      effective_from: new Date().toISOString().split('T')[0],
      effective_to: '',
    },
  })

  // Reset form when dialog opens/closes or mapping changes
  useEffect(() => {
    if (open) {
      if (mapping) {
        form.reset({
          position: mapping.position || '',
          department: mapping.department || '',
          campus: mapping.campus || '',
          effective_from: mapping.effective_from,
          effective_to: mapping.effective_to || '',
        })
      } else {
        form.reset({
          position: '',
          department: '',
          campus: '',
          effective_from: new Date().toISOString().split('T')[0],
          effective_to: '',
        })
      }
    }
  }, [open, mapping, form])

  const onSubmit = async (data: MappingFormData) => {
    try {
      if (isEdit && mapping) {
        await updateMutation.mutateAsync({
          id: mapping.id,
          data: {
            position: data.position || null,
            department: data.department || null,
            campus: data.campus || null,
            effective_from: data.effective_from,
            effective_to: data.effective_to || null,
          },
        })
        toast.success('映射更新成功')
      } else if (staffId) {
        await createMutation.mutateAsync({
          staff_id: staffId,
          position: data.position || null,
          department: data.department || null,
          campus: data.campus || null,
          effective_from: data.effective_from,
          effective_to: data.effective_to || null,
        })
        toast.success('映射创建成功')
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
      <DialogContent className='sm:max-w-[500px]'>
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑映射' : '添加映射'}</DialogTitle>
          <DialogDescription>
            {staffName ? `为员工「${staffName}」配置映射信息` : '配置员工映射信息'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
            <FormField
              control={form.control}
              name='campus'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>校区</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='请选择校区' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {campusOptions.map((option) => (
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
              name='department'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>部门</FormLabel>
                  <FormControl>
                    <Input placeholder='请输入部门名称' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='position'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>职位</FormLabel>
                  <FormControl>
                    <Input placeholder='请输入职位名称' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='effective_from'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>生效开始日期</FormLabel>
                    <FormControl>
                      <Input type='date' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='effective_to'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>生效结束日期</FormLabel>
                    <FormControl>
                      <Input type='date' {...field} />
                    </FormControl>
                    <FormDescription>留空表示至今</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
