import * as React from "react"
import { cn } from "@/lib/utils"
// import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable" // Not using resizable yet for simplicity
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { SquarePen, Menu } from "lucide-react"
import { useConversations } from "../api"
// import { useQueryClient } from "@tanstack/react-query"

interface ChatLayoutProps {
    children: React.ReactNode
    defaultLayout?: number[] | undefined
    navCollapsedSize?: number
}

export function ChatLayout({ children }: ChatLayoutProps) {
    const [isMobileOpen, setIsMobileOpen] = React.useState(false)
    const { data: conversationsData } = useConversations({ include_archived: false })
    const conversations = conversationsData?.items || []

    // Mocking selection logic for now, usually passed via URL or context
    const selectedId = null

    return (
        <div className="flex h-full w-full overflow-hidden">
            {/* Desktop Sidebar */}
            <aside className="hidden md:flex w-[260px] flex-col border-r bg-muted/30">
                <div className="flex h-14 items-center border-b px-4">
                    <Button variant="outline" className="w-full justify-start gap-2" onClick={() => window.location.href = '/ai-chat'}>
                        <SquarePen className="h-4 w-4" />
                        New Chat
                    </Button>
                </div>
                <ScrollArea className="flex-1">
                    <div className="flex flex-col gap-2 p-2">
                        {conversations.map(chat => (
                            <Button
                                key={chat.id}
                                variant={selectedId === chat.id ? "secondary" : "ghost"}
                                className="justify-start truncate h-9 px-3 text-sm font-normal"
                            >
                                {chat.title || "Untitled Chat"}
                            </Button>
                        ))}
                    </div>
                </ScrollArea>
            </aside>

            {/* Mobile Sidebar Trigger */}
            <div className="md:hidden absolute top-3 left-4 z-20">
                <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
                    <SheetTrigger asChild>
                        <Button variant="ghost" size="icon">
                            <Menu />
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-[260px] p-0">
                        <div className="flex h-14 items-center border-b px-4">
                            <Button variant="outline" className="w-full justify-start gap-2">
                                <SquarePen className="h-4 w-4" />
                                New Chat
                            </Button>
                        </div>
                        <ScrollArea className="flex-1 h-[calc(100vh-3.5rem)]">
                            <div className="flex flex-col gap-2 p-2">
                                {conversations.map(chat => (
                                    <Button
                                        key={chat.id}
                                        variant="ghost"
                                        className="justify-start truncate h-9 px-3 text-sm font-normal"
                                    >
                                        {chat.title || "Untitled Chat"}
                                    </Button>
                                ))}
                            </div>
                        </ScrollArea>
                    </SheetContent>
                </Sheet>
            </div>

            {/* Main Content */}
            <main className="flex flex-1 flex-col overflow-hidden bg-background">
                {children}
            </main>
        </div>
    )
}
