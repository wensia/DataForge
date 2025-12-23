import { useRef, useState, useLayoutEffect } from 'react'
import { Copy, Edit, Eye, MoreHorizontal, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  buildTemplateSrcDoc,
  replaceVariablesWithDefaults,
} from '../utils/template-preview'
import type { HtmlTemplate } from '../data/schema'

interface TemplateCardProps {
  template: HtmlTemplate
  isLibrary?: boolean // 是否在模板库 Tab
  isAdmin?: boolean // 是否是管理员
  onEdit: (template: HtmlTemplate) => void
  onDelete: (template: HtmlTemplate) => void
  onUse: (template: HtmlTemplate) => void
  onCopy?: (template: HtmlTemplate) => void
  isCopying?: boolean
}

export function TemplateCard({
  template,
  isLibrary = false,
  isAdmin = false,
  onEdit,
  onDelete,
  onUse,
  onCopy,
  isCopying = false,
}: TemplateCardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.1)

  // 使用变量默认值替换后构建预览
  const htmlWithDefaults = replaceVariablesWithDefaults(
    template.html_content,
    template.variables
  )
  const previewSrcDoc = buildTemplateSrcDoc(htmlWithDefaults, template.css_content)

  // 计算缩放比例
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateScale = () => {
      const containerWidth = container.clientWidth
      const containerHeight = container.clientHeight
      const scaleX = (containerWidth * 0.95) / template.width
      const scaleY = (containerHeight * 0.95) / template.height
      setScale(Math.min(scaleX, scaleY))
    }

    updateScale()

    const resizeObserver = new ResizeObserver(updateScale)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [template.width, template.height])

  return (
    <Card className='group relative overflow-hidden transition-shadow hover:shadow-lg'>
      {/* 缩略图预览区 */}
      <div
        ref={containerRef}
        className='relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800'
      >
        {template.thumbnail ? (
          <img
            src={template.thumbnail}
            alt={template.name}
            className='h-full w-full object-cover transition-transform duration-300 group-hover:scale-105'
          />
        ) : (
          <div className='absolute inset-0 flex items-center justify-center overflow-hidden'>
            {/* 缩放后的容器 */}
            <div
              className='overflow-hidden rounded shadow-sm'
              style={{
                width: template.width * scale,
                height: template.height * scale,
              }}
            >
              {/* 原始尺寸的 iframe，通过 transform 缩放 */}
              <iframe
                title={`${template.name}-preview`}
                className='pointer-events-none block border-0 bg-white'
                sandbox='allow-same-origin'
                srcDoc={previewSrcDoc}
                style={{
                  width: template.width,
                  height: template.height,
                  transform: `scale(${scale})`,
                  transformOrigin: '0 0',
                }}
              />
            </div>
          </div>
        )}

        {/* 尺寸标签 */}
        <div className='absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100'>
          {template.width} × {template.height}
        </div>

        {/* 悬浮操作按钮 */}
        <div className='absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 backdrop-blur-sm transition-all duration-200 group-hover:opacity-100'>
          {isLibrary ? (
            <Button
              size='sm'
              onClick={() => onCopy?.(template)}
              disabled={isCopying}
              className='shadow-lg'
            >
              <Copy className='mr-1.5 h-4 w-4' />
              {isCopying ? '复制中...' : '复制到我的模板'}
            </Button>
          ) : (
            <Button size='sm' onClick={() => onUse(template)} className='shadow-lg'>
              <Eye className='mr-1.5 h-4 w-4' />
              使用模板
            </Button>
          )}
        </div>
      </div>

      {/* 内容区域 */}
      <CardContent className='p-3'>
        <div className='flex items-start gap-2'>
          <div className='min-w-0 flex-1'>
            <h3 className='truncate text-sm font-semibold leading-tight'>
              {template.name}
            </h3>
            {template.description ? (
              <p className='text-muted-foreground mt-1 line-clamp-1 text-xs'>
                {template.description}
              </p>
            ) : (
              <p className='text-muted-foreground/50 mt-1 text-xs italic'>
                暂无描述
              </p>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant='ghost'
                size='icon'
                className='h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100'
              >
                <MoreHorizontal className='h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              {isLibrary ? (
                <>
                  <DropdownMenuItem
                    onClick={() => onCopy?.(template)}
                    disabled={isCopying}
                  >
                    <Copy className='mr-2 h-4 w-4' />
                    复制到我的模板
                  </DropdownMenuItem>
                  {isAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onEdit(template)}>
                        <Edit className='mr-2 h-4 w-4' />
                        编辑
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className='text-destructive'
                        onClick={() => onDelete(template)}
                      >
                        <Trash2 className='mr-2 h-4 w-4' />
                        删除
                      </DropdownMenuItem>
                    </>
                  )}
                </>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => onUse(template)}>
                    <Eye className='mr-2 h-4 w-4' />
                    使用
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onEdit(template)}>
                    <Edit className='mr-2 h-4 w-4' />
                    编辑
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className='text-destructive'
                    onClick={() => onDelete(template)}
                  >
                    <Trash2 className='mr-2 h-4 w-4' />
                    删除
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>

      {/* 底部信息 */}
      <CardFooter className='flex items-center justify-between border-t px-3 py-2'>
        <div className='flex items-center gap-1.5'>
          {template.is_system && (
            <Badge variant='secondary' className='h-5 px-1.5 text-[10px] font-medium'>
              系统
            </Badge>
          )}
          {template.category_name && (
            <Badge variant='outline' className='h-5 px-1.5 text-[10px]'>
              {template.category_name}
            </Badge>
          )}
          {!template.is_active && (
            <Badge variant='destructive' className='h-5 px-1.5 text-[10px]'>
              已禁用
            </Badge>
          )}
        </div>
        <span className='text-muted-foreground text-[10px]'>
          {template.use_count} 次使用
        </span>
      </CardFooter>
    </Card>
  )
}
