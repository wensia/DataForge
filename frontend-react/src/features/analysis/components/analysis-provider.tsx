import React, { useState } from 'react'
import useDialogState from '@/hooks/use-dialog-state'
import type { CallRecord } from '../types'

type AnalysisDialogType = 'detail' | 'delete' | 'bulk-delete' | 'transcript-stats'

type AnalysisContextType = {
  open: AnalysisDialogType | null
  setOpen: (str: AnalysisDialogType | null) => void
  currentRow: CallRecord | null
  setCurrentRow: React.Dispatch<React.SetStateAction<CallRecord | null>>
  // 音频相关状态
  audioUrl: string | null
  setAudioUrl: React.Dispatch<React.SetStateAction<string | null>>
  audioLoading: boolean
  setAudioLoading: React.Dispatch<React.SetStateAction<boolean>>
  showBatchSidebar: boolean
  setShowBatchSidebar: (show: boolean) => void
  batchSidebarWidth: number
  setBatchSidebarWidth: (width: number) => void
}

const AnalysisContext = React.createContext<AnalysisContextType | null>(null)

export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useDialogState<AnalysisDialogType>(null)
  const [currentRow, setCurrentRow] = useState<CallRecord | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioLoading, setAudioLoading] = useState(false)
  const [showBatchSidebar, setShowBatchSidebar] = useState(false)
  const [batchSidebarWidth, setBatchSidebarWidth] = useState(400)

  return (
    <AnalysisContext
      value={{
        open,
        setOpen,
        currentRow,
        setCurrentRow,
        audioUrl,
        setAudioUrl,
        audioLoading,
        setAudioLoading,
        showBatchSidebar,
        setShowBatchSidebar,
        batchSidebarWidth,
        setBatchSidebarWidth,
      }}
    >
      {children}
    </AnalysisContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAnalysisContext = () => {
  const context = React.useContext(AnalysisContext)

  if (!context) {
    throw new Error('useAnalysisContext must be used within <AnalysisProvider>')
  }

  return context
}

// 兼容别名
export const useAnalysis = useAnalysisContext
