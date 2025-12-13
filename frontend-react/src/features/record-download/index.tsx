/**
 * 录音下载页面
 */
import { useState } from 'react'
import { format, subDays } from 'date-fns'
import {
  Download,
  Play,
  Pause,
  RefreshCw,
  Search,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAccounts } from '@/features/accounts/api'
import { useCallLogs, useDownloadRecord, useRecordUrl } from './api'
import type { CallLogItem } from './types'

export default function RecordDownload() {
  // 筛选状态
  const [accountId, setAccountId] = useState<number>(0)
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [callType, setCallType] = useState<'all' | 'outbound' | 'inbound'>('all')
  const [searchPhone, setSearchPhone] = useState('')
  const [page, setPage] = useState(1)
  const [shouldQuery, setShouldQuery] = useState(false)

  // 播放状态
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null)

  // 获取账号列表
  const { data: accounts, isLoading: accountsLoading } = useAccounts()

  // 获取通话记录
  const {
    data: callLogsData,
    isLoading: callLogsLoading,
    refetch,
  } = useCallLogs(
    {
      accountId,
      startTime: `${startDate} 00:00:00`,
      endTime: `${endDate} 23:59:59`,
      page,
      pageSize: 20,
      callType: callType === 'all' ? undefined : callType,
      searchPhone: searchPhone || undefined,
    },
    shouldQuery && accountId > 0
  )

  // 获取录音地址
  const recordUrlMutation = useRecordUrl()
  // 下载录音
  const downloadMutation = useDownloadRecord()

  // 处理查询
  const handleSearch = () => {
    if (!accountId) {
      toast.error('请选择账号')
      return
    }
    setPage(1)
    setShouldQuery(true)
    setTimeout(() => refetch(), 100)
  }

  // 处理播放
  const handlePlay = async (item: CallLogItem) => {
    if (!item.voiceId) {
      toast.error('该记录没有录音')
      return
    }

    // 如果正在播放同一个，则暂停
    if (playingId === item.id && audioElement) {
      audioElement.pause()
      setPlayingId(null)
      return
    }

    // 停止之前的播放
    if (audioElement) {
      audioElement.pause()
    }

    try {
      const result = await recordUrlMutation.mutateAsync({
        accountId,
        voiceId: item.voiceId,
      })

      const audio = new Audio(result.download_url)
      audio.onended = () => setPlayingId(null)
      audio.onerror = () => {
        toast.error('播放失败')
        setPlayingId(null)
      }

      setAudioElement(audio)
      setAudioUrl(result.download_url)
      setPlayingId(item.id)
      audio.play()
    } catch {
      toast.error('获取录音地址失败')
    }
  }

  // 处理下载
  const handleDownload = async (item: CallLogItem) => {
    if (!item.voiceId) {
      toast.error('该记录没有录音')
      return
    }

    try {
      const result = await downloadMutation.mutateAsync({
        accountId,
        voiceId: item.voiceId,
      })

      // 创建下载链接
      const url = window.URL.createObjectURL(result.blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${item.voiceId}.mp3`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      toast.success('下载成功')
    } catch {
      toast.error('下载失败')
    }
  }

  // 解析通话记录
  const callLogs: CallLogItem[] = callLogsData?.json?.data?.list || []
  const total = callLogsData?.json?.data?.total || 0
  const totalPages = Math.ceil(total / 20)

  return (
    <>
      <Header fixed>
        <div className="ml-auto flex items-center gap-2">
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold">录音下载</h1>
          <p className="text-muted-foreground">查询云客通话记录并下载录音文件</p>
        </div>

        {/* 筛选区域 */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">查询条件</CardTitle>
            <CardDescription>选择账号和时间范围查询通话记录</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-2">
                <Label>云客账号</Label>
                {accountsLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : accounts && accounts.length > 0 ? (
                  <Select
                    value={accountId ? String(accountId) : ''}
                    onValueChange={(v) => setAccountId(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择账号" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={String(account.id)}>
                          {account.name || account.phone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex h-10 items-center rounded-md border border-input bg-background px-3 text-sm text-muted-foreground">
                    暂无账号，请先添加云客账号
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>开始日期</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>结束日期</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>通话类型</Label>
                <Select value={callType} onValueChange={(v) => setCallType(v as typeof callType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部</SelectItem>
                    <SelectItem value="outbound">外呼</SelectItem>
                    <SelectItem value="inbound">呼入</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>搜索号码</Label>
                <Input
                  placeholder="输入号码搜索"
                  value={searchPhone}
                  onChange={(e) => setSearchPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button onClick={handleSearch} disabled={callLogsLoading}>
                {callLogsLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                查询
              </Button>
              <Button
                variant="outline"
                onClick={() => refetch()}
                disabled={!shouldQuery || callLogsLoading}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                刷新
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 结果列表 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              通话记录
              {total > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground">共 {total} 条</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {callLogsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : callLogs.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-muted-foreground">
                {shouldQuery ? '暂无通话记录' : '请选择账号并点击查询'}
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>类型</TableHead>
                      <TableHead>主叫</TableHead>
                      <TableHead>被叫</TableHead>
                      <TableHead>通话时间</TableHead>
                      <TableHead>时长(秒)</TableHead>
                      <TableHead>坐席</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {callLogs.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          {item.callType === 1 ? (
                            <span className="flex items-center gap-1 text-blue-600">
                              <PhoneOutgoing className="h-4 w-4" />
                              外呼
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-green-600">
                              <PhoneIncoming className="h-4 w-4" />
                              呼入
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{item.callerNumber || '-'}</TableCell>
                        <TableCell>{item.calleeNumber || '-'}</TableCell>
                        <TableCell>{item.callTime}</TableCell>
                        <TableCell>{item.talkTime || 0}</TableCell>
                        <TableCell>{item.userName || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handlePlay(item)}
                              disabled={!item.voiceId || recordUrlMutation.isPending}
                              title="播放"
                            >
                              {playingId === item.id ? (
                                <Pause className="h-4 w-4" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleDownload(item)}
                              disabled={!item.voiceId || downloadMutation.isPending}
                              title="下载"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* 分页 */}
                {totalPages > 1 && (
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      上一页
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {page} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      下一页
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
