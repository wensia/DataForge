import * as React from "react"
import { ChatList } from "./components/chat-list"
import { ChatInput } from "./components/chat-input"
// import { cn } from "@/lib/utils"
import { ChatLayout } from "./components/chat-layout"
import { useAuthStore } from "@/stores/auth-store"

// Simple Message type
interface Message {
    role: "user" | "assistant" | "system"
    content: string
}

export function AIChat() {
    const accessToken = useAuthStore(state => state.auth.accessToken)
    const [input, setInput] = React.useState("")
    const [messages, setMessages] = React.useState<Message[]>([])
    const [isLoading, setIsLoading] = React.useState(false)

    // Manual streaming implementation
    const append = async (message: Message) => {
        const newMessages = [...messages, message]
        setMessages(newMessages)
        setIsLoading(true)

        try {
            const response = await fetch("/api/v1/analysis/chat_stream", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    messages: newMessages,
                    provider: "deepseek"
                }),
            })

            if (!response.ok) throw new Error(response.statusText)
            if (!response.body) throw new Error("No response body")

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let assistantMessage = { role: "assistant" as const, content: "" }

            // Add initial empty assistant message
            setMessages(prev => [...prev, assistantMessage])

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = decoder.decode(value, { stream: true })
                assistantMessage.content += chunk

                // Update the last message (which is the assistant message)
                setMessages(prev => {
                    const others = prev.slice(0, -1)
                    return [...others, { ...assistantMessage }]
                })
            }
        } catch (error) {
            console.error("Chat error:", error)
            // Optional: Add error message to chat
        } finally {
            setIsLoading(false)
        }
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value)
    }

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault()
        if (!input.trim() || isLoading) return

        const userMessage = input.trim()
        setInput("")
        await append({
            role: "user",
            content: userMessage
        })
    }

    return (
        <ChatLayout>
            <div className="flex h-full w-full flex-col overflow-hidden bg-background">
                {/* Header */}
                <header className="flex h-14 shrink-0 items-center justify-center relative md:border-b md:px-4 bg-background/95 backdrop-blur z-10 supports-[backdrop-filter]:bg-background/60">
                    <h2 className="text-lg font-semibold tracking-tight hidden md:block">DataForge AI</h2>
                </header>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto w-full max-w-3xl mx-auto px-4">
                    <ChatList messages={messages.map(m => ({ ...m, role: m.role, content: m.content }))} isLoading={isLoading} />
                </div>

                {/* Input */}
                <div className="p-4 w-full max-w-3xl mx-auto">
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleSubmit(e);
                        }}
                        className="relative"
                    >
                        <ChatInput
                            value={input}
                            onChange={handleInputChange}
                            onSubmit={() => {
                                handleSubmit();
                            }}
                            isLoading={isLoading}
                            placeholder="Ask anything..."
                        />
                    </form>
                    <div className="text-center text-xs text-muted-foreground mt-2">
                        AI generated content may be inaccurate.
                    </div>
                </div>
            </div>
        </ChatLayout>
    )
}
export default AIChat
