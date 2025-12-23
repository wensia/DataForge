import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import html2canvas from 'html2canvas'
import {
  Code,
  Copy,
  Download,
  FileDown,
  Loader2,
  Maximize2,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Slider } from '@/components/ui/slider'
import { useRenderTemplate } from '../api'
import { buildTemplateSrcDoc } from '../utils/template-preview'
import type { HtmlTemplate } from '../data/schema'

interface TemplateUseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: HtmlTemplate | null
}

export function TemplateUseDialog({
  open,
  onOpenChange,
  template,
}: TemplateUseDialogProps) {
  const previewFrameRef = useRef<HTMLIFrameElement>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const [variables, setVariables] = useState<Record<string, string>>({})
  const [renderedHtml, setRenderedHtml] = useState<string>('')
  const [renderedCss, setRenderedCss] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [previewScale, setPreviewScale] = useState(0.1)
  const [autoFitScale, setAutoFitScale] = useState(0.1)
  const [isManualScale, setIsManualScale] = useState(false)

  const renderTemplate = useRenderTemplate()

  // 获取模板缩放存储键
  const getScaleStorageKey = useCallback(
    (templateId: number) => `template-preview-scale-${templateId}`,
    []
  )

  // 初始化变量默认值和加载保存的缩放设置
  useEffect(() => {
    if (template?.variables) {
      const defaults: Record<string, string> = {}
      template.variables.forEach((v) => {
        defaults[v.name] = v.default_value || ''
      })
      setVariables(defaults)
    } else {
      setVariables({})
    }
    setRenderedHtml('')
    setRenderedCss(null)

    // 加载该模板保存的缩放设置
    if (template) {
      const savedScale = localStorage.getItem(getScaleStorageKey(template.id))
      if (savedScale) {
        const scale = parseFloat(savedScale)
        if (!isNaN(scale) && scale >= 0.1 && scale <= 1) {
          setIsManualScale(true)
          setPreviewScale(scale)
          return
        }
      }
    }
    setIsManualScale(false)
  }, [template, getScaleStorageKey])

  // 计算自适应缩放比例
  useLayoutEffect(() => {
    const container = previewContainerRef.current
    if (!container || !template || !open) return

    const updateScale = () => {
      const containerWidth = container.clientWidth
      const containerHeight = container.clientHeight
      if (containerWidth === 0 || containerHeight === 0) return
      const scaleX = containerWidth / template.width
      const scaleY = containerHeight / template.height
      const fitScale = Math.min(scaleX, scaleY) * 0.95
      setAutoFitScale(fitScale)
      if (!isManualScale) {
        setPreviewScale(fitScale)
      }
    }

    // 延迟计算，确保容器已完全渲染
    requestAnimationFrame(updateScale)

    const resizeObserver = new ResizeObserver(updateScale)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [template, open, isManualScale])

  // 重置为自适应缩放
  const handleResetScale = useCallback(() => {
    setIsManualScale(false)
    setPreviewScale(autoFitScale)
    // 清除保存的缩放设置
    if (template) {
      localStorage.removeItem(getScaleStorageKey(template.id))
    }
  }, [autoFitScale, template, getScaleStorageKey])

  // 手动调节缩放
  const handleScaleChange = useCallback(
    (value: number[]) => {
      setIsManualScale(true)
      setPreviewScale(value[0])
      // 保存缩放设置到 localStorage
      if (template) {
        localStorage.setItem(getScaleStorageKey(template.id), value[0].toString())
      }
    },
    [template, getScaleStorageKey]
  )

  const handleVariableChange = (name: string, value: string) => {
    setVariables((prev) => ({ ...prev, [name]: value }))
  }

  // 渲染预览
  const handlePreview = async () => {
    if (!template) return

    try {
      const result = await renderTemplate.mutateAsync({
        templateId: template.id,
        variables,
      })
      setRenderedHtml(result.html)
      setRenderedCss(result.css ?? null)
    } catch {
      toast.error('渲染失败')
    }
  }

  const previewCss = renderedCss ?? template?.css_content ?? null
  const previewSrcDoc = useMemo(() => {
    if (!renderedHtml) return ''
    return buildTemplateSrcDoc(renderedHtml, previewCss)
  }, [previewCss, renderedHtml])

  // 生成图片并下载
  const handleDownload = async () => {
    if (!previewFrameRef.current || !template) return

    const previewBody = previewFrameRef.current.contentDocument?.body
    if (!previewBody) return

    setIsGenerating(true)
    try {
      const canvas = await html2canvas(previewBody, {
        scale: 2, // 高清
        useCORS: true,
        backgroundColor: '#ffffff',
        width: template.width || 800,
        height: template.height || 600,
        windowWidth: template.width || 800,
        windowHeight: template.height || 600,
        logging: false,
      })

      // 转换为 blob 并下载
      canvas.toBlob((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${template?.name || 'template'}-${Date.now()}.png`
        a.click()
        URL.revokeObjectURL(url)
        toast.success('图片下载成功')
      }, 'image/png')
    } catch {
      toast.error('生成图片失败')
    } finally {
      setIsGenerating(false)
    }
  }

  // 复制图片到剪贴板
  const handleCopy = async () => {
    if (!previewFrameRef.current || !template) return

    const previewBody = previewFrameRef.current.contentDocument?.body
    if (!previewBody) return

    setIsGenerating(true)
    try {
      const canvas = await html2canvas(previewBody, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: template.width || 800,
        height: template.height || 600,
        windowWidth: template.width || 800,
        windowHeight: template.height || 600,
        logging: false,
      })

      canvas.toBlob(async (blob) => {
        if (!blob) return

        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ])
          toast.success('图片已复制到剪贴板')
        } catch {
          toast.error('复制失败，请使用下载功能')
        }
      }, 'image/png')
    } catch {
      toast.error('生成图片失败')
    } finally {
      setIsGenerating(false)
    }
  }

  const variableList = template?.variables || []
  const requiredCount = variableList.filter((v) => v.required).length
  const sizeLabel = template
    ? `${template.width} × ${template.height}`
    : '尺寸未知'

  // 复制 HTML 到剪贴板
  const handleCopyHtml = async () => {
    if (!previewSrcDoc) return
    try {
      await navigator.clipboard.writeText(previewSrcDoc)
      toast.success('HTML 已复制到剪贴板')
    } catch {
      toast.error('复制失败')
    }
  }

  // 下载 HTML 文件
  const handleDownloadHtml = () => {
    if (!previewSrcDoc || !template) return
    const blob = new Blob([previewSrcDoc], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${template.name}-${Date.now()}.html`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('HTML 文件下载成功')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className='flex h-[90vh] w-[min(96vw,1280px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-7xl'
      >
        <div className='flex flex-wrap items-start justify-between gap-4 border-b bg-muted/30 px-6 py-5'>
          <DialogHeader className='gap-1 text-start'>
            <DialogTitle>使用模板: {template?.name}</DialogTitle>
            <DialogDescription>填写变量值，预览并导出图片</DialogDescription>
          </DialogHeader>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='outline' className='font-mono text-xs'>
              {sizeLabel}
            </Badge>
            <Badge variant={renderedHtml ? 'secondary' : 'outline'}>
              {renderedHtml ? '已生成预览' : '待预览'}
            </Badge>
            <Button variant='outline' onClick={() => onOpenChange(false)}>
              关闭
            </Button>
            <Button onClick={handlePreview} disabled={renderTemplate.isPending}>
              {renderTemplate.isPending ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <RefreshCw className='mr-2 h-4 w-4' />
              )}
              预览
            </Button>
          </div>
        </div>

        <div className='grid min-h-0 flex-1 gap-6 p-6 lg:grid-cols-[320px_1fr]'>
          {/* 左侧: 变量设置 */}
          <Card className='flex min-h-0 flex-col gap-4 py-4'>
            <CardHeader className='px-6 pb-0'>
              <div className='flex items-center justify-between gap-2'>
                <CardTitle className='text-base'>变量设置</CardTitle>
                {variableList.length > 0 && (
                  <div className='flex items-center gap-2'>
                    <Badge variant='secondary'>{variableList.length} 个</Badge>
                    {requiredCount > 0 && (
                      <Badge variant='outline'>必填 {requiredCount}</Badge>
                    )}
                  </div>
                )}
              </div>
              <CardDescription>填写变量值，必填项标记 *</CardDescription>
            </CardHeader>
            <CardContent className='min-h-0 flex-1 overflow-hidden px-6'>
              <ScrollArea className='h-full pr-3'>
                <div className='space-y-4 pb-1'>
                  {variableList.map((v) => (
                    <div key={v.name} className='space-y-2'>
                      <Label htmlFor={v.name}>
                        {v.label || v.name}
                        {v.required && (
                          <span className='text-destructive ml-1'>*</span>
                        )}
                      </Label>
                      <Input
                        id={v.name}
                        value={variables[v.name] || ''}
                        onChange={(e) =>
                          handleVariableChange(v.name, e.target.value)
                        }
                        placeholder={
                          v.placeholder || `输入 ${v.label || v.name}`
                        }
                      />
                    </div>
                  ))}

                  {variableList.length === 0 && (
                    <p className='text-muted-foreground text-sm'>
                      此模板没有定义变量
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* 右侧: 实时预览 */}
          <Card className='flex min-h-0 flex-col gap-4 py-4'>
            <CardHeader className='flex items-center justify-between gap-2 px-6 pb-0'>
              <div>
                <CardTitle className='text-base'>实时预览</CardTitle>
                <CardDescription>原始尺寸：{sizeLabel}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className='flex min-h-0 flex-1 flex-col px-6'>
              <div
                ref={previewContainerRef}
                className='relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border bg-muted/50 p-4'
              >
                {renderedHtml ? (
                  <div
                    className='overflow-hidden'
                    style={{
                      width: (template?.width || 800) * previewScale,
                      height: (template?.height || 600) * previewScale,
                    }}
                  >
                    <iframe
                      ref={previewFrameRef}
                      title={`template-preview-${template?.id ?? 'preview'}`}
                      className='block border-0 bg-white'
                      sandbox='allow-same-origin'
                      srcDoc={previewSrcDoc}
                      style={{
                        width: template?.width || 800,
                        height: template?.height || 600,
                        transform: `scale(${previewScale})`,
                        transformOrigin: '0 0',
                      }}
                    />
                  </div>
                ) : (
                  <div className='text-muted-foreground flex items-center justify-center'>
                    点击"预览"按钮查看效果
                  </div>
                )}
              </div>
              {/* 缩放控制栏 */}
              <div className='mt-3 flex items-center gap-3'>
                <span className='text-muted-foreground w-12 shrink-0 text-xs'>
                  {Math.round(previewScale * 100)}%
                </span>
                <Slider
                  value={[previewScale]}
                  onValueChange={handleScaleChange}
                  min={0.1}
                  max={1}
                  step={0.01}
                  className='flex-1'
                  disabled={!renderedHtml}
                />
                <Button
                  variant='ghost'
                  size='icon'
                  className='h-7 w-7 shrink-0'
                  onClick={handleResetScale}
                  disabled={!renderedHtml || !isManualScale}
                  title='重置为自适应'
                >
                  <Maximize2 className='h-4 w-4' />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter className='flex-row flex-wrap justify-end gap-2 border-t bg-muted/30 px-6 py-4'>
          <Button
            variant='outline'
            onClick={handleCopyHtml}
            disabled={!renderedHtml}
          >
            <Code className='mr-2 h-4 w-4' />
            复制 HTML
          </Button>
          <Button
            variant='outline'
            onClick={handleDownloadHtml}
            disabled={!renderedHtml}
          >
            <FileDown className='mr-2 h-4 w-4' />
            下载 HTML
          </Button>
          <Button
            variant='outline'
            onClick={handleCopy}
            disabled={!renderedHtml || isGenerating}
          >
            {isGenerating ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <Copy className='mr-2 h-4 w-4' />
            )}
            复制图片
          </Button>
          <Button
            onClick={handleDownload}
            disabled={!renderedHtml || isGenerating}
          >
            {isGenerating ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <Download className='mr-2 h-4 w-4' />
            )}
            下载图片
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
