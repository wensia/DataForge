import { ChatMessage, ChatMessageProps } from "./chat-message"

interface ChatListProps {
    messages: ChatMessageProps[]
    isLoading?: boolean
}

export function ChatList({ messages, isLoading }: ChatListProps) {
    if (!messages.length) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 p-8 text-center">
                <h3 className="font-semibold text-2xl">Good Morning, DataForge AI</h3>
                <p className="text-muted-foreground">How can I help you today?</p>
            </div>
        )
    }

    return (
        <div className="flex-1 flex flex-col gap-4 p-4 pb-32">
            {messages.map((message, index) => (
                <ChatMessage key={index} {...message} />
            ))}
            {isLoading && (
                <ChatMessage role="assistant" content="" isLoading={true} />
            )}
        </div>
    )
}
