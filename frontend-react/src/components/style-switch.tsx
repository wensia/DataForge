import { Check, Palette } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStyle } from '@/context/style-provider'
import { styles, styleConfig } from '@/config/styles'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function StyleSwitch() {
  const { style, setStyle } = useStyle()

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon' className='scale-95 rounded-full'>
          <Palette className='size-[1.2rem]' />
          <span className='sr-only'>Toggle style</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        {styles.map((styleKey) => {
          const config = styleConfig[styleKey]
          return (
            <DropdownMenuItem
              key={styleKey}
              onClick={() => setStyle(styleKey)}
            >
              <span className='flex items-center gap-2'>
                <span
                  className='inline-block h-3 w-3 border border-current'
                  style={{ borderRadius: config.radius }}
                />
                {config.name}
              </span>
              <Check
                size={14}
                className={cn('ms-auto', style !== styleKey && 'hidden')}
              />
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
