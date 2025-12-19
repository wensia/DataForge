import { useStyle } from '@/context/style-provider'
import { styles, styleConfig, Style } from '@/config/styles'
import { cn } from '@/lib/utils'

interface StylePreviewProps {
  styleKey: Style
  isSelected: boolean
  onClick: () => void
}

function StylePreview({ styleKey, isSelected, onClick }: StylePreviewProps) {
  const config = styleConfig[styleKey]
  const isLyra = styleKey === 'lyra'

  // Parse radius for preview
  const radiusValue = parseFloat(config.radius) * 16 // Convert rem to px

  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-2 p-1 border-2 rounded-md transition-colors cursor-pointer',
        isSelected
          ? 'border-primary'
          : 'border-muted hover:border-accent'
      )}
    >
      {/* Preview container */}
      <div
        className={cn(
          'w-full space-y-2 p-2',
          'bg-slate-100 dark:bg-slate-900'
        )}
        style={{ borderRadius: `${radiusValue}px` }}
      >
        {/* Card preview */}
        <div
          className='space-y-2 bg-white dark:bg-slate-800 p-2 shadow-xs'
          style={{ borderRadius: `${Math.max(0, radiusValue - 2)}px` }}
        >
          <div
            className='h-2 w-[80px] bg-slate-200 dark:bg-slate-600'
            style={{ borderRadius: `${Math.max(0, radiusValue - 4)}px` }}
          />
          <div
            className='h-2 w-[100px] bg-slate-200 dark:bg-slate-600'
            style={{ borderRadius: `${Math.max(0, radiusValue - 4)}px` }}
          />
        </div>
        {/* Button preview */}
        <div
          className='flex items-center space-x-2 bg-white dark:bg-slate-800 p-2 shadow-xs'
          style={{ borderRadius: `${Math.max(0, radiusValue - 2)}px` }}
        >
          <div
            className='h-4 w-4 bg-slate-200 dark:bg-slate-600'
            style={{ borderRadius: radiusValue < 6 ? '2px' : '50%' }}
          />
          <div
            className={cn(
              'h-2 w-[80px] bg-slate-200 dark:bg-slate-600',
              isLyra && 'font-mono'
            )}
            style={{ borderRadius: `${Math.max(0, radiusValue - 4)}px` }}
          />
        </div>
      </div>
      {/* Label */}
      <div className='text-center pb-1'>
        <span className='block font-medium text-sm'>{config.name}</span>
        <span className='block text-xs text-muted-foreground'>
          {config.description.zh}
        </span>
      </div>
    </button>
  )
}

export function StyleSwitcher() {
  const { style, setStyle } = useStyle()

  return (
    <div className='space-y-4'>
      <div>
        <h4 className='text-sm font-medium'>视觉风格</h4>
        <p className='text-sm text-muted-foreground'>
          选择界面的视觉风格
        </p>
      </div>
      <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4'>
        {styles.map((styleKey) => (
          <StylePreview
            key={styleKey}
            styleKey={styleKey}
            isSelected={style === styleKey}
            onClick={() => setStyle(styleKey)}
          />
        ))}
      </div>
    </div>
  )
}
