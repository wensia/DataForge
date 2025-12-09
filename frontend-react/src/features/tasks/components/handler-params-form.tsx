import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import type { TaskHandlerParam } from '../data/schema'

interface HandlerParamsFormProps {
  params: TaskHandlerParam[]
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
  disabled?: boolean
}

/**
 * 解析默认值字符串为实际类型
 */
function parseDefaultValue(
  defaultStr: string | null,
  type: string
): unknown {
  if (defaultStr === null || defaultStr === 'None') {
    return type === 'bool' ? false : type === 'int' || type === 'float' ? 0 : ''
  }

  // 去除引号
  const trimmed = defaultStr.trim()

  switch (type) {
    case 'int':
      return parseInt(trimmed, 10) || 0
    case 'float':
      return parseFloat(trimmed) || 0
    case 'bool':
      return trimmed.toLowerCase() === 'true'
    case 'str':
      // 去除字符串引号 'hello' -> hello
      if (
        (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
        (trimmed.startsWith('"') && trimmed.endsWith('"'))
      ) {
        return trimmed.slice(1, -1)
      }
      return trimmed
    case 'dict':
    case 'list':
      try {
        return JSON.parse(trimmed.replace(/'/g, '"'))
      } catch {
        return trimmed
      }
    default:
      return trimmed
  }
}

/**
 * 根据参数类型渲染对应的表单控件
 */
function ParamField({
  param,
  value,
  onChange,
  disabled,
}: {
  param: TaskHandlerParam
  value: unknown
  onChange: (value: unknown) => void
  disabled?: boolean
}) {
  const { name, type, required } = param

  // 根据类型渲染不同控件
  switch (type) {
    case 'int':
      return (
        <div className='space-y-2'>
          <Label>
            {name}
            {required && <span className='text-destructive ml-1'>*</span>}
          </Label>
          <Input
            type='number'
            step='1'
            value={value as number}
            onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
            disabled={disabled}
            placeholder={`输入 ${name}`}
          />
        </div>
      )

    case 'float':
      return (
        <div className='space-y-2'>
          <Label>
            {name}
            {required && <span className='text-destructive ml-1'>*</span>}
          </Label>
          <Input
            type='number'
            step='0.01'
            value={value as number}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            disabled={disabled}
            placeholder={`输入 ${name}`}
          />
        </div>
      )

    case 'bool':
      return (
        <div className='flex items-center justify-between'>
          <Label>
            {name}
            {required && <span className='text-destructive ml-1'>*</span>}
          </Label>
          <Switch
            checked={value as boolean}
            onCheckedChange={onChange}
            disabled={disabled}
          />
        </div>
      )

    case 'str':
      return (
        <div className='space-y-2'>
          <Label>
            {name}
            {required && <span className='text-destructive ml-1'>*</span>}
          </Label>
          <Input
            type='text'
            value={value as string}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={`输入 ${name}`}
          />
        </div>
      )

    case 'dict':
    case 'list':
    default:
      // 复杂类型保留 JSON 格式
      const strValue =
        typeof value === 'string' ? value : JSON.stringify(value, null, 2)
      return (
        <div className='space-y-2'>
          <Label>
            {name}
            {required && <span className='text-destructive ml-1'>*</span>}
            <span className='text-muted-foreground ml-2 text-xs'>
              (JSON 格式)
            </span>
          </Label>
          <Textarea
            value={strValue}
            onChange={(e) => {
              try {
                onChange(JSON.parse(e.target.value))
              } catch {
                onChange(e.target.value)
              }
            }}
            disabled={disabled}
            placeholder='{"key": "value"}'
            rows={2}
            className='font-mono text-sm'
          />
        </div>
      )
  }
}

/**
 * 处理函数参数动态表单
 */
export function HandlerParamsForm({
  params,
  value,
  onChange,
  disabled,
}: HandlerParamsFormProps) {
  const [localValues, setLocalValues] = useState<Record<string, unknown>>({})

  // 初始化参数值
  useEffect(() => {
    const initialValues: Record<string, unknown> = {}

    params.forEach((param) => {
      if (value[param.name] !== undefined) {
        // 使用传入的值
        initialValues[param.name] = value[param.name]
      } else {
        // 使用默认值
        initialValues[param.name] = parseDefaultValue(
          param.default,
          param.type
        )
      }
    })

    setLocalValues(initialValues)
  }, [params, value])

  // 更新单个参数值
  const handleParamChange = (name: string, paramValue: unknown) => {
    const newValues = { ...localValues, [name]: paramValue }
    setLocalValues(newValues)
    onChange(newValues)
  }

  if (params.length === 0) {
    return (
      <p className='text-muted-foreground text-sm'>该函数无需配置参数</p>
    )
  }

  return (
    <div className='space-y-4'>
      {params.map((param) => (
        <ParamField
          key={param.name}
          param={param}
          value={localValues[param.name]}
          onChange={(v) => handleParamChange(param.name, v)}
          disabled={disabled}
        />
      ))}
    </div>
  )
}
