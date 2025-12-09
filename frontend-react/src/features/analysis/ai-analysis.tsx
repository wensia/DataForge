/**
 * AI 分析页面
 */
import { useState, useMemo, useEffect } from 'react'
import { toast } from 'sonner'
import { BarChart3, Loader2 } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
  useAIProviders,
  useAnalysisHistory,
  useGenerateSummary,
  useAnalyzeTrend,
  useDetectAnomalies,
} from './api'
import { analysisTypeOptions, getAnalysisTypeLabel, type AnalysisResult } from './types'

export function AIAnalysis() {
  // AI 分析状态
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [analysisType, setAnalysisType] = useState('summary')
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null
  )
  const [showResultModal, setShowResultModal] = useState(false)

  // API Hooks
  const { data: providersData } = useAIProviders()
  const { data: historyData, refetch: refetchHistory } = useAnalysisHistory({
    page_size: 10,
  })
  const summaryMutation = useGenerateSummary()
  const trendMutation = useAnalyzeTrend()
  const anomalyMutation = useDetectAnomalies()

  // 设置默认 AI 服务
  const availableProviders = useMemo(
    () => providersData?.providers.filter((p) => p.available) || [],
    [providersData]
  )

  // 初始化默认 provider
  useEffect(() => {
    if (providersData?.default && !selectedProvider) {
      setSelectedProvider(providersData.default)
    }
  }, [providersData?.default])

  // 开始分析
  const handleAnalyze = async () => {
    if (availableProviders.length === 0) {
      toast.warning('没有可用的 AI 服务，请先配置 API 密钥')
      return
    }

    const params = {
      ai_provider: selectedProvider,
      max_records: 500,
    }

    try {
      let result: AnalysisResult
      switch (analysisType) {
        case 'trend':
          result = await trendMutation.mutateAsync(params)
          break
        case 'anomaly':
          result = await anomalyMutation.mutateAsync(params)
          break
        default:
          result = await summaryMutation.mutateAsync(params)
      }
      setAnalysisResult(result)
      setShowResultModal(true)
      refetchHistory()
    } catch {
      toast.error('分析失败')
    }
  }

  const isAnalyzing =
    summaryMutation.isPending ||
    trendMutation.isPending ||
    anomalyMutation.isPending

  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-4'>
          <h1 className='text-xl font-semibold'>AI 分析</h1>
        </div>
      </Header>

      <Main fixed className='min-h-0'>
        <div className='space-y-6'>
          <div className='grid gap-6 md:grid-cols-2'>
            {/* 分析配置 */}
            <Card>
              <CardHeader>
                <CardTitle>分析配置</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='space-y-2'>
                  <Label>AI 服务</Label>
                  <Select
                    value={selectedProvider}
                    onValueChange={setSelectedProvider}
                    disabled={availableProviders.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='选择 AI 服务' />
                    </SelectTrigger>
                    <SelectContent>
                      {availableProviders.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {availableProviders.length === 0 && (
                    <p className='text-muted-foreground text-sm'>
                      没有可用的 AI 服务，请先在系统设置中配置 AI API 密钥
                    </p>
                  )}
                </div>

                <div className='space-y-2'>
                  <Label>分析类型</Label>
                  <RadioGroup
                    value={analysisType}
                    onValueChange={setAnalysisType}
                    className='flex flex-col gap-2'
                  >
                    {analysisTypeOptions.map((opt) => (
                      <div
                        key={opt.value}
                        className='flex items-center space-x-2'
                      >
                        <RadioGroupItem value={opt.value} id={opt.value} />
                        <Label htmlFor={opt.value} className='cursor-pointer'>
                          {opt.label}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                <Button
                  className='w-full'
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || availableProviders.length === 0}
                >
                  {isAnalyzing ? (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  ) : (
                    <BarChart3 className='mr-2 h-4 w-4' />
                  )}
                  开始分析
                </Button>
              </CardContent>
            </Card>

            {/* 分析历史 */}
            <Card>
              <CardHeader>
                <CardTitle>分析历史</CardTitle>
              </CardHeader>
              <CardContent>
                {historyData?.items.length ? (
                  <div className='space-y-3'>
                    {historyData.items.map((item) => (
                      <div
                        key={item.id}
                        className='border-primary flex cursor-pointer items-start gap-3 border-l-2 pl-3 hover:bg-muted/50'
                        onClick={() => {
                          setAnalysisResult(item)
                          setShowResultModal(true)
                        }}
                      >
                        <div className='flex-1'>
                          <div className='flex items-center gap-2'>
                            <span className='font-medium'>
                              {getAnalysisTypeLabel(item.analysis_type)}
                            </span>
                            {item.tokens_used && (
                              <Badge variant='secondary'>
                                {item.tokens_used} tokens
                              </Badge>
                            )}
                          </div>
                          <p className='text-muted-foreground text-sm'>
                            {item.data_summary || '无描述'}
                          </p>
                          <p className='text-muted-foreground text-xs'>
                            {item.created_at}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className='text-muted-foreground text-center'>
                    暂无分析记录
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </Main>

      {/* 分析结果弹窗 */}
      <Dialog open={showResultModal} onOpenChange={setShowResultModal}>
        <DialogContent className='max-w-3xl'>
          <DialogHeader>
            <DialogTitle>分析结果</DialogTitle>
          </DialogHeader>
          {analysisResult && (
            <div className='space-y-4'>
              <div className='grid grid-cols-2 gap-4 text-sm'>
                <div>
                  <span className='text-muted-foreground'>分析类型：</span>
                  {getAnalysisTypeLabel(analysisResult.analysis_type)}
                </div>
                <div>
                  <span className='text-muted-foreground'>AI 服务：</span>
                  {analysisResult.ai_provider}
                </div>
                <div>
                  <span className='text-muted-foreground'>消耗 Tokens：</span>
                  {analysisResult.tokens_used || '-'}
                </div>
                <div>
                  <span className='text-muted-foreground'>分析时间：</span>
                  {analysisResult.created_at}
                </div>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>分析结果</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className='whitespace-pre-wrap text-sm'>
                    {analysisResult.result}
                  </pre>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
