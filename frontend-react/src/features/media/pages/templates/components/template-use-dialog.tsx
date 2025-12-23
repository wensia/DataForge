import { useEffect, useMemo, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { Copy, Download, Loader2, RefreshCw } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  const [variables, setVariables] = useState<Record<string, string>>({})
  const [renderedHtml, setRenderedHtml] = useState<string>('')
  const [renderedCss, setRenderedCss] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  const renderTemplate = useRenderTemplate()

  // 初始化变量默认值
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
  }, [template])

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90vh] max-w-4xl'>
        <DialogHeader>
          <DialogTitle>使用模板: {template?.name}</DialogTitle>
          <DialogDescription>填写变量值，预览并导出图片</DialogDescription>
        </DialogHeader>

        <div className='grid grid-cols-2 gap-6'>
          {/* 左侧: 变量表单 */}
          <div className='space-y-4'>
            <h4 className='font-medium'>填写变量</h4>
            <ScrollArea className='h-[400px] pr-4'>
              <div className='space-y-4'>
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
                      placeholder={v.placeholder || `输入 ${v.label || v.name}`}
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

            <Button
              onClick={handlePreview}
              disabled={renderTemplate.isPending}
              className='w-full'
            >
              {renderTemplate.isPending ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <RefreshCw className='mr-2 h-4 w-4' />
              )}
              预览
            </Button>
          </div>

          {/* 右侧: 预览区 */}
          <div className='space-y-4'>
            <h4 className='font-medium'>预览</h4>
            <div
              className='overflow-auto rounded-lg border bg-muted/50 p-2'
              style={{ maxHeight: '400px' }}
            >
              {renderedHtml ? (
                <iframe
                  ref={previewFrameRef}
                  title={`template-preview-${template?.id ?? 'preview'}`}
                  className='block border-0 bg-white'
                  sandbox='allow-same-origin'
                  srcDoc={previewSrcDoc}
                  style={{
                    width: template?.width || 800,
                    height: template?.height || 600,
                  }}
                />
              ) : (
                <div
                  className='text-muted-foreground flex items-center justify-center'
                  style={{ height: 300 }}
                >
                  点击"预览"按钮查看效果
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            关闭
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
          <Button onClick={handleDownload} disabled={!renderedHtml || isGenerating}>
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
