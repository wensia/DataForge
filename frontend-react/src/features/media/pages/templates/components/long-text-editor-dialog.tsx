import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

interface LongTextEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  value: string
  onSave: (value: string) => void
  placeholder?: string
}

export function LongTextEditorDialog({
  open,
  onOpenChange,
  title,
  value,
  onSave,
  placeholder,
}: LongTextEditorDialogProps) {
  const [localValue, setLocalValue] = useState(value)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 同步外部值变化
  useEffect(() => {
    if (open) {
      setLocalValue(value)
    }
  }, [open, value])

  // 插入 <br> 标签
  const handleInsertBr = () => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newValue =
      localValue.substring(0, start) + '<br>' + localValue.substring(end)
    setLocalValue(newValue)

    // 设置光标位置到插入内容之后
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(start + 4, start + 4)
    })
  }

  const handleSave = () => {
    onSave(localValue)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            编辑长文本内容，可使用换行按钮插入 HTML 换行标签
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-3'>
          <Textarea
            ref={textareaRef}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            placeholder={placeholder}
            className='min-h-[200px] font-mono text-sm'
          />
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={handleInsertBr}
            >
              插入换行 {'<br>'}
            </Button>
            <span className='text-xs text-muted-foreground'>
              在光标位置插入 HTML 换行标签
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>确定</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
