/**
 * 录音下载页面
 *
 * 通过粘贴云客录音详情页 URL，提取 voiceId 下载录音
 */
import { useState, useRef } from 'react'
import { Download, Play, Pause, Loader2, Link, Volume2, Clock, User, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAccounts } from '@/features/accounts/api'
import { useDownloadRecord, useRecordUrl } from './api'

// 从 URL 中解析的录音信息
interface ParsedRecordInfo {
  voiceId: string
  userId?: string
  customerName?: string
  audioFrom?: string
  audioTo?: string
  audioTime?: string
  time?: string // 时长（秒）
  recordFile?: string
}

// 从云客 URL 中解析录音信息
function parseYunkeUrl(url: string): ParsedRecordInfo | null {
  try {
    const urlObj = new URL(url)
    const params = urlObj.searchParams

    const voiceId = params.get('voiceId')
    if (!voiceId) {
      return null
    }

    return {
      voiceId,
      userId: params.get('userId') || undefined,
      customerName: params.get('customerName') || undefined,
      audioFrom: params.get('audioFrom') ? decodeURIComponent(params.get('audioFrom')!) : undefined,
      audioTo: params.get('audioTo') || undefined,
      audioTime: params.get('audioTime') ? decodeURIComponent(params.get('audioTime')!) : undefined,
      time: params.get('time') || undefined,
      recordFile: params.get('recordFile') ? decodeURIComponent(params.get('recordFile')!) : undefined,
    }
  } catch {
    return null
  }
}

export default function RecordDownload() {
  // 状态
  const [accountId, setAccountId] = useState<number>(0)
  const [urlInput, setUrlInput] = useState('')
  const [parsedInfo, setParsedInfo] = useState<ParsedRecordInfo | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // 获取账号列表
  const { data: accounts, isLoading: accountsLoading } = useAccounts()

  // 获取录音地址
  const recordUrlMutation = useRecordUrl()
  // 下载录音
  const downloadMutation = useDownloadRecord()

  // 解析 URL
  const handleParseUrl = () => {
    if (!urlInput.trim()) {
      toast.error('请输入云客录音 URL')
      return
    }

    const info = parseYunkeUrl(urlInput.trim())
    if (!info) {
      toast.error('无法解析 URL，请确保是有效的云客录音详情页链接')
      return
    }

    setParsedInfo(info)
    toast.success(`已解析 voiceId: ${info.voiceId}`)
  }

  // 播放录音
  const handlePlay = async () => {
    if (!parsedInfo?.voiceId) {
      toast.error('请先解析 URL')
      return
    }

    if (!accountId) {
      toast.error('请选择云客账号')
      return
    }

    // 如果正在播放，则暂停
    if (isPlaying && audioRef.current) {
      audioRef.current.pause()
      setIsPlaying(false)
      return
    }

    try {
      const result = await recordUrlMutation.mutateAsync({
        accountId,
        voiceId: parsedInfo.voiceId,
      })

      setAudioUrl(result.download_url)

      // 播放音频
      if (audioRef.current) {
        audioRef.current.src = result.download_url
        audioRef.current.play()
        setIsPlaying(true)
      }
    } catch {
      toast.error('获取录音地址失败')
    }
  }

  // 下载录音
  const handleDownload = async () => {
    if (!parsedInfo?.voiceId) {
      toast.error('请先解析 URL')
      return
    }

    if (!accountId) {
      toast.error('请选择云客账号')
      return
    }

    try {
      const result = await downloadMutation.mutateAsync({
        accountId,
        voiceId: parsedInfo.voiceId,
      })

      // 创建下载链接
      const url = window.URL.createObjectURL(result.blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${parsedInfo.voiceId}.mp3`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      toast.success('下载成功')
    } catch {
      toast.error('下载失败')
    }
  }

  // 音频播放结束
  const handleAudioEnded = () => {
    setIsPlaying(false)
  }

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
          <p className="text-muted-foreground">粘贴云客录音详情页 URL，提取 voiceId 下载录音</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* 输入区域 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Link className="h-5 w-5" />
                输入云客 URL
              </CardTitle>
              <CardDescription>
                从云客 CRM 系统复制录音详情页的完整 URL
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                      <SelectValue placeholder="选择账号（用于获取录音）" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={String(account.id)}>
                          {account.company_name || account.phone}
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
                <Label>录音详情页 URL</Label>
                <Textarea
                  placeholder="粘贴云客录音详情页 URL，例如：https://crm.yunkecn.com/cms/customer/callDetail?voiceId=phone-xxx..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  rows={4}
                  className="font-mono text-xs"
                />
              </div>

              <Button onClick={handleParseUrl} className="w-full">
                解析 URL
              </Button>
            </CardContent>
          </Card>

          {/* 结果区域 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Volume2 className="h-5 w-5" />
                录音信息
              </CardTitle>
              <CardDescription>
                解析结果和播放/下载操作
              </CardDescription>
            </CardHeader>
            <CardContent>
              {parsedInfo ? (
                <div className="space-y-4">
                  {/* 解析出的信息 */}
                  <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-muted-foreground">Voice ID:</span>
                      <code className="rounded bg-muted px-2 py-0.5 text-xs">
                        {parsedInfo.voiceId}
                      </code>
                    </div>

                    {parsedInfo.audioFrom && (
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span>坐席: {parsedInfo.audioFrom}</span>
                      </div>
                    )}

                    {parsedInfo.audioTo && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>客户: {parsedInfo.audioTo}</span>
                      </div>
                    )}

                    {parsedInfo.audioTime && (
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>时间: {parsedInfo.audioTime}</span>
                      </div>
                    )}

                    {parsedInfo.time && (
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>时长: {parsedInfo.time} 秒</span>
                      </div>
                    )}
                  </div>

                  {/* 音频播放器 */}
                  <audio
                    ref={audioRef}
                    onEnded={handleAudioEnded}
                    onPause={() => setIsPlaying(false)}
                    onPlay={() => setIsPlaying(true)}
                    controls
                    className="w-full"
                    src={audioUrl || undefined}
                  />

                  {/* 操作按钮 */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handlePlay}
                      disabled={!accountId || recordUrlMutation.isPending}
                      className="flex-1"
                    >
                      {recordUrlMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : isPlaying ? (
                        <Pause className="mr-2 h-4 w-4" />
                      ) : (
                        <Play className="mr-2 h-4 w-4" />
                      )}
                      {isPlaying ? '暂停' : '播放'}
                    </Button>

                    <Button
                      onClick={handleDownload}
                      disabled={!accountId || downloadMutation.isPending}
                      className="flex-1"
                    >
                      {downloadMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="mr-2 h-4 w-4" />
                      )}
                      下载 MP3
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex h-48 items-center justify-center text-muted-foreground">
                  请先粘贴云客 URL 并点击解析
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 使用说明 */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">使用说明</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>1. 在云客 CRM 系统中打开通话记录详情页</p>
            <p>2. 复制浏览器地址栏中的完整 URL</p>
            <p>3. 选择一个已登录的云客账号</p>
            <p>4. 将 URL 粘贴到上方输入框，点击"解析 URL"</p>
            <p>5. 解析成功后可以播放或下载录音文件</p>
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
