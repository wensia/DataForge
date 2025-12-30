import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { ChatList } from "./components/chat-list"
import { ChatInput } from "./components/chat-input"
import { cn } from "@/lib/utils"
import { ChatLayout } from "./components/chat-layout"

export function AIChat() {
    const { messages, input, handleInputChange, handleSubmit, isLoading, stop } = useChat({
        api: "/api/v1/analysis/chat_stream", // Ensure this matches backend
        streamProtocol: "text", // Adjust based on backend response. Try 'text' first if raw chunks, or default for Vercel protocol
        // Note: If backend sends OpenAI-like SSE, we might need a custom fetcher or use 'data' protocol?
        // Let's assume standard Vercel AI SDK behavior for now.
        onError: (error) => {
            console.error("Chat error:", error)
        }
    })

    const [currentLayout, setCurrentLayout] = React.useState(undefined)

    return (
        <ChatLayout>
            <div className="flex h-full w-full flex-col overflow-hidden bg-background">
                {/* Header - Hidden on mobile if sidebar button exists? No, keep it. */}
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
