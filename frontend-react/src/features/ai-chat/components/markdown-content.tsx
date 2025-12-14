/**
 * Markdown 内容渲染组件
 *
 * 支持 GFM (GitHub Flavored Markdown)，代码高亮，表格等。
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '@/lib/utils'
import { Copy, Check } from 'lucide-react'
import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'

interface MarkdownContentProps {
  content: string
  className?: string
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none',
        // 重置一些 prose 样式
        'prose-p:my-2 prose-p:leading-relaxed',
        'prose-ul:my-2 prose-ol:my-2',
        'prose-li:my-0',
        'prose-pre:my-2 prose-pre:p-0 prose-pre:bg-transparent',
        'prose-code:before:content-none prose-code:after:content-none',
        'prose-headings:my-3 prose-headings:font-semibold',
        'prose-table:my-2',
        // 移动端溢出处理（官方推荐）
        'prose-pre:max-w-full prose-pre:overflow-x-auto',
        'prose-img:max-w-full',
        // 宽度约束
        'w-full',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 代码块
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const language = match ? match[1] : ''
            const codeString = String(children).replace(/\n$/, '')

            // 判断是否是代码块（多行）还是行内代码
            const isCodeBlock = codeString.includes('\n') || language

            if (isCodeBlock) {
              return (
                <CodeBlock language={language} code={codeString} />
              )
            }

            // 行内代码
            return (
              <code
                className={cn(
                  'rounded bg-muted px-1.5 py-0.5 text-sm font-mono',
                  className
                )}
                {...props}
              >
                {children}
              </code>
            )
          },
          // 表格样式 - 移动端优化
          table({ children }) {
            return (
              <div className="my-2 max-w-full overflow-x-auto rounded-lg border">
                <table className="w-full table-auto">{children}</table>
              </div>
            )
          },
          th({ children }) {
            return (
              <th className="border-b bg-muted/50 px-2 py-1.5 text-left text-xs font-medium sm:whitespace-nowrap sm:px-3 sm:py-2 sm:text-sm">
                {children}
              </th>
            )
          },
          td({ children }) {
            return (
              <td className="border-b px-2 py-1.5 text-xs sm:whitespace-nowrap sm:px-3 sm:py-2 sm:text-sm">{children}</td>
            )
          },
          // 链接
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80"
              >
                {children}
              </a>
            )
          },
          // 引用块
          blockquote({ children }) {
            return (
              <blockquote className="border-l-4 border-primary/30 pl-4 italic text-muted-foreground">
                {children}
              </blockquote>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

// 代码块组件（带复制按钮）
interface CodeBlockProps {
  language: string
  code: string
}

function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  return (
    <div className="group relative my-2 max-w-full overflow-hidden rounded-lg">
      {/* 语言标签和复制按钮 */}
      <div className="flex items-center justify-between bg-zinc-800 px-2 sm:px-4 py-2 text-xs text-zinc-400">
        <span>{language || 'code'}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-zinc-400 hover:text-white"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check className="mr-1 h-3 w-3" />
              已复制
            </>
          ) : (
            <>
              <Copy className="mr-1 h-3 w-3" />
              复制
            </>
          )}
        </Button>
      </div>
      {/* 代码内容 */}
      <div className="overflow-x-auto">
        <SyntaxHighlighter
          style={oneDark}
          language={language || 'text'}
          PreTag="div"
          customStyle={{
            margin: 0,
            borderRadius: 0,
            fontSize: '0.875rem',
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}
