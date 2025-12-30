import * as React from "react"
import { SendHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

interface ChatInputProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    onSubmit?: () => void
    isLoading?: boolean
}

export const ChatInput = React.forwardRef<HTMLTextAreaElement, ChatInputProps>(
    ({ className, onSubmit, isLoading, ...props }, ref) => {
        const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                // Directly call onSubmit without arguments
                onSubmit?.()
            }
        }

        return (
            <div className={cn("relative flex items-end w-full p-2 bg-background border rounded-xl shadow-sm focus-within:ring-1 focus-within:ring-ring", className)}>
                <Textarea
                    ref={ref}
                    className="min-h-[44px] w-full resize-none border-0 bg-transparent py-3 focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Type a message..."
                    onKeyDown={handleKeyDown}
                    rows={1}
                    style={{ maxHeight: "200px" }}
                    {...props}
                />
                <Button
                    size="icon"
                    disabled={isLoading || !props.value}
                    onClick={() => onSubmit?.()}
                    className="mb-1 ml-2 h-8 w-8 shrink-0 rounded-full"
                >
                    <SendHorizontal className="h-4 w-4" />
                    <span className="sr-only">Send</span>
                </Button>
            </div>
        )
    }
)
ChatInput.displayName = "ChatInput"
