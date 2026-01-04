import { cn } from "@/lib/utils"
// import { CodeBlock } from "@/components/ui/codeblock" // Need to implement or mock
import { Bot, User } from "lucide-react"
import Markdown from "markdown-to-jsx"

export interface ChatMessageProps {
    role: string
    content: string
    isLoading?: boolean
}

export function ChatMessage({ role, content, isLoading }: ChatMessageProps) {
    const isUser = role === "user"

    return (
        <div
            className={cn(
                "group relative flex w-full items-start gap-4 p-4",
                isUser ? "flex-row-reverse" : ""
            )}
        >
            <div
                className={cn(
                    "flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg border shadow-sm",
                    isUser ? "bg-primary text-primary-foreground" : "bg-muted"
                )}
            >
                {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </div>
            <div className={cn("flex-1 space-y-2 overflow-hidden", isUser ? "text-right" : "text-left")}>
                <div
                    className={cn(
                        "prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0",
                        isUser
                            ? "ml-auto max-w-[85%] w-fit bg-primary text-primary-foreground rounded-2xl px-4 py-2 text-left"
                            : "max-w-none"
                    )}
                >
                    {isLoading && !content ? (
                        <span className="animate-pulse">Thinking...</span>
                    ) : (
                        <Markdown options={{
                            overrides: {
                                pre: ({ children, ...props }) => (
                                    <div className="rounded-md border bg-muted p-2 my-2 overflow-x-auto" {...props}>{children}</div>
                                )
                            }
                        }}>
                            {content}
                        </Markdown>
                    )}
                </div>
            </div>
        </div>
    )
}
