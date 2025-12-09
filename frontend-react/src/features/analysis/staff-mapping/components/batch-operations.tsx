/**
 * 批量操作组件
 *
 * 提供同步员工和回写通话记录功能
 */

import { useState } from 'react'
import { AlertCircle, CheckCircle, Download, RefreshCw, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useApplyToRecords, useSyncStaff } from '../api'
import type { ApplyToRecordsResponse } from '../types'

export function BatchOperations() {
  const syncStaffMutation = useSyncStaff()
  const applyMutation = useApplyToRecords()

  // Apply to records form state
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [previewResult, setPreviewResult] = useState<ApplyToRecordsResponse | null>(null)

  const handleSyncStaff = async () => {
    try {
      const result = await syncStaffMutation.mutateAsync()
      toast.success(`同步完成：新增 ${result.added} 人，已有 ${result.existing} 人`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '同步失败'
      toast.error(message)
    }
  }

  const handlePreview = async () => {
    try {
      const result = await applyMutation.mutateAsync({
        start_date: startDate || null,
        end_date: endDate || null,
        dry_run: true,
      })
      setPreviewResult(result)
      toast.info(`预览完成：将更新 ${result.updated_count} 条记录`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '预览失败'
      toast.error(message)
    }
  }

  const handleApply = async () => {
    try {
      const result = await applyMutation.mutateAsync({
        start_date: startDate || null,
        end_date: endDate || null,
        dry_run: false,
      })
      toast.success(`回写完成：更新 ${result.updated_count} 条，跳过 ${result.skipped_count} 条`)
      setPreviewResult(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : '回写失败'
      toast.error(message)
    }
  }

  return (
    <div className='grid gap-6 md:grid-cols-2'>
      {/* 同步员工 */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Download className='h-5 w-5' />
            同步员工名单
          </CardTitle>
          <CardDescription>
            从通话记录中提取所有不重复的员工姓名，自动创建员工记录
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className='h-4 w-4' />
            <AlertTitle>说明</AlertTitle>
            <AlertDescription>
              此操作会扫描通话记录中的 staff_name 字段，为不存在的员工创建新记录。
              已存在的员工不会被修改。
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button
            onClick={handleSyncStaff}
            disabled={syncStaffMutation.isPending}
            className='w-full'
          >
            {syncStaffMutation.isPending ? (
              <>
                <RefreshCw className='mr-2 h-4 w-4 animate-spin' />
                同步中...
              </>
            ) : (
              <>
                <Download className='mr-2 h-4 w-4' />
                开始同步
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      {/* 回写通话记录 */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Upload className='h-5 w-5' />
            回写通话记录
          </CardTitle>
          <CardDescription>
            将员工映射信息回写到通话记录中，用于数据分析和统计
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid grid-cols-2 gap-4'>
            <div className='space-y-2'>
              <Label htmlFor='start-date'>开始日期</Label>
              <Input
                id='start-date'
                type='date'
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='end-date'>结束日期</Label>
              <Input
                id='end-date'
                type='date'
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <p className='text-muted-foreground text-sm'>
            留空表示处理所有记录。建议先预览再执行。
          </p>

          {previewResult && (
            <>
              <Separator />
              <div className='space-y-2'>
                <div className='flex items-center justify-between'>
                  <span className='text-sm font-medium'>预览结果</span>
                  <div className='flex gap-2'>
                    <Badge variant='default'>
                      将更新: {previewResult.updated_count}
                    </Badge>
                    <Badge variant='secondary'>
                      跳过: {previewResult.skipped_count}
                    </Badge>
                  </div>
                </div>
                {previewResult.details.length > 0 && (
                  <ScrollArea className='h-32 rounded-md border p-2'>
                    <div className='space-y-1 text-xs'>
                      {previewResult.details.slice(0, 50).map((detail, index) => (
                        <div
                          key={index}
                          className={`flex items-center gap-2 ${
                            detail.status === 'will_update'
                              ? 'text-green-600'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {detail.status === 'will_update' ? (
                            <CheckCircle className='h-3 w-3' />
                          ) : (
                            <AlertCircle className='h-3 w-3' />
                          )}
                          <span>
                            {detail.staff_name}
                            {detail.call_date && ` (${detail.call_date})`}
                            {detail.reason && `: ${detail.reason}`}
                            {detail.mapping && ` → ${detail.mapping.campus || '-'}`}
                          </span>
                        </div>
                      ))}
                      {previewResult.details.length > 50 && (
                        <div className='text-muted-foreground'>
                          ... 还有 {previewResult.details.length - 50} 条
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className='flex gap-2'>
          <Button
            variant='outline'
            onClick={handlePreview}
            disabled={applyMutation.isPending}
            className='flex-1'
          >
            预览
          </Button>
          <Button
            onClick={handleApply}
            disabled={applyMutation.isPending || !previewResult}
            className='flex-1'
          >
            {applyMutation.isPending ? (
              <>
                <RefreshCw className='mr-2 h-4 w-4 animate-spin' />
                执行中...
              </>
            ) : (
              <>
                <Upload className='mr-2 h-4 w-4' />
                执行回写
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
