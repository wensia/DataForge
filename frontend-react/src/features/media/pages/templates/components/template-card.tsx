import { Edit, Eye, MoreHorizontal, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { HtmlTemplate } from '../data/schema'

interface TemplateCardProps {
  template: HtmlTemplate
  onEdit: (template: HtmlTemplate) => void
  onDelete: (template: HtmlTemplate) => void
  onUse: (template: HtmlTemplate) => void
}

export function TemplateCard({
  template,
  onEdit,
  onDelete,
  onUse,
}: TemplateCardProps) {
  return (
    <Card className='group relative overflow-hidden'>
      {/* 缩略图预览区 */}
      <div className='relative aspect-[4/3] overflow-hidden bg-muted'>
        {template.thumbnail ? (
          <img
            src={template.thumbnail}
            alt={template.name}
            className='h-full w-full object-cover'
          />
        ) : (
          <div className='flex h-full w-full items-center justify-center overflow-hidden p-2'>
            <div
              className='origin-top-left scale-[0.3]'
              style={{
                width: template.width,
                height: template.height,
              }}
              dangerouslySetInnerHTML={{ __html: template.html_content }}
            />
          </div>
        )}

        {/* 悬浮操作按钮 */}
        <div className='absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100'>
          <Button size='sm' variant='secondary' onClick={() => onUse(template)}>
            <Eye className='mr-1 h-4 w-4' />
            使用
          </Button>
        </div>
      </div>

      <CardContent className='p-4'>
        <div className='flex items-start justify-between'>
          <div className='min-w-0 flex-1 space-y-1'>
            <h3 className='truncate font-medium leading-none'>
              {template.name}
            </h3>
            {template.description && (
              <p className='text-muted-foreground line-clamp-2 text-sm'>
                {template.description}
              </p>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='icon' className='h-8 w-8 shrink-0'>
                <MoreHorizontal className='h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>

      <CardFooter className='flex items-center justify-between border-t px-4 py-2'>
        <div className='flex items-center gap-2'>
          {template.category_name && (
            <Badge variant='outline'>{template.category_name}</Badge>
          )}
          {!template.is_active && <Badge variant='secondary'>已禁用</Badge>}
        </div>
        <span className='text-muted-foreground text-xs'>
          使用 {template.use_count} 次
        </span>
      </CardFooter>
    </Card>
  )
}
