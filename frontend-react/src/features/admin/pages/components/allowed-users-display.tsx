import { Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface User {
  id: number
  name: string
  username: string
}

interface AllowedUsersDisplayProps {
  userIds: number[]
  usersMap: Map<number, User>
  className?: string
  maxDisplay?: number
}

export function AllowedUsersDisplay({
  userIds,
  usersMap,
  className,
  maxDisplay = 2,
}: AllowedUsersDisplayProps) {
  if (!userIds || userIds.length === 0) {
    return (
      <span className={cn('rounded px-1.5 py-0.5 text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', className)}>
        指定用户
      </span>
    )
  }

  const users = userIds
    .map((id) => usersMap.get(id))
    .filter((u): u is User => !!u)

  const displayUsers = users.slice(0, maxDisplay)
  const remainingCount = users.length - maxDisplay

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs',
            'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
            'hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors cursor-pointer',
            className
          )}
        >
          <Users className="h-3 w-3" />
          <span>{users.length}人可见</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground px-1">
            可访问用户 ({users.length})
          </div>
          <ScrollArea className="max-h-48">
            <div className="space-y-1">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                    {user.name?.charAt(0) || user.username?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{user.name || user.username}</div>
                    {user.name && user.username && (
                      <div className="truncate text-xs text-muted-foreground">
                        @{user.username}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {userIds.length > users.length && (
                <div className="px-2 py-1 text-xs text-muted-foreground">
                  还有 {userIds.length - users.length} 个用户未找到
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  )
}
